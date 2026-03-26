#!/usr/bin/env python3
"""
Trading Economics Scraper v1.0.0
Daily macro briefing layer: G10 calendar events, bond auctions, FX snapshot.

PURPOSE:
    Complements the ForexFactory scraper (which handles bias scoring from BEAT/MISS history).
    This scraper = daily macro context: what is happening TODAY and what rates look like NOW.
    Two separate outputs, both displayed in the Intel Hub dashboard.

REQUIRES:
    pip install beautifulsoup4 --break-system-packages

OUTPUT FILE: te-snapshot.json
    IMPORTANT: Verify this path exists on Unraid before first run.
    Default Unraid path: /mnt/user/appdata/trading-state/data/te-snapshot.json
    The data/ directory must exist (it is created by the FF scraper on first run).

CRON (Unraid User Scripts — every 6 hours, same schedule as FF scraper):
    0 */6 * * * /usr/bin/python3 /mnt/user/appdata/forex-command-centre/backend/scripts/te_scraper.py --unraid

MANUAL RUN (test without writing to Unraid path):
    python3 te_scraper.py --print

Changelog:
    v1.0.0 - Initial release: G10 calendar events, bond auctions, FX snapshot
"""

import argparse, json, re, sys, os, time
from datetime import datetime, timezone
from urllib.request import urlopen, Request
from urllib.error import URLError, HTTPError

try:
    from bs4 import BeautifulSoup
except ImportError:
    print("ERROR: beautifulsoup4 required. Run: pip install beautifulsoup4 --break-system-packages",
          file=sys.stderr)
    sys.exit(1)

# ── Constants ─────────────────────────────────────────────────────────────────

VERSION = "1.0.0"

# G10 currencies we care about
G10_CURRENCIES = ["USD", "EUR", "GBP", "JPY", "AUD", "NZD", "CAD", "CHF"]

# TE country name → currency code (lowercase match)
COUNTRY_TO_CURRENCY = {
    "united states":    "USD",
    "euro area":        "EUR",
    "european union":   "EUR",
    "germany":          "EUR",
    "france":           "EUR",
    "italy":            "EUR",
    "spain":            "EUR",
    "united kingdom":   "GBP",
    "japan":            "JPY",
    "australia":        "AUD",
    "new zealand":      "NZD",
    "canada":           "CAD",
    "switzerland":      "CHF",
}

# Bond symbols we track
BOND_SYMBOLS = {"USB10Y", "USB02Y", "USB05Y", "USB30Y", "DE10Y", "UK10Y", "JP10Y"}

# FX pairs: pair label → (TE country slug, currency code)
FX_PAGES = {
    "EURUSD": ("euro-area",      "EUR"),
    "GBPUSD": ("united-kingdom", "GBP"),
    "USDJPY": ("japan",          "JPY"),
    "AUDUSD": ("australia",      "AUD"),
    "NZDUSD": ("new-zealand",    "NZD"),
    "USDCAD": ("canada",         "CAD"),
    "USDCHF": ("switzerland",    "CHF"),
}

BASE_URL      = "https://tradingeconomics.com"
CALENDAR_URL  = f"{BASE_URL}/calendar"
BONDS_URL     = f"{BASE_URL}/calendar/bonds"
FX_URL_TPL    = f"{BASE_URL}/{{}}/currency"

UNRAID_OUTPUT = "/mnt/user/appdata/trading-state/data/te-snapshot.json"

# ── HTTP fetch ────────────────────────────────────────────────────────────────

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept":          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.5",
    "Accept-Encoding": "identity",
    "Cache-Control":   "no-cache",
}


def fetch_html(url, timeout=30):
    """Fetch URL and return decoded HTML string. Raises RuntimeError on failure."""
    try:
        req = Request(url, headers=HEADERS)
        with urlopen(req, timeout=timeout) as r:
            return r.read().decode("utf-8", errors="replace")
    except HTTPError as e:
        raise RuntimeError(f"HTTP {e.code} fetching {url}: {e.reason}")
    except URLError as e:
        raise RuntimeError(f"URL error fetching {url}: {e.reason}")
    except Exception as e:
        raise RuntimeError(f"Fetch failed for {url}: {e}")


