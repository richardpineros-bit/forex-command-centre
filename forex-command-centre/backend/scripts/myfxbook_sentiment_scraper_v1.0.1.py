#!/usr/bin/env python3
"""
myfxbook_sentiment_scraper.py v1.0.1

Retail crowd sentiment via Myfxbook Community Outlook official public API.
Replaces oanda_orderbook_scraper.py (v3.0.0) — same output schema + 6 bonus
fields (position counts, volumes, average entry prices) for trapped-crowd
analysis in the Intel Hub.

SOURCE
    GET https://www.myfxbook.com/api/login.json
    GET https://www.myfxbook.com/api/get-community-outlook.json
    GET https://www.myfxbook.com/api/logout.json

SIGNAL LOGIC (contrarian — identical to oanda_orderbook_scraper and
              ig_sentiment_scraper)
    Retail crowd 70%+ LONG  -> contrarian = BEARISH
    Retail crowd 70%+ SHORT -> contrarian = BULLISH
    60 - 70%  = SOFT
    70%+      = STRONG
    < 60%     = NEUTRAL

OUTPUT
    /mnt/user/appdata/trading-state/data/oanda-orderbook.json
    /mnt/user/appdata/trading-state/data/oanda-orderbook-history.json

    Filename unchanged from the retired Oanda scraper to preserve downstream
    compatibility (armed-panel.js reads long_pct, short_pct, strength,
    contrarian_signal, label). The six bonus fields are additive.

CONFIG
    /mnt/user/appdata/forex-command-centre/backend/scripts/myfxbook-config.json
    Schema: { "email": "...", "password": "..." }
    Env var fallback: MYFXBOOK_EMAIL, MYFXBOOK_PASSWORD

CRON (every 4h)
    0 */4 * * * /usr/bin/python3 \\
        /mnt/user/appdata/forex-command-centre/backend/scripts/myfxbook_sentiment_scraper_v1.0.1.py \\
        --unraid

CHANGELOG
    v1.0.1  Bug fix: Myfxbook session tokens can contain URL-reserved characters
            (e.g. '/ywrdi...'). v1.0.0 used requests.Session().get(url, params=...)
            which URL-encodes such values, turning '/' into '%2F'. Myfxbook's
            server then compares the DECODED value against the stored session,
            producing "Invalid session" errors on affected logins. Fix: drop
            requests library, use urllib.request directly with f-string URLs —
            matches the probe pattern that is proven to work. Stdlib only, no
            pip dependencies.
    v1.0.0  Initial release. Full replacement for oanda_orderbook_scraper.
            33 UTCC pairs (31 direct Myfxbook names + 2 aliases: USOIL->WTICOUSD,
            XBRUSD->BCOUSD). Login/fetch/logout per run, fail-closed on
            credential / login / fetch errors, always logout in finally block.
"""

import argparse
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import urlopen, Request
from urllib.error import URLError, HTTPError


# --- Constants ---------------------------------------------------------------

VERSION             = "1.0.1"
API_BASE            = "https://www.myfxbook.com/api"
TIMEOUT             = 15
STRONG_THRESHOLD    = 70
SOFT_THRESHOLD      = 60
MAX_HISTORY_ENTRIES = 500   # matches retired oanda_orderbook_scraper.py
USER_AGENT          = f"FCC-MyfxbookScraper/{VERSION}"

DEFAULT_CONFIG_PATH  = "/mnt/user/appdata/forex-command-centre/backend/scripts/myfxbook-config.json"
DEFAULT_OUTPUT_PATH  = "/mnt/user/appdata/trading-state/data/oanda-orderbook.json"
DEFAULT_HISTORY_PATH = "/mnt/user/appdata/trading-state/data/oanda-orderbook-history.json"


# --- Pair universe -----------------------------------------------------------

UTCC_PAIRS = [
    "EURUSD", "GBPUSD", "USDJPY", "AUDUSD", "NZDUSD", "USDCAD", "USDCHF",
    "EURGBP", "EURJPY", "GBPJPY", "AUDJPY", "NZDJPY", "CADJPY", "CHFJPY",
    "EURAUD", "EURCAD", "EURCHF", "EURNZD",
    "GBPAUD", "GBPCAD", "GBPCHF", "GBPNZD",
    "AUDCAD", "AUDCHF", "AUDNZD",
    "NZDCAD", "NZDCHF", "CADCHF",
    "XAUUSD", "XAGUSD",
    "WTICOUSD", "BCOUSD", "BTCUSD",
]

