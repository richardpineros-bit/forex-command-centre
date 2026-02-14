# Forex Command Centre - System Architecture v1.0.0

## Overview

The Forex Command Centre is a web-based trading management system running on an Unraid server. It enforces systematic, rules-based forex trading through the UTCC (Unified Trading Command Center) methodology. The system is designed around one core principle: **the trader will eventually act irrationally; the system stops them.**

---

## High-Level Architecture

```
TradingView (Pine Script v6 Indicators)
    |
    +-- Email Alerts --> Gmail --> Phone Notification
    |
    +-- Webhook Alerts --> forex-alert-server (Node.js, port 3847)
                              |
                              +--> armed.json / candidates.json / utcc-alerts.json
                              |
                              +--> alerts.pineros.club (Cloudflare Tunnel)
                                        |
    Browser <-- forex.pineros.club <-- Nginx Container
        |                                  |
        +--> index.html (SPA)              +--> src/js/[MODULES]
        |                                  +--> backend/api/ (PHP)
        +--> Oanda API (via oanda-proxy.php)
        |
        +--> Nextcloud WebDAV (via nextcloud-proxy.php)
        |
        +--> Server Storage (via storage-api.php)
```

---

## Component Layers

### Layer 1: Signal Generation (TradingView)

Six UTCC Pine Script v6 indicator suites generate alerts across asset classes:

| Asset Class | Indicator Version | Alert Format |
|-------------|------------------|--------------|
| Forex       | v2.6.0           | Institutional (severity prefix) |
| Metals      | v2.6.0           | Institutional |
| Indices     | v2.1.2           | Institutional |
| Energy      | v2.1.1           | Institutional |
| Bonds       | v2.1.1           | Institutional |
| Crypto      | v2.1.2           | Institutional |

Alerts use plain text format with severity prefixes: `[A]` Armed, `[C]` Candidate, `[B]` Blocked, `[I]` Info.

### Layer 2: Alert Processing (forex-alert-server)

- **Runtime:** Node.js on Docker (Unraid)
- **Port:** 3847
- **Endpoint:** alerts.pineros.club (Cloudflare Tunnel)
- **Responsibility:** Receives TradingView webhooks, parses institutional alert format, maintains armed/candidate state
- **Data files:** armed.json, utcc-alerts.json, candidates.json (4-hour TTL)

### Layer 3: Web Application (forex-command-centre)

Single-page application served by Nginx. All state persisted via server-side JSON files through storage-api.php.

**Module Categories:**

| Category   | Purpose                          | Modules |
|------------|----------------------------------|---------|
| CORE       | Data sync, alerts, broker mgmt   | server-storage.js, alert-queue.js, broker-manager.js |
| BROKER     | Oanda API integration            | broker-oanda.js, broker-dashboard.js, broker-ui.js |
| TRADING    | Trade capture, journal, autofill | trade-capture.js, trade-journal.js, journal-autofill.js |
| RISK       | Circuit breaker system           | circuit-breaker-module.js, circuit-breaker-integration.js, circuit-breaker-ui.js |
| LOGIC      | Playbook, regime, sessions       | playbook-module.js, regime-module.js, session-board.js |
| EXECUTION  | Pre-trade validation             | execute-integration.js |
| REFERENCE  | Guides and documentation         | gold-nugget-guide.js, trading-guide.js |

### Layer 4: Data Persistence

**Server-side (storage-api.php):**

| File                | Purpose                          |
|---------------------|----------------------------------|
| trades.json         | Complete trade history           |
| session-board.json  | Daily session board state        |
| regime.json         | Market regime selection          |
| playbook.json       | Playbook selection               |
| circuit-breaker.json| Loss thresholds and lockout state|

**Backup (Nextcloud WebDAV):**
- Path: `Trading/forex-backup.json`
- Proxy: `nextcloud-proxy.php` (bypasses CORS)
- Optional auto-backup after journal entries

### Layer 5: Broker Integration

- **Broker:** Oanda (REST API v20)
- **Proxy:** oanda-proxy.php (CORS bypass, credential hiding)
- **Features:** Account balance polling, open position tracking, trade history retrieval, auto-journal population

---

## Network Topology

| Subdomain              | Service              | Port | Container   |
|------------------------|----------------------|------|-------------|
| forex.pineros.club     | Nginx (web app)      | 80   | nginx       |
| alerts.pineros.club    | Webhook receiver     | 3847 | trading-state |
| nextcloud.pineros.club | Nextcloud AIO        | 443  | nextcloud   |

All external access via Cloudflare Tunnels. No ports exposed directly.

---

## Data Flow: Trade Lifecycle

```
1. UTCC indicator fires alert on TradingView
2. Alert --> Email (phone notification) + Webhook (alert server)
3. Alert server parses, updates armed.json
4. Trader opens Command Centre, sees Armed Instruments panel
5. Trader validates setup via pre-trade checklist (5 criteria)
6. If all pass --> trade captured in trade-capture.js
7. broker-dashboard.js detects new Oanda position
8. journal-autofill.js auto-populates journal entry
9. Circuit breaker monitors drawdown in real-time
10. Trade closed --> journal updated --> stats recalculated
```

---

## Design Principles

1. **Fail-closed:** Missing regime, session, or context = no trade
2. **Risk above execution:** Risk logic has veto power over all trading decisions
3. **No overrides:** Kill-switches and lockouts have no bypass mechanism
4. **Audit trail:** Every trade, non-trade, veto, and block is logged
5. **Encoding safety:** HTML entities for markup, Unicode escapes for JS (never raw emoji)
6. **Server-side persistence:** All critical state stored server-side via PHP API (not just localStorage)
