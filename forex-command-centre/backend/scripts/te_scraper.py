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
    v1.1.0 - Bias scoring: TE actuals fed into shared bias-history.json alongside FF runs;
             normalize_te_events_for_bias() maps event→title, surprise_dir→result,
             time_et→datetime_utc (ET+4=UTC), defaults impact to Medium (conservative);
             calculate_te_currency_bias(), calculate_te_pair_verdicts(), append_te_bias_run()
             mirror FF bias engine exactly; run_id suffixed _te for identification
    v1.0.5 - surprise_abs/pct/dir fields added to all events and bond auctions
    v1.0.2 - importance default 1→0; added impact_level field
    v1.0.1 - Fix cell positions; fix importance star detection; relax bonds canary; rename date→time_et
    v1.0.0 - Initial release: G10 calendar events, bond auctions, FX snapshot
"""

import argparse, json, re, sys, os, time
from datetime import datetime, timezone, timedelta
from urllib.request import urlopen, Request
from urllib.error import URLError, HTTPError

try:
    from bs4 import BeautifulSoup
except ImportError:
    print("ERROR: beautifulsoup4 required. Run: pip install beautifulsoup4 --break-system-packages",
          file=sys.stderr)
    sys.exit(1)

# ── Constants ─────────────────────────────────────────────────────────────────

VERSION = "1.1.0"

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

# G10 countries whose bond auctions we track (by TE data-country value, lowercase)
G10_BOND_COUNTRIES = {
    "united states", "germany", "united kingdom", "japan",
    "australia", "new zealand", "canada", "switzerland", "france", "italy",
}

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
    # Relaxed: bonds page may not have 'calendar-table' — just needs data rows
    markers = ["data-symbol", "data-country"]
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

def parse_numeric(val_str):
    """Parse value string to float, handling K/M/B/% suffixes. Returns None if unparseable."""
    if not val_str:
        return None
    s = val_str.strip().replace(',', '').replace('%', '')
    multiplier = 1.0
    if s.upper().endswith('T'):   multiplier = 1e12; s = s[:-1]
    elif s.upper().endswith('B'): multiplier = 1e9;  s = s[:-1]
    elif s.upper().endswith('M'): multiplier = 1e6;  s = s[:-1]
    elif s.upper().endswith('K'): multiplier = 1e3;  s = s[:-1]
    try:
        return round(float(s) * multiplier, 6)
    except (ValueError, TypeError):
        return None


def calculate_surprise(actual_str, forecast_str, result=None):
    """Calculate surprise magnitude from actual vs forecast strings."""
    actual   = parse_numeric(actual_str)
    forecast = parse_numeric(forecast_str)
    if actual is None or forecast is None:
        return {'surprise_abs': None, 'surprise_pct': None, 'surprise_dir': result}
    diff = actual - forecast
    surprise_pct = round((diff / abs(forecast)) * 100, 2) if forecast != 0 else None
    # Infer direction if not provided
    if result is None:
        result = 'BEAT' if diff > 0 else ('MISS' if diff < 0 else 'INLINE')
    return {
        'surprise_abs': round(diff, 6),
        'surprise_pct': surprise_pct,
        'surprise_dir': result,
    }


def parse_importance(row):
    """
    TE does not expose importance/stars in scraped HTML.
    Returns 0 (unknown) for all events — matches FF Holiday=0.
    impact_level field is preserved for schema consistency with FF data.
    """
    return 0


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

    TE confirmed row structure (from live HTML inspection):
      cells[0]  = date/time TD — time is in <span class="event-X calendar-date-Y">
      cells[1]  = country flag table
      cells[2]  = event name <a class="calendar-event">
      cells[3]  = actual  — <span id="actual">
      cells[4]  = previous — <span id="previous">
      cells[5]  = forecast/consensus — <a id="consensus">
      cells[6+] = responsive/alert cols (ignore)

    Values are extracted by id attribute within the row scope.
    bond_mode=True filters to G10_BOND_COUNTRIES instead of G10 calendar currencies.
    """
    soup = BeautifulSoup(html, "html.parser")
    events = []

    rows = soup.find_all("tr", attrs={"data-symbol": True})
    if not rows:
        rows = soup.find_all("tr", attrs={"data-event": True})

    now_utc = datetime.utcnow().isoformat() + "Z"

    for row in rows:
        try:
            symbol  = row.get("data-symbol", "").strip().upper()
            country = row.get("data-country", "").strip().lower()
            event   = row.get("data-event",   "").strip()
            cat     = row.get("data-category","").strip()

            # ── Filter ────────────────────────────────────────────────────
            if bond_mode:
                if country not in G10_BOND_COUNTRIES:
                    continue
                # Map country → currency same as calendar events
                currency = COUNTRY_TO_CURRENCY.get(country, "")
            else:
                currency = COUNTRY_TO_CURRENCY.get(country)
                if not currency:
                    continue

            # ── Time — span inside cells[0] ───────────────────────────────
            cells = row.find_all("td")
            time_val = None
            if cells:
                time_span = cells[0].find("span")
                if time_span:
                    time_val = time_span.get_text(strip=True) or None

            # ── Values — by id within this row ────────────────────────────
            def get_by_id(el_id):
                el = row.find(id=el_id)
                if not el:
                    return None
                text = el.get_text(strip=True)
                return text if text else None

            actual_val   = get_by_id("actual")
            previous_val = get_by_id("previous")
            forecast_val = get_by_id("consensus")

            def clean_val(v):
                if not v:
                    return None
                v = v.strip().replace("\xa0", "").replace("\u00a0", "")
                if len(v) == 2 and v.isupper():
                    return None  # reject stray country codes
                return v if v not in ("-", "", "NA", "N/A") else None

            actual_val   = clean_val(actual_val)
            previous_val = clean_val(previous_val)
            forecast_val = clean_val(forecast_val)

            # importance always 0 — TE does not expose stars in HTML
            importance   = 0
            impact_label = "Unknown"
            impact_level = 0

            # Both calendar and bond events use same structure
            # bond events get is_bond=True for display differentiation if needed
            entry = {
                "currency":     currency,
                "country":      row.get("data-country", "").strip(),
                "symbol":       symbol,
                "event":        event,
                "category":     cat,
                "time_et":      time_val,
                "actual":       actual_val,
                "forecast":     forecast_val,
                "previous":     previous_val,
                "importance":   importance,
                "impact":       impact_label,
                "impact_level": impact_level,
                "scraped_at":   now_utc,
                "is_bond":      bond_mode,
                **calculate_surprise(actual_val, forecast_val),
            }

            events.append(entry)

        except Exception as e:
            print(f"  Row parse error: {e}", file=sys.stderr)

    return events


