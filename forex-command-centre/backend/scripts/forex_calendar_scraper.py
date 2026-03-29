#!/usr/bin/env python3
"""
ForexFactory Economic Calendar Scraper v3.4.0
Multi-site scraping: forex + metals + energy + crypto sister sites.

Requires: pip install beautifulsoup4 --break-system-packages

Cron (Unraid User Scripts, every 6 hours):
    0 */6 * * * /usr/bin/python3 /mnt/user/appdata/forex-command-centre/backend/scripts/forex_calendar_scraper.py --unraid --all-sites

Backfill last 30 days (run once manually):
    python3 forex_calendar_scraper.py --unraid --backfill [--all-sites]

Changelog:
    v3.4.0 - Fix sister site canary (site-aware checks); add TITLE_TO_CURRENCY inference
             for metals/energy/crypto (no currency column); expand IMPACT_CSS_MAP with mm/ee/cc
             prefixes; COMMODITY_TO_FX mapping routes commodity moves to G10 currency bias
             (0.5x weight); BOND_TO_CURRENCY maps TE bond auctions to currency (yield up=bullish);
             bond yield scoring branch in calculate_currency_bias
    v3.3.1 - FF --backfill chains to TE backfill via subprocess
    v3.3.0 - Surprise magnitude: parse_numeric() handles K/M/B/% suffixes; calculate_surprise()
             adds surprise_abs, surprise_pct, surprise_dir fields to every event dict
    v3.2.0 - --all-sites flag: scrape metals/energy/crypto sister sites; extended PAIRS list
    v3.1.0 - --backfill flag: scrapes past 4 weeks to populate 30 days of history
    v3.0.0 - Switch to HTML scraping; actuals from FF CSS classes; UNRAID_BIAS path fix
    v2.0.0 - actual field; bias scoring; bias-history.json; canary check
    v1.0.0 - initial release
"""

import argparse, json, re, sys, os, time
from datetime import datetime, timedelta, timezone
from urllib.request import urlopen, Request
from urllib.error import URLError, HTTPError

try:
    from bs4 import BeautifulSoup
except ImportError:
    print("ERROR: beautifulsoup4 required. Run: pip install beautifulsoup4 --break-system-packages", file=sys.stderr)
    sys.exit(1)

# ── Site configs ────────────────────────────────────────────────────────────
# currencies=None means accept any non-empty currency from that site
SITE_CONFIGS = {
    "forex": {
        "url":       "https://www.forexfactory.com/calendar?week=this",
        "currencies": ["USD","EUR","GBP","JPY","AUD","NZD","CAD","CHF"],
        "canary_required": True,
    },
    "metals": {
        "url":       "https://www.metalsmine.com/calendar",
        "currencies": None,  # accept all
        "canary_required": False,
    },
    "energy": {
        "url":       "https://www.energyexch.com/calendar",
        "currencies": None,
        "canary_required": False,
    },
    "crypto": {
        "url":       "https://www.cryptocraft.com/calendar",
        "currencies": None,
        "canary_required": False,
    },
}

# ── Instruments we trade (for pair verdict calculation) ─────────────────────
FOREX_CURRENCIES = ["USD","EUR","GBP","JPY","AUD","NZD","CAD","CHF"]

IMPACT_LEVELS  = {"High":3,"Medium":2,"Low":1,"Holiday":0}
IMPACT_WEIGHTS = {"High":3.0,"Medium":1.0,"Low":0.0}
TIME_DECAY     = [(24,1.0),(48,0.7),(72,0.4),(168,0.2),(9999,0.0)]

PAIRS = [
    # Forex
    # Forex pairs
    "EURCAD","CADJPY","EURJPY","CHFJPY","GBPNZD","GBPJPY",
    "USDJPY","NZDCHF","AUDCHF","AUDUSD","GBPAUD","AUDCAD",
    "NZDCAD","NZDUSD","EURAUD","NZDJPY","EURNZD","AUDNZD",
    "AUDJPY","GBPCHF","EURUSD","USDCAD","EURCHF","EURGBP",
    "USDCHF","GBPUSD","GBPCAD","CADCHF",
    # Indices (Asia session focus)
    "JP225YJPY","JP225USD","AU200AUD","HK33HKD","CN50USD",
    # Other indices
    "US30USD","US2000USD","SPX500USD","NAS100USD",
    "UK100GBP","FR40EUR","EU50EUR","DE30EUR",
    # Metals
    "XAUUSD","XAGUSD","XPTUSD","XCUUSD",
    # Energy
    "WTICOUSD","BCOUSD","NATGASUSD",
    # Crypto
    "BTCUSD","ETHUSD","BCHUSD","LTCUSD","MBTCUSD",
]

