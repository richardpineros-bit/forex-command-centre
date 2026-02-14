# Forex Command Centre - Deployment Procedures v1.0.0

## Environment

| Component        | Location                                      |
|------------------|-----------------------------------------------|
| Web App          | `/mnt/user/appdata/forex-command-centre/`      |
| Alert Server     | `/mnt/user/appdata/forex-alert-server/`        |
| Nginx Config     | `/mnt/user/appdata/nginx/nginx/forex-command-centre.conf` |
| SSL Certs        | `/mnt/user/appdata/nginx/keys/`               |
| Server           | Unraid (Docker)                                |
| Timezone         | AEST (Australia/Sydney)                        |

---

## Deploying Frontend Changes

### 1. Pre-Deployment Checks

```bash
# Verify file encoding (must be UTF-8)
file /mnt/user/appdata/forex-command-centre/src/index.html
# Expected: HTML document, UTF-8 Unicode text

# Check for encoding corruption
grep -c "Ã" /mnt/user/appdata/forex-command-centre/src/index.html
# Expected: 0

# Backup current version
cp /mnt/user/appdata/forex-command-centre/src/index.html \
   /mnt/user/appdata/forex-command-centre/backups/index_$(date +%Y%m%d_%H%M%S).html
```

### 2. Deploy Files

```bash
# Copy new file(s) to src/
cp new_file.js /mnt/user/appdata/forex-command-centre/src/js/CATEGORY/

# Set permissions
chmod 644 /mnt/user/appdata/forex-command-centre/src/js/CATEGORY/new_file.js
```

### 3. Post-Deployment

```bash
# Clear Nginx cache
docker exec nginx nginx -s reload

# Verify site loads
curl -s -o /dev/null -w "%{http_code}" https://forex.pineros.club
# Expected: 200

# Clear browser cache: Ctrl+Shift+Delete
# Check F12 Console for JavaScript errors
```

---

## Deploying Alert Server Changes

### 1. Backup

```bash
cp /mnt/user/appdata/forex-alert-server/index.js \
   /mnt/user/appdata/forex-alert-server/index_$(date +%Y%m%d_%H%M%S).js.bak
```

### 2. Deploy and Restart

```bash
# Copy new file
cp new_index.js /mnt/user/appdata/forex-alert-server/index.js

# Restart container
docker restart trading-state

# Verify health
curl https://alerts.pineros.club/health
# Expected: {"status":"ok",...}

# Verify state endpoint
curl https://alerts.pineros.club/state
```

### 3. Test Alert Processing

```bash
# Send test webhook (old format)
curl -X POST https://alerts.pineros.club/webhook \
  -H "Content-Type: text/plain" \
  -d "ARMED | EURUSD | CONTINUATION | LDN"

# Send test webhook (institutional format)
curl -X POST https://alerts.pineros.club/webhook \
  -H "Content-Type: text/plain" \
  -d "[A] ARMED | EURUSD | CONTINUATION | LDN -- R1: Trend aligned | Permission: FULL | Max Risk: 1.0% | Score: 85"

# Verify armed state updated
curl https://alerts.pineros.club/state
```

---

## Deploying Backend (PHP) Changes

```bash
# Backup
cp /mnt/user/appdata/forex-command-centre/backend/api/storage-api.php \
   /mnt/user/appdata/forex-command-centre/backups/storage-api_$(date +%Y%m%d).php.bak

# Deploy
cp new_storage-api.php /mnt/user/appdata/forex-command-centre/backend/api/storage-api.php

# Set permissions
chmod 644 /mnt/user/appdata/forex-command-centre/backend/api/storage-api.php

# Test
curl -s https://forex.pineros.club/backend/api/storage-api.php?file=trades
# Should return JSON
```

---

## Nginx Configuration

### Current Config Location

```
/mnt/user/appdata/nginx/nginx/forex-command-centre.conf
```

### Key Settings

```nginx
root /mnt/user/appdata/forex-command-centre/src/;
```

### Testing Config Changes

```bash
# Syntax check
docker exec nginx nginx -t
# Must say: "test is successful"

# Reload (no downtime)
docker exec nginx nginx -s reload

# Full restart (if reload fails)
docker restart nginx
```

---

## Rollback Procedure

If anything breaks after deployment:

```bash
# 1. Identify the broken component
# Check Nginx logs
docker logs nginx --tail 50

# Check alert server logs
docker logs trading-state --tail 50

# 2. Restore from backup
cp /mnt/user/appdata/forex-command-centre/backups/index_TIMESTAMP.html \
   /mnt/user/appdata/forex-command-centre/src/index.html

# 3. Reload
docker exec nginx nginx -s reload
```

---

## Health Checks

Run these after any deployment:

```bash
# Web app
curl -s -o /dev/null -w "%{http_code}" https://forex.pineros.club
# Expected: 200

# Alert server
curl https://alerts.pineros.club/health
# Expected: {"status":"ok"}

# Storage API
curl -s https://forex.pineros.club/backend/api/storage-api.php?file=trades | head -c 100
# Expected: JSON data

# Oanda proxy
curl -s https://forex.pineros.club/backend/api/oanda-proxy.php?endpoint=accounts
# Expected: JSON (or auth error if no config)
```

---

## File Permissions Reference

| Path                           | Permission | Owner |
|--------------------------------|------------|-------|
| src/ (all frontend files)      | 644        | nobody:users |
| data/ (JSON persistence)       | 666        | nobody:users |
| backend/api/ (PHP)             | 644        | nobody:users |
| config/ (credentials)          | 600        | nobody:users |
| backups/                       | 755        | nobody:users |

---

## Critical Reminders

1. **Never deploy during active trading sessions** (Tokyo 9am-3pm AEST, London 5pm-1am AEST)
2. **Always backup before deploying** -- no exceptions
3. **Check encoding after every HTML edit** -- `grep -c "Ã"` must return 0
4. **Test alert flow end-to-end** after any alert server changes
5. **Version your deployments** -- use semantic versioning in filenames
