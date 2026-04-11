#!/usr/bin/env python3
"""
oanda_orderbook_scraper.py v3.0.0

Fetches Oanda's public position book via their GraphQL API (no auth required).
Endpoint: https://labs-api.oanda.com/graphql
Query:    orderPositionBook(instrument, bookType:POSITION, recentHours:1)

Signal logic (contrarian, mirrors ig_sentiment_scraper.py):
  - Retail crowd 70%+ LONG  -> expect DOWN -> contrarian = BEARISH
  - Retail crowd 70%+ SHORT -> expect UP   -> contrarian = BULLISH
  - 60-70% = SOFT, 70%+ = STRONG

OUTPUT: /mnt/user/appdata/trading-state/data/oanda-orderbook.json
HISTORY: /mnt/user/appdata/trading-state/data/oanda-orderbook-history.json

CRON (every 4h):
    0 */4 * * * python3 /mnt/user/appdata/forex-command-centre/backend/scripts/oanda_orderbook_scraper.py --unraid >> /tmp/oanda-book.log 2>&1
"""

import argparse, json, os, sys, time
from datetime import datetime, timezone

try:
    import requests
except ImportError:
    sys.exit("requests not installed. Run: pip3 install requests")

VERSION          = "3.0.0"
STRONG_THRESHOLD = 70
SOFT_THRESHOLD   = 60
MAX_ENTRIES      = 500

GRAPHQL_URL = "https://labs-api.oanda.com/graphql"

HEADERS = {
    "Content-Type":  "application/json",
    "Origin":        "https://www.oanda.com",
    "Referer":       "https://www.oanda.com/bvi-en/cfds/tools/orderbook/",
    "User-Agent":    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept":        "application/json",
    "Accept-Language": "en-US,en;q=0.9",
}

QUERY = """query($instrument:String!,$bookType:BookType!,$recentHours:Int){
  orderPositionBook(instrument:$instrument,bookType:$bookType,recentHours:$recentHours){
    buckets{price longCountPercent shortCountPercent}
  }
}"""

INSTRUMENTS = {
    "EUR_USD": "EURUSD",
    "USD_JPY": "USDJPY",
    "GBP_USD": "GBPUSD",
    "AUD_USD": "AUDUSD",
    "NZD_USD": "NZDUSD",
    "USD_CAD": "USDCAD",
    "USD_CHF": "USDCHF",
    "EUR_GBP": "EURGBP",
    "EUR_JPY": "EURJPY",
    "GBP_JPY": "GBPJPY",
    "AUD_JPY": "AUDJPY",
    "NZD_JPY": "NZDJPY",
}


def fetch_book(session, instrument, book_type="POSITION", verbose=False):
    payload = {
        "query":     QUERY,
        "variables": {"instrument": instrument, "bookType": book_type, "recentHours": 1},
    }
    try:
        r = session.post(GRAPHQL_URL, headers=HEADERS, json=payload, timeout=15)
        if r.status_code != 200:
            if verbose:
                print(f"    HTTP {r.status_code}")
            return None
        data = r.json()
        if "errors" in data:
            if verbose:
                print(f"    GraphQL error: {data['errors']}")
            return None
        # Response: data.orderPositionBook is an array; take first element
        books = (data.get("data") or {}).get("orderPositionBook") or []
        if not books:
            if verbose:
                print(f"    No book data returned")
            return None
        return books[0].get("buckets", [])
    except Exception as e:
        if verbose:
            print(f"    Exception: {e}")
        return None


def aggregate(buckets):
    """Sum longCountPercent and shortCountPercent across all buckets, normalise to 100%."""
    tl = ts = 0.0
    for b in buckets:
        try:
            tl += float(b.get("longCountPercent",  0))
            ts += float(b.get("shortCountPercent", 0))
        except (ValueError, TypeError):
            pass
    total = tl + ts
    if total == 0:
        return None
    return round(tl / total * 100, 1), round(ts / total * 100, 1)


