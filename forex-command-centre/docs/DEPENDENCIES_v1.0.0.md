# Forex Command Centre - Module Dependencies v1.0.0

## Overview

All 18 JavaScript modules are loaded by `index.html` via `<script>` tags. There is no bundler or module system — load order matters. Modules communicate through the global `window` object and DOM events.

---

## Load Order (Critical)

Modules must load in this sequence. Reordering will break functionality.

```
1. CORE/server-storage.js      -- Storage API (no dependencies)
2. CORE/alert-queue.js          -- Alert handling (depends: server-storage)
3. CORE/broker-manager.js       -- Broker abstraction (depends: server-storage)
4. BROKER/broker-oanda.js       -- Oanda API adapter (depends: broker-manager)
5. BROKER/broker-dashboard.js   -- Auto-journal engine (depends: broker-oanda, trade-journal)
6. BROKER/broker-ui.js          -- Account display (depends: broker-oanda)
7. RISK/circuit-breaker-module.js      -- Loss tracking core (depends: server-storage)
8. RISK/circuit-breaker-integration.js -- Risk gates (depends: circuit-breaker-module)
9. RISK/circuit-breaker-ui.js          -- Risk display (depends: circuit-breaker-module)
10. LOGIC/playbook-module.js     -- Playbook selection (depends: server-storage)
11. LOGIC/regime-module.js       -- Regime tracking (depends: server-storage)
12. LOGIC/session-board.js       -- Session state (depends: server-storage)
13. TRADING/trade-capture.js     -- Trade entry (depends: server-storage, alert-queue)
14. TRADING/trade-journal.js     -- Trade management (depends: server-storage)
15. TRADING/journal-autofill.js  -- Auto-fill (depends: trade-journal, broker-dashboard)
16. EXECUTION/execute-integration.js -- Pre-trade checklist (depends: circuit-breaker, playbook, regime, session-board)
17. REFERENCE/gold-nugget-guide.js   -- Reference (no runtime deps)
18. REFERENCE/trading-guide.js       -- Reference (no runtime deps)
```

---

## Dependency Graph

```
server-storage.js
  +-- alert-queue.js
  |     +-- trade-capture.js
  +-- broker-manager.js
  |     +-- broker-oanda.js
  |           +-- broker-dashboard.js --> journal-autofill.js
  |           +-- broker-ui.js
  +-- circuit-breaker-module.js
  |     +-- circuit-breaker-integration.js
  |     +-- circuit-breaker-ui.js
  +-- playbook-module.js ----+
  +-- regime-module.js ------+--> execute-integration.js
  +-- session-board.js ------+
  +-- trade-journal.js
        +-- journal-autofill.js
```

---

## Module Responsibilities

### CORE (Foundation)

| Module              | Exposes                        | Consumed By              |
|---------------------|--------------------------------|--------------------------|
| server-storage.js   | `ServerStorage` API (load/save JSON) | All modules requiring persistence |
| alert-queue.js      | `AlertQueue` (UTCC alert display)    | trade-capture.js, index.html |
| broker-manager.js   | `BrokerManager` (abstract broker)    | broker-oanda.js |

### BROKER (Oanda Integration)

| Module              | Exposes                        | Consumed By              |
|---------------------|--------------------------------|--------------------------|
| broker-oanda.js     | `OandaBroker` (REST API v20)   | broker-dashboard, broker-ui |
| broker-dashboard.js | Auto-journal sync engine       | journal-autofill.js |
| broker-ui.js        | Account balance/equity display | index.html (Dashboard tab) |

### TRADING (Journal System)

| Module              | Exposes                        | Consumed By              |
|---------------------|--------------------------------|--------------------------|
| trade-capture.js    | Trade entry form logic         | index.html |
| trade-journal.js    | CRUD for trades.json           | journal-autofill, broker-dashboard |
| journal-autofill.js | Maps Oanda trades to journal   | broker-dashboard.js |

### RISK (Circuit Breaker)

| Module                          | Exposes                   | Consumed By                    |
|---------------------------------|---------------------------|--------------------------------|
| circuit-breaker-module.js       | Core loss tracking engine | integration, ui, execute       |
| circuit-breaker-integration.js  | Risk gate enforcement     | execute-integration.js         |
| circuit-breaker-ui.js           | Drawdown display/banners  | index.html (Dashboard tab)     |

### LOGIC (Trading Logic)

| Module             | Exposes                  | Consumed By              |
|--------------------|--------------------------|--------------------------|
| playbook-module.js | Playbook state manager   | execute-integration.js   |
| regime-module.js   | Market regime tracker    | execute-integration.js   |
| session-board.js   | Session state manager    | execute-integration.js   |

### EXECUTION (Pre-Trade)

| Module                    | Exposes               | Consumed By    |
|---------------------------|-----------------------|----------------|
| execute-integration.js    | Pre-trade checklist   | index.html     |

### REFERENCE (Read-Only)

| Module                | Exposes           | Consumed By    |
|-----------------------|-------------------|----------------|
| gold-nugget-guide.js  | Reference content | index.html     |
| trading-guide.js      | Reference content | index.html     |

---

## Backend Dependencies

### PHP (served by Nginx)

| File              | Purpose                   | Called By               |
|-------------------|---------------------------|-------------------------|
| storage-api.php   | JSON file CRUD            | server-storage.js       |
| oanda-proxy.php   | CORS proxy for Oanda API  | broker-oanda.js         |

### Node.js (forex-alert-server)

| File      | Dependencies        | Purpose                     |
|-----------|---------------------|-----------------------------|
| index.js  | express, fs, path   | TradingView webhook receiver |

### Python

| File                       | Dependencies          | Purpose                |
|----------------------------|-----------------------|------------------------|
| forex_calendar_scraper.py  | requests, bs4, json   | Economic calendar data |

---

## CSS Files

| File                 | Styles For                    |
|----------------------|-------------------------------|
| alert-queue-ui.css   | Alert queue panel             |
| trade-capture-ui.css | Trade capture form            |

Remaining styles are inline within `index.html`.

---

## External Services

| Service    | Protocol      | Auth                    | Used By             |
|------------|---------------|-------------------------|---------------------|
| Oanda      | REST API v20  | Bearer token via proxy  | broker-oanda.js     |
| Nextcloud  | WebDAV        | App password            | server-storage.js   |
| TradingView| Webhook POST  | URL-based (no auth)     | forex-alert-server  |
| Cloudflare | Tunnel        | Tunnel token            | All external access |