# ── FX snapshot parser ────────────────────────────────────────────────────────

def parse_fx_page(html, pair, currency):
    """
    Parse a TE currency page for current rate, daily change, and TE summary text.
    Returns dict with rate data or error info.
    """
    soup = BeautifulSoup(html, "html.parser")
    result = {
        "pair":        pair,
        "currency":    currency,
        "rate":        None,
        "daily_pct":   None,
        "summary":     None,   # TE's own summary paragraph for this pair
        "scraped_at":  datetime.utcnow().isoformat() + "Z",
        "status":      "OK",
    }

    try:
        # ── Rate ─────────────────────────────────────────────────────────────
        # Method 1: <tr data-symbol="EURUSD:CUR"> contains the live rate
        rate_row = soup.find("tr", attrs={"data-symbol": True})
        if rate_row:
            tds = rate_row.find_all("td")
            for td in tds[:3]:
                t = td.get_text(strip=True).replace(",", "")
                try:
                    float(t)
                    if t and t != "0":
                        result["rate"] = t
                        break
                except (ValueError, TypeError):
                    pass

        # Method 2: TEChartsMeta JS var contains "last" value
        # e.g. TEChartsMeta = [{"last":1.153320000000,...}]
        if not result["rate"]:
            meta_match = re.search(r'"last"\s*:\s*([\d.]+)', html)
            if meta_match:
                result["rate"] = meta_match.group(1)

        # ── Daily % ──────────────────────────────────────────────────────────
        # Extract from TEChartsMeta or meta description
        # meta description: "fell to 1.1534 on March 26, 2026, down 0.21%"
        desc_match = re.search(r'(?:up|down)\s+([\d.]+)%\s+from the previous session', html)
        if desc_match:
            # Determine sign from direction word
            sign_match = re.search(r'(up|down)\s+' + re.escape(desc_match.group(1)), html)
            sign = "-" if sign_match and sign_match.group(1) == "down" else "+"
            result["daily_pct"] = f"{sign}{desc_match.group(1)}%"

        # ── Summary text ─────────────────────────────────────────────────────
        # TE puts a plain-English paragraph in <div id="stats"><h2> and <meta description>
        # Priority: stats tab > meta description

        # Method 1: stats tab paragraph
        stats_div = soup.find("div", id="stats")
        if stats_div:
            h2 = stats_div.find("h2")
            if h2:
                text = h2.get_text(strip=True)
                if len(text) > 40:
                    result["summary"] = text

        # Method 2: meta description (shorter but always present)
        if not result["summary"]:
            meta = soup.find("meta", attrs={"name": "description"})
            if meta and meta.get("content"):
                content = meta["content"]
                if len(content) > 40:
                    result["summary"] = content

    except Exception as e:
        result["status"] = f"PARSE_ERROR: {e}"

    if not result["rate"]:
        result["status"] = "RATE_NOT_FOUND"

    return result