IMPACT_CSS_MAP = {
    # ForexFactory
    "icon--ff-impact-red": "High",
    "icon--ff-impact-ora": "Medium",
    "icon--ff-impact-yel": "Low",
    "icon--ff-impact-gra": "Holiday",
    # MetalsMine, EnergyExch, CryptoCraft sister sites
    "icon--mm-impact-red": "High",
    "icon--mm-impact-ora": "Medium",
    "icon--mm-impact-yel": "Low",
    "icon--ee-impact-red": "High",
    "icon--ee-impact-ora": "Medium",
    "icon--ee-impact-yel": "Low",
    "icon--cc-impact-red": "High",
    "icon--cc-impact-ora": "Medium",
    "icon--cc-impact-yel": "Low",
}

# Sister site currency inference from event title keywords
TITLE_TO_CURRENCY = {
    "gold":         "XAU", "silver":       "XAG", "platinum":     "XPT",
    "copper":       "XCU", "palladium":    "XPD",
    "crude":        "OIL", "wti":          "OIL", "brent":        "OIL",
    "natural gas":  "GAS", "gasoline":     "OIL", "distillate":   "OIL",
    "heating oil":  "OIL", "eia":          "OIL", "refinery":     "OIL",
    "bitcoin":      "BTC", "ethereum":     "ETH", "litecoin":     "LTC",
    "bitcoin cash": "BCH", "ripple":       "XRP",
}

# Commodity proxy -> G10 currency sentiment
# BEAT (price up) -> bullish currencies; MISS (price down) -> bearish
COMMODITY_TO_FX = {
    "XAU": {"bullish": ["CHF","JPY","USD"], "bearish": ["AUD","NZD"]},
    "XAG": {"bullish": ["AUD"],             "bearish": []},
    "XCU": {"bullish": ["AUD","NZD"],       "bearish": []},
    "OIL": {"bullish": ["CAD"],             "bearish": []},
    "GAS": {"bullish": ["USD"],             "bearish": []},
    "BTC": {"bullish": ["AUD","NZD"],       "bearish": ["JPY","CHF"]},
    "ETH": {"bullish": ["AUD","NZD"],       "bearish": ["JPY","CHF"]},
}

# ── Canary ──────────────────────────────────────────────────────────────────
def check_feed_canaries(html_content, site="forex"):
    # FF requires currency column; sister sites do not have it
    if site == "forex":
        required = ["calendar__actual", "calendar__event-title", "data-event-id",
                    "calendar__currency"]
    else:
        # Sister sites: metalsmine, energyexch, cryptocraft
        required = ["calendar__actual", "calendar__event-title", "data-event-id"]
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

# ── Fetch ───────────────────────────────────────────────────────────────────
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
    except (HTTPError, URLError, Exception) as e:
        raise RuntimeError(f"Fetch failed for {url}: {e}")

# ── Time parsing ─────────────────────────────────────────────────────────────
def parse_time_to_utc(time_str, dateline_ts):
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
        event_utc_ts = dateline_ts + h * 3600 + m * 60
        utc_dt  = datetime.fromtimestamp(event_utc_ts, tz=timezone.utc).replace(tzinfo=None)
        aest_dt = utc_dt + timedelta(hours=10)
        return {"time_24h":f"{h:02d}:{m:02d}","time_et":time_str,
                "datetime_utc":utc_dt.isoformat()+"Z","datetime_aest":aest_dt.isoformat()}
    except Exception:
        return {"time_24h":time_str,"datetime_utc":None,"datetime_aest":None}

# ── Impact extraction ────────────────────────────────────────────────────────
def extract_impact(td):
    if not td: return "Low"
    span = td.find("span", class_=True)
    if not span: return "Low"
    for css_class, level in IMPACT_CSS_MAP.items():
        if css_class in span.get("class",[]):
            return level
    return "Low"