# ── Canary checks ─────────────────────────────────────────────────────────────

def canary_calendar(html):
    """Check TE calendar page has expected structure."""
    markers = ["data-country", "data-event", "data-symbol", "calendar-table"]
    missing = [m for m in markers if m not in html]
    if missing:
        return False, f"Calendar canary FAIL — missing: {missing}"
    return True, "OK"


def canary_bonds(html):
    """Check TE bonds page has expected structure."""
    markers = ["data-symbol", "data-country", "calendar-table"]
    missing = [m for m in markers if m not in html]
    if missing:
        return False, f"Bonds canary FAIL — missing: {missing}"
    return True, "OK"


def canary_fx(html):
    """Check TE currency page has some rate data."""
    markers = ["data-symbol", "te-currency"]
    # fx pages vary — just check we got real HTML back
    if len(html) < 5000:
        return False, "FX page suspiciously short — possible block"
    return True, "OK"


# ── Calendar parser ───────────────────────────────────────────────────────────

def parse_importance(row):
    """Extract importance level (1-3) from TE calendar row."""
    # TE uses <td class="calendar-importance"> with <i> stars
    # Some versions use <td class="importance">
    for class_name in ("calendar-importance", "importance"):
        td = row.find("td", class_=class_name)
        if td:
            stars = td.find_all("i", class_=lambda c: c and "glyphicon-star" in c)
            if stars:
                return len(stars)
    # Fallback: check data-importance attribute on the row
    imp = row.get("data-importance")
    if imp:
        try:
            return int(imp)
        except (ValueError, TypeError):
            pass
    return 1  # default low


def importance_to_label(imp):
    if imp >= 3:
        return "High"
    if imp == 2:
        return "Medium"
    return "Low"


def parse_cell_text(td):
    """Get clean text from a table cell, stripping flags and icons."""
    if not td:
        return None
    # Remove child elements that are icons/flags (img, i, span.flag)
    for el in td.find_all(["img", "i"]):
        el.decompose()
    text = td.get_text(strip=True)
    return text if text else None


def parse_calendar_page(html, bond_mode=False):
    """
    Parse TE calendar or bonds page.
    Returns list of event dicts.
    bond_mode=True filters to BOND_SYMBOLS only.
    """
    soup = BeautifulSoup(html, "html.parser")
    events = []

    # TE calendar rows carry data attributes directly on <tr>
    rows = soup.find_all("tr", attrs={"data-symbol": True})

    # If no data-symbol rows, try generic tr with data-event
    if not rows:
        rows = soup.find_all("tr", attrs={"data-event": True})

    now_utc = datetime.utcnow().isoformat() + "Z"

    for row in rows:
        try:
            symbol  = row.get("data-symbol", "").strip().upper()
            country = row.get("data-country", "").strip().lower()
            event   = row.get("data-event",   "").strip()
            cat     = row.get("data-category","").strip()

            # ── Bond mode: filter to tracked bond symbols ──────────────────
            if bond_mode:
                if symbol not in BOND_SYMBOLS:
                    continue
            else:
                # ── Calendar mode: filter to G10 currencies ────────────────
                currency = COUNTRY_TO_CURRENCY.get(country)
                if not currency:
                    continue

            # Get table cells
            cells = row.find_all("td")
            if len(cells) < 4:
                continue

            # Cell layout varies but generally: date, country, event, actual, forecast, previous
            # We use data attributes for country/event (already extracted above)
            # Find cells by content position
            date_td     = cells[0] if len(cells) > 0 else None
            actual_td   = None
            forecast_td = None
            previous_td = None

            # Try to find labelled cells first
            actual_td   = row.find("td", class_=lambda c: c and "actual"   in c.lower())
            forecast_td = row.find("td", class_=lambda c: c and "forecast" in c.lower())
            previous_td = row.find("td", class_=lambda c: c and "previous" in c.lower())

            # Fallback to positional (TE typical order: date, country, event, actual, forecast, previous)
            if not actual_td and len(cells) >= 4:
                actual_td   = cells[3] if len(cells) > 3 else None
                forecast_td = cells[4] if len(cells) > 4 else None
                previous_td = cells[5] if len(cells) > 5 else None

            actual_val   = parse_cell_text(actual_td)
            forecast_val = parse_cell_text(forecast_td)
            previous_val = parse_cell_text(previous_td)
            date_val     = parse_cell_text(date_td)

            # Clean up values — TE sometimes returns "\xa0" or "-"
            def clean_val(v):
                if not v:
                    return None
                v = v.strip().replace("\xa0", "").replace("\u00a0", "")
                return v if v not in ("-", "", "NA", "N/A") else None

            actual_val   = clean_val(actual_val)
            forecast_val = clean_val(forecast_val)
            previous_val = clean_val(previous_val)

            importance   = parse_importance(row)
            impact_label = importance_to_label(importance)

            if bond_mode:
                entry = {
                    "symbol":      symbol,
                    "country":     row.get("data-country", "").strip(),
                    "event":       event,
                    "category":    cat,
                    "date":        date_val,
                    "actual":      actual_val,
                    "forecast":    forecast_val,
                    "previous":    previous_val,
                    "importance":  importance,
                    "impact":      impact_label,
                    "scraped_at":  now_utc,
                }
            else:
                entry = {
                    "currency":    currency,
                    "country":     row.get("data-country", "").strip(),
                    "symbol":      symbol,
                    "event":       event,
                    "category":    cat,
                    "date":        date_val,
                    "actual":      actual_val,
                    "forecast":    forecast_val,
                    "previous":    previous_val,
                    "importance":  importance,
                    "impact":      impact_label,
                    "scraped_at":  now_utc,
                }

            events.append(entry)

        except Exception as e:
            print(f"  Row parse error: {e}", file=sys.stderr)

    return events