# ── Bias engine (mirrors forex_calendar_scraper.py) ───────────────────────────
# TE events default to Medium impact — TE doesn't expose stars but events with
# actuals are always market-relevant. Conservative weighting.

IMPACT_WEIGHTS = {"High": 3.0, "Medium": 1.0, "Low": 0.0}
TIME_DECAY     = [(24, 1.0), (48, 0.7), (72, 0.4), (168, 0.2), (9999, 0.0)]

PAIRS = [
    "AUDUSD","USDJPY","EURUSD","GBPUSD","EURJPY","GBPJPY",
    "AUDJPY","NZDJPY","NZDUSD","USDCAD","USDCHF","EURGBP",
    "XAUUSD","XAGUSD","XPTUSD","XCUUSD",
    "WTICOUSD","BCOUSD","NATGASUSD",
    "BTCUSD","ETHUSD","BCHUSD","LTCUSD","MBTCUSD",
]

# ET→UTC offset (EDT=−4, EST=−5). Late March = EDT.
# TE pages are in ET. We add 4h to get UTC.
ET_TO_UTC_HOURS = 4


def time_et_to_datetime_utc(time_et_str):
    """
    Convert a TE time string like '02:00 PM' to a UTC datetime for today.
    Returns ISO string or None.
    """
    if not time_et_str:
        return None
    try:
        s = time_et_str.strip().lower().replace(" ", "")
        is_pm = "pm" in s
        s = s.replace("am", "").replace("pm", "")
        parts = s.split(":")
        h = int(parts[0])
        m = int(parts[1]) if len(parts) > 1 else 0
        if is_pm and h != 12: h += 12
        elif not is_pm and h == 12: h = 0
        # Add ET→UTC offset
        h_utc = h + ET_TO_UTC_HOURS
        today = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
        event_utc = today + timedelta(hours=h_utc, minutes=m)
        return event_utc.isoformat() + "Z"
    except Exception:
        return None


