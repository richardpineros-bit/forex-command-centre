#!/usr/bin/env python3
"""
ForexFactory Economic Calendar Scraper v3.1.0
Switches from FF XML feed (no actuals) to FF website HTML scraping.
BEAT/MISS/INLINE sourced directly from FF CSS classes (better/worse).

Requires: pip install beautifulsoup4 --break-system-packages

Cron (Unraid User Scripts, every 6 hours):
    0 */6 * * * /usr/bin/python3 /mnt/user/appdata/forex-command-centre/backend/scripts/forex_calendar_scraper.py --unraid

Changelog:
    v3.1.0 - --backfill flag: scrapes past 4 weeks to populate 30 days of history
    v3.0.0 - Switch to HTML scraping; actuals from FF CSS classes; UNRAID_BIAS path fix
    v2.0.0 - actual field; bias scoring; bias-history.json; canary check
    v1.0.0 - initial release

Backfill usage (run once manually):
    python3 forex_calendar_scraper.py --unraid --backfill
"""

import argparse, json, re, sys, os, time
from datetime import datetime, timedelta
from urllib.request import urlopen, Request
from urllib.error import URLError, HTTPError

try:
    from bs4 import BeautifulSoup
except ImportError:
    print("ERROR: beautifulsoup4 required. Run: pip install beautifulsoup4 --break-system-packages", file=sys.stderr)
    sys.exit(1)

# ── Constants ──────────────────────────────────────────────────────────────
FF_CALENDAR_URL  = "https://www.forexfactory.com/calendar?week=this"
FOREX_CURRENCIES = ["USD","EUR","GBP","JPY","AUD","NZD","CAD","CHF"]
IMPACT_LEVELS    = {"High":3,"Medium":2,"Low":1,"Holiday":0}
IMPACT_WEIGHTS   = {"High":3.0,"Medium":1.0,"Low":0.0}
TIME_DECAY       = [(24,1.0),(48,0.7),(72,0.4),(168,0.2),(9999,0.0)]
PAIRS            = ["AUDUSD","USDJPY","EURUSD","GBPUSD","EURJPY","GBPJPY",
                    "AUDJPY","NZDJPY","NZDUSD","USDCAD","USDCHF","EURGBP"]

# FF impact icon CSS class -> impact level name
IMPACT_CSS_MAP = {
    "icon--ff-impact-red": "High",
    "icon--ff-impact-ora": "Medium",
    "icon--ff-impact-yel": "Low",
    "icon--ff-impact-gra": "Holiday",
}

# ── Canary ─────────────────────────────────────────────────────────────────
def check_feed_canaries(html_content):
    """Check FF HTML structure is intact."""
    required = ["calendar__table", "calendar__actual", "calendar__currency",
                "calendar__event-title", "data-event-id"]
    missing = [m for m in required if m not in html_content]
    if missing:
        return {"status":"MARKUP_CHANGED","message":f"Missing markers: {missing}",
                "missing_tags":missing,"checked_at":datetime.utcnow().isoformat()+"Z"}
    return {"status":"OK","message":"Feed structure validated","missing_tags":[],
            "checked_at":datetime.utcnow().isoformat()+"Z"}

def save_health(health, output_dir):
    path = os.path.join(output_dir, "scraper_health.json")
    try:
        with open(path,"w",encoding="utf-8") as f: json.dump(health,f,indent=2)
        print(f"Health: {health['status']} -> {path}")
    except Exception as e:
        print(f"Warning: health write failed: {e}", file=sys.stderr)

# ── Fetch ──────────────────────────────────────────────────────────────────
def fetch_html_feed(url):
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                      "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
    }
    try:
        req = Request(url, headers=headers)
        with urlopen(req, timeout=30) as r:
            return r.read().decode("utf-8", errors="replace")
    except HTTPError as e:
        print(f"HTTP {e.code}: {e.reason}", file=sys.stderr); sys.exit(1)
    except URLError as e:
        print(f"URL Error: {e.reason}", file=sys.stderr); sys.exit(1)
    except Exception as e:
        print(f"Fetch error: {e}", file=sys.stderr); sys.exit(1)