# ── HTML parsing ─────────────────────────────────────────────────────────────
def parse_calendar_html(html_content, allowed_currencies=None, source_site="forex"):
    """Parse FF-platform calendar HTML. allowed_currencies=None accepts all."""
    soup = BeautifulSoup(html_content, "html.parser")
    events = []
    current_dateline = None
    current_date_str = ""

    rows = soup.find_all("tr", attrs={"data-event-id": True})

    for row in rows:
        try:
            dl = row.get("data-day-dateline")
            if dl:
                try:
                    current_dateline = int(dl)
                    dt_utc = datetime.fromtimestamp(current_dateline, tz=timezone.utc)
                    current_date_str = dt_utc.strftime("%m-%d-%Y")
                except Exception:
                    pass

            currency_td = row.find("td", class_="calendar__currency")
            currency = currency_td.get_text(strip=True) if currency_td else ""

            # Sister sites have no currency column -- infer from event title
            if not currency and source_site != "forex":
                title_span_tmp = row.find("span", class_="calendar__event-title")
                title_tmp = title_span_tmp.get_text(strip=True).lower() if title_span_tmp else ""
                for keyword, proxy in TITLE_TO_CURRENCY.items():
                    if keyword in title_tmp:
                        currency = proxy
                        break

            if not currency:
                continue
            if allowed_currencies is not None and currency not in allowed_currencies:
                continue

            impact_td = row.find("td", class_="calendar__impact")
            impact = extract_impact(impact_td)

            title_span = row.find("span", class_="calendar__event-title")
            title = title_span.get_text(strip=True) if title_span else ""

            time_td = row.find("td", class_="calendar__time")
            time_str = time_td.get_text(strip=True) if time_td else ""

            actual_td = row.find("td", class_="calendar__actual")
            actual_str = None
            result = None
            if actual_td:
                actual_span = actual_td.find("span")
                if actual_span:
                    actual_str = actual_span.get_text(strip=True) or None
                    if actual_str:
                        classes = actual_span.get("class", [])
                        if "better" in classes:   result = "BEAT"
                        elif "worse" in classes:  result = "MISS"
                        else:                      result = "INLINE"

            forecast_td = row.find("td", class_="calendar__forecast")
            forecast_str = None
            if forecast_td:
                fs = forecast_td.find("span")
                if fs: forecast_str = fs.get_text(strip=True) or None

            previous_td = row.find("td", class_="calendar__previous")
            previous_str = None
            if previous_td:
                ps = previous_td.find("span")
                if ps: previous_str = ps.get_text(strip=True) or None

            ti = parse_time_to_utc(time_str, current_dateline) if current_dateline else {
                "time_24h": time_str, "datetime_utc": None, "datetime_aest": None
            }

            events.append({
                "title":         title,
                "currency":      currency,
                "source_site":   source_site,
                "date":          current_date_str,
                "time_et":       time_str,
                "time_24h":      ti.get("time_24h"),
                "datetime_utc":  ti.get("datetime_utc"),
                "datetime_aest": ti.get("datetime_aest"),
                "impact":        impact,
                "impact_level":  IMPACT_LEVELS.get(impact, 0),
                "forecast":      forecast_str,
                "previous":      previous_str,
                "actual":        actual_str,
                "result":        result,
                "url":           None,
                **calculate_surprise(actual_str, forecast_str, result),
            })

        except Exception as e:
            print(f"Event parse error ({source_site}): {e}", file=sys.stderr)

    events.sort(key=lambda x: (x.get("datetime_utc") or "9999", x.get("currency", "")))
    return events

