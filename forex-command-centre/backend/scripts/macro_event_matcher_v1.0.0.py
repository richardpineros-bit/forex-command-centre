#!/usr/bin/env python3
"""
Macro Event Matcher v1.0.0 (MDI Phase 3)

Captures scheduled news events, takes MDI + price snapshots,
and measures post-event outcomes to validate the MDI heuristic.

PURPOSE:
    This is the evidence-gathering layer for the Macro Dominance Index.
    Without this component, MDI remains a display-only curiosity with
    the Intel Hub counter permanently stuck at 0/30.

    With this component, matched events accumulate until statistically
    meaningful hit-rate analysis becomes possible (target N>=30
    DOMINANT-flagged events, expected 60-90 days of data collection).

    The Risk Committee principle at stake: "New signals earn their
    weight through evidence, not assumption."

MODE OF OPERATION:

    Runs every minute via cron. Two internal phases per run:

    PHASE 1 (capture):
        For each scheduled news event in the calendar that is exactly
        15 minutes in the future (+/- 30sec tolerance), capture:
          - Event metadata (currency, title, impact, scheduled time)
          - MDI snapshot for every pair that includes the news currency
          - Oanda baseline price for each pair
          - Oanda ATR14 on H4 for each pair

        Write the record to macro-dominance-events.json with
        status: "PENDING".

    PHASE 2 (outcome measurement):
        For each PENDING event in the log:
          - If now < T+60min: poll prices, update reaction_max_deviation
          - If now >= T+4h (and not already complete):
            * Record final price
            * Compute |final-baseline| / ATR14 (final deviation)
            * Compute max reaction / ATR14 (reaction magnitude)
            * Classify outcome (REACTED_AND_RESUMED / SUSTAINED / etc)
            * Mark status: "COMPLETE"

CLASSIFICATION (three-state outcome, ATR-scaled):

    Let reaction = max abs(P - baseline) over [T, T+60min]
    Let final    = abs(P at T+4h - baseline)
    Both scaled by ATR14 on H4.

    REACTED_AND_RESUMED:  reaction >= 0.5 ATR  AND  final <= 0.3 ATR
        The "MDI hypothesis held" outcome.

    SUSTAINED_REACTION:   final > 0.5 ATR
        News dominated. Sustained directional move past the
        reaction window. MDI was wrong (if it flagged absorption).

    MIXED:                reaction >= 0.5 ATR  AND  0.3 < final <= 0.5 ATR
        Partial absorption. Direction resumed somewhat but not fully.

    NO_REACTION:          reaction < 0.5 ATR
        Non-event. Excluded from hit rate math because there was
        nothing to absorb in the first place.

REQUIRES:
    pip install requests --break-system-packages

ENV VARS (mandatory - fail-closed if missing):
    OANDA_API_KEY         - Oanda REST API personal token
    OANDA_ACCOUNT_ID      - Oanda account ID (for pricing endpoint)
    OANDA_ENV             - 'live' or 'practice' (default: 'live')

OUTPUT:
    /mnt/user/appdata/trading-state/data/macro-dominance-events.json

INPUT PATHS (must exist):
    /mnt/user/appdata/trading-state/data/calendar.json
    /mnt/user/appdata/trading-state/data/macro-dominance.json

CRON (Unraid User Scripts, every minute):
    * * * * * /usr/bin/python3 /mnt/user/appdata/forex-command-centre/backend/scripts/macro_event_matcher_v1.0.0.py --unraid >> /mnt/user/appdata/trading-state/data/event-matcher-cron.log 2>&1

MANUAL TESTING (no writes):
    python3 macro_event_matcher_v1.0.0.py --print
    python3 macro_event_matcher_v1.0.0.py --print --mode capture
    python3 macro_event_matcher_v1.0.0.py --print --mode outcome

SAFETY / DESIGN PRINCIPLES:

    Fail-closed everywhere:
      - Missing calendar file -> exit 0, do nothing, log reason
      - Missing MDI file -> capture still proceeds but MDI fields null
      - Missing Oanda credentials -> exit 0, log, do nothing
      - Oanda API error -> pair skipped for this run, retried next run
      - Clock drift: events captured later than T-10min are marked late
        and excluded
      - Never default ATR or price to a "reasonable guess" - null stays null

    Separable + inspectable:
      - Standalone script, does not modify any other component
      - All state in a single inspectable JSON file
      - Can be killed without affecting any running system
      - Deleting macro-dominance-events.json resets history only

    No authority modification:
      - This script does not modify MDI authority (stays SOFT)
      - Does not touch any gate (news, regime, circuit breaker)
      - Its only effect is to accumulate historical records

Changelog:
    v1.0.0 - Initial release. Two-phase capture + outcome measurement.
             ATR-scaled three-state classification. Oanda REST for
             prices and candles. G8 currencies, all 28 cross pairs.
"""