# Aliases for FCC canonicals that Myfxbook uses a different symbol for.
# First match in the list wins.
ALIAS_MAP = {
    "WTICOUSD": ["USOIL", "XTIUSD", "WTI", "CRUDE", "OILUSD"],
    "BCOUSD":   ["XBRUSD", "UKOIL", "BRENT", "UKOILCASH"],
    "XAUUSD":   ["GOLD"],
    "XAGUSD":   ["SILVER"],
    "BTCUSD":   ["BITCOIN"],
}


# --- Credential loading ------------------------------------------------------

def load_credentials(config_path, verbose=False):
    """Load Myfxbook credentials. Fail-closed: returns (None, None) if missing."""
    path = Path(config_path)
    if path.exists():
        try:
            with path.open("r", encoding="utf-8") as f:
                cfg = json.load(f)
            email    = (cfg.get("email") or "").strip()
            password = (cfg.get("password") or "").strip()
            if email and password and not email.startswith("YOUR_"):
                if verbose:
                    print(f"[CRED] Config loaded: {path}")
                return email, password
            if verbose:
                print(f"[CRED] Config exists but is empty/template: {path}")
        except (OSError, json.JSONDecodeError) as e:
            if verbose:
                print(f"[CRED] Config read failed: {e}")

    email    = os.environ.get("MYFXBOOK_EMAIL", "").strip()
    password = os.environ.get("MYFXBOOK_PASSWORD", "").strip()
    if email and password:
        if verbose:
            print("[CRED] Loaded from environment variables")
        return email, password

    return None, None


# --- Myfxbook API ------------------------------------------------------------
#
# URL construction is deliberate:
#   - Login: user-controlled params → urlencode (safe for special chars).
#   - Outlook / Logout: session token is Myfxbook-controlled and may already
#     contain URL-reserved characters ('/', '=', etc). Any re-encoding
#     (including requests.params=) double-encodes and breaks the session
#     check server-side. Token goes into the URL AS-IS — same as the probe.
#
# ----------------------------------------------------------------------------

def _http_get_json(url, verbose=False):
    """GET a URL, return parsed JSON. Raises on HTTP/network/parse errors."""
    if verbose:
        print(f"[HTTP] GET {url.split('?')[0]}")
    req = Request(url, headers={"User-Agent": USER_AGENT})
    with urlopen(req, timeout=TIMEOUT) as resp:
        raw = resp.read().decode("utf-8")
    return json.loads(raw)


def myfxbook_login(email, password, verbose=False):
    """Login. Returns session ID string. Raises RuntimeError on API failure."""
    qs = urlencode({"email": email, "password": password})
    url = f"{API_BASE}/login.json?{qs}"
    data = _http_get_json(url, verbose=verbose)
    if data.get("error"):
        raise RuntimeError(f"Login API error: {data.get('message', 'unknown')}")
    sess_id = data.get("session")
    if not sess_id:
        raise RuntimeError("Login response missing session ID")
    if verbose:
        print(f"[LOGIN] OK — session: {sess_id[:8]}...")
    return sess_id


def myfxbook_get_outlook(myfxbook_session, verbose=False):
    """Fetch community outlook. Returns list of symbol dicts.
    Session token is embedded in the URL AS-IS — see module note above."""
    url = f"{API_BASE}/get-community-outlook.json?session={myfxbook_session}"
    data = _http_get_json(url, verbose=verbose)
    if data.get("error"):
        raise RuntimeError(f"Outlook API error: {data.get('message', 'unknown')}")
    symbols = data.get("symbols", [])
    if verbose:
        print(f"[FETCH] OK — {len(symbols)} symbols returned")
    return symbols


def myfxbook_logout(myfxbook_session, verbose=False):
    """Best-effort logout. Never raises. Session token embedded AS-IS."""
    try:
        url = f"{API_BASE}/logout.json?session={myfxbook_session}"
        _http_get_json(url, verbose=verbose)
        if verbose:
            print("[LOGOUT] Session closed cleanly")
    except (URLError, HTTPError, json.JSONDecodeError, RuntimeError) as e:
        if verbose:
            print(f"[LOGOUT] Warning — logout failed: {e}")