# ── Fetch all sites ──────────────────────────────────────────────────────────
def fetch_all_sites(output_dir):
    """Fetch forex + metals + energy + crypto, merge events. Returns (events, health)."""
    all_events = []
    worst_health = {"status":"OK","message":"All feeds OK","missing_tags":[],
                    "checked_at":datetime.utcnow().isoformat()+"Z"}

    for site_name, cfg in SITE_CONFIGS.items():
        url = cfg["url"]
        print(f"Fetching {site_name}: {url}...")
        try:
            html = fetch_html_feed(url)
        except RuntimeError as e:
            print(f"  WARNING: {e}", file=sys.stderr)
            if cfg["canary_required"]:
                worst_health = {"status":"MARKUP_CHANGED","message":str(e),
                                "missing_tags":[],"checked_at":datetime.utcnow().isoformat()+"Z"}
            continue

        health = check_feed_canaries(html, site=site_name)
        if health["status"] != "OK":
            print(f"  Canary FAIL for {site_name}: {health['message']}", file=sys.stderr)
            if cfg["canary_required"]:
                save_health(health, output_dir)
                print(f"ABORT: required site {site_name} failed canary", file=sys.stderr)
                sys.exit(2)
            else:
                print(f"  Skipping {site_name} (non-critical)", file=sys.stderr)
                continue

        events = parse_calendar_html(html, allowed_currencies=cfg["currencies"], source_site=site_name)
        with_actuals = len([e for e in events if e.get("actual")])
        print(f"  {len(events)} events | {with_actuals} with actuals")
        all_events.extend(events)
        time.sleep(1)  # polite rate limiting between sites

    all_events.sort(key=lambda x: (x.get("datetime_utc") or "9999", x.get("currency", "")))
    save_health(worst_health, output_dir)
    return all_events

# Bond auction symbol -> currency (yield up = currency bullish)
BOND_TO_CURRENCY = {
    # US Treasuries
    "USB02Y": "USD", "USB05Y": "USD", "USB10Y": "USD", "USB30Y": "USD",
    # European
    "DE10Y":  "EUR", "GDBR7YR": "EUR", "GERMANY2YNY": "EUR", "GERMANY5YNY": "EUR",
    "UK10Y":  "GBP", "GBP CALENDAR": "GBP",
    "JP10Y":  "JPY", "GJGB10": "JPY", "GJGB3M": "JPY", "JAPAN2YNY": "JPY",
    # Others
    "GCAN10YR": "CAD", "GCAN2Y": "CAD",
    "FRA CALENDAR": "EUR", "ITA CALENDAR": "EUR",
}

# ── Bias scoring ─────────────────────────────────────────────────────────────
def get_decay(hours_ago):
    for threshold, mult in TIME_DECAY:
        if hours_ago <= threshold: return mult
    return 0.0

def parse_numeric(val_str):
    """
    Parse a value string to float, handling K/M/B suffixes and % signs.
    Returns float or None if unparseable.
    Examples: '225K' -> 225000, '2.3%' -> 2.3, '-0.5' -> -0.5, '52.4' -> 52.4
    """
    if not val_str:
        return None
    s = val_str.strip().replace(',', '').replace('%', '')
    multiplier = 1.0
    if s.upper().endswith('T'):
        multiplier = 1e12; s = s[:-1]
    elif s.upper().endswith('B'):
        multiplier = 1e9;  s = s[:-1]
    elif s.upper().endswith('M'):
        multiplier = 1e6;  s = s[:-1]
    elif s.upper().endswith('K'):
        multiplier = 1e3;  s = s[:-1]
    try:
        return round(float(s) * multiplier, 6)
    except (ValueError, TypeError):
        return None


