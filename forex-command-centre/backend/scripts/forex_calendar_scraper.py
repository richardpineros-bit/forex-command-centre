#!/usr/bin/env python3
"""
ForexFactory Economic Calendar Scraper v2.0.0
Adds: actual field capture, bias scoring, bias-history.json, canary health check.

Cron (Unraid User Scripts, every 6 hours):
    0 */6 * * * /usr/bin/python3 /mnt/user/appdata/forex-command-centre/backend/scripts/forex_calendar_scraper.py --unraid

Changelog:
    v2.0.0 - actual field; bias scoring; bias-history.json; canary check
    v1.0.0 - initial release
"""

import argparse, json, re, sys, os
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta
from urllib.request import urlopen, Request
from urllib.error import URLError, HTTPError

# ── Constants ──────────────────────────────────────────────────────────────
FF_CALENDAR_URL  = "https://nfs.faireconomy.media/ff_calendar_thisweek.xml"
FOREX_CURRENCIES = ["USD","EUR","GBP","JPY","AUD","NZD","CAD","CHF"]
IMPACT_LEVELS    = {"High":3,"Medium":2,"Low":1,"Holiday":0}
IMPACT_WEIGHTS   = {"High":3.0,"Medium":1.0,"Low":0.0}
TIME_DECAY       = [(24,1.0),(48,0.7),(72,0.4),(168,0.2),(9999,0.0)]
CANARY_TAGS      = ["event","title","country","impact","forecast","previous"]
PAIRS            = ["AUDUSD","USDJPY","EURUSD","GBPUSD","EURJPY","GBPJPY",
                    "AUDJPY","NZDJPY","NZDUSD","USDCAD","USDCHF","EURGBP"]