# ── Time parsing ───────────────────────────────────────────────────────────
def parse_time_to_24h(time_str, base_dt):
    """Parse FF time string (e.g. '7:30pm') into 24h and UTC/AEST datetimes."""
    empty = {"time_24h":"All Day","datetime_utc":None,"datetime_aest":None}
    if not time_str or time_str.strip().lower() in ["","all day","tentative","-"]:
        return empty
    try:
        s = time_str.strip().lower().replace(" ","")
        is_pm = "pm" in s
        s = s.replace("am","").replace("pm","")
        parts = s.split(":")
        h = int(parts[0]); m = int(parts[1]) if len(parts)>1 else 0
        if is_pm and h!=12: h+=12
        elif not is_pm and h==12: h=0
        # base_dt is the day in UTC; time is ET (UTC-5 assumed, matches v2 behaviour)
        et = base_dt.replace(hour=h, minute=m, second=0, microsecond=0)
        utc = et + timedelta(hours=5)
        aest = utc + timedelta(hours=10)
        return {"time_24h":f"{h:02d}:{m:02d}","time_et":time_str,
                "datetime_utc":utc.isoformat()+"Z","datetime_aest":aest.isoformat()}
    except Exception:
        return {"time_24h":time_str,"datetime_utc":None,"datetime_aest":None}

# ── Impact extraction ──────────────────────────────────────────────────────
def extract_impact(td):
    """Get impact level from the FF impact icon CSS class."""
    if not td: return "Low"
    span = td.find("span", class_=True)
    if not span: return "Low"
    for css_class, level in IMPACT_CSS_MAP.items():
        if css_class in span.get("class",[]):
            return level
    return "Low"

# ── HTML parsing ───────────────────────────────────────────────────────────
def parse_calendar_html(html_content):
    """Parse FF calendar HTML and return list of event dicts."""
    soup = BeautifulSoup(html_content, "html.parser")
    events = []
    current_day_dt = None  # datetime for current day (UTC midnight)

    # Find all calendar rows
    rows = soup.find_all("tr", attrs={"data-event-id": True})

    for row in rows:
        try:
            # Update current date if this row carries a day dateline
            dateline = row.get("data-day-dateline")
            if dateline:
                try:
                    current_day_dt = datetime.utcfromtimestamp(int(dateline))
                except Exception:
                    pass

            # Currency
            currency_td = row.find("td", class_="calendar__currency")
            currency = currency_td.get_text(strip=True) if currency_td else ""
            if currency not in FOREX_CURRENCIES:
                continue

            # Impact
            impact_td = row.find("td", class_="calendar__impact")
            impact = extract_impact(impact_td)

            # Skip low-weight events for efficiency (still parse, scoring handles weight)
            # Title
            title_span = row.find("span", class_="calendar__event-title")
            title = title_span.get_text(strip=True) if title_span else ""

            # Time
            time_td = row.find("td", class_="calendar__time")
            time_str = time_td.get_text(strip=True) if time_td else ""

            # Actual — CSS class tells us BEAT/MISS directly
            actual_td = row.find("td", class_="calendar__actual")
            actual_str = None
            result = None
            if actual_td:
                actual_span = actual_td.find("span")
                if actual_span:
                    actual_str = actual_span.get_text(strip=True)
                    if actual_str:
                        span_classes = actual_span.get("class", [])
                        if "better" in span_classes:
                            result = "BEAT"
                        elif "worse" in span_classes:
                            result = "MISS"
                        else:
                            result = "INLINE"

            # Forecast
            forecast_td = row.find("td", class_="calendar__forecast")
            forecast_str = None
            if forecast_td:
                forecast_span = forecast_td.find("span")
                if forecast_span:
                    forecast_str = forecast_span.get_text(strip=True) or None

            # Previous
            previous_td = row.find("td", class_="calendar__previous")
            previous_str = None
            if previous_td:
                previous_span = previous_td.find("span")
                if previous_span:
                    # Strip revision icon text
                    prev_text = previous_span.get_text(strip=True)
                    previous_str = prev_text or None

            # Date string for output
            date_str = current_day_dt.strftime("%m-%d-%Y") if current_day_dt else ""

            # Parse time
            ti = parse_time_to_24h(time_str, current_day_dt) if current_day_dt else {
                "time_24h": time_str, "datetime_utc": None, "datetime_aest": None
            }

            events.append({
                "title":        title,
                "currency":     currency,
                "date":         date_str,
                "time_et":      time_str,
                "time_24h":     ti.get("time_24h"),
                "datetime_utc": ti.get("datetime_utc"),
                "datetime_aest":ti.get("datetime_aest"),
                "impact":       impact,
                "impact_level": IMPACT_LEVELS.get(impact, 0),
                "forecast":     forecast_str,
                "previous":     previous_str,
                "actual":       actual_str or None,
                "result":       result,
                "url":          None,
            })

        except Exception as e:
            print(f"Event parse error: {e}", file=sys.stderr)

    events.sort(key=lambda x: (x.get("datetime_utc") or "9999", x.get("currency", "")))
    return events