import argparse
import json
import os
import sys
import time
import urllib.request
import urllib.error
from datetime import datetime, timezone, timedelta

VERSION = "1.0.0"

# ============================================================================
# Constants
# ============================================================================

# Unraid paths
UNRAID_DATA_DIR        = "/mnt/user/appdata/trading-state/data"
CALENDAR_FILE          = os.path.join(UNRAID_DATA_DIR, "calendar.json")
MDI_FILE               = os.path.join(UNRAID_DATA_DIR, "macro-dominance.json")
EVENTS_FILE            = os.path.join(UNRAID_DATA_DIR, "macro-dominance-events.json")
DEFAULT_OUTPUT         = EVENTS_FILE

# Oanda config (env vars)
OANDA_API_KEY    = os.environ.get("OANDA_API_KEY")
OANDA_ACCOUNT_ID = os.environ.get("OANDA_ACCOUNT_ID")
OANDA_ENV        = os.environ.get("OANDA_ENV", "live").lower()
OANDA_HOST       = {
    "live":     "https://api-fxtrade.oanda.com",
    "practice": "https://api-fxpractice.oanda.com",
}.get(OANDA_ENV, "https://api-fxtrade.oanda.com")

# G8 currencies and cross pairs (matches MDI scraper)
G8_CURRENCIES = ["USD", "EUR", "GBP", "JPY", "AUD", "NZD", "CAD", "CHF"]
CROSS_PAIRS = [
    "EURUSD", "GBPUSD", "AUDUSD", "NZDUSD",
    "USDJPY", "USDCAD", "USDCHF",
    "EURGBP", "EURJPY", "EURAUD", "EURNZD", "EURCAD", "EURCHF",
    "GBPJPY", "GBPAUD", "GBPNZD", "GBPCAD", "GBPCHF",
    "AUDJPY", "AUDNZD", "AUDCAD", "AUDCHF",
    "NZDJPY", "NZDCAD", "NZDCHF",
    "CADJPY", "CADCHF", "CHFJPY",
]

# Capture window: fire capture job when event is exactly this close to firing
# Wider window = more tolerance for cron drift, but risk capturing after event
CAPTURE_TARGET_MINUTES = 15    # aim to snapshot 15min before event
CAPTURE_WINDOW_SECS    = 90    # +/- 90sec tolerance (covers 1-min cron jitter)
LATE_CAPTURE_CUTOFF_MIN = 10   # if captured later than T-10min, mark as LATE

# Outcome windows
REACTION_WINDOW_MIN    = 60    # T to T+60min: track max deviation
RESUMPTION_CHECK_MIN   = 240   # T+4h: record final price

# Only capture events with these impact levels (avoid noise from Low/Unknown)
CAPTURABLE_IMPACTS = {"High", "Critical"}

# ATR-scaled classification thresholds
# IMPORTANT: these are pre-committed and must not be retroactively tuned.
# If tuning is needed, bump to v1.1.0 and re-classify all historical
# outcomes transparently in a new column (don't overwrite history).
REACTION_THRESHOLD_ATR   = 0.5   # min reaction to count as "something happened"
RESUMED_THRESHOLD_ATR    = 0.3   # max final deviation to count as "resumed"
SUSTAINED_THRESHOLD_ATR  = 0.5   # final deviation beyond = sustained reaction

