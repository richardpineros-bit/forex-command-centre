#!/usr/bin/env python3
"""
ForexFactory Economic Calendar Scraper
Fetches weekly calendar data and saves as JSON for Command Center integration.

Usage:
    python forex_calendar_scraper.py [--output /path/to/calendar.json]

Runs on Unraid via cron (e.g., daily at 6am AEST):
    0 6 * * * /usr/bin/python3 /path/to/forex_calendar_scraper.py --output /path/to/calendar.json
"""

import argparse
import json
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta
from urllib.request import urlopen, Request
from urllib.error import URLError, HTTPError
import os
import sys

# ForexFactory XML feed URL
FF_CALENDAR_URL = "https://nfs.faireconomy.media/ff_calendar_thisweek.xml"

# Currencies we care about for forex trading
FOREX_CURRENCIES = ["USD", "EUR", "GBP", "JPY", "AUD", "NZD", "CAD", "CHF"]

# Impact level mapping
IMPACT_LEVELS = {
    "High": 3,
    "Medium": 2,
    "Low": 1,
    "Holiday": 0
}


def fetch_xml_feed(url: str) -> str:
    """Fetch the XML feed from ForexFactory."""
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
    }
    
    try:
        request = Request(url, headers=headers)
        with urlopen(request, timeout=30) as response:
            # Handle encoding - FF uses windows-1252
            return response.read().decode("windows-1252", errors="replace")
    except HTTPError as e:
        print(f"HTTP Error {e.code}: {e.reason}", file=sys.stderr)
        sys.exit(1)
    except URLError as e:
        print(f"URL Error: {e.reason}", file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(f"Error fetching feed: {e}", file=sys.stderr)
        sys.exit(1)


def parse_time_to_24h(time_str: str, date_str: str) -> dict:
    """
    Convert ForexFactory time format to 24h and calculate UTC timestamp.
    FF times are in US Eastern Time.
    
    Returns dict with:
        - time_24h: "HH:MM" format
        - datetime_utc: ISO format UTC datetime
        - datetime_aest: ISO format AEST datetime
    """
    if not time_str or time_str.strip() == "":
        return {
            "time_24h": "All Day",
            "datetime_utc": None,
            "datetime_aest": None
        }
    
    time_str = time_str.strip()
    
    # Handle "All Day" or "Tentative" events
    if time_str.lower() in ["all day", "tentative", ""]:
        return {
            "time_24h": "All Day",
            "datetime_utc": None,
            "datetime_aest": None
        }
    
    try:
        # Parse time like "3:00pm" or "10:30am"
        time_str_clean = time_str.lower().replace(" ", "")
        
        if "am" in time_str_clean or "pm" in time_str_clean:
            is_pm = "pm" in time_str_clean
            time_str_clean = time_str_clean.replace("am", "").replace("pm", "")
            
            parts = time_str_clean.split(":")
            hour = int(parts[0])
            minute = int(parts[1]) if len(parts) > 1 else 0
            
            # Convert to 24h
            if is_pm and hour != 12:
                hour += 12
            elif not is_pm and hour == 12:
                hour = 0
            
            time_24h = f"{hour:02d}:{minute:02d}"
            
            # Parse date (MM-DD-YYYY format from FF)
            date_parts = date_str.split("-")
            month = int(date_parts[0])
            day = int(date_parts[1])
            year = int(date_parts[2])
            
            # Create datetime in US Eastern Time
            # Note: This is simplified - doesn't handle DST properly
            # For trading purposes, approximate is fine
            et_dt = datetime(year, month, day, hour, minute)
            
            # Convert to UTC (ET is UTC-5, or UTC-4 during DST)
            # Using UTC-5 as approximation
            utc_dt = et_dt + timedelta(hours=5)
            
            # Convert to AEST (UTC+10, or UTC+11 during DST)
            # Using UTC+10 as approximation
            aest_dt = utc_dt + timedelta(hours=10)
            
            return {
                "time_24h": time_24h,
                "time_et": time_str,
                "datetime_utc": utc_dt.isoformat() + "Z",
                "datetime_aest": aest_dt.isoformat()
            }
        else:
            return {
                "time_24h": time_str,
                "datetime_utc": None,
                "datetime_aest": None
            }
            
    except Exception as e:
        return {
            "time_24h": time_str,
            "datetime_utc": None,
            "datetime_aest": None,
            "parse_error": str(e)
        }


def parse_calendar_xml(xml_content: str) -> list:
    """Parse the ForexFactory XML into a list of events."""
    events = []
    
    try:
        root = ET.fromstring(xml_content)
    except ET.ParseError as e:
        print(f"XML Parse Error: {e}", file=sys.stderr)
        sys.exit(1)
    
    for event_elem in root.findall("event"):
        try:
            # Extract fields
            title = event_elem.findtext("title", "").strip()
            country = event_elem.findtext("country", "").strip()
            date = event_elem.findtext("date", "").strip()
            time_str = event_elem.findtext("time", "").strip()
            impact = event_elem.findtext("impact", "").strip()
            forecast = event_elem.findtext("forecast", "").strip()
            previous = event_elem.findtext("previous", "").strip()
            url = event_elem.findtext("url", "").strip()
            
            # Skip if not a forex currency we care about
            if country not in FOREX_CURRENCIES:
                continue
            
            # Parse time
            time_info = parse_time_to_24h(time_str, date)
            
            event = {
                "title": title,
                "currency": country,
                "date": date,
                "time_et": time_str,
                "time_24h": time_info.get("time_24h"),
                "datetime_utc": time_info.get("datetime_utc"),
                "datetime_aest": time_info.get("datetime_aest"),
                "impact": impact,
                "impact_level": IMPACT_LEVELS.get(impact, 0),
                "forecast": forecast if forecast else None,
                "previous": previous if previous else None,
                "url": url
            }
            
            events.append(event)
            
        except Exception as e:
            print(f"Error parsing event: {e}", file=sys.stderr)
            continue
    
    # Sort by datetime
    events.sort(key=lambda x: (x.get("datetime_utc") or "9999", x.get("currency")))
    
    return events


def save_calendar(events: list, output_path: str) -> None:
    """Save events to JSON file."""
    
    output_data = {
        "last_updated": datetime.utcnow().isoformat() + "Z",
        "source": "ForexFactory",
        "feed_url": FF_CALENDAR_URL,
        "event_count": len(events),
        "events": events
    }
    
    # Ensure directory exists
    output_dir = os.path.dirname(output_path)
    if output_dir and not os.path.exists(output_dir):
        os.makedirs(output_dir)
    
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(output_data, f, indent=2, ensure_ascii=False)
    
    print(f"Saved {len(events)} events to {output_path}")


def main():
    parser = argparse.ArgumentParser(
        description="Fetch ForexFactory economic calendar and save as JSON"
    )
    parser.add_argument(
        "--output", "-o",
        default="calendar.json",
        help="Output JSON file path (default: calendar.json)"
    )
    parser.add_argument(
        "--print", "-p",
        action="store_true",
        dest="print_output",
        help="Print events to stdout instead of saving"
    )
    
    args = parser.parse_args()
    
    print(f"Fetching ForexFactory calendar from {FF_CALENDAR_URL}...")
    xml_content = fetch_xml_feed(FF_CALENDAR_URL)
    
    print("Parsing calendar events...")
    events = parse_calendar_xml(xml_content)
    
    print(f"Found {len(events)} forex events")
    
    # Count by impact
    high_impact = len([e for e in events if e["impact"] == "High"])
    medium_impact = len([e for e in events if e["impact"] == "Medium"])
    print(f"  - High impact: {high_impact}")
    print(f"  - Medium impact: {medium_impact}")
    
    if args.print_output:
        print(json.dumps(events, indent=2))
    else:
        save_calendar(events, args.output)


if __name__ == "__main__":
    main()