# ── FX snapshot parser ────────────────────────────────────────────────────────

def parse_fx_page(html, pair, currency):
    """
    Parse a TE currency page for current rate, daily change, trend.
    Returns dict with rate data or error info.
    """
    soup = BeautifulSoup(html, "html.parser")
    result = {
        "pair":        pair,
        "currency":    currency,
        "rate":        None,
        "daily_pct":   None,
        "trend_1m":    None,
        "scraped_at":  datetime.utcnow().isoformat() + "Z",
        "status":      "OK",
    }

    try:
        # TE currency pages: rate is typically in an element with id or class
        # containing the symbol, or in a <span id="ctl00_..."> or data-symbol attr
        # Try multiple selectors

        # Method 1: data-symbol attribute on span/td
        rate_el = soup.find(attrs={"data-symbol": True})
        if rate_el:
            rate_text = rate_el.get_text(strip=True)
            if rate_text and rate_text.replace(".", "").replace(",", "").lstrip("-").isdigit():
                result["rate"] = rate_text

        # Method 2: look for large numeric display elements
        # TE uses <span id="p"> or similar for live rate
        for el_id in ("p", "rate", "currentrate"):
            el = soup.find(id=el_id)
            if el:
                t = el.get_text(strip=True).replace(",", "")
                try:
                    float(t)
                    result["rate"] = t
                    break
                except (ValueError, TypeError):
                    pass

        # Method 3: look for te-currency class elements
        for cls in ("te-currency", "currency-rate", "current-rate"):
            el = soup.find(class_=cls)
            if el:
                t = el.get_text(strip=True).replace(",", "")
                try:
                    float(t)
                    result["rate"] = t
                    break
                except (ValueError, TypeError):
                    pass

        # Daily % change — look for elements with "%" text near the rate
        pct_candidates = soup.find_all(string=lambda s: s and "%" in s)
        for cand in pct_candidates[:10]:
            text = cand.strip()
            # Match patterns like "+0.23%", "-0.15%", "0.23%"
            match = re.search(r"([+-]?\d+\.?\d*)\s*%", text)
            if match:
                try:
                    val = float(match.group(1))
                    if abs(val) < 10:  # sanity check — daily % rarely > 10%
                        result["daily_pct"] = f"{val:+.2f}%"
                        break
                except (ValueError, TypeError):
                    pass

    except Exception as e:
        result["status"] = f"PARSE_ERROR: {e}"

    if not result["rate"]:
        result["status"] = "RATE_NOT_FOUND"

    return result