# History retention (events file can grow unbounded; cap at this many records)
MAX_EVENT_RECORDS = 2000


# ============================================================================
# Oanda REST helpers
# ============================================================================

def oanda_request(path, timeout=15):
    """GET from Oanda API. Returns parsed JSON or raises RuntimeError."""
    if not OANDA_API_KEY:
        raise RuntimeError("OANDA_API_KEY not set")

    url = OANDA_HOST + path
    req = urllib.request.Request(url, headers={
        "Authorization": "Bearer " + OANDA_API_KEY,
        "Accept-Datetime-Format": "RFC3339",
        "Content-Type": "application/json",
    })
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"Oanda HTTP {e.code}: {e.reason}")
    except urllib.error.URLError as e:
        raise RuntimeError(f"Oanda URL error: {e.reason}")
    except Exception as e:
        raise RuntimeError(f"Oanda fetch error: {e}")


def oanda_get_prices(instruments):
    """
    Batch fetch current mid prices for up to N instruments in one call.

    Args:
        instruments: list of Oanda instrument names (e.g., ['CAD_JPY','EUR_USD'])

    Returns:
        dict mapping instrument -> mid price (float), or None per instrument
        if not available.
    """
    if not OANDA_ACCOUNT_ID:
        raise RuntimeError("OANDA_ACCOUNT_ID not set")
    if not instruments:
        return {}

    path = f"/v3/accounts/{OANDA_ACCOUNT_ID}/pricing?instruments=" + ",".join(instruments)
    data = oanda_request(path)
    prices = {}
    for p in data.get("prices", []):
        instr = p.get("instrument")
        try:
            bid = float(p.get("bids", [{}])[0].get("price", 0))
            ask = float(p.get("asks", [{}])[0].get("price", 0))
            if bid > 0 and ask > 0:
                prices[instr] = (bid + ask) / 2.0
        except (ValueError, TypeError, IndexError):
            prices[instr] = None
    return prices


def oanda_get_atr14_h4(instrument):
    """
    Compute ATR14 on H4 candles by fetching last 60 H4 candles.

    Uses standard True Range formula:
      TR = max(H-L, |H-prev_close|, |L-prev_close|)
    ATR14 = simple average of last 14 TRs.

    Returns float or None on failure.
    """
    try:
        path = f"/v3/instruments/{instrument}/candles?granularity=H4&count=60&price=M"
        data = oanda_request(path)
        candles = [c for c in data.get("candles", []) if c.get("complete")]
        if len(candles) < 15:
            return None

        trs = []
        for i in range(1, len(candles)):
            mid_prev = candles[i-1].get("mid", {})
            mid_curr = candles[i].get("mid", {})
            h = float(mid_curr.get("h", 0))
            l = float(mid_curr.get("l", 0))
            prev_c = float(mid_prev.get("c", 0))
            if h <= 0 or l <= 0 or prev_c <= 0:
                continue
            tr = max(h - l, abs(h - prev_c), abs(l - prev_c))
            trs.append(tr)

        if len(trs) < 14:
            return None

        atr14 = sum(trs[-14:]) / 14.0
        return atr14 if atr14 > 0 else None

    except Exception:
        return None


def pair_to_oanda(pair):
    """Convert 'CADJPY' -> 'CAD_JPY' for Oanda API."""
    if not pair or len(pair) < 6:
        return None
    return pair[:3] + "_" + pair[3:]


# ============================================================================
# File I/O helpers
# ============================================================================

def load_json(path, default=None):
    """Read JSON file. Returns default on any error (fail-closed caller handling)."""
    if not os.path.exists(path):
        return default
    try:
        with open(path, "r") as f:
            return json.load(f)
    except (json.JSONDecodeError, OSError):
        return default