def normalize_te_events_for_bias(events):
    """
    Normalise TE events to FF bias-engine schema.
    For bond auctions with no forecast: infer BEAT/MISS from actual vs previous.
    Yield up vs previous = BEAT (hawkish = bullish for currency).
    """
    out = []
    for e in events:
        actual   = e.get("actual")
        currency = e.get("currency", "")
        if not actual or not currency:
            continue

        result = e.get("surprise_dir")

        # Bonds often lack forecast -- infer from actual vs previous
        if (not result or result not in ("BEAT", "MISS", "INLINE")) and e.get("is_bond"):
            prev = e.get("previous")
            if prev:
                a = parse_numeric(actual)
                p = parse_numeric(prev)
                if a is not None and p is not None:
                    if a > p:   result = "BEAT"
                    elif a < p: result = "MISS"
                    else:       result = "INLINE"

        if not result or result not in ("BEAT", "MISS", "INLINE"):
            continue

        dt_utc = time_et_to_datetime_utc(e.get("time_et"))
        out.append({
            "title":        e.get("event", e.get("symbol", "Unknown")),
            "currency":     currency,
            "impact":       "Medium",
            "result":       result,
            "actual":       actual,
            "forecast":     e.get("forecast"),
            "previous":     e.get("previous"),
            "datetime_utc": dt_utc,
            "source_site":  "te_bond" if e.get("is_bond") else "te_calendar",
            "surprise_abs": e.get("surprise_abs"),
            "surprise_pct": e.get("surprise_pct"),
            "is_bond":      e.get("is_bond", False),
        })
    return out


def get_te_decay(hours_ago):
    for threshold, mult in TIME_DECAY:
        if hours_ago <= threshold:
            return mult
    return 0.0


def calculate_te_currency_bias(normalised_events, now):
    """Same logic as FF calculate_currency_bias — runs on normalised TE events."""
    scores = {}
    for event in normalised_events:
        currency = event.get("currency")
        impact   = event.get("impact", "Medium")
        result   = event.get("result")
        actual   = event.get("actual")
        dt_str   = event.get("datetime_utc")
        if not actual or not result or result in ("UNKNOWN", None): continue
        if IMPACT_WEIGHTS.get(impact, 0) == 0: continue
        if not dt_str: continue
        try:
            event_dt = datetime.fromisoformat(dt_str.replace("Z", ""))
        except Exception:
            continue
        if event_dt >= now: continue
        hours_ago = (now - event_dt).total_seconds() / 3600
        decay = get_te_decay(hours_ago)
        if decay == 0: continue
        score_val = {"BEAT": 1.0, "MISS": -1.0, "INLINE": 0.0}.get(result, 0.0)
        final = score_val * IMPACT_WEIGHTS.get(impact, 1.0) * decay
        if currency not in scores:
            scores[currency] = {"total": 0.0, "events": [], "count": 0}
        scores[currency]["total"]  += final
        scores[currency]["count"]  += 1
        scores[currency]["events"].append({
            "title":      event.get("title"), "impact": impact, "result": result,
            "actual":     actual, "forecast": event.get("forecast"),
            "previous":   event.get("previous"), "hours_ago": round(hours_ago, 1),
            "score":      round(final, 2), "source_site": event.get("source_site", "te_calendar"),
        })

    bias_map = {}
    for currency, data in scores.items():
        t = data["total"]; c = data["count"]
        if c == 0: continue
        if t > 2.0:    bias = "STRONGLY_BULLISH"
        elif t > 0.5:  bias = "BULLISH"
        elif t < -2.0: bias = "STRONGLY_BEARISH"
        elif t < -0.5: bias = "BEARISH"
        else:          bias = "NEUTRAL"
        high_c = sum(1 for e in data["events"] if e["impact"] == "High")
        if high_c >= 2:           conf = "HIGH"
        elif high_c == 1 or c >= 2: conf = "MEDIUM"
        else:                       conf = "LOW"
        bias_map[currency] = {
            "score":       round(t, 2), "bias": bias, "confidence": conf,
            "event_count": c, "events": data["events"],
        }
    return bias_map