# --- Signal calculation ------------------------------------------------------

def calc_signal(long_pct, short_pct):
    """Contrarian signal — identical logic to oanda/ig scrapers."""
    dom   = max(long_pct, short_pct)
    crowd = "LONG" if long_pct >= short_pct else "SHORT"
    if dom >= STRONG_THRESHOLD:
        strength = "STRONG"
    elif dom >= SOFT_THRESHOLD:
        strength = "SOFT"
    else:
        return {
            "crowd_direction":   "NEUTRAL",
            "contrarian_signal": "NEUTRAL",
            "strength":          "NEUTRAL",
            "label":             "NEUTRAL",
        }
    contra = "BEARISH" if crowd == "LONG" else "BULLISH"
    return {
        "crowd_direction":   crowd,
        "contrarian_signal": contra,
        "strength":          strength,
        "label":             f"{strength} {contra}",
    }


# --- Entry building ----------------------------------------------------------

def _safe_float(value, default=None):
    if value is None:
        return default
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _safe_int(value, default=None):
    if value is None:
        return default
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def build_entry(mfb_symbol, mfb_data):
    """Turn a Myfxbook symbol payload into an FCC order_book entry.
    Returns None if the payload lacks the required percentages."""
    long_pct  = _safe_float(mfb_data.get("longPercentage"))
    short_pct = _safe_float(mfb_data.get("shortPercentage"))
    if long_pct is None or short_pct is None:
        return None

    total = long_pct + short_pct
    if total <= 0:
        return None
    long_pct_n  = round(long_pct  / total * 100, 1)
    short_pct_n = round(short_pct / total * 100, 1)

    sig = calc_signal(long_pct_n, short_pct_n)

    return {
        "myfxbook_symbol":   mfb_symbol,
        "long_pct":          long_pct_n,
        "short_pct":         short_pct_n,
        "crowd_direction":   sig["crowd_direction"],
        "contrarian_signal": sig["contrarian_signal"],
        "strength":          sig["strength"],
        "label":             sig["label"],
        # --- Bonus fields (additive; safe for existing frontend) ----------
        "long_positions":    _safe_int(mfb_data.get("longPositions")),
        "short_positions":   _safe_int(mfb_data.get("shortPositions")),
        "long_volume":       _safe_float(mfb_data.get("longVolume")),
        "short_volume":      _safe_float(mfb_data.get("shortVolume")),
        "avg_long_price":    _safe_float(mfb_data.get("avgLongPrice")),
        "avg_short_price":   _safe_float(mfb_data.get("avgShortPrice")),
    }


def match_pair(fcc_pair, mfb_by_name):
    """Return (mfb_name, mfb_data) for a UTCC pair, or (None, None)."""
    if fcc_pair in mfb_by_name:
        return fcc_pair, mfb_by_name[fcc_pair]
    for alias in ALIAS_MAP.get(fcc_pair, []):
        if alias in mfb_by_name:
            return alias, mfb_by_name[alias]
    return None, None


# --- Orchestration -----------------------------------------------------------

def run_scrape(config_path, verbose=False):
    """Full scrape flow: login -> fetch -> logout. Returns output dict."""
    email, password = load_credentials(config_path, verbose=verbose)
    if not email or not password:
        raise RuntimeError(
            f"No credentials available. Expected config at {config_path} or "
            "MYFXBOOK_EMAIL/MYFXBOOK_PASSWORD env vars."
        )

    mfb_session = None
    try:
        if verbose:
            print(f"Myfxbook Sentiment Scraper v{VERSION}")
            print(f"Endpoint: {API_BASE}")
        mfb_session = myfxbook_login(email, password, verbose=verbose)
        symbols = myfxbook_get_outlook(mfb_session, verbose=verbose)
    finally:
        if mfb_session:
            myfxbook_logout(mfb_session, verbose=verbose)

    mfb_by_name = {}
    for s in symbols:
        name = (s.get("name") or "").upper()
        if name:
            mfb_by_name[name] = s

    order_book = {}
    failed     = []
    fetched    = 0

    for fcc_pair in UTCC_PAIRS:
        mfb_name, mfb_data = match_pair(fcc_pair, mfb_by_name)
        if mfb_data is None:
            failed.append(fcc_pair)
            if verbose:
                print(f"  {fcc_pair:10s} -> MISSING from Myfxbook")
            continue

        entry = build_entry(mfb_name, mfb_data)
        if entry is None:
            failed.append(fcc_pair)
            if verbose:
                print(f"  {fcc_pair:10s} -> FAILED (invalid payload)")
            continue

        order_book[fcc_pair] = entry
        fetched += 1
        if verbose:
            lp = entry["long_pct"]
            sp = entry["short_pct"]
            lbl = entry["label"]
            via = "" if mfb_name == fcc_pair else f"  via {mfb_name}"
            print(f"  {fcc_pair:10s} -> {lp:>4.0f}% L / {sp:>4.0f}% S  [{lbl}]{via}")

    return {
        "last_updated": datetime.now(timezone.utc).isoformat(),
        "version":      VERSION,
        "source":       "myfxbook",
        "order_book":   order_book,
        "health": {
            "instruments_attempted": len(UTCC_PAIRS),
            "instruments_fetched":   fetched,
            "instruments_failed":    len(failed),
            "failed_instruments":    failed,
        },
    }