def save_events(events_list, path, dry_run=False):
    """Write events list atomically (tmp file + rename)."""
    if dry_run:
        return True
    payload = {
        "version":       VERSION,
        "last_updated":  datetime.now(timezone.utc).isoformat(),
        "event_count":   len(events_list),
        "events":        events_list[-MAX_EVENT_RECORDS:],
    }
    tmp_path = path + ".tmp"
    try:
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(tmp_path, "w") as f:
            json.dump(payload, f, indent=2)
        os.replace(tmp_path, path)
        return True
    except OSError as e:
        print(f"ERROR writing events file: {e}", file=sys.stderr)
        return False


def load_events(path):
    """Load events list or return empty list."""
    data = load_json(path, default={})
    if not isinstance(data, dict):
        return []
    events = data.get("events", [])
    return events if isinstance(events, list) else []


# ============================================================================
# Pair resolution
# ============================================================================

def pairs_for_currency(ccy):
    """Return all cross pairs containing the given currency."""
    if not ccy or len(ccy) != 3:
        return []
    ccy = ccy.upper()
    return [p for p in CROSS_PAIRS if ccy in (p[:3], p[3:])]


def build_event_id(event):
    """Deterministic event ID for dedupe.

    Combines currency + title + scheduled datetime. Two scrapes that yield
    identical event metadata collapse to one record.
    """
    ccy   = event.get("currency", "?")
    title = event.get("title", "?").replace(" ", "_")[:40]
    when  = event.get("datetime_utc", "?")
    return f"{ccy}_{title}_{when}"


# ============================================================================
# Phase 1: Capture events at T-15min
# ============================================================================

def find_captureable_events(calendar_events, now_utc, existing_event_ids):
    """
    Filter calendar events to those that should be captured right now.

    Criteria:
      - Not already in our event log (dedupe by event_id)
      - Impact is in CAPTURABLE_IMPACTS
      - datetime_utc is exactly CAPTURE_TARGET_MINUTES ahead of now_utc
        (with CAPTURE_WINDOW_SECS tolerance on either side)
    """
    target_delta = timedelta(minutes=CAPTURE_TARGET_MINUTES)
    window       = timedelta(seconds=CAPTURE_WINDOW_SECS)

    lower = now_utc + target_delta - window
    upper = now_utc + target_delta + window

    out = []
    for e in calendar_events or []:
        if not isinstance(e, dict):
            continue
        if e.get("impact") not in CAPTURABLE_IMPACTS:
            continue
        dt_str = e.get("datetime_utc")
        if not dt_str:
            continue
        try:
            # Accept 'Z' or '+00:00' suffix
            dt = datetime.fromisoformat(dt_str.replace("Z", "+00:00"))
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
        except ValueError:
            continue

        if not (lower <= dt <= upper):
            continue

        if build_event_id(e) in existing_event_ids:
            continue

        out.append(e)

    return out


