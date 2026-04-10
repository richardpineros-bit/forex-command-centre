#!/usr/bin/env python3
"""
oanda_orderbook_scraper.py v1.0.0

Fetches Oanda position book data per instrument and calculates contrarian
signals using the same logic as ig_sentiment_scraper.py.

Signal logic (contrarian, same as IG sentiment):
  - Retail crowd 70%+ LONG  -> expect DOWN -> contrarian = BEARISH
  - Retail crowd 70%+ SHORT -> expect UP   -> contrarian = BULLISH
  - 60-70% = SOFT signal, 70%+ = STRONG signal

OUTPUT FILE: oanda-orderbook.json
    Default Unraid path: /mnt/user/appdata/trading-state/data/oanda-orderbook.json

OUTPUT HISTORY: oanda-orderbook-history.json
    Same folder. Appended each run. Max 500 entries.

CONFIG FILE: oanda-scraper-config.json
    Default Unraid path: /mnt/user/appdata/trading-state/data/oanda-scraper-config.json
    See oanda-scraper-config.json.template for format.

CRON (every 4 hours, same as IG sentiment):
    0 */4 * * * python3 /path/to/oanda_orderbook_scraper.py --unraid >> /tmp/oanda-book.log 2>&1
"""

import argparse
import json
import os
import sys
import time
from datetime import datetime, timezone

try:
    import requests
except ImportError:
    sys.exit("requests not installed. Run: pip3 install requests")

VERSION = "1.0.0"

# Oanda API endpoints
OANDA_LIVE     = "https://api-fxtrade.oanda.com"
OANDA_PRACTICE = "https://api-fxpractice.oanda.com"

# Signal thresholds (match ig_sentiment_scraper.py exactly)
STRONG_THRESHOLD = 70   # >= 70% one side = strong contrarian signal
SOFT_THRESHOLD   = 60   # >= 60% one side = soft contrarian signal

# Max history entries
MAX_ENTRIES = 500