# ── Bias scoring ───────────────────────────────────────────────────────────
def get_decay(hours_ago):
    for threshold, mult in TIME_DECAY:
        if hours_ago <= threshold: return mult
    return 0.0

def score_result(result):
    return {"BEAT":1.0,"MISS":-1.0,"INLINE":0.0,"UNKNOWN":0.0}.get(result,0.0)

def calculate_currency_bias(events, now):
    scores = {}
    for event in events:
        currency = event.get("currency"); impact = event.get("impact")
        result   = event.get("result");   actual = event.get("actual")
        dt_str   = event.get("datetime_utc")
        if not actual or not result or result in ("UNKNOWN", None): continue
        if IMPACT_WEIGHTS.get(impact,0)==0: continue
        if not dt_str: continue
        try: event_dt = datetime.fromisoformat(dt_str.replace("Z",""))
        except: continue
        if event_dt >= now: continue
        hours_ago = (now - event_dt).total_seconds()/3600
        decay = get_decay(hours_ago)
        if decay==0: continue
        final = score_result(result) * IMPACT_WEIGHTS.get(impact,1.0) * decay
        if currency not in scores:
            scores[currency] = {"total":0.0,"events":[],"count":0}
        scores[currency]["total"]  += final
        scores[currency]["count"]  += 1
        scores[currency]["events"].append({
            "title":event.get("title"),"impact":impact,"result":result,
            "actual":actual,"forecast":event.get("forecast"),"previous":event.get("previous"),
            "hours_ago":round(hours_ago,1),"score":round(final,2)
        })

    bias_map = {}
    for currency, data in scores.items():
        t = data["total"]; c = data["count"]
        if c==0: continue
        if t>2.0:   bias="STRONGLY_BULLISH"
        elif t>0.5: bias="BULLISH"
        elif t<-2:  bias="STRONGLY_BEARISH"
        elif t<-.5: bias="BEARISH"
        else:       bias="NEUTRAL"
        high_c = sum(1 for e in data["events"] if e["impact"]=="High")
        if high_c>=2:            conf="HIGH"
        elif high_c==1 or c>=2:  conf="MEDIUM"
        else:                    conf="LOW"
        bias_map[currency] = {"score":round(t,2),"bias":bias,"confidence":conf,
                              "event_count":c,"events":data["events"]}
    return bias_map

def size_modifier(net):
    a = abs(net)
    if a>3.0: return 0.5
    if a>1.0: return 0.75
    return 1.0

def calculate_pair_verdicts(bias_map):
    verdicts = {}
    for pair in PAIRS:
        base = pair[:3]; quote = pair[3:]
        bd = bias_map.get(base, {"score":0,"bias":"NEUTRAL","confidence":"LOW","event_count":0})
        qd = bias_map.get(quote,{"score":0,"bias":"NEUTRAL","confidence":"LOW","event_count":0})
        net = bd["score"] - qd["score"]
        direction = "BULLISH" if net>0.5 else ("BEARISH" if net<-0.5 else "NEUTRAL")
        strength  = "STRONG" if abs(net)>3 else ("MODERATE" if abs(net)>1 else "WEAK")
        verdicts[pair] = {
            "net_score":round(net,2),"direction":direction,"strength":strength,
            "base_bias":bd.get("bias","NEUTRAL"),"quote_bias":qd.get("bias","NEUTRAL"),
            "base_confidence":bd.get("confidence","LOW"),"quote_confidence":qd.get("confidence","LOW"),
            "size_modifier":size_modifier(net)
        }
    return verdicts

# ── Bias history ───────────────────────────────────────────────────────────
def load_bias_history(path):
    if os.path.exists(path):
        try:
            with open(path,"r",encoding="utf-8") as f: return json.load(f)
        except Exception as e:
            print(f"Warning: bias history read failed: {e}", file=sys.stderr)
    return {"schema_version":"1.0.0","created":datetime.utcnow().isoformat()+"Z","runs":[]}