def calc_signal(long_pct, short_pct):
    """Mirrors ig_sentiment_scraper.calculate_signal() exactly."""
    dom   = max(long_pct, short_pct)
    crowd = "LONG" if long_pct >= short_pct else "SHORT"
    if dom >= STRONG_THRESHOLD:
        strength = "STRONG"
    elif dom >= SOFT_THRESHOLD:
        strength = "SOFT"
    else:
        return {"crowd_direction":"NEUTRAL","contrarian_signal":"NEUTRAL","strength":"NEUTRAL","label":"NEUTRAL"}
    contra = "BEARISH" if crowd == "LONG" else "BULLISH"
    return {"crowd_direction":crowd,"contrarian_signal":contra,"strength":strength,"label":f"{strength} {contra}"}


def run_scrape(verbose=False):
    session  = requests.Session()
    ob_data  = {}
    failed   = []
    fetched  = 0

    if verbose:
        print(f"Oanda Order Book Scraper v{VERSION} (GraphQL, no auth)")
        print(f"Endpoint: {GRAPHQL_URL}")
        print(f"Fetching {len(INSTRUMENTS)} instruments (POSITION book)...")

    for oanda_id, fcc_name in INSTRUMENTS.items():
        buckets = fetch_book(session, oanda_id, book_type="POSITION", verbose=verbose)
        time.sleep(0.5)

        if buckets is None:
            failed.append(oanda_id)
            if verbose:
                print(f"  {oanda_id:12s} -> FAILED")
            continue

        result = aggregate(buckets)
        if result is None:
            failed.append(oanda_id)
            if verbose:
                print(f"  {oanda_id:12s} -> FAILED (empty buckets)")
            continue

        lp, sp = result
        sig    = calc_signal(lp, sp)
        fetched += 1

        ob_data[fcc_name] = {
            "oanda_instrument":  oanda_id,
            "long_pct":          lp,
            "short_pct":         sp,
            "crowd_direction":   sig["crowd_direction"],
            "contrarian_signal": sig["contrarian_signal"],
            "strength":          sig["strength"],
            "label":             sig["label"],
        }

        if verbose:
            print(f"  {oanda_id:12s} -> {lp:.0f}% L / {sp:.0f}% S  [{sig['label']}]")

    now = datetime.now(timezone.utc).isoformat()
    return {
        "last_updated": now,
        "version":      VERSION,
        "order_book":   ob_data,
        "health": {
            "instruments_attempted": len(INSTRUMENTS),
            "instruments_fetched":   fetched,
            "instruments_failed":    len(failed),
            "failed_instruments":    failed,
        },
    }


def append_history(data, history_path):
    history = []
    if os.path.exists(history_path):
        try:
            with open(history_path, "r") as f:
                history = json.load(f)
            if not isinstance(history, list):
                history = []
        except Exception:
            history = []
    history.append({"timestamp": data["last_updated"], "order_book": data["order_book"]})
    if len(history) > MAX_ENTRIES:
        history = history[-MAX_ENTRIES:]
    os.makedirs(os.path.dirname(os.path.abspath(history_path)), exist_ok=True)
    with open(history_path, "w") as f:
        json.dump(history, f, separators=(",", ":"))
    return len(history)


def main():
    parser = argparse.ArgumentParser(description=f"Oanda Order Book Scraper v{VERSION}")
    parser.add_argument("--unraid",  action="store_true", help="Use Unraid default paths")
    parser.add_argument("--verbose", action="store_true", help="Verbose output")
    parser.add_argument("--dry-run", action="store_true", help="Fetch but don't write files")
    args = parser.parse_args()

    if args.unraid:
        out  = "/mnt/user/appdata/trading-state/data/oanda-orderbook.json"
        hist = "/mnt/user/appdata/trading-state/data/oanda-orderbook-history.json"
    else:
        base = os.path.dirname(os.path.abspath(__file__))
        out  = os.path.join(base, "../../data/oanda-orderbook.json")
        hist = os.path.join(base, "../../data/oanda-orderbook-history.json")

    data = run_scrape(verbose=args.verbose)

    if args.dry_run:
        print(json.dumps(data, indent=2))
        return

    os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
    with open(out, "w") as f:
        json.dump(data, f, separators=(",", ":"))

    hc = append_history(data, hist)
    h  = data["health"]
    print(f"[{data['last_updated']}] {h['instruments_fetched']}/{h['instruments_attempted']} fetched, "
          f"{h['instruments_failed']} failed, history={hc}")
    if h["failed_instruments"]:
        print(f"  Failed: {h['failed_instruments']}")


if __name__ == "__main__":
    main()
