#!/usr/bin/env python3
"""
Macro Dominance Index (MDI) Scraper v1.0.0
Institutional-grade macro dominance scoring for cross pairs.

PURPOSE:
    Fourth satellite in the FCC GPS stack:
      1. Structure (UTCC/TradingView)
      2. Macro Bias (TE + ForexFactory scrapers)
      3. Retail Sentiment (IG Client Sentiment)
      4. Macro Dominance (this scraper)

    Core principle: "When one leg of a cross is in a strong macro regime,
    news on the other leg usually gets absorbed."

    Scores each G8 currency (-100 to +100) based on:
      - 10Y bond yield level vs 20-day history (±30 pts)
      - 10Y yield momentum (20d change)          (±25 pts)
      - Central bank policy rate (real rate)     (±25 pts)
      - Currency strength proxy                  (±20 pts)

    Per cross pair: computes gap = |base_score - quote_score|
      Gap >= 60  -> DOMINANT    (absorption likely)
      Gap 30-59  -> LEANING     (partial absorption)
      Gap < 30   -> BALANCED    (full news impact)

    SOFT GATE AUTHORITY: v1.0.0 outputs are DISPLAY-ONLY.
    The FCC news gate is not modified by MDI in v1.0.0.
    Historical storage enables hit-rate validation in v1.x.x.

REQUIRES:
    pip install beautifulsoup4 --break-system-packages

OUTPUT FILE: macro-dominance.json
    Default Unraid path: /mnt/user/appdata/trading-state/data/macro-dominance.json

CRON (Unraid User Scripts -- every 4 hours):
    0 */4 * * * /usr/bin/python3 /mnt/user/appdata/forex-command-centre/backend/scripts/macro_dominance_scraper_v1.0.0.py --unraid

MANUAL RUN (test, prints output, no file write):
    python3 macro_dominance_scraper_v1.0.0.py --print

Changelog:
    v1.0.2 - HIKE/CUT/HOLD detection fix. v1.0.1 searched only the first
             8000 chars of HTML for CB action prose, but TE's nav/header
             boilerplate pushes the summary H2 to ~17-20K chars. Result:
             all 8 currencies returned last_change=None, leaving the
             policy_stance scoring component (+/- 20 pts) silent.
             Fix: search full HTML. Patterns are specific enough
             ("left ... steady at", "raised ... rate") that they do not
             false-match on nav/CSS/footer content.
    v1.0.1 - Policy rate parser rewritten. TE interest-rate pages do NOT
             expose TEChartsMeta "last" JSON or data-symbol row reliably.
             New priority order:
               1. "last recorded at X.XX percent" (most reliable prose)
               2. "target range" upper bound (Fed-style ranges)
               3. Summary headline H2 numeric extraction
               4. Original TEChartsMeta fallback
             HIKE/CUT/HOLD detection also rewritten to use summary prose
             ("steady at", "raised", "cut", "kept").
    v1.0.0 - Initial release. SOFT gate authority. 8 G8 currencies,
             28 cross pairs scored. Scrapes 10Y yields + policy rates from TE.
             Fail-closed: missing data -> currency omitted from scoring.
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

# -- Constants --------------------------------------------------------------

VERSION = "1.0.2"

# G8 currencies (USD, EUR, GBP, JPY, AUD, NZD, CAD, CHF)
# NOTE: EUR uses German bund as proxy for eurozone benchmark
G8_CURRENCIES = ["USD", "EUR", "GBP", "JPY", "AUD", "NZD", "CAD", "CHF"]

# TE bond yield page slugs per currency (10Y government bond)
# URL pattern: https://tradingeconomics.com/{slug}/government-bond-yield
TE_YIELD_SLUGS = {
    "USD": "united-states",
    "EUR": "germany",           # German bund = eurozone proxy
    "GBP": "united-kingdom",
    "JPY": "japan",
    "AUD": "australia",
    "NZD": "new-zealand",
    "CAD": "canada",
    "CHF": "switzerland",
}

# TE interest rate page slugs (central bank policy rate)
# URL pattern: https://tradingeconomics.com/{slug}/interest-rate
TE_POLICY_SLUGS = {
    "USD": "united-states",
    "EUR": "euro-area",
    "GBP": "united-kingdom",
    "JPY": "japan",
    "AUD": "australia",
    "NZD": "new-zealand",
    "CAD": "canada",
    "CHF": "switzerland",
}

# Cross pairs to score (28 majors + crosses). Base/quote convention.
CROSS_PAIRS = [
    # USD majors
    "EURUSD", "GBPUSD", "AUDUSD", "NZDUSD",
    "USDJPY", "USDCAD", "USDCHF",
    # EUR crosses
    "EURGBP", "EURJPY", "EURAUD", "EURNZD", "EURCAD", "EURCHF",
    # GBP crosses
    "GBPJPY", "GBPAUD", "GBPNZD", "GBPCAD", "GBPCHF",
    # AUD crosses
    "AUDJPY", "AUDNZD", "AUDCAD", "AUDCHF",
    # NZD crosses
    "NZDJPY", "NZDCAD", "NZDCHF",
    # CAD/CHF crosses
    "CADJPY", "CADCHF", "CHFJPY",
]

# Dominance thresholds (gap between base and quote scores)
GAP_DOMINANT = 60   # One leg clearly dominates
GAP_LEANING  = 30   # Tilt toward one leg

BASE_URL      = "https://tradingeconomics.com"
YIELD_URL_TPL = f"{BASE_URL}/{{slug}}/government-bond-yield"
POLICY_URL_TPL = f"{BASE_URL}/{{slug}}/interest-rate"

UNRAID_OUTPUT = "/mnt/user/appdata/trading-state/data/macro-dominance.json"
UNRAID_HISTORY = "/mnt/user/appdata/trading-state/data/macro-dominance-history.json"

# -- HTTP fetch -------------------------------------------------------------

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


# -- Parsing helpers --------------------------------------------------------

def parse_yield_page(html, currency):
    """
    Parse TE government bond yield page for current yield + 20d stats.

    Returns dict:
        current_yield: float (percent, e.g. 4.53)
        yield_20d_ago: float or None (from chart data if available)
        daily_change_pct: float or None
        scraped_at: ISO timestamp
        status: 'OK' | error string

    Fail-closed: on parse error, returns None values with error status.
    """
    result = {
        "currency":        currency,
        "current_yield":   None,
        "yield_20d_ago":   None,
        "daily_change_pct": None,
        "scraped_at":      datetime.utcnow().isoformat() + "Z",
        "status":          "OK",
    }

    try:
        soup = BeautifulSoup(html, "html.parser")

        # Method 1: TEChartsMeta JSON contains recent history
        # Pattern: TEChartsMeta = [{"last": 4.531, "low": 4.50, "high": 4.55, ...}]
        # Plus historical series in embedded JS
        meta_match = re.search(r'"last"\s*:\s*([\d.]+)', html)
        if meta_match:
            try:
                result["current_yield"] = float(meta_match.group(1))
            except (ValueError, TypeError):
                pass

        # Method 2: <tr data-symbol="GTNLD10Y:GOV"> with current value in td
        if result["current_yield"] is None:
            rate_row = soup.find("tr", attrs={"data-symbol": True})
            if rate_row:
                tds = rate_row.find_all("td")
                for td in tds[:3]:
                    t = td.get_text(strip=True).replace(",", "")
                    try:
                        val = float(t)
                        if 0 < val < 30:   # sanity: yields are 0-30%
                            result["current_yield"] = val
                            break
                    except (ValueError, TypeError):
                        pass

        # Daily change from meta description
        # e.g. "rose to 4.53% on March 20, 2026, up 0.02"
        desc_match = re.search(r'(up|down|rose|fell|gained|lost)\s+([\d.]+)', html[:5000])
        if desc_match:
            direction = desc_match.group(1).lower()
            try:
                change = float(desc_match.group(2))
                if direction in ("down", "fell", "lost"):
                    change = -change
                result["daily_change_pct"] = change
            except (ValueError, TypeError):
                pass

        # 20-day ago yield from embedded historical series (TradingEconomics
        # charts often embed series data in <script> as [[timestamp, value], ...])
        # We look for any numeric time series and take the value from ~20 days prior.
        # Conservative: if not found, leave null. Scoring will use momentum = 0.
        series_match = re.search(r'series\s*:\s*\[\s*\[[\d,.\s\[\]]+\]', html)
        if series_match:
            # Extract all [timestamp, value] pairs
            pairs = re.findall(r'\[(\d{10,13}),\s*([\d.]+)\]', series_match.group(0))
            if len(pairs) >= 2:
                try:
                    # Pairs are in ascending time order; last = most recent
                    # 20 trading days ~= 28 calendar days
                    if result["current_yield"] is None:
                        result["current_yield"] = float(pairs[-1][1])
                    # Find value closest to 20 days ago
                    now_ts = int(pairs[-1][0])
                    target_ts = now_ts - (20 * 86400 * 1000 if now_ts > 1e12 else 20 * 86400)
                    closest = min(pairs, key=lambda p: abs(int(p[0]) - target_ts))
                    result["yield_20d_ago"] = float(closest[1])
                except (ValueError, TypeError, IndexError):
                    pass

        if result["current_yield"] is None:
            result["status"] = "PARSE_FAIL: no yield value found"

    except Exception as e:
        result["status"] = f"PARSE_ERROR: {e}"

    return result


def parse_policy_page(html, currency):
    """
    Parse TE interest rate page for current policy rate + last change direction.

    Returns dict:
        current_rate: float (percent)
        last_change: 'HIKE' | 'CUT' | 'HOLD' | None
        scraped_at: ISO timestamp
        status: 'OK' | error string
    """
    result = {
        "currency":     currency,
        "current_rate": None,
        "last_change":  None,
        "scraped_at":   datetime.utcnow().isoformat() + "Z",
        "status":       "OK",
    }

    try:
        # ------------------------------------------------------------------
        # Method 1 (PRIMARY): prose pattern "last recorded at X.XX percent"
        # This appears in every TE interest-rate page summary H2.
        # ------------------------------------------------------------------
        # e.g. "The benchmark interest rate in the United States was last
        #       recorded at 3.75 percent."
        # e.g. "The benchmark interest rate in Japan was last recorded at
        #       0.50 percent."
        # Also handles negative rates: "-0.10 percent" (Japan historical)
        m = re.search(
            r'last recorded at\s+(-?[\d.]+)\s*percent',
            html, re.IGNORECASE
        )
        if m:
            try:
                val = float(m.group(1))
                if -5 < val < 30:
                    result["current_rate"] = val
            except (ValueError, TypeError):
                pass

        # ------------------------------------------------------------------
        # Method 2: Fed-style target range — "3.5%-3.75% target range" or
        # "target range at 3.5%-3.75%". Pick upper bound (effective ceiling).
        # ------------------------------------------------------------------
        if result["current_rate"] is None:
            # Handle both ascii hyphen and en-dash between the two bounds
            # Range BEFORE "target range" (most common TE pattern)
            range_patterns = [
                r'(\d+(?:\.\d+)?)\s*%\s*[\-\u2013\u2014]\s*(\d+(?:\.\d+)?)\s*%\s*target\s*range',
                r'target\s*range[^\d]{0,40}(\d+(?:\.\d+)?)\s*%\s*[\-\u2013\u2014]\s*(\d+(?:\.\d+)?)\s*%',
            ]
            for pat in range_patterns:
                m = re.search(pat, html, re.IGNORECASE)
                if m:
                    try:
                        upper = float(m.group(2))
                        if 0 < upper < 25:
                            result["current_rate"] = upper
                            break
                    except (ValueError, TypeError):
                        continue

        # ------------------------------------------------------------------
        # Method 3: H2 summary headline "steady at X.XX percent" or
        # "raised to X.XX percent" — covers pages without "last recorded at"
        # ------------------------------------------------------------------
        if result["current_rate"] is None:
            headline_patterns = [
                r'(?:steady|unchanged|held|kept)\s+at[^\d]{0,40}(-?\d+(?:\.\d+)?)\s*percent',
                r'(?:raised|hiked|increased|cut|lowered|reduced)[^\d]{0,80}(?:to|by)[^\d]{0,20}(-?\d+(?:\.\d+)?)\s*percent',
                r'interest rate[^\d]{0,40}(-?\d+(?:\.\d+)?)\s*percent',
            ]
            for pat in headline_patterns:
                m = re.search(pat, html, re.IGNORECASE)
                if m:
                    try:
                        val = float(m.group(1))
                        if -5 < val < 30:
                            result["current_rate"] = val
                            break
                    except (ValueError, TypeError):
                        continue

        # ------------------------------------------------------------------
        # Method 4 (LEGACY FALLBACK): TEChartsMeta "last" — rarely present
        # on interest-rate pages but kept for safety.
        # ------------------------------------------------------------------
        if result["current_rate"] is None:
            meta_match = re.search(r'"last"\s*:\s*(-?[\d.]+)', html)
            if meta_match:
                try:
                    val = float(meta_match.group(1))
                    if -5 < val < 30:
                        result["current_rate"] = val
                except (ValueError, TypeError):
                    pass

        # ------------------------------------------------------------------
        # Method 5 (LEGACY FALLBACK): data-symbol row
        # ------------------------------------------------------------------
        if result["current_rate"] is None:
            soup = BeautifulSoup(html, "html.parser")
            rate_row = soup.find("tr", attrs={"data-symbol": True})
            if rate_row:
                tds = rate_row.find_all("td")
                for td in tds[:3]:
                    t = td.get_text(strip=True).replace(",", "")
                    try:
                        val = float(t)
                        if -5 < val < 25:
                            result["current_rate"] = val
                            break
                    except (ValueError, TypeError):
                        pass

        # ------------------------------------------------------------------
        # Last change direction from summary prose
        # Priority: HOLD > HIKE/CUT (HOLD language is most distinctive)
        # ------------------------------------------------------------------
        # v1.0.2: search full HTML. TE nav/header boilerplate pushes the
        # summary H2 past position 8000, so the old html[:8000] window
        # missed every currency. Patterns below are specific enough
        # ("left ... steady at", "raised the bank rate") that they will
        # not false-match on nav/CSS/footer content.
        html_lower = html.lower()

        # HOLD patterns first (more specific)
        hold_patterns = [
            r'\bleft\b[^.]{0,40}\b(?:steady|unchanged)',
            r'\b(?:kept|held|maintained)\b[^.]{0,40}\b(?:steady|unchanged|at)',
            r'\bsteady\s+at\b',
            r'\bunchanged\s+at\b',
        ]
        hike_patterns = [
            r'\braised\s+(?:the\s+)?(?:\w+\s+)?(?:rate|rates|fed|ecb|boe|rba|rbnz|boc|snb|cash|bank|policy|benchmark|target)',
            r'\bhiked?\s+(?:the\s+)?(?:\w+\s+)?(?:rate|rates|by)',
            r'\bincreased\s+(?:the\s+)?(?:\w+\s+)?(?:rate|rates|interest)',
        ]
        cut_patterns = [
            r'\bcut\s+(?:the\s+)?(?:\w+\s+)?(?:rate|rates|fed|ecb|boe|rba|rbnz|boc|snb|cash|bank|policy|benchmark|target|by)',
            r'\blowered\s+(?:the\s+)?(?:\w+\s+)?(?:rate|rates|interest)',
            r'\breduced\s+(?:the\s+)?(?:\w+\s+)?(?:rate|rates|interest)',
        ]

        found_hold = any(re.search(p, html_lower) for p in hold_patterns)
        found_hike = any(re.search(p, html_lower) for p in hike_patterns)
        found_cut  = any(re.search(p, html_lower) for p in cut_patterns)

        if found_hold and not (found_hike or found_cut):
            result["last_change"] = "HOLD"
        elif found_hike and not found_cut:
            result["last_change"] = "HIKE"
        elif found_cut and not found_hike:
            result["last_change"] = "CUT"
        elif found_hold:
            # Conflict resolution: "left steady after raising last month" etc.
            # HOLD wins if the CB did not move THIS meeting
            result["last_change"] = "HOLD"

        if result["current_rate"] is None:
            result["status"] = "PARSE_FAIL: no policy rate found"

    except Exception as e:
        result["status"] = f"PARSE_ERROR: {e}"

    return result


# -- Scoring engine ---------------------------------------------------------

def score_currency(ccy_data, all_policy_rates):
    """
    Score a single currency -100 to +100 based on macro dominance inputs.

    Weights:
      - Yield level vs peers:       +/- 30 pts
      - Yield momentum (20d change): +/- 25 pts
      - Real rate vs peers:          +/- 25 pts
      - Policy stance (last change): +/- 20 pts

    Fail-closed: missing inputs -> 0 contribution from that factor.
    Returns dict with score + components for audit.
    """
    ccy = ccy_data["currency"]
    components = {
        "yield_level":    0,
        "yield_momentum": 0,
        "real_rate":      0,
        "policy_stance":  0,
    }
    reasons = []

    # --- 1. Yield level vs peers (+/- 30) ---
    if ccy_data.get("yield", {}).get("current_yield") is not None and all_policy_rates:
        current = ccy_data["yield"]["current_yield"]
        peer_yields = [
            v.get("yield", {}).get("current_yield")
            for v in all_policy_rates.values()
            if v.get("yield", {}).get("current_yield") is not None
        ]
        if len(peer_yields) >= 3:
            avg_yield = sum(peer_yields) / len(peer_yields)
            # Normalize: each 100bp above avg = +10 pts, capped at +/- 30
            diff = current - avg_yield
            score = max(-30, min(30, diff * 10))
            components["yield_level"] = round(score, 1)
            reasons.append(f"yield {current:.2f}% vs peer avg {avg_yield:.2f}%")

    # --- 2. Yield momentum (+/- 25) ---
    y20 = ccy_data.get("yield", {}).get("yield_20d_ago")
    current_y = ccy_data.get("yield", {}).get("current_yield")
    if y20 is not None and current_y is not None:
        change_bp = (current_y - y20) * 100    # convert to basis points
        # 50bp move = full +/- 25 pts
        score = max(-25, min(25, (change_bp / 50.0) * 25))
        components["yield_momentum"] = round(score, 1)
        reasons.append(f"20d yield change {change_bp:+.0f}bp")

    # --- 3. Real rate vs peers (+/- 25) ---
    # Real rate proxy: policy rate - 2% (rough developed-market inflation anchor)
    # Relative scoring: rank against peers
    policy = ccy_data.get("policy", {}).get("current_rate")
    if policy is not None and all_policy_rates:
        peer_policies = [
            v.get("policy", {}).get("current_rate")
            for v in all_policy_rates.values()
            if v.get("policy", {}).get("current_rate") is not None
        ]
        if len(peer_policies) >= 3:
            avg_policy = sum(peer_policies) / len(peer_policies)
            diff = policy - avg_policy
            score = max(-25, min(25, diff * 8))
            components["real_rate"] = round(score, 1)
            reasons.append(f"policy {policy:.2f}% vs peer avg {avg_policy:.2f}%")

    # --- 4. Policy stance (+/- 20) ---
    last_change = ccy_data.get("policy", {}).get("last_change")
    if last_change == "HIKE":
        components["policy_stance"] = 20
        reasons.append("recent hike")
    elif last_change == "CUT":
        components["policy_stance"] = -20
        reasons.append("recent cut")
    elif last_change == "HOLD":
        components["policy_stance"] = 0
        reasons.append("on hold")

    # Aggregate
    total = sum(components.values())
    total = max(-100, min(100, total))

    return {
        "currency":   ccy,
        "score":      round(total, 1),
        "components": components,
        "reasons":    reasons,
    }


def score_pair(pair, currency_scores):
    """
    Compute MDI verdict for a cross pair.

    Args:
        pair: e.g. "CADJPY"
        currency_scores: dict of { "CAD": {...}, "JPY": {...}, ... }

    Returns:
        dict with base/quote scores, gap, dominant_leg, verdict, threshold.
        Returns None if either leg missing data (fail-closed).
    """
    base  = pair[:3]
    quote = pair[3:]

    if base not in currency_scores or quote not in currency_scores:
        return None

    base_score  = currency_scores[base]["score"]
    quote_score = currency_scores[quote]["score"]
    gap = abs(base_score - quote_score)

    if gap >= GAP_DOMINANT:
        if base_score > quote_score:
            dominant = "base"
            verdict  = f"{base}-strength dominant" if base_score > 0 else f"{quote}-weakness dominant"
        else:
            dominant = "quote"
            verdict  = f"{quote}-strength dominant" if quote_score > 0 else f"{base}-weakness dominant"
        threshold = "DOMINANT"
    elif gap >= GAP_LEANING:
        if base_score > quote_score:
            dominant = "base"
            verdict  = f"leaning {base}-side"
        else:
            dominant = "quote"
            verdict  = f"leaning {quote}-side"
        threshold = "LEANING"
    else:
        dominant = None
        verdict  = "balanced — full news impact"
        threshold = "BALANCED"

    return {
        "pair":       pair,
        "base":       {"ccy": base,  "score": base_score},
        "quote":      {"ccy": quote, "score": quote_score},
        "gap":        round(gap, 1),
        "dominant_leg": dominant,
        "verdict":    verdict,
        "threshold":  threshold,
        "absorption_likely": threshold == "DOMINANT",
    }


# -- Orchestration ----------------------------------------------------------

def scrape_all_yields(verbose=True):
    """Scrape 10Y yields for all G8 currencies."""
    results = {}
    for ccy, slug in TE_YIELD_SLUGS.items():
        url = YIELD_URL_TPL.format(slug=slug)
        if verbose:
            print(f"  Yield: {ccy} ({url}) ...")
        try:
            html = fetch_html(url)
        except RuntimeError as e:
            print(f"    ERROR: {e}", file=sys.stderr)
            results[ccy] = {
                "currency": ccy,
                "current_yield": None,
                "status": f"FETCH_ERROR: {e}",
                "scraped_at": datetime.utcnow().isoformat() + "Z",
            }
            time.sleep(1)
            continue

        parsed = parse_yield_page(html, ccy)
        results[ccy] = parsed
        if verbose:
            y = parsed.get("current_yield")
            print(f"    {ccy}: {y if y is not None else 'N/A'}%  [{parsed['status']}]")
        time.sleep(2)   # polite

    return results


def scrape_all_policies(verbose=True):
    """Scrape central bank policy rates for all G8 currencies."""
    results = {}
    for ccy, slug in TE_POLICY_SLUGS.items():
        url = POLICY_URL_TPL.format(slug=slug)
        if verbose:
            print(f"  Policy: {ccy} ({url}) ...")
        try:
            html = fetch_html(url)
        except RuntimeError as e:
            print(f"    ERROR: {e}", file=sys.stderr)
            results[ccy] = {
                "currency": ccy,
                "current_rate": None,
                "status": f"FETCH_ERROR: {e}",
                "scraped_at": datetime.utcnow().isoformat() + "Z",
            }
            time.sleep(1)
            continue

        parsed = parse_policy_page(html, ccy)
        results[ccy] = parsed
        if verbose:
            r = parsed.get("current_rate")
            c = parsed.get("last_change")
            print(f"    {ccy}: {r if r is not None else 'N/A'}% [{c or '?'}]  [{parsed['status']}]")
        time.sleep(2)

    return results


def build_snapshot(yields, policies):
    """Assemble per-currency scores and per-pair verdicts."""
    # Merge yield + policy per currency
    merged = {}
    for ccy in G8_CURRENCIES:
        merged[ccy] = {
            "currency": ccy,
            "yield":    yields.get(ccy, {}),
            "policy":   policies.get(ccy, {}),
        }

    # Score each currency (fail-closed: skip if missing yield AND policy data)
    currency_scores = {}
    for ccy, data in merged.items():
        has_yield  = data["yield"].get("current_yield") is not None
        has_policy = data["policy"].get("current_rate") is not None
        if not has_yield and not has_policy:
            continue
        currency_scores[ccy] = score_currency(data, merged)

    # Score each pair
    pair_scores = {}
    for pair in CROSS_PAIRS:
        result = score_pair(pair, currency_scores)
        if result is not None:
            pair_scores[pair] = result

    # Health summary
    yields_ok   = sum(1 for v in yields.values()   if v.get("current_yield") is not None)
    policies_ok = sum(1 for v in policies.values() if v.get("current_rate")  is not None)

    return {
        "version":         VERSION,
        "last_updated":    datetime.utcnow().isoformat() + "Z",
        "gate_authority":  "SOFT",
        "thresholds":      {"dominant": GAP_DOMINANT, "leaning": GAP_LEANING},
        "health": {
            "yields_ok":   f"{yields_ok}/{len(G8_CURRENCIES)}",
            "policies_ok": f"{policies_ok}/{len(G8_CURRENCIES)}",
            "scored_ccys": len(currency_scores),
            "scored_pairs": len(pair_scores),
        },
        "currencies": currency_scores,
        "pairs":      pair_scores,
        "raw": {
            "yields":   yields,
            "policies": policies,
        },
    }


# -- Historical storage -----------------------------------------------------

def append_history(snapshot, history_path, max_entries=500):
    """
    Append snapshot to history file for edge-discovery analysis later.
    Stores pair scores + timestamps. Truncates at max_entries.
    """
    try:
        if os.path.exists(history_path):
            with open(history_path, "r") as f:
                history = json.load(f)
        else:
            history = {"version": VERSION, "entries": []}

        entry = {
            "timestamp": snapshot["last_updated"],
            "pairs": {
                p: {
                    "base_score":  v["base"]["score"],
                    "quote_score": v["quote"]["score"],
                    "gap":         v["gap"],
                    "threshold":   v["threshold"],
                    "verdict":     v["verdict"],
                }
                for p, v in snapshot["pairs"].items()
            },
        }
        history["entries"].append(entry)
        # Keep last N entries
        history["entries"] = history["entries"][-max_entries:]
        history["last_updated"] = snapshot["last_updated"]

        with open(history_path, "w") as f:
            json.dump(history, f, indent=2)
    except Exception as e:
        print(f"WARNING: history append failed: {e}", file=sys.stderr)


# -- CLI --------------------------------------------------------------------

def main():
    ap = argparse.ArgumentParser(description="MDI Scraper v" + VERSION)
    ap.add_argument("--unraid", action="store_true",
                    help="Write to Unraid path: " + UNRAID_OUTPUT)
    ap.add_argument("--print", action="store_true",
                    help="Print JSON to stdout instead of writing")
    ap.add_argument("--output", default=None,
                    help="Custom output path")
    ap.add_argument("--quiet", action="store_true",
                    help="Suppress progress logs")
    args = ap.parse_args()

    verbose = not args.quiet

    if verbose:
        print(f"MDI Scraper v{VERSION} -- starting at {datetime.utcnow().isoformat()}Z")
        print("=" * 60)
        print("Scraping 10Y yields...")

    yields   = scrape_all_yields(verbose=verbose)

    if verbose:
        print("")
        print("Scraping policy rates...")
    policies = scrape_all_policies(verbose=verbose)

    if verbose:
        print("")
        print("Computing scores...")
    snapshot = build_snapshot(yields, policies)

    if verbose:
        print(f"  Scored {snapshot['health']['scored_ccys']} currencies, "
              f"{snapshot['health']['scored_pairs']} pairs")
        print("")

    # Output
    out_json = json.dumps(snapshot, indent=2)

    if args.print:
        print(out_json)
    else:
        out_path = args.output or (UNRAID_OUTPUT if args.unraid else "./macro-dominance.json")
        out_dir = os.path.dirname(out_path)
        if out_dir and not os.path.exists(out_dir):
            os.makedirs(out_dir, exist_ok=True)
        with open(out_path, "w") as f:
            f.write(out_json)
        if verbose:
            print(f"Wrote snapshot -> {out_path}")

        # Append to history (only in --unraid or --output mode)
        history_path = UNRAID_HISTORY if args.unraid else os.path.join(
            os.path.dirname(out_path) or ".", "macro-dominance-history.json"
        )
        append_history(snapshot, history_path)
        if verbose:
            print(f"Appended to history -> {history_path}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