def append_bias_run(history, events, bias_map, pair_verdicts, run_time=None):
    now = run_time or datetime.utcnow()
    cutoff = datetime.utcnow() - timedelta(days=90)

    event_results = []
    for e in events:
        if e.get("actual") and e.get("result") and e.get("result") not in ("UNKNOWN", None):
            dt_str = e.get("datetime_utc")
            if dt_str:
                try:
                    if datetime.fromisoformat(dt_str.replace("Z","")) < datetime.utcnow():
                        event_results.append({
                            "id": f"{e['currency'].lower()}-{e['title'].lower().replace(' ','-')[:20]}-{dt_str[:10]}",
                            "title":e["title"],"currency":e["currency"],"impact":e["impact"],
                            "actual":e["actual"],"forecast":e.get("forecast"),
                            "previous":e.get("previous"),"result":e["result"],"datetime_utc":dt_str
                        })
                except: pass

    run = {
        "run_id":    now.strftime("%Y%m%d_%H%M%S"),
        "timestamp": now.isoformat()+"Z",
        "event_results": event_results,
        "currency_bias": {k:{"score":v["score"],"bias":v["bias"],"confidence":v["confidence"],
                             "event_count":v["event_count"]} for k,v in bias_map.items()},
        "pair_verdicts": pair_verdicts
    }

    history["runs"].append(run)
    history["runs"] = [r for r in history["runs"]
                       if datetime.fromisoformat(r["timestamp"].replace("Z",""))>=cutoff]
    history["last_updated"] = now.isoformat()+"Z"
    history["run_count"]    = len(history["runs"])
    return history

def save_bias_history(history, path):
    d = os.path.dirname(path)
    if d and not os.path.exists(d): os.makedirs(d)
    with open(path,"w",encoding="utf-8") as f: json.dump(history,f,indent=2,ensure_ascii=False)
    print(f"Bias history: {history.get('run_count',0)} runs -> {path}")

# ── Calendar save ──────────────────────────────────────────────────────────
def save_calendar(events, path, bias_map=None, pair_verdicts=None):
    data = {
        "last_updated":   datetime.utcnow().isoformat()+"Z",
        "schema_version": "2.0.0",
        "source":         "ForexFactory",
        "feed_url":       FF_CALENDAR_URL,
        "event_count":    len(events),
        "events":         events
    }
    if bias_map:
        data["currency_bias"] = {k:{"score":v["score"],"bias":v["bias"],
                                    "confidence":v["confidence"],"event_count":v["event_count"]}
                                 for k,v in bias_map.items()}
    if pair_verdicts:
        data["pair_verdicts"] = pair_verdicts

    d = os.path.dirname(path)
    if d and not os.path.exists(d): os.makedirs(d)
    with open(path,"w",encoding="utf-8") as f: json.dump(data,f,indent=2,ensure_ascii=False)
    print(f"Calendar: {len(events)} events -> {path}")


# ── Backfill helpers ───────────────────────────────────────────────────────
def get_past_week_urls(n_weeks=4):
    """Return list of (url, week_sunday_dt) for the past n_weeks, oldest first."""
    MONTHS = ["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"]
    now = datetime.utcnow()
    # Find most recent Sunday (FF week starts Sunday)
    weekday = now.weekday()  # Mon=0 ... Sun=6
    days_since_sunday = (weekday + 1) % 7
    current_sunday = (now - timedelta(days=days_since_sunday)).replace(
        hour=0, minute=0, second=0, microsecond=0)
    urls = []
    for i in range(n_weeks, 0, -1):  # oldest first
        week_sunday = current_sunday - timedelta(weeks=i)
        month_str = MONTHS[week_sunday.month - 1]
        url = f"https://www.forexfactory.com/calendar?week={month_str}{week_sunday.day}.{week_sunday.year}"
        urls.append((url, week_sunday))
    return urls

def run_id_for_week(week_sunday):
    return f"backfill_{week_sunday.strftime('%Y%m%d')}"

def week_already_backfilled(history, week_sunday):
    rid = run_id_for_week(week_sunday)
    return any(r.get("run_id") == rid for r in history.get("runs", []))

def backfill_week(url, week_sunday, history, bias_path):
    print(f"  Fetching {url}...")
    html_content = fetch_html_feed(url)
    health = check_feed_canaries(html_content)
    if health["status"] != "OK":
        print(f"  WARNING: Canary fail for {url} — skipping", file=sys.stderr)
        return history
    events = parse_calendar_html(html_content)
    with_actuals = len([e for e in events if e.get("actual")])
    high_events  = len([e for e in events if e.get("impact") == "High"])
    print(f"  {len(events)} events | {high_events} high | {with_actuals} with actuals")
    if with_actuals == 0:
        print(f"  No actuals — skipping")
        return history
    # Use Friday end-of-week as run_time for correct time-decay scoring
    run_time = week_sunday + timedelta(days=5, hours=23, minutes=59)
    now = datetime.utcnow()
    bias_map = calculate_currency_bias(events, now)
    for cur, d in sorted(bias_map.items()):
        print(f"    {cur}: {d['bias']} ({d['score']:+.1f}) [{d['confidence']}, {d['event_count']} events]")
    pair_verdicts = calculate_pair_verdicts(bias_map)
    history = append_bias_run(history, events, bias_map, pair_verdicts, run_time=run_time)
    history["runs"][-1]["run_id"] = run_id_for_week(week_sunday)
    history["runs"][-1]["backfill"] = True
    save_bias_history(history, bias_path)
    return history

