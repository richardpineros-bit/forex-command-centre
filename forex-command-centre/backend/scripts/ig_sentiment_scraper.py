#!/usr/bin/env python3
"""
IG Client Sentiment Scraper v1.0.0
Fetches retail long/short positioning from IG REST API for all FCC instruments.

PURPOSE:
    Third satellite in the FCC GPS stack:
      1. Structure (UTCC/TradingView)
      2. Macro Bias (TE + ForexFactory scrapers)
      3. Retail Sentiment (this scraper — IG Client Sentiment API)

    Contrarian interpretation:
      - Retail 70%+ SHORT → crowd is bearish → BULLISH signal (green, confirms long)
      - Retail 70%+ LONG  → crowd is bullish → BEARISH signal (red, caution on longs)
      - 40-60% either way → NEUTRAL

REQUIRES:
    pip install requests --break-system-packages

OUTPUT FILE: ig-sentiment.json
    Default Unraid path: /mnt/user/appdata/trading-state/data/ig-sentiment.json

CONFIG FILE: ig-sentiment-config.json
    Default Unraid path: /mnt/user/appdata/trading-state/data/ig-sentiment-config.json
    Must contain: { "api_key": "...", "username": "...", "password": "...", "account_type": "LIVE" }

CRON (Unraid User Scripts — every 4 hours):
    0 */4 * * * /usr/bin/python3 /mnt/user/appdata/forex-command-centre/backend/scripts/ig_sentiment_scraper.py --unraid

MANUAL RUN (test, prints output, no file write):
    python3 ig_sentiment_scraper.py --print

Changelog:
    v1.0.0 - Initial release: forex 28 pairs, indices, metals, energy, crypto
             Contrarian signal calculation; soft-threshold at 60% and strong at 70%;
             IG Australia live API; config-file credential loading; staleness tracking
"""

import argparse, json, os, sys, time
from datetime import datetime, timezone

try:
    import requests
except ImportError:
    print("ERROR: requests required. Run: pip install requests --break-system-packages", file=sys.stderr)
    sys.exit(1)

# ── Constants ─────────────────────────────────────────────────────────────────

VERSION = "1.0.1"

# IG REST API base URL (Australia live — same endpoint as global)
IG_API_BASE = "https://api.ig.com/gateway/deal"

# Staleness threshold — warn if data older than this (scraper runs every 4h, allow 2h margin)
STALE_HOURS = 6

# Contrarian thresholds
STRONG_THRESHOLD = 70   # >= 70% one side = strong contrarian signal
SOFT_THRESHOLD   = 60   # >= 60% one side = soft contrarian signal

# ── Instrument map: FCC pair name → IG Market ID ────────────────────────────
#
# IG market IDs are the "natural grouping" identifiers, NOT epics (CS.D.EURUSD.CFD.IP).
# Using the simple market IDs as documented at labs.ig.com/node/297
#
INSTRUMENT_MAP = {
    # ── Forex 28 pairs ──────────────────────────────────────────────────────
    "EURUSD":   "EURUSD",
    "GBPUSD":   "GBPUSD",
    "USDJPY":   "USDJPY",
    "AUDUSD":   "AUDUSD",
    "USDCAD":   "USDCAD",
    "USDCHF":   "USDCHF",
    "NZDUSD":   "NZDUSD",
    "EURGBP":   "EURGBP",
    "EURJPY":   "EURJPY",
    "GBPJPY":   "GBPJPY",
    "AUDJPY":   "AUDJPY",
    "NZDJPY":   "NZDJPY",
    "CADJPY":   "CADJPY",
    "CHFJPY":   "CHFJPY",
    "EURAUD":   "EURAUD",
    "EURCAD":   "EURCAD",
    "EURCHF":   "EURCHF",
    "EURNZD":   "EURNZD",
    "GBPAUD":   "GBPAUD",
    "GBPCAD":   "GBPCAD",
    "GBPCHF":   "GBPCHF",
    "GBPNZD":   "GBPNZD",
    "AUDCAD":   "AUDCAD",
    "AUDCHF":   "AUDCHF",
    "AUDNZD":   "AUDNZD",
    "NZDCAD":   "NZDCAD",
    "NZDCHF":   "NZDCHF",
    "CADCHF":   "CADCHF",
    # ── Indices (Asia session focus) ─────────────────────────────────────────
    "JP225USD":  "JP225",
    "JP225YJPY": "JP225",    # Same IG market, different FCC naming
    "AU200AUD":  "AU200",
    "HK33HKD":   "HS34",    # IG marketId for Hang Seng / HK50
    # ── Other indices ────────────────────────────────────────────────────────
    "US30USD":   "WALL",
    "NAS100USD": "USTECH",
    "UK100GBP":  "FT100",
    "FR40EUR":   "FR40",
    "EU50EUR":   "EU50",
    "DE30EUR":   "DE30",
    # CN50USD, US2000USD, SPX500USD — no IG client sentiment available, excluded
    # ── Metals ───────────────────────────────────────────────────────────────
    "XAUUSD":   "GC",
    "XAGUSD":   "SI",
    "XCUUSD":   "COPPER",
    # XPTUSD (Platinum) — no IG client sentiment available, excluded
    # ── Energy ───────────────────────────────────────────────────────────────
    "WTICOUSD": "CL",
    "BCOUSD":   "LCO",
    "NATGASUSD":"NG",
    # ── Crypto ───────────────────────────────────────────────────────────────
    "BTCUSD":   "BITCOIN",
    "ETHUSD":   "ETHUSD",
    # BCHUSD, LTCUSD, MBTCUSD — no IG client sentiment available, excluded
}