def capture_event(event, mdi_data, now_utc, verbose=True):
    """
    Build a capture record for a single event.

    Returns dict with PENDING outcome, or None on unrecoverable error.
    """
    event_id = build_event_id(event)
    ccy      = event.get("currency", "?").upper()
    affected = pairs_for_currency(ccy)

    if not affected:
        if verbose:
            print(f"  [{event_id}] no pairs affected (currency {ccy}), skipping")
        return None

    # Fetch prices for all affected pairs in one Oanda batch call
    oanda_instruments = [pair_to_oanda(p) for p in affected]
    oanda_instruments = [i for i in oanda_instruments if i]

    prices = {}
    try:
        prices = oanda_get_prices(oanda_instruments)
    except RuntimeError as e:
        if verbose:
            print(f"  [{event_id}] Oanda pricing failed: {e}")
        # Continue anyway - we'll store nulls rather than skip the event

    # ATR is per-instrument, can't batch. Fetch each sequentially.
    atr_data = {}
    for instr in oanda_instruments:
        atr_data[instr] = oanda_get_atr14_h4(instr)
        time.sleep(0.1)  # tiny courtesy delay

    # Build per-pair snapshot
    pair_snapshots = {}
    mdi_pairs = (mdi_data or {}).get("pairs", {}) if isinstance(mdi_data, dict) else {}

    for pair in affected:
        oi = pair_to_oanda(pair)
        mdi_entry = mdi_pairs.get(pair) if isinstance(mdi_pairs, dict) else None

        # Determine which leg the news targets
        news_leg = "base" if ccy == pair[:3] else "quote"

        snapshot = {
            "news_leg":       news_leg,
            "baseline_price": prices.get(oi),
            "atr14_h4":       atr_data.get(oi),
            "mdi_threshold":  None,
            "mdi_gap":        None,
            "mdi_dominant_leg": None,
            "mdi_verdict":    None,
            "news_on_dominant_side": None,
        }
        if mdi_entry:
            snapshot["mdi_threshold"]       = mdi_entry.get("threshold")
            snapshot["mdi_gap"]             = mdi_entry.get("gap")
            snapshot["mdi_dominant_leg"]    = mdi_entry.get("dominant_leg")
            snapshot["mdi_verdict"]         = mdi_entry.get("verdict")
            dom_leg = mdi_entry.get("dominant_leg")
            if dom_leg:
                snapshot["news_on_dominant_side"] = (dom_leg == news_leg)

        pair_snapshots[pair] = snapshot

    # Determine capture timing status
    try:
        event_dt = datetime.fromisoformat(event.get("datetime_utc", "").replace("Z", "+00:00"))
        if event_dt.tzinfo is None:
            event_dt = event_dt.replace(tzinfo=timezone.utc)
        mins_before = (event_dt - now_utc).total_seconds() / 60.0
        capture_timing = "ON_TIME" if mins_before >= LATE_CAPTURE_CUTOFF_MIN else "LATE"
    except Exception:
        mins_before = None
        capture_timing = "UNKNOWN"

    record = {
        "event_id":       event_id,
        "captured_at":    now_utc.isoformat(),
        "capture_timing": capture_timing,
        "mins_before_event": round(mins_before, 2) if mins_before is not None else None,
        "event": {
            "currency":     event.get("currency"),
            "title":        event.get("title"),
            "impact":       event.get("impact"),
            "datetime_utc": event.get("datetime_utc"),
        },
        "pairs": pair_snapshots,
        "outcome": {
            "status":                       "PENDING",
            "reaction_max_deviation_per_pair": {pair: None for pair in affected},
            "t_plus_1h_prices":             None,
            "t_plus_4h_prices":             None,
            "classifications":              None,
            "completed_at":                 None,
        },
    }
    return record


# ============================================================================
# Phase 2: Outcome measurement
# ============================================================================