# --- History file ------------------------------------------------------------

def append_history(data, history_path):
    """Append this run to the history file. Keep last MAX_HISTORY_ENTRIES."""
    history = []
    if os.path.exists(history_path):
        try:
            with open(history_path, "r", encoding="utf-8") as f:
                history = json.load(f)
            if not isinstance(history, list):
                history = []
        except (OSError, json.JSONDecodeError):
            history = []

    history.append({
        "timestamp":  data["last_updated"],
        "source":     data.get("source", "myfxbook"),
        "order_book": data["order_book"],
    })

    if len(history) > MAX_HISTORY_ENTRIES:
        history = history[-MAX_HISTORY_ENTRIES:]

    os.makedirs(os.path.dirname(os.path.abspath(history_path)), exist_ok=True)
    with open(history_path, "w", encoding="utf-8") as f:
        json.dump(history, f, separators=(",", ":"))

    return len(history)


# --- Entry point -------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(
        description=f"Myfxbook Sentiment Scraper v{VERSION}"
    )
    parser.add_argument("--unraid", action="store_true",
                        help="Use production Unraid paths (config + output).")
    parser.add_argument("--verbose", action="store_true",
                        help="Print per-pair progress + HTTP logging.")
    parser.add_argument("--dry-run", action="store_true",
                        help="Run full scrape, print JSON to stdout, write nothing.")
    parser.add_argument("--config", default=None,
                        help="Override config path (default depends on --unraid).")
    parser.add_argument("--output", default=None,
                        help="Override output path.")
    parser.add_argument("--history", default=None,
                        help="Override history path.")
    args = parser.parse_args()

    if args.unraid:
        config_path  = args.config  or DEFAULT_CONFIG_PATH
        output_path  = args.output  or DEFAULT_OUTPUT_PATH
        history_path = args.history or DEFAULT_HISTORY_PATH
    else:
        base = os.path.dirname(os.path.abspath(__file__))
        config_path  = args.config  or os.path.join(base, "myfxbook-config.json")
        output_path  = args.output  or os.path.join(base, "../../data/oanda-orderbook.json")
        history_path = args.history or os.path.join(base, "../../data/oanda-orderbook-history.json")

    try:
        data = run_scrape(config_path, verbose=args.verbose)
    except RuntimeError as e:
        print(f"ERROR: {e}", file=sys.stderr)
        sys.exit(1)
    except (URLError, HTTPError) as e:
        print(f"ERROR: Network failure — {e}", file=sys.stderr)
        sys.exit(2)
    except (json.JSONDecodeError, KeyError, ValueError) as e:
        print(f"ERROR: Parse failure — {e}", file=sys.stderr)
        sys.exit(3)

    if args.dry_run:
        print(json.dumps(data, indent=2))
        return

    os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(data, f, separators=(",", ":"))

    hc = append_history(data, history_path)
    h  = data["health"]
    print(f"[{data['last_updated']}] "
          f"{h['instruments_fetched']}/{h['instruments_attempted']} fetched, "
          f"{h['instruments_failed']} failed, history={hc}")
    if h["failed_instruments"]:
        print(f"  Failed: {h['failed_instruments']}")


if __name__ == "__main__":
    main()