# ── Scraping orchestration ────────────────────────────────────────────────────

def scrape_calendar(verbose=True):
    """Scrape TE main calendar for G10 events today."""
    if verbose:
        print(f"Fetching calendar: {CALENDAR_URL} ...")
    try:
        html = fetch_html(CALENDAR_URL)
    except RuntimeError as e:
        print(f"  ERROR: {e}", file=sys.stderr)
        return [], {"status": "FETCH_ERROR", "message": str(e)}

    ok, msg = canary_calendar(html)
    if not ok:
        print(f"  {msg}", file=sys.stderr)
        return [], {"status": "CANARY_FAIL", "message": msg}

    events = parse_calendar_page(html, bond_mode=False)
    if verbose:
        high_ct = sum(1 for e in events if e.get("impact") == "High")
        print(f"  {len(events)} G10 events | {high_ct} High impact")

    return events, {"status": "OK", "message": "Calendar scraped"}


def scrape_bonds(verbose=True):
    """Scrape TE bonds calendar for tracked bond symbols."""
    if verbose:
        print(f"Fetching bonds: {BONDS_URL} ...")
    try:
        html = fetch_html(BONDS_URL)
    except RuntimeError as e:
        print(f"  ERROR: {e}", file=sys.stderr)
        return [], {"status": "FETCH_ERROR", "message": str(e)}

    ok, msg = canary_bonds(html)
    if not ok:
        print(f"  {msg}", file=sys.stderr)
        return [], {"status": "CANARY_FAIL", "message": msg}

    auctions = parse_calendar_page(html, bond_mode=True)
    if verbose:
        print(f"  {len(auctions)} bond auction events")

    return auctions, {"status": "OK", "message": "Bonds scraped"}


def scrape_fx_snapshots(verbose=True):
    """Scrape TE currency pages for 7 major pairs."""
    snapshots = {}
    for pair, (slug, currency) in FX_PAGES.items():
        url = FX_URL_TPL.format(slug)
        if verbose:
            print(f"  Fetching FX: {pair} ({url}) ...")
        try:
            html = fetch_html(url)
        except RuntimeError as e:
            print(f"    ERROR: {e}", file=sys.stderr)
            snapshots[pair] = {
                "pair": pair, "currency": currency,
                "rate": None, "daily_pct": None, "trend_1m": None,
                "status": f"FETCH_ERROR: {e}",
                "scraped_at": datetime.utcnow().isoformat() + "Z",
            }
            time.sleep(1)
            continue

        ok, msg = canary_fx(html)
        if not ok:
            print(f"    {msg}", file=sys.stderr)
            snapshots[pair] = {
                "pair": pair, "currency": currency,
                "rate": None, "daily_pct": None, "trend_1m": None,
                "status": f"CANARY_FAIL: {msg}",
                "scraped_at": datetime.utcnow().isoformat() + "Z",
            }
            time.sleep(1)
            continue

        snapshot = parse_fx_page(html, pair, currency)
        snapshots[pair] = snapshot

        if verbose:
            rate = snapshot.get("rate") or "N/A"
            pct  = snapshot.get("daily_pct") or "N/A"
            print(f"    {pair}: {rate}  {pct}  [{snapshot['status']}]")

        time.sleep(2)  # polite — FX pages hit 7 different URLs

    return snapshots


# ── Output ────────────────────────────────────────────────────────────────────

def build_snapshot(events, auctions, fx_snapshots, health):
    """Assemble the final te-snapshot.json structure."""
    now = datetime.utcnow().isoformat() + "Z"

    # Summary counts
    high_events = [e for e in events   if e.get("impact") == "High"]
    med_events  = [e for e in events   if e.get("impact") == "Medium"]
    with_actual = [e for e in events   if e.get("actual")]
    bond_actual = [b for b in auctions if b.get("actual")]

    # FX snapshot status summary
    fx_ok  = sum(1 for v in fx_snapshots.values() if v.get("status") == "OK")
    fx_tot = len(fx_snapshots)

    return {
        "schema_version": VERSION,
        "source":         "TradingEconomics",
        "last_updated":   now,
        "health":         health,
        "summary": {
            "total_events":      len(events),
            "high_impact":       len(high_events),
            "medium_impact":     len(med_events),
            "events_with_actual": len(with_actual),
            "bond_auctions":     len(auctions),
            "bonds_with_actual": len(bond_actual),
            "fx_pairs_ok":       f"{fx_ok}/{fx_tot}",
        },
        "today_events":   events,
        "bond_auctions":  auctions,
        "fx_snapshot":    fx_snapshots,
    }