def calculate_te_pair_verdicts(bias_map):
    """Same logic as FF calculate_pair_verdicts."""
    def size_modifier(net):
        a = abs(net)
        if a > 3.0: return 0.5
        if a > 1.0: return 0.75
        return 1.0

    verdicts = {}
    for pair in PAIRS:
        base  = pair[:3]; quote = pair[3:]
        bd = bias_map.get(base,  {"score": 0, "bias": "NEUTRAL", "confidence": "LOW", "event_count": 0})
        qd = bias_map.get(quote, {"score": 0, "bias": "NEUTRAL", "confidence": "LOW", "event_count": 0})
        net       = bd["score"] - qd["score"]
        direction = "BULLISH" if net > 0.5 else ("BEARISH" if net < -0.5 else "NEUTRAL")
        strength  = "STRONG"  if abs(net) > 3 else ("MODERATE" if abs(net) > 1 else "WEAK")
        verdicts[pair] = {
            "net_score":        round(net, 2), "direction": direction, "strength": strength,
            "base_bias":        bd.get("bias", "NEUTRAL"),
            "quote_bias":       qd.get("bias", "NEUTRAL"),
            "base_confidence":  bd.get("confidence", "LOW"),
            "quote_confidence": qd.get("confidence", "LOW"),
            "size_modifier":    size_modifier(net),
        }
    return verdicts


def load_bias_history(path):
    if not os.path.exists(path):
        return {"schema_version": "1.0.0", "created": datetime.utcnow().isoformat() + "Z", "runs": []}
    try:
        with open(path, "r", encoding="utf-8") as f:
            raw = f.read()
        return json.loads(raw) if raw.strip() else             {"schema_version": "1.0.0", "created": datetime.utcnow().isoformat() + "Z", "runs": []}
    except Exception as e:
        print(f"Warning: bias history read failed: {e}", file=sys.stderr)
        return {"schema_version": "1.0.0", "created": datetime.utcnow().isoformat() + "Z", "runs": []}


def append_te_bias_run(history, normalised_events, bias_map, pair_verdicts):
    """Append a TE bias run to bias-history.json alongside FF runs."""
    now     = datetime.utcnow()
    cutoff  = now - timedelta(days=90)

    event_results = []
    for e in normalised_events:
        if not e.get("actual") or not e.get("result"): continue
        dt_str = e.get("datetime_utc")
        if not dt_str: continue
        try:
            if datetime.fromisoformat(dt_str.replace("Z", "")) >= now: continue
        except Exception:
            continue
        cur = e.get("currency", "")
        title = e.get("title", "")
        event_results.append({
            "id":          f"te-{cur.lower()}-{title.lower().replace(' ','-')[:20]}-{dt_str[:10]}",
            "title":       title,
            "currency":    cur,
            "impact":      e.get("impact", "Medium"),
            "actual":      e.get("actual"),
            "forecast":    e.get("forecast"),
            "previous":    e.get("previous"),
            "result":      e.get("result"),
            "datetime_utc": dt_str,
            "source_site": e.get("source_site", "te_calendar"),
        })

    run = {
        "run_id":        now.strftime("%Y%m%d_%H%M%S") + "_te",
        "timestamp":     now.isoformat() + "Z",
        "source":        "te",
        "event_results": event_results,
        "currency_bias": {k: {"score": v["score"], "bias": v["bias"],
                               "confidence": v["confidence"], "event_count": v["event_count"]}
                          for k, v in bias_map.items()},
        "pair_verdicts": pair_verdicts,
    }

    history["runs"].append(run)
    history["runs"] = [
        r for r in history["runs"]
        if datetime.fromisoformat(r["timestamp"].replace("Z", "")) >= cutoff
    ]
    history["last_updated"] = now.isoformat() + "Z"
    history["run_count"]    = len(history["runs"])
    return history


def save_bias_history(history, path):
    d = os.path.dirname(path)
    if d and not os.path.exists(d): os.makedirs(d)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(history, f, indent=2, ensure_ascii=False)
    print(f"TE bias: {history.get('run_count', 0)} runs -> {path}")


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

