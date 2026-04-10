#!/usr/bin/env python3
"""
oanda_orderbook_scraper.py v2.0.0

Scrapes Oanda's public order book tool (no API auth required):
  https://www.oanda.com/bvi-en/cfds/tools/orderbook/

Signal logic (contrarian, same as ig_sentiment_scraper.py):
  - Retail crowd 70%+ LONG  -> expect DOWN -> contrarian = BEARISH
  - Retail crowd 70%+ SHORT -> expect UP   -> contrarian = BULLISH

CRON: 0 */4 * * * python3 /path/to/oanda_orderbook_scraper.py --unraid
"""

import argparse, json, os, sys, time
from datetime import datetime, timezone

try:
    import requests
except ImportError:
    sys.exit("requests not installed. Run: pip3 install requests")

VERSION          = "2.0.0"
STRONG_THRESHOLD = 70
SOFT_THRESHOLD   = 60
MAX_ENTRIES      = 500

HEADERS = {
    "User-Agent":      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept":          "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9",
    "Referer":         "https://www.oanda.com/bvi-en/cfds/tools/orderbook/",
    "Origin":          "https://www.oanda.com",
}

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

API_CANDIDATES = [
    "https://www.oanda.com/rates/api/v1/order_book.json?instrument={i}&period=1",
    "https://www.oanda.com/cfds/api/orderbook?instrument={i}&period=1",
    "https://www.oanda.com/labs/api/v1/orderbook?instrument={i}&period=1",
    "https://fxlabs.oanda.com/v1/orderbook?instrument={i}&period=1",
    "https://www.oanda.com/bvi-en/cfds/tools/orderbook/?instrument={i}",
]


def try_fetch(session, instrument, verbose=False):
    for template in API_CANDIDATES:
        url = template.format(i=instrument)
        try:
            r = session.get(url, headers=HEADERS, timeout=15)
            if verbose:
                print(f"    {url} -> {r.status_code} ({len(r.content)} bytes)")
            if r.status_code == 200 and r.content:
                try:
                    return r.json(), url
                except Exception:
                    if verbose:
                        print(f"    Not JSON: {r.text[:100]}")
        except Exception as e:
            if verbose:
                print(f"    Error: {e}")
        time.sleep(0.3)
    return None, None


def extract_pcts(data, verbose=False):
    if verbose:
        print(f"    Parsing: {json.dumps(data)[:400]}")

    # Direct keys
    for lk, sk in [("longPercent","shortPercent"),("long_percent","short_percent"),
                   ("percentLong","percentShort"),("buyPercent","sellPercent"),
                   ("longOrderPercent","shortOrderPercent")]:
        if lk in data and sk in data:
            try:
                return float(data[lk]), float(data[sk])
            except Exception:
                pass

    # Nested data/orderbook
    for key in ("data", "orderbook", "order_book"):
        if key in data and isinstance(data[key], dict):
            result = extract_pcts(data[key], verbose=False)
            if result:
                return result

    # Buckets
    buckets = None
    for key in ("buckets", "data", "orders"):
        if key in data and isinstance(data[key], list):
            buckets = data[key]
            break
    if isinstance(data, list):
        buckets = data

    if buckets:
        return aggregate(buckets)
    return None


def aggregate(buckets):
    tl = ts = 0.0
    for b in buckets:
        if not isinstance(b, dict):
            continue
        lv = sv = None
        for lk in ("longOrderPercent","longCountPercent","orderBuy","buyPercent","long","percentLong","orders_long"):
            if lk in b:
                try: lv = float(b[lk]); break
                except: pass
        for sk in ("shortOrderPercent","shortCountPercent","orderSell","sellPercent","short","percentShort","orders_short"):
            if sk in b:
                try: sv = float(b[sk]); break
                except: pass
        if lv is not None and sv is not None:
            tl += lv; ts += sv
    total = tl + ts
    if total == 0:
        return None
    return round(tl/total*100, 1), round(ts/total*100, 1)


def signal(long_pct, short_pct):
    dom = max(long_pct, short_pct)
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
    session = requests.Session()
    ob_data = {}
    failed  = []
    fetched = 0

    if verbose:
        print(f"Oanda Order Book Scraper v{VERSION} (public web scrape)")
        print(f"Fetching {len(INSTRUMENTS)} instruments...")

    for oanda_id, fcc_name in INSTRUMENTS.items():
        data, url = try_fetch(session, oanda_id, verbose)
        time.sleep(0.5)
        if data is None:
            failed.append(oanda_id)
            if verbose: print(f"  {oanda_id:12s} -> FAILED (no valid response)")
            continue
        result = extract_pcts(data, verbose)
        if result is None:
            failed.append(oanda_id)
            if verbose: print(f"  {oanda_id:12s} -> FAILED (could not parse)")
            continue
        lp, sp = result
        sig = signal(lp, sp)
        fetched += 1
        ob_data[fcc_name] = {
            "oanda_instrument": oanda_id,
            "long_pct": lp, "short_pct": sp,
            "crowd_direction": sig["crowd_direction"],
            "contrarian_signal": sig["contrarian_signal"],
            "strength": sig["strength"],
            "label": sig["label"],
        }
        if verbose:
            print(f"  {oanda_id:12s} -> {lp:.0f}% L / {sp:.0f}% S  [{sig['label']}]  ({url})")

    now = datetime.now(timezone.utc).isoformat()
    return {
        "last_updated": now, "version": VERSION, "order_book": ob_data,
        "health": {
            "instruments_attempted": len(INSTRUMENTS),
            "instruments_fetched": fetched,
            "instruments_failed": len(failed),
            "failed_instruments": failed,
        }
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
        json.dump(history, f, separators=(",",":"))
    return len(history)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--unraid",  action="store_true")
    parser.add_argument("--verbose", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
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
        print(json.dumps(data, indent=2)); return

    os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
    with open(out, "w") as f:
        json.dump(data, f, separators=(",",":"))

    hc = append_history(data, hist)
    h  = data["health"]
    print(f"[{data['last_updated']}] {h['instruments_fetched']}/{h['instruments_attempted']} fetched, {h['instruments_failed']} failed, history={hc}")
    if h["failed_instruments"]:
        print(f"  Failed: {h['failed_instruments']}")

if __name__ == "__main__":
    main()