# Deduplicated IG market IDs (JP225 appears twice in FCC names)
# We fetch each unique IG market ID once, then map back to all FCC names
def build_ig_to_fcc_map(instrument_map):
    ig_to_fcc = {}
    for fcc_name, ig_id in instrument_map.items():
        if ig_id not in ig_to_fcc:
            ig_to_fcc[ig_id] = []
        ig_to_fcc[ig_id].append(fcc_name)
    return ig_to_fcc

# ── Auth & API ────────────────────────────────────────────────────────────────

def create_session(api_key, username, password):
    """Authenticate with IG API. Returns (cst, x_security_token) or raises."""
    url = f"{IG_API_BASE}/session"
    headers = {
        "Content-Type": "application/json; charset=UTF-8",
        "Accept": "application/json; charset=UTF-8",
        "X-IG-API-KEY": api_key,
        "Version": "2",
    }
    payload = {
        "identifier": username,
        "password": password,
        "encryptedPassword": False,
    }
    r = requests.post(url, headers=headers, json=payload, timeout=15)
    if r.status_code != 200:
        raise RuntimeError(f"IG auth failed: HTTP {r.status_code} — {r.text[:200]}")
    cst = r.headers.get("CST")
    token = r.headers.get("X-SECURITY-TOKEN")
    if not cst or not token:
        raise RuntimeError("IG auth failed: missing CST or X-SECURITY-TOKEN in response headers")
    return cst, token


def get_sentiment(api_key, cst, token, market_id, verbose=False):
    """Fetch client sentiment for a single IG market ID.
    Returns dict with longPositionPercentage, shortPositionPercentage or None on failure."""
    url = f"{IG_API_BASE}/clientsentiment/{market_id}"
    headers = {
        "X-IG-API-KEY": api_key,
        "CST": cst,
        "X-SECURITY-TOKEN": token,
        "Accept": "application/json; charset=UTF-8",
        "Version": "1",
    }
    try:
        r = requests.get(url, headers=headers, timeout=10)
        if r.status_code == 200:
            return r.json()
        if verbose:
            print(f"    [{market_id}] HTTP {r.status_code}: {r.text[:120]}")
        return None
    except Exception as e:
        if verbose:
            print(f"    [{market_id}] Exception: {e}")
        return None


def logout_session(api_key, cst, token):
    """Cleanly close IG session."""
    try:
        url = f"{IG_API_BASE}/session"
        headers = {
            "X-IG-API-KEY": api_key,
            "CST": cst,
            "X-SECURITY-TOKEN": token,
            "Version": "1",
        }
        requests.delete(url, headers=headers, timeout=5)
    except Exception:
        pass

# ── Signal calculation ────────────────────────────────────────────────────────

def calculate_signal(long_pct, short_pct):
    """
    Contrarian interpretation of retail positioning.
    Returns signal string and strength.

    Retail LONG majority  → expect DOWN  → contrarian = BEARISH (caution if you want to go long)
    Retail SHORT majority → expect UP    → contrarian = BULLISH (confirms long, fades crowd)
    """
    dominant_pct = max(long_pct, short_pct)
    crowd_direction = "LONG" if long_pct >= short_pct else "SHORT"

    if dominant_pct >= STRONG_THRESHOLD:
        strength = "STRONG"
    elif dominant_pct >= SOFT_THRESHOLD:
        strength = "SOFT"
    else:
        return {
            "crowd_direction": crowd_direction,
            "contrarian_signal": "NEUTRAL",
            "strength": "NEUTRAL",
            "label": "NEUTRAL",
        }

    # Contrarian: if crowd is long, signal is bearish (and vice versa)
    contrarian = "BEARISH" if crowd_direction == "LONG" else "BULLISH"
    label = f"{strength} {contrarian}"

    return {
        "crowd_direction": crowd_direction,
        "contrarian_signal": contrarian,
        "strength": strength,
        "label": label,
    }

# ── Main scrape ───────────────────────────────────────────────────────────────