def save_snapshot(snapshot, path):
    """Write snapshot JSON to disk. Creates parent dirs if needed."""
    d = os.path.dirname(path)
    if d and not os.path.exists(d):
        os.makedirs(d)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(snapshot, f, indent=2, ensure_ascii=False)
    print(f"Snapshot saved -> {path}")


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    SCRIPT_DIR   = os.path.dirname(os.path.abspath(__file__))
    PROJECT_ROOT = os.path.abspath(os.path.join(SCRIPT_DIR, "..", ".."))
    DEFAULT_OUT  = os.path.join(PROJECT_ROOT, "data", "te-snapshot.json")

    parser = argparse.ArgumentParser(
        description=f"FCC Trading Economics Scraper v{VERSION}"
    )
    parser.add_argument("--output", "-o", default=DEFAULT_OUT,
                        help="Output path for te-snapshot.json")
    parser.add_argument("--unraid", action="store_true",
                        help=f"Write to Unraid path: {UNRAID_OUTPUT}")
    parser.add_argument("--skip-fx", action="store_true", dest="skip_fx",
                        help="Skip FX snapshot scraping (faster, for testing)")
    parser.add_argument("--skip-bonds", action="store_true", dest="skip_bonds",
                        help="Skip bond auction scraping")
    parser.add_argument("--print", "-p", action="store_true", dest="print_output",
                        help="Print JSON to stdout instead of writing file")
    parser.add_argument("--quiet", "-q", action="store_true",
                        help="Suppress progress output")
    args = parser.parse_args()

    output_path = UNRAID_OUTPUT if args.unraid else args.output
    verbose = not args.quiet

    if verbose:
        print(f"Trading Economics Scraper v{VERSION}")
        print(f"Output: {output_path}")
        print("-" * 50)

    health = {
        "calendar": {"status": "SKIPPED"},
        "bonds":    {"status": "SKIPPED"},
        "fx":       {"status": "SKIPPED"},
        "scraped_at": datetime.utcnow().isoformat() + "Z",
    }

    # ── Calendar ──────────────────────────────────────────────────────────────
    events, cal_health = scrape_calendar(verbose=verbose)
    health["calendar"] = cal_health
    time.sleep(2)

    # ── Bonds ─────────────────────────────────────────────────────────────────
    auctions = []
    if not args.skip_bonds:
        auctions, bond_health = scrape_bonds(verbose=verbose)
        health["bonds"] = bond_health
        time.sleep(2)

    # ── FX Snapshot ───────────────────────────────────────────────────────────
    fx_snapshots = {}
    if not args.skip_fx:
        if verbose:
            print("Fetching FX snapshots...")
        fx_snapshots = scrape_fx_snapshots(verbose=verbose)
        fx_ok = sum(1 for v in fx_snapshots.values() if v.get("status") == "OK")
        health["fx"] = {
            "status": "OK" if fx_ok > 0 else "ALL_FAILED",
            "pairs_ok": fx_ok,
            "pairs_total": len(fx_snapshots),
        }

    # ── Assemble & save ───────────────────────────────────────────────────────
    snapshot = build_snapshot(events, auctions, fx_snapshots, health)

    if verbose:
        print("-" * 50)
        print(f"Summary: {snapshot['summary']}")

    if args.print_output:
        print(json.dumps(snapshot, indent=2))
    else:
        save_snapshot(snapshot, output_path)

    # Overall health check — warn if calendar completely failed
    if health["calendar"]["status"] not in ("OK",):
        print(f"\nWARNING: Calendar scrape failed — {health['calendar']['message']}",
              file=sys.stderr)
        print("TE may be blocking requests. Check User-Agent or try again later.",
              file=sys.stderr)

    print("Done.")


if __name__ == "__main__":
    main()