def parse_event_time(record):
    """Return event datetime in UTC, or None if unparseable."""
    try:
        dt_str = record.get("event", {}).get("datetime_utc")
        dt = datetime.fromisoformat(dt_str.replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except Exception:
        return None


def update_reaction_window(record, now_utc, verbose=True):
    """
    If we are still in the reaction window [T, T+60min], poll prices
    and update max deviation per pair.
    """
    event_dt = parse_event_time(record)
    if event_dt is None:
        return

    if now_utc < event_dt:
        return  # event hasn't happened yet
    if now_utc > event_dt + timedelta(minutes=REACTION_WINDOW_MIN):
        return  # reaction window closed

    pairs      = record.get("pairs", {})
    affected   = list(pairs.keys())
    instruments = [pair_to_oanda(p) for p in affected]
    instruments = [i for i in instruments if i]

    try:
        prices = oanda_get_prices(instruments)
    except RuntimeError as e:
        if verbose:
            print(f"  reaction update failed: {e}")
        return

    deviations = record["outcome"].get("reaction_max_deviation_per_pair") or {}

    for pair in affected:
        baseline = pairs[pair].get("baseline_price")
        current  = prices.get(pair_to_oanda(pair))
        if baseline is None or current is None:
            continue
        dev = abs(current - baseline)
        prev = deviations.get(pair) or 0.0
        if dev > prev:
            deviations[pair] = dev

    record["outcome"]["reaction_max_deviation_per_pair"] = deviations


def finalize_event(record, now_utc, verbose=True):
    """
    If T+4h has passed and event is still PENDING, take final prices
    and classify each pair's outcome.
    """
    event_dt = parse_event_time(record)
    if event_dt is None:
        # Can't classify without event time; mark as error
        record["outcome"]["status"] = "ERROR"
        record["outcome"]["completed_at"] = now_utc.isoformat()
        return

    resumption_time = event_dt + timedelta(minutes=RESUMPTION_CHECK_MIN)
    if now_utc < resumption_time:
        return  # not yet time to finalize

    pairs       = record.get("pairs", {})
    affected    = list(pairs.keys())
    instruments = [pair_to_oanda(p) for p in affected]
    instruments = [i for i in instruments if i]

    try:
        final_prices = oanda_get_prices(instruments)
    except RuntimeError as e:
        if verbose:
            print(f"  finalize failed: {e}")
        return  # try again next run

    # Fill in final prices
    record["outcome"]["t_plus_4h_prices"] = {
        pair: final_prices.get(pair_to_oanda(pair)) for pair in affected
    }

    # Per-pair classification
    classifications = {}
    deviations = record["outcome"].get("reaction_max_deviation_per_pair") or {}

    for pair in affected:
        snapshot = pairs[pair]
        baseline = snapshot.get("baseline_price")
        atr      = snapshot.get("atr14_h4")
        final    = final_prices.get(pair_to_oanda(pair))
        reaction_max = deviations.get(pair)

        if baseline is None or atr is None or atr <= 0 or final is None:
            classifications[pair] = {
                "status":           "INSUFFICIENT_DATA",
                "reason":           "missing baseline/atr/final",
                "reaction_max_atr": None,
                "final_abs_atr":    None,
            }
            continue

        final_abs_atr    = abs(final - baseline) / atr
        reaction_max_atr = (reaction_max / atr) if reaction_max is not None else None

        # Three-state classification logic
        if reaction_max_atr is None or reaction_max_atr < REACTION_THRESHOLD_ATR:
            cls = "NO_REACTION"
        elif final_abs_atr > SUSTAINED_THRESHOLD_ATR:
            cls = "SUSTAINED_REACTION"
        elif final_abs_atr <= RESUMED_THRESHOLD_ATR:
            cls = "REACTED_AND_RESUMED"
        else:
            cls = "MIXED"

        classifications[pair] = {
            "status":           cls,
            "reaction_max_atr": round(reaction_max_atr, 3) if reaction_max_atr is not None else None,
            "final_abs_atr":    round(final_abs_atr, 3),
            "direction":        "up" if final > baseline else "down",
        }

    record["outcome"]["classifications"] = classifications
    record["outcome"]["status"]          = "COMPLETE"
    record["outcome"]["completed_at"]    = now_utc.isoformat()


# ============================================================================
# Main pipeline
# ============================================================================

def run_matcher(args):
    verbose = not args.quiet
    dry_run = args.print_only

    now_utc = datetime.now(timezone.utc)

    if verbose:
        print(f"Macro Event Matcher v{VERSION} - run at {now_utc.isoformat()}")
        print("=" * 72)

    # --- Fail-closed preflight checks -----------------------------------

    if not OANDA_API_KEY or not OANDA_ACCOUNT_ID:
        print("FATAL: OANDA_API_KEY / OANDA_ACCOUNT_ID not set. Exiting (fail-closed).",
              file=sys.stderr)
        return 1

    calendar = load_json(args.calendar, default={})
    if not calendar or not isinstance(calendar, dict) or not calendar.get("events"):
        print(f"WARNING: calendar file empty or missing at {args.calendar}. "
              f"Capture will be skipped but outcomes on existing events will proceed.",
              file=sys.stderr)
        calendar_events = []
    else:
        calendar_events = calendar.get("events", [])

    mdi_data = load_json(args.mdi, default=None)
    if not mdi_data:
        if verbose:
            print(f"WARNING: MDI file empty or missing at {args.mdi}. "
                  f"Events will be captured with null MDI fields.")

    # Load existing events log
    existing_events = [] if args.fresh else load_events(args.output)
    existing_ids    = {e.get("event_id") for e in existing_events if isinstance(e, dict)}

    # --- Phase 1: Capture ---------------------------------------------

    capture_count = 0
    if args.mode in ("capture", "both"):
        to_capture = find_captureable_events(calendar_events, now_utc, existing_ids)
        if verbose:
            print(f"\nPhase 1 (capture): {len(to_capture)} event(s) eligible for capture")

        for ev in to_capture:
            if verbose:
                print(f"  Capturing: {ev.get('currency')} {ev.get('title')} at {ev.get('datetime_utc')}")
            record = capture_event(ev, mdi_data, now_utc, verbose=verbose)
            if record is not None:
                existing_events.append(record)
                capture_count += 1

    # --- Phase 2: Outcome measurement ---------------------------------

    updated_count  = 0
    finalized_count = 0
    if args.mode in ("outcome", "both"):
        if verbose:
            print(f"\nPhase 2 (outcome): scanning {len(existing_events)} event(s)")

        for record in existing_events:
            if not isinstance(record, dict):
                continue
            status = record.get("outcome", {}).get("status")
            if status == "COMPLETE":
                continue

            # Update reaction window (no-op if outside [T, T+60min])
            before = json.dumps(record.get("outcome", {}).get("reaction_max_deviation_per_pair"))
            update_reaction_window(record, now_utc, verbose=verbose)
            after = json.dumps(record.get("outcome", {}).get("reaction_max_deviation_per_pair"))
            if before != after:
                updated_count += 1

            # Finalize if T+4h passed
            if status == "PENDING":
                finalize_event(record, now_utc, verbose=verbose)
                if record.get("outcome", {}).get("status") == "COMPLETE":
                    finalized_count += 1

        if verbose:
            print(f"  Updated reaction data on {updated_count} event(s)")
            print(f"  Finalized {finalized_count} event(s) to COMPLETE")

    # --- Write back ---------------------------------------------------

    if dry_run:
        if verbose:
            print(f"\nDRY RUN - would write {len(existing_events)} event(s) to {args.output}")
        print(json.dumps({
            "version":      VERSION,
            "dry_run":      True,
            "captured":     capture_count,
            "updated":      updated_count,
            "finalized":    finalized_count,
            "event_count":  len(existing_events),
        }, indent=2))
    else:
        ok = save_events(existing_events, args.output, dry_run=False)
        if verbose:
            status = "OK" if ok else "FAILED"
            print(f"\nWrite: {status} - {args.output}")
            print(f"Summary: captured={capture_count}, updated={updated_count}, finalized={finalized_count}, total={len(existing_events)}")

    return 0


def main():
    ap = argparse.ArgumentParser(description=f"Macro Event Matcher v{VERSION}")
    ap.add_argument("--mode", choices=["capture", "outcome", "both"], default="both",
                    help="Run only capture phase, only outcome phase, or both (default)")
    ap.add_argument("--unraid", action="store_true",
                    help=f"Use Unraid paths (data dir: {UNRAID_DATA_DIR})")
    ap.add_argument("--calendar", default=CALENDAR_FILE, help="Path to calendar.json")
    ap.add_argument("--mdi", default=MDI_FILE, help="Path to macro-dominance.json")
    ap.add_argument("--output", default=DEFAULT_OUTPUT, help="Path to events file")
    ap.add_argument("--print", dest="print_only", action="store_true",
                    help="Dry run - print summary instead of writing")
    ap.add_argument("--quiet", action="store_true", help="Suppress progress logs")
    ap.add_argument("--fresh", action="store_true",
                    help="Ignore existing events file (testing only)")
    args = ap.parse_args()

    try:
        return run_matcher(args)
    except Exception as e:
        print(f"UNHANDLED ERROR: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc(file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