def build_snapshot(events, fx_snapshots, health):
    """Assemble the final te-snapshot.json structure. Bond auctions are merged into events."""
    now = datetime.utcnow().isoformat() + "Z"

    high_events  = [e for e in events if e.get("impact") == "High"]
    med_events   = [e for e in events if e.get("impact") == "Medium"]
    with_actual  = [e for e in events if e.get("actual")]
    bond_events  = [e for e in events if e.get("is_bond")]

    fx_ok  = sum(1 for v in fx_snapshots.values() if v.get("status") == "OK")
    fx_tot = len(fx_snapshots)

    return {
        "schema_version": VERSION,
        "source":         "TradingEconomics",
        "last_updated":   now,
        "health":         health,
        "summary": {
            "total_events":       len(events),
            "high_impact":        len(high_events),
            "medium_impact":      len(med_events),
            "events_with_actual": len(with_actual),
            "bond_auctions":      len(bond_events),
            "bonds_with_actual":  len([e for e in bond_events if e.get("actual")]),
            "fx_pairs_ok":        f"{fx_ok}/{fx_tot}",
        },
        "today_events":   events,   # includes bond auctions (is_bond=True)
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


# ── TE Backfill ───────────────────────────────────────────────────────────────

def get_te_past_week_urls(n_weeks=4):
    """Generate TE calendar week URLs for the past n_weeks. Same Sunday-anchored logic as FF."""
    MONTHS = ["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"]
    now = datetime.utcnow()
    days_since_sunday = (now.weekday() + 1) % 7
    current_sunday = (now - timedelta(days=days_since_sunday)).replace(
        hour=0, minute=0, second=0, microsecond=0)
    weeks = []
    for i in range(n_weeks, 0, -1):
        week_sunday = current_sunday - timedelta(weeks=i)
        month_str   = MONTHS[week_sunday.month - 1]
        suffix      = f"{month_str}{week_sunday.day}.{week_sunday.year}"
        url         = f"{BASE_URL}/calendar?week={suffix}"
        weeks.append((url, week_sunday))
    return weeks


def te_week_already_backfilled(history, week_sunday):
    rid = f"backfill_{week_sunday.strftime('%Y%m%d')}_te"
    return any(r.get("run_id") == rid for r in history.get("runs", []))


def backfill_te_week(url, week_sunday, history, bias_path, verbose=True):
    """Scrape one week of TE calendar, score bias, append to shared bias-history.json."""
    if verbose:
        print(f"  TE fetching: {url}...")
    try:
        html = fetch_html(url)
    except RuntimeError as e:
        print(f"  WARNING: {e} — skipping", file=sys.stderr)
        return history

    ok, msg = canary_calendar(html)
    if not ok:
        print(f"  {msg} — skipping", file=sys.stderr)
        return history

    events = parse_calendar_page(html, bond_mode=False)
    with_actual = [e for e in events if e.get("actual")]
    if verbose:
        print(f"    {len(events)} events | {len(with_actual)} with actuals")

    if not with_actual:
        print(f"    No actuals — skipping week")
        return history

    # Normalise and score
    normalised = normalize_te_events_for_bias(events)
    with_result = [e for e in normalised if e.get("result") in ("BEAT","MISS","INLINE")]
    if not with_result:
        print(f"    No scoreable events — skipping week")
        return history

    # Use end-of-week timestamp for backfill (same as FF)
    run_time = week_sunday + timedelta(days=5, hours=23, minutes=59)
    now = datetime.utcnow()
    bias_map      = calculate_te_currency_bias(normalised, now)
    pair_verdicts = calculate_te_pair_verdicts(bias_map)

    if verbose:
        for cur, d in sorted(bias_map.items()):
            print(f"    {cur}: {d['bias']} ({d['score']:+.1f}) [{d['confidence']}, {d['event_count']} ev]")

    history = append_te_bias_run(history, normalised, bias_map, pair_verdicts)
    # Override run_id and timestamp to mark as backfill
    history["runs"][-1]["run_id"]    = f"backfill_{week_sunday.strftime('%Y%m%d')}_te"
    history["runs"][-1]["timestamp"] = run_time.isoformat() + "Z"
    history["runs"][-1]["backfill"]  = True
    save_bias_history(history, bias_path)
    return history


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
    parser.add_argument("--backfill", action="store_true",
                        help="Backfill past N weeks of TE calendar into bias-history.json")
    parser.add_argument("--backfill-weeks", type=int, default=4, dest="backfill_weeks",
                        help="Number of weeks to backfill (default: 4)")
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
    UNRAID_BIAS = "/mnt/user/appdata/trading-state/data/bias-history.json"
    DEFAULT_BIAS = os.path.join(os.path.dirname(output_path), "bias-history.json")
    bias_path = UNRAID_BIAS if args.unraid else DEFAULT_BIAS
    verbose = not args.quiet

    # ── Backfill mode ─────────────────────────────────────────────────────────
    if args.backfill:
        print(f"TE BACKFILL MODE: {args.backfill_weeks} weeks...")
        history    = load_bias_history(bias_path)
        past_weeks = get_te_past_week_urls(args.backfill_weeks)
        for url, week_sunday in past_weeks:
            if te_week_already_backfilled(history, week_sunday):
                print(f"  Skipping {week_sunday.strftime('%Y-%m-%d')} (already backfilled)")
                continue
            print(f"  Week: {week_sunday.strftime('%Y-%m-%d')}")
            history = backfill_te_week(url, week_sunday, history, bias_path, verbose=verbose)
            time.sleep(2)
        print(f"TE backfill complete: {history.get('run_count', 0)} total runs in bias history")
        print("Done.")
        return

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

    # ── Bonds — merge into events list ───────────────────────────────────────
    if not args.skip_bonds:
        auctions, bond_health = scrape_bonds(verbose=verbose)
        health["bonds"] = bond_health
        events.extend(auctions)  # bonds are now just events with is_bond=True
        if verbose:
            print(f"  Merged {len(auctions)} bond auctions into events")
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

    # ── Assemble & save snapshot ──────────────────────────────────────────────
    snapshot = build_snapshot(events, fx_snapshots, health)

    if verbose:
        print("-" * 50)
        print(f"Summary: {snapshot['summary']}")

    if args.print_output:
        print(json.dumps(snapshot, indent=2))
    else:
        save_snapshot(snapshot, output_path)

    # ── Bias scoring — feed TE actuals into shared bias-history.json ──────────
    if not args.print_output:
        normalised = normalize_te_events_for_bias(events)
        with_result = [e for e in normalised if e.get("result") in ("BEAT","MISS","INLINE")]
        if with_result:
            if verbose:
                print(f"Scoring TE bias: {len(with_result)} events with results...")
            now = datetime.utcnow()
            bias_map      = calculate_te_currency_bias(normalised, now)
            pair_verdicts = calculate_te_pair_verdicts(bias_map)
            if verbose:
                for cur, d in sorted(bias_map.items()):
                    print(f"  {cur}: {d['bias']} ({d['score']:+.1f}) [{d['confidence']}, {d['event_count']} events]")
                print(f"  {len(pair_verdicts)} pair verdicts calculated")
            history = load_bias_history(bias_path)
            history = append_te_bias_run(history, normalised, bias_map, pair_verdicts)
            save_bias_history(history, bias_path)
        else:
            if verbose:
                print("No TE events with results yet — bias scoring skipped")

    # Overall health check — warn if calendar completely failed
    if health["calendar"]["status"] not in ("OK",):
        print(f"\nWARNING: Calendar scrape failed — {health['calendar']['message']}",
              file=sys.stderr)
        print("TE may be blocking requests. Check User-Agent or try again later.",
              file=sys.stderr)

    print("Done.")


if __name__ == "__main__":
    main()