def calculate_surprise(actual_str, forecast_str, result):
    """
    Calculate surprise magnitude: how far actual deviated from forecast.
    Returns dict with surprise_abs (absolute diff), surprise_pct (% diff), surprise_dir.
    Returns None fields if values can't be parsed.
    """
    if not result or result not in ('BEAT', 'MISS', 'INLINE'):
        return {'surprise_abs': None, 'surprise_pct': None, 'surprise_dir': None}
    actual   = parse_numeric(actual_str)
    forecast = parse_numeric(forecast_str)
    if actual is None or forecast is None:
        return {'surprise_abs': None, 'surprise_pct': None, 'surprise_dir': result}
    diff     = actual - forecast
    surprise_pct = round((diff / abs(forecast)) * 100, 2) if forecast != 0 else None
    return {
        'surprise_abs': round(diff, 6),
        'surprise_pct': surprise_pct,
        'surprise_dir': result,
    }


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
        raw_score = score_result(result) * IMPACT_WEIGHTS.get(impact,1.0) * decay

        # Direct G10 currency event (FF or TE calendar)
        if currency in FOREX_CURRENCIES:
            if currency not in scores:
                scores[currency] = {"total":0.0,"events":[],"count":0}
            scores[currency]["total"]  += raw_score
            scores[currency]["count"]  += 1
            scores[currency]["events"].append({
                "title":event.get("title"),"impact":impact,"result":result,
                "actual":actual,"forecast":event.get("forecast"),"previous":event.get("previous"),
                "hours_ago":round(hours_ago,1),"score":round(raw_score,2),
                "source_site":event.get("source_site","forex")
            })
        # Bond auction event (from TE scraper, is_bond=True)
        elif event.get("is_bond"):
            symbol   = event.get("symbol", "")
            fx_cur   = BOND_TO_CURRENCY.get(symbol)
            if not fx_cur:
                # Try inferring from currency field directly
                if currency in FOREX_CURRENCIES:
                    fx_cur = currency
            if fx_cur:
                # Yield up (BEAT) = hawkish signal = bullish for currency
                bond_score = raw_score * 0.5  # half weight — yields are indirect signal
                if fx_cur not in scores:
                    scores[fx_cur] = {"total":0.0,"events":[],"count":0}
                scores[fx_cur]["total"]  += bond_score
                scores[fx_cur]["count"]  += 1
                scores[fx_cur]["events"].append({
                    "title":f"Bond {event.get('event',symbol)}","impact":impact,"result":result,
                    "actual":actual,"forecast":event.get("forecast"),"previous":event.get("previous"),
                    "hours_ago":round(hours_ago,1),"score":round(bond_score,2),
                    "source_site":"te_bond"
                })

        # Commodity proxy event (metals/energy/crypto sister sites)
        elif currency in COMMODITY_TO_FX:
            mapping = COMMODITY_TO_FX[currency]
            # BEAT = price up = bullish for mapped currencies
            # MISS = price down = bearish for mapped currencies
            if result == "BEAT":
                affected = mapping.get("bullish", [])
                sign = 1.0
            elif result == "MISS":
                affected = mapping.get("bullish", [])  # reverse: if price missed, those currencies weaken
                sign = -1.0
            else:
                affected = []
                sign = 0.0
            commodity_score = sign * IMPACT_WEIGHTS.get(impact, 1.0) * decay * 0.5  # half weight vs direct
            for fx_cur in affected:
                if fx_cur not in scores:
                    scores[fx_cur] = {"total":0.0,"events":[],"count":0}
                scores[fx_cur]["total"]  += commodity_score
                scores[fx_cur]["count"]  += 1
                scores[fx_cur]["events"].append({
                    "title":f"{currency} {event.get('title','')}","impact":impact,"result":result,
                    "actual":actual,"forecast":event.get("forecast"),"previous":event.get("previous"),
                    "hours_ago":round(hours_ago,1),"score":round(commodity_score,2),
                    "source_site":event.get("source_site","forex")
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

# Explicit base/quote mapping for non-standard pairs (indices, metals etc)
INDEX_PAIR_CURRENCIES = {
    "AU200AUD":  ("AUD", "USD"),  # AU200 priced in AUD, vs USD risk sentiment
    "CN50USD":   ("CNY", "USD"),
    "HK33HKD":   ("HKD", "USD"),
    "JP225YJPY": ("JPY", "USD"),
    "JP225USD":  ("JPY", "USD"),
    "US30USD":   ("USD", "USD"),
    "US2000USD": ("USD", "USD"),
    "SPX500USD": ("USD", "USD"),
    "NAS100USD": ("USD", "USD"),
    "UK100GBP":  ("GBP", "USD"),
    "FR40EUR":   ("EUR", "USD"),
    "EU50EUR":   ("EUR", "USD"),
    "DE30EUR":   ("EUR", "USD"),
}

def calculate_pair_verdicts(bias_map):
    verdicts = {}
    for pair in PAIRS:
        if pair in INDEX_PAIR_CURRENCIES:
            base, quote = INDEX_PAIR_CURRENCIES[pair]
        else:
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

# ── Bias history ──────────────────────────────────────────────────────────────
def load_bias_history(path):
    if not os.path.exists(path):
        return {"schema_version":"1.0.0","created":datetime.utcnow().isoformat()+"Z","runs":[]}
    try:
        with open(path,"r",encoding="utf-8") as f:
            raw = f.read()
        return json.loads(raw) if raw.strip() else             {"schema_version":"1.0.0","created":datetime.utcnow().isoformat()+"Z","runs":[]}
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
                            "id":f"{e['currency'].lower()}-{e['title'].lower().replace(' ','-')[:20]}-{dt_str[:10]}",
                            "title":e["title"],"currency":e["currency"],"impact":e["impact"],
                            "actual":e["actual"],"forecast":e.get("forecast"),
                            "previous":e.get("previous"),"result":e["result"],"datetime_utc":dt_str,
                            "source_site":e.get("source_site","forex"),
                            "surprise_abs":e.get("surprise_abs"),
                            "surprise_pct":e.get("surprise_pct"),
                            "surprise_dir":e.get("surprise_dir"),
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
    with open(path,"w",encoding="utf-8") as f:
        json.dump(history,f,indent=2,ensure_ascii=False)
    print(f"Bias history: {history.get('run_count',0)} runs -> {path}")

# ── Calendar save ─────────────────────────────────────────────────────────────
def save_calendar(events, path, bias_map=None, pair_verdicts=None):
    data = {
        "last_updated":   datetime.utcnow().isoformat()+"Z",
        "schema_version": "2.0.0",
        "source":         "ForexFactory+Sisters",
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

# ── Backfill helpers ──────────────────────────────────────────────────────────
def get_past_week_urls(n_weeks=4, all_sites=False):
    MONTHS = ["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"]
    now = datetime.utcnow()
    weekday = now.weekday()
    days_since_sunday = (weekday + 1) % 7
    current_sunday = (now - timedelta(days=days_since_sunday)).replace(
        hour=0, minute=0, second=0, microsecond=0)
    weeks = []
    for i in range(n_weeks, 0, -1):
        week_sunday = current_sunday - timedelta(weeks=i)
        month_str = MONTHS[week_sunday.month - 1]
        suffix = f"{month_str}{week_sunday.day}.{week_sunday.year}"
        if all_sites:
            site_urls = [
                (f"https://www.forexfactory.com/calendar?week={suffix}", "forex"),
                (f"https://www.metalsmine.com/calendar?week={suffix}",   "metals"),
                (f"https://www.energyexch.com/calendar?week={suffix}",   "energy"),
                (f"https://www.cryptocraft.com/calendar?week={suffix}",  "crypto"),
            ]
        else:
            site_urls = [(f"https://www.forexfactory.com/calendar?week={suffix}", "forex")]
        weeks.append((site_urls, week_sunday))
    return weeks

def run_id_for_week(week_sunday, all_sites=False):
    suffix = "_allsites" if all_sites else ""
    return f"backfill_{week_sunday.strftime('%Y%m%d')}{suffix}"

def week_already_backfilled(history, week_sunday, all_sites=False):
    rid = run_id_for_week(week_sunday, all_sites)
    # Also accept old backfill IDs without suffix
    old_rid = f"backfill_{week_sunday.strftime('%Y%m%d')}"
    return any(r.get("run_id") in (rid, old_rid) for r in history.get("runs", []))

def backfill_week(site_urls, week_sunday, history, bias_path, all_sites=False):
    all_events = []
    for url, site_name in site_urls:
        print(f"  Fetching {site_name}: {url}...")
        try:
            html = fetch_html_feed(url)
        except RuntimeError as e:
            print(f"  WARNING: {e} — skipping {site_name}", file=sys.stderr)
            continue
        health = check_feed_canaries(html, site=site_name)
        if health["status"] != "OK":
            print(f"  Canary fail for {site_name} — skipping", file=sys.stderr)
            continue
        cfg = SITE_CONFIGS.get(site_name, {})
        events = parse_calendar_html(html, allowed_currencies=cfg.get("currencies"), source_site=site_name)
        with_actuals = len([e for e in events if e.get("actual")])
        print(f"    {len(events)} events | {with_actuals} with actuals")
        all_events.extend(events)
        time.sleep(1)

    if not any(e.get("actual") for e in all_events):
        print(f"  No actuals across all sites — skipping")
        return history

    run_time = week_sunday + timedelta(days=5, hours=23, minutes=59)
    now = datetime.utcnow()
    bias_map = calculate_currency_bias(all_events, now)
    for cur, d in sorted(bias_map.items()):
        print(f"    {cur}: {d['bias']} ({d['score']:+.1f}) [{d['confidence']}, {d['event_count']} ev]")
    pair_verdicts = calculate_pair_verdicts(bias_map)
    history = append_bias_run(history, all_events, bias_map, pair_verdicts, run_time=run_time)
    history["runs"][-1]["run_id"] = run_id_for_week(week_sunday, all_sites)
    history["runs"][-1]["backfill"] = True
    save_bias_history(history, bias_path)
    return history

# ── Main ──────────────────────────────────────────────────────────────────────
def main():
    SCRIPT_DIR    = os.path.dirname(os.path.abspath(__file__))
    PROJECT_ROOT  = os.path.abspath(os.path.join(SCRIPT_DIR,'..','..'))
    DEFAULT_OUT   = os.path.join(PROJECT_ROOT,'src','calendar.json')
    DEFAULT_BAK   = os.path.join(PROJECT_ROOT,'data','calendar.json')
    DEFAULT_BIAS  = os.path.join(PROJECT_ROOT,'data','bias-history.json')
    UNRAID_BIAS   = '/mnt/user/appdata/trading-state/data/bias-history.json'

    parser = argparse.ArgumentParser(description="FCC Calendar Scraper v3.2.0")
    parser.add_argument("--output",         "-o", default=DEFAULT_OUT)
    parser.add_argument("--backup-path",          default=DEFAULT_BAK)
    parser.add_argument("--bias-history",         default=DEFAULT_BIAS)
    parser.add_argument("--unraid",               action="store_true")
    parser.add_argument("--all-sites",            action="store_true", dest="all_sites",
                        help="Also scrape metals/energy/crypto sister sites")
    parser.add_argument("--backfill",             action="store_true")
    parser.add_argument("--backfill-weeks",       type=int, default=4, dest="backfill_weeks")
    parser.add_argument("--print",          "-p", action="store_true", dest="print_output")
    args = parser.parse_args()

    bias_path  = UNRAID_BIAS if args.unraid else args.bias_history
    output_dir = os.path.dirname(DEFAULT_OUT)

    # ── Backfill mode ─────────────────────────────────────────────────────────
    if args.backfill:
        print(f"BACKFILL MODE: {args.backfill_weeks} weeks {'(all sites)' if args.all_sites else '(forex only)'}...")
        history = load_bias_history(bias_path)
        past_weeks = get_past_week_urls(args.backfill_weeks, all_sites=args.all_sites)
        for site_urls, week_sunday in past_weeks:
            if week_already_backfilled(history, week_sunday, args.all_sites):
                print(f"  Skipping {week_sunday.strftime('%Y-%m-%d')} (already backfilled)")
                continue
            history = backfill_week(site_urls, week_sunday, history, bias_path, args.all_sites)
            time.sleep(2)
        print(f"FF backfill complete: {history.get('run_count',0)} total runs")

        # ── TE backfill — same weeks, same bias file ───────────────────────
        te_script = os.path.join(os.path.dirname(os.path.abspath(__file__)), "te_scraper.py")
        if os.path.exists(te_script):
            print(f"\nStarting TE backfill ({args.backfill_weeks} weeks)...")
            import subprocess
            cmd = [sys.executable, te_script, "--backfill",
                   f"--backfill-weeks={args.backfill_weeks}"]
            if args.unraid:
                cmd.append("--unraid")
            subprocess.run(cmd, check=False)
        else:
            print(f"te_scraper.py not found at {te_script} — skipping TE backfill")

        print("Done.")
        return

    # ── Normal run ────────────────────────────────────────────────────────────
    if args.all_sites:
        events = fetch_all_sites(output_dir)
    else:
        url = SITE_CONFIGS["forex"]["url"]
        print(f"Fetching {url}...")
        html = fetch_html_feed(url)
        health = check_feed_canaries(html, site="forex")
        save_health(health, output_dir)
        if health["status"] != "OK":
            print(f"ABORT: {health['message']}", file=sys.stderr); sys.exit(2)
        events = parse_calendar_html(html, allowed_currencies=SITE_CONFIGS["forex"]["currencies"], source_site="forex")

    with_actuals = len([e for e in events if e.get("actual")])
    high_events  = len([e for e in events if e.get("impact")=="High"])
    print(f"Total: {len(events)} events | {high_events} high | {with_actuals} with actuals")

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