# ── Canary ─────────────────────────────────────────────────────────────────
def check_feed_canaries(xml_content):
    missing = [t for t in CANARY_TAGS if f"<{t}" not in xml_content]
    if missing:
        return {"status":"MARKUP_CHANGED","message":f"Missing tags: {missing}",
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
def fetch_xml_feed(url):
    headers = {"User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}
    try:
        req = Request(url, headers=headers)
        with urlopen(req, timeout=30) as r:
            return r.read().decode("windows-1252", errors="replace")
    except HTTPError as e:
        print(f"HTTP {e.code}: {e.reason}", file=sys.stderr); sys.exit(1)
    except URLError as e:
        print(f"URL Error: {e.reason}", file=sys.stderr); sys.exit(1)
    except Exception as e:
        print(f"Fetch error: {e}", file=sys.stderr); sys.exit(1)

# ── Time parsing ───────────────────────────────────────────────────────────
def parse_time_to_24h(time_str, date_str):
    empty = {"time_24h":"All Day","datetime_utc":None,"datetime_aest":None}
    if not time_str or time_str.strip().lower() in ["","all day","tentative"]:
        return empty
    try:
        s = time_str.strip().lower().replace(" ","")
        is_pm = "pm" in s
        s = s.replace("am","").replace("pm","")
        parts = s.split(":")
        h = int(parts[0]); m = int(parts[1]) if len(parts)>1 else 0
        if is_pm and h!=12: h+=12
        elif not is_pm and h==12: h=0
        dp = date_str.split("-")
        et = datetime(int(dp[2]),int(dp[0]),int(dp[1]),h,m)
        utc = et + timedelta(hours=5)
        aest = utc + timedelta(hours=10)
        return {"time_24h":f"{h:02d}:{m:02d}","time_et":time_str,
                "datetime_utc":utc.isoformat()+"Z","datetime_aest":aest.isoformat()}
    except Exception as e:
        return {"time_24h":time_str,"datetime_utc":None,"datetime_aest":None}

# ── Actual value parsing ───────────────────────────────────────────────────
def parse_numeric(val):
    if not val: return None
    try: return float(re.sub(r'[%KkMmBb,]','',val.strip()))
    except: return None

def determine_result(actual_str, forecast_str, previous_str):
    actual = parse_numeric(actual_str)
    if actual is None: return "UNKNOWN"
    compare = parse_numeric(forecast_str) or parse_numeric(previous_str)
    if compare is None: return "UNKNOWN"
    diff = actual - compare
    pct  = abs(diff/compare) if compare!=0 else abs(diff)
    if pct < 0.05: return "INLINE"
    return "BEAT" if diff > 0 else "MISS"

# ── XML parsing ────────────────────────────────────────────────────────────
def parse_calendar_xml(xml_content):
    events = []
    try: root = ET.fromstring(xml_content)
    except ET.ParseError as e:
        print(f"XML parse error: {e}", file=sys.stderr); sys.exit(1)

    for elem in root.findall("event"):
        try:
            title    = elem.findtext("title","").strip()
            country  = elem.findtext("country","").strip()
            date     = elem.findtext("date","").strip()
            time_str = elem.findtext("time","").strip()
            impact   = elem.findtext("impact","").strip()
            forecast = elem.findtext("forecast","").strip()
            previous = elem.findtext("previous","").strip()
            actual   = elem.findtext("actual","").strip()   # v2.0 addition
            url      = elem.findtext("url","").strip()

            if country not in FOREX_CURRENCIES: continue

            ti     = parse_time_to_24h(time_str, date)
            result = determine_result(actual,forecast,previous) if actual else None

            events.append({
                "title":title,"currency":country,"date":date,
                "time_et":time_str,"time_24h":ti.get("time_24h"),
                "datetime_utc":ti.get("datetime_utc"),"datetime_aest":ti.get("datetime_aest"),
                "impact":impact,"impact_level":IMPACT_LEVELS.get(impact,0),
                "forecast":forecast or None,"previous":previous or None,
                "actual":actual or None,"result":result,"url":url  # v2.0 additions
            })
        except Exception as e:
            print(f"Event parse error: {e}", file=sys.stderr)

    events.sort(key=lambda x:(x.get("datetime_utc") or "9999", x.get("currency","")))
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
        if not actual or not result or result=="UNKNOWN": continue
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

def append_bias_run(history, events, bias_map, pair_verdicts):
    now = datetime.utcnow()
    cutoff = now - timedelta(days=90)

    event_results = []
    for e in events:
        if e.get("actual") and e.get("result") and e.get("result")!="UNKNOWN":
            dt_str = e.get("datetime_utc")
            if dt_str:
                try:
                    if datetime.fromisoformat(dt_str.replace("Z","")) < now:
                        event_results.append({
                            "id": f"{e['currency'].lower()}-{e['title'].lower().replace(' ','-')[:20]}-{dt_str[:10]}",
                            "title":e["title"],"currency":e["currency"],"impact":e["impact"],
                            "actual":e["actual"],"forecast":e.get("forecast"),
                            "previous":e.get("previous"),"result":e["result"],"datetime_utc":dt_str
                        })
                except: pass

    run = {
        "run_id":   now.strftime("%Y%m%d_%H%M%S"),
        "timestamp":now.isoformat()+"Z",
        "event_results":event_results,
        "currency_bias":{k:{"score":v["score"],"bias":v["bias"],"confidence":v["confidence"],
                            "event_count":v["event_count"]} for k,v in bias_map.items()},
        "pair_verdicts":pair_verdicts
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
        "last_updated":datetime.utcnow().isoformat()+"Z",
        "schema_version":"2.0.0","source":"ForexFactory",
        "feed_url":FF_CALENDAR_URL,"event_count":len(events),"events":events
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

# ── Main ───────────────────────────────────────────────────────────────────
def main():
    SCRIPT_DIR   = os.path.dirname(os.path.abspath(__file__))
    PROJECT_ROOT = os.path.abspath(os.path.join(SCRIPT_DIR,'..','..'))
    DEFAULT_OUT   = os.path.join(PROJECT_ROOT,'src','calendar.json')
    DEFAULT_BAK   = os.path.join(PROJECT_ROOT,'data','calendar.json')
    DEFAULT_BIAS  = os.path.join(PROJECT_ROOT,'data','bias-history.json')
    UNRAID_BIAS   = '/data/bias-history.json'

    parser = argparse.ArgumentParser(description="FCC Calendar Scraper v2.0.0")
    parser.add_argument("--output",       "-o", default=DEFAULT_OUT)
    parser.add_argument("--backup-path",        default=DEFAULT_BAK)
    parser.add_argument("--bias-history",       default=DEFAULT_BIAS)
    parser.add_argument("--unraid",             action="store_true",
                        help="Use /data/ Docker volume paths")
    parser.add_argument("--print",        "-p", action="store_true", dest="print_output")
    args = parser.parse_args()

    bias_path = UNRAID_BIAS if args.unraid else args.bias_history

    print(f"Fetching {FF_CALENDAR_URL}...")
    xml_content = fetch_xml_feed(FF_CALENDAR_URL)

    print("Canary check...")
    health = check_feed_canaries(xml_content)
    save_health(health, os.path.dirname(DEFAULT_OUT))
    if health["status"] != "OK":
        print(f"ABORT: {health['message']}", file=sys.stderr); sys.exit(2)

    print("Parsing events...")
    events = parse_calendar_xml(xml_content)
    with_actuals = len([e for e in events if e.get("actual")])
    print(f"  {len(events)} events | {len([e for e in events if e['impact']=='High'])} high | {with_actuals} with actuals")

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