# ── Main ───────────────────────────────────────────────────────────────────
def main():
    SCRIPT_DIR    = os.path.dirname(os.path.abspath(__file__))
    PROJECT_ROOT  = os.path.abspath(os.path.join(SCRIPT_DIR,'..','..'))
    DEFAULT_OUT   = os.path.join(PROJECT_ROOT,'src','calendar.json')
    DEFAULT_BAK   = os.path.join(PROJECT_ROOT,'data','calendar.json')
    DEFAULT_BIAS  = os.path.join(PROJECT_ROOT,'data','bias-history.json')
    UNRAID_BIAS   = '/mnt/user/appdata/trading-state/data/bias-history.json'  # v3 fix

    parser = argparse.ArgumentParser(description="FCC Calendar Scraper v3.1.0")
    parser.add_argument("--output",       "-o", default=DEFAULT_OUT)
    parser.add_argument("--backup-path",        default=DEFAULT_BAK)
    parser.add_argument("--bias-history",       default=DEFAULT_BIAS)
    parser.add_argument("--unraid",             action="store_true",
                        help="Use Unraid host paths")
    parser.add_argument("--backfill",           action="store_true",
                        help="Scrape past 4 weeks to populate 30 days of history")
    parser.add_argument("--backfill-weeks",     type=int, default=4,
                        dest="backfill_weeks",
                        help="Number of past weeks to backfill (default: 4)")
    parser.add_argument("--print",        "-p", action="store_true", dest="print_output")
    args = parser.parse_args()

    bias_path = UNRAID_BIAS if args.unraid else args.bias_history

    # ── Backfill mode ──────────────────────────────────────────────────────
    if args.backfill:
        print(f"BACKFILL MODE: scraping past {args.backfill_weeks} weeks...")
        history = load_bias_history(bias_path)
        past_weeks = get_past_week_urls(args.backfill_weeks)
        for url, week_sunday in past_weeks:
            if week_already_backfilled(history, week_sunday):
                print(f"  Skipping {url} (already backfilled)")
                continue
            history = backfill_week(url, week_sunday, history, bias_path)
            time.sleep(2)
        print(f"Backfill complete: {history.get('run_count',0)} total runs in history")
        print("Done.")
        return

    print(f"Fetching {FF_CALENDAR_URL}...")
    html_content = fetch_html_feed(FF_CALENDAR_URL)

    print("Canary check...")
    health = check_feed_canaries(html_content)
    save_health(health, os.path.dirname(DEFAULT_OUT))
    if health["status"] != "OK":
        print(f"ABORT: {health['message']}", file=sys.stderr); sys.exit(2)

    print("Parsing events...")
    events = parse_calendar_html(html_content)
    with_actuals = len([e for e in events if e.get("actual")])
    high_events  = len([e for e in events if e.get("impact")=="High"])
    print(f"  {len(events)} events | {high_events} high | {with_actuals} with actuals")

    print("Scoring bias...")
    now = datetime.utcnow()
    bias_map = calculate_currency_bias(events, now)
    for cur, d in sorted(bias_map.items()):
        print(f"  {cur}: {d['bias']} ({d['score']:+.1f}) [{d['confidence']}, {d['event_count']} events]")
    pair_verdicts = calculate_pair_verdicts(bias_map)
    print(f"  {len(pair_verdicts)} pair verdicts calculated")

    print(f"Updating bias history -> {bias_path}")
    history = load_bias_history(bias_path)
    history = append_bias_run(history, events, bias_map, pair_verdicts)
    save_bias_history(history, bias_path)

    if args.print_output:
        print(json.dumps(events, indent=2))
    else:
        save_calendar(events, args.output, bias_map, pair_verdicts)
        try: save_calendar(events, args.backup_path, bias_map, pair_verdicts)
        except Exception as e: print(f"Warning: backup failed: {e}", file=sys.stderr)

    print("Done.")

if __name__ == "__main__":
    main()