# All pairs to fetch (Oanda instrument format)
ALL_INSTRUMENTS = {
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


def load_config(config_path):
    if not os.path.exists(config_path):
        sys.exit(f"Config not found: {config_path}\nCreate it from oanda-scraper-config.json.template")
    with open(config_path, "r") as f:
        return json.load(f)


def get_headers(api_token):
    return {
        "Authorization": f"Bearer {api_token}",
        "Accept": "application/json",
    }


def fetch_position_book(base_url, api_token, instrument, verbose=False):
    """
    Fetch Oanda positionBook for an instrument.
    Returns list of buckets or None on failure.
    """
    url = f"{base_url}/v3/instruments/{instrument}/positionBook"
    try:
        r = requests.get(url, headers=get_headers(api_token), timeout=15)
        if r.status_code != 200:
            if verbose:
                print(f"  {instrument}: HTTP {r.status_code}")
            return None, None
        data = r.json()
        book = data.get("positionBook", {})
        return book.get("buckets", []), book.get("price")
    except Exception as e:
        if verbose:
            print(f"  {instrument}: ERROR {e}")
        return None, None


def calculate_signal(buckets, current_price_str, verbose=False):
    """
    Aggregate position book buckets to determine crowd direction and
    contrarian signal. Mirrors ig_sentiment_scraper.calculate_signal().

    Weights buckets by proximity to current price (within 1% range).
    Falls back to global aggregate if no buckets in range.
    """
    if not buckets or current_price_str is None:
        return {
            "crowd_direction": "NEUTRAL",
            "contrarian_signal": "NEUTRAL",
            "strength": "NEUTRAL",
            "label": "NEUTRAL",
            "long_pct": 50.0,
            "short_pct": 50.0,
        }

    try:
        current_price = float(current_price_str)
    except (ValueError, TypeError):
        current_price = 0

    total_long_w  = 0.0
    total_short_w = 0.0
    total_weight  = 0.0

    for bucket in buckets:
        try:
            price     = float(bucket.get("price", 0))
            long_pct  = float(bucket.get("longCountPercent",  0))
            short_pct = float(bucket.get("shortCountPercent", 0))
        except (ValueError, TypeError):
            continue

        bucket_total = long_pct + short_pct
        if bucket_total == 0:
            continue

        # Weight by proximity (within 1% of current price)
        if current_price > 0:
            price_diff_pct = abs(price - current_price) / current_price * 100
            if price_diff_pct > 1.0:
                continue
            weight = 1.0 - (price_diff_pct / 1.0)
        else:
            weight = 1.0

        total_long_w  += long_pct  * weight
        total_short_w += short_pct * weight
        total_weight  += bucket_total * weight

    # Fallback: use all buckets unweighted if none in range
    if total_weight == 0:
        for bucket in buckets:
            try:
                long_pct  = float(bucket.get("longCountPercent",  0))
                short_pct = float(bucket.get("shortCountPercent", 0))
            except (ValueError, TypeError):
                continue
            bucket_total = long_pct + short_pct
            if bucket_total == 0:
                continue
            total_long_w  += long_pct
            total_short_w += short_pct
            total_weight  += bucket_total

    if total_weight == 0:
        return {
            "crowd_direction": "NEUTRAL",
            "contrarian_signal": "NEUTRAL",
            "strength": "NEUTRAL",
            "label": "NEUTRAL",
            "long_pct": 50.0,
            "short_pct": 50.0,
        }

    net_long_pct  = (total_long_w  / total_weight) * 100
    net_short_pct = (total_short_w / total_weight) * 100

    dominant_pct = max(net_long_pct, net_short_pct)
    if dominant_pct >= STRONG_THRESHOLD:
        strength = "STRONG"
    elif dominant_pct >= SOFT_THRESHOLD:
        strength = "SOFT"
    else:
        return {
            "crowd_direction": "NEUTRAL",
            "contrarian_signal": "NEUTRAL",
            "strength": "NEUTRAL",
            "label": "NEUTRAL",
            "long_pct": round(net_long_pct, 1),
            "short_pct": round(net_short_pct, 1),
        }

    crowd_direction  = "LONG" if net_long_pct >= net_short_pct else "SHORT"
    contrarian       = "BEARISH" if crowd_direction == "LONG" else "BULLISH"
    label            = f"{strength} {contrarian}"

    return {
        "crowd_direction":   crowd_direction,
        "contrarian_signal": contrarian,
        "strength":          strength,
        "label":             label,
        "long_pct":          round(net_long_pct,  1),
        "short_pct":         round(net_short_pct, 1),
    }


def run_scrape(config_path, verbose=False):
    cfg         = load_config(config_path)
    api_token   = cfg["api_token"]
    environment = cfg.get("environment", "live")
    base_url    = OANDA_PRACTICE if environment == "practice" else OANDA_LIVE

    if verbose:
        print(f"Oanda Order Book Scraper v{VERSION}")
        print(f"Environment: {environment} ({base_url})")
        print(f"Fetching {len(ALL_INSTRUMENTS)} instruments...")

    order_book_data = {}
    failed          = []
    fetched_count   = 0

    for oanda_id, fcc_name in ALL_INSTRUMENTS.items():
        buckets, current_price = fetch_position_book(base_url, api_token, oanda_id, verbose)
        time.sleep(0.5)   # polite rate limiting

        if buckets is None:
            failed.append(oanda_id)
            if verbose:
                print(f"  {oanda_id:12s} -> FAILED")
            continue

        signal = calculate_signal(buckets, current_price, verbose)
        fetched_count += 1

        entry = {
            "oanda_instrument":  oanda_id,
            "long_pct":          signal["long_pct"],
            "short_pct":         signal["short_pct"],
            "crowd_direction":   signal["crowd_direction"],
            "contrarian_signal": signal["contrarian_signal"],
            "strength":          signal["strength"],
            "label":             signal["label"],
        }

        order_book_data[fcc_name] = entry

        if verbose:
            print(f"  {oanda_id:12s} -> {signal['long_pct']:.0f}% L / {signal['short_pct']:.0f}% S  [{signal['label']}]")

    now_utc = datetime.now(timezone.utc).isoformat()
    output  = {
        "last_updated": now_utc,
        "version":      VERSION,
        "order_book":   order_book_data,
        "health": {
            "instruments_attempted": len(ALL_INSTRUMENTS),
            "instruments_fetched":   fetched_count,
            "instruments_failed":    len(failed),
            "failed_instruments":    failed,
        },
    }
    return output


def append_history(data, history_path):
    run_entry = {
        "timestamp":  data["last_updated"],
        "order_book": data["order_book"],
    }

    history = []
    if os.path.exists(history_path):
        try:
            with open(history_path, "r", encoding="utf-8") as f:
                history = json.load(f)
            if not isinstance(history, list):
                history = []
        except Exception:
            history = []

    history.append(run_entry)
    if len(history) > MAX_ENTRIES:
        history = history[-MAX_ENTRIES:]

    os.makedirs(os.path.dirname(history_path), exist_ok=True)
    with open(history_path, "w", encoding="utf-8") as f:
        json.dump(history, f, separators=(",", ":"))

    return len(history)


def main():
    parser = argparse.ArgumentParser(description=f"Oanda Order Book Scraper v{VERSION}")
    parser.add_argument("--config",  default=None, help="Path to oanda-scraper-config.json")
    parser.add_argument("--unraid",  action="store_true", help="Use Unraid default paths")
    parser.add_argument("--verbose", action="store_true", help="Verbose output")
    parser.add_argument("--dry-run", action="store_true", help="Fetch but don't write files")
    args = parser.parse_args()

    if args.unraid:
        config_path  = "/mnt/user/appdata/trading-state/data/oanda-scraper-config.json"
        output_path  = "/mnt/user/appdata/trading-state/data/oanda-orderbook.json"
        history_path = "/mnt/user/appdata/trading-state/data/oanda-orderbook-history.json"
    else:
        base_dir     = os.path.dirname(os.path.abspath(__file__))
        config_path  = args.config or os.path.join(base_dir, "oanda-scraper-config.json")
        output_path  = os.path.join(base_dir, "../../data/oanda-orderbook.json")
        history_path = os.path.join(base_dir, "../../data/oanda-orderbook-history.json")

    data = run_scrape(config_path, verbose=args.verbose)

    if args.dry_run:
        print(json.dumps(data, indent=2))
        return

    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(data, f, separators=(",", ":"))

    history_count = append_history(data, history_path)

    h = data["health"]
    print(f"[{data['last_updated']}] Oanda book: {h['instruments_fetched']}/{h['instruments_attempted']} fetched, "
          f"{h['instruments_failed']} failed, history={history_count}")
    if h["failed_instruments"] and args.verbose:
        print(f"  Failed: {h['failed_instruments']}")


if __name__ == "__main__":
    main()