def load_config(config_path):
    """Load IG credentials from config file."""
    if not os.path.exists(config_path):
        raise FileNotFoundError(
            f"Config file not found: {config_path}\n"
            "Create it with: "
            '{"api_key": "...", "username": "...", "password": "...", "account_type": "LIVE"}'
        )
    with open(config_path, "r") as f:
        cfg = json.load(f)
    required = ["api_key", "username", "password"]
    missing = [k for k in required if not cfg.get(k)]
    if missing:
        raise ValueError(f"Config missing required fields: {missing}")
    return cfg


def run_scrape(config_path, verbose=False):
    """Main scrape logic. Returns output dict."""

    cfg = load_config(config_path)
    api_key  = cfg["api_key"]
    username = cfg["username"]
    password = cfg["password"]

    if verbose:
        print(f"IG Sentiment Scraper v{VERSION}")
        print(f"Authenticating with IG API ({IG_API_BASE})...")

    # Authenticate
    cst, token = create_session(api_key, username, password)
    if verbose:
        print("  Auth OK")

    ig_to_fcc = build_ig_to_fcc_map(INSTRUMENT_MAP)
    unique_ig_ids = list(ig_to_fcc.keys())

    sentiment_data = {}   # FCC pair name → sentiment dict
    failed_ig_ids  = []
    fetched_count  = 0

    if verbose:
        print(f"Fetching sentiment for {len(unique_ig_ids)} unique IG markets...")

    for ig_id in unique_ig_ids:
        result = get_sentiment(api_key, cst, token, ig_id, verbose=verbose)
        time.sleep(0.3)   # Polite rate limiting

        if result and "longPositionPercentage" in result:
            long_pct  = float(result["longPositionPercentage"])
            short_pct = float(result["shortPositionPercentage"])
            signal    = calculate_signal(long_pct, short_pct)
            fetched_count += 1

            entry = {
                "ig_market_id": ig_id,
                "long_pct":     round(long_pct, 1),
                "short_pct":    round(short_pct, 1),
                "crowd_direction":    signal["crowd_direction"],
                "contrarian_signal":  signal["contrarian_signal"],
                "strength":           signal["strength"],
                "label":              signal["label"],
            }

            # Map to all FCC names that point to this IG market
            for fcc_name in ig_to_fcc[ig_id]:
                sentiment_data[fcc_name] = entry

            if verbose:
                print(f"  {ig_id:12s} → {long_pct:.0f}% L / {short_pct:.0f}% S  [{signal['label']}]")
        else:
            failed_ig_ids.append(ig_id)
            if verbose:
                print(f"  {ig_id:12s} → FAILED (no data)")

    logout_session(api_key, cst, token)

    now_utc = datetime.now(timezone.utc).isoformat()
    output = {
        "last_updated": now_utc,
        "version": VERSION,
        "sentiment": sentiment_data,
        "health": {
            "unique_markets_attempted": len(unique_ig_ids),
            "unique_markets_fetched":   fetched_count,
            "unique_markets_failed":    len(failed_ig_ids),
            "failed_ig_ids":            failed_ig_ids,
            "fcc_pairs_mapped":         len(sentiment_data),
        },
    }

    return output

# ── Entry point ───────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description=f"IG Sentiment Scraper v{VERSION}")
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--unraid", action="store_true",
                      help="Write output to /mnt/user/appdata/trading-state/data/ig-sentiment.json")
    mode.add_argument("--print", action="store_true",
                      help="Print output to stdout only (no file write)")
    parser.add_argument("--verbose", "-v", action="store_true",
                        help="Show per-instrument progress")
    args = parser.parse_args()

    if args.unraid:
        config_path = "/mnt/user/appdata/trading-state/data/ig-sentiment-config.json"
        output_path = "/mnt/user/appdata/trading-state/data/ig-sentiment.json"
    else:
        config_path = os.path.join(os.path.dirname(__file__), "ig-sentiment-config.json")
        output_path = None

    verbose = args.verbose or args.print

    try:
        data = run_scrape(config_path, verbose=verbose)
    except FileNotFoundError as e:
        print(f"ERROR: {e}", file=sys.stderr)
        sys.exit(1)
    except RuntimeError as e:
        print(f"ERROR: {e}", file=sys.stderr)
        sys.exit(1)

    if args.print:
        print(json.dumps(data, indent=2))
        return

    if args.unraid:
        os.makedirs(os.path.dirname(output_path), exist_ok=True)
        with open(output_path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)
        h = data["health"]
        print(f"[ig_sentiment_scraper v{VERSION}] Done: "
              f"{h['unique_markets_fetched']}/{h['unique_markets_attempted']} markets fetched, "
              f"{h['fcc_pairs_mapped']} FCC pairs mapped. "
              f"Written to {output_path}")
        if h["failed_ig_ids"]:
            print(f"  Failed markets: {', '.join(h['failed_ig_ids'])}")
    else:
        # Local dev — just print
        print(json.dumps(data, indent=2))


if __name__ == "__main__":
    main()
