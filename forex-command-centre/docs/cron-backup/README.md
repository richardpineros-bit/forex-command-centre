# Cron Backup — Unraid User Scripts

**Purpose:** Version-controlled copies of the Unraid User Scripts that
run the scraper cron jobs. Primary copies live at:

```
/boot/config/plugins/user.scripts/scripts/<name>/
  ├── name       (display name for the UI)
  ├── schedule   (cron expression, e.g. "0 */4 * * *")
  └── script     (the bash script that runs)
```

These files are NOT under version control by default. If Unraid rebuilds
or the `/boot` partition fails, they're lost. This directory is the backup.

---

## When to update this backup

**Whenever you edit a User Script on Unraid**, also update the matching
file here and commit. Otherwise the backup drifts from reality and becomes
worse than useless.

Suggested workflow after editing a User Script:

```bash
# On Unraid, after editing any script via UI or sed/echo:
cd /mnt/user/appdata
cat /boot/config/plugins/user.scripts/scripts/SCRIPT_NAME/script > \
    forex-command-centre/docs/cron-backup/SCRIPT_NAME.script
cat /boot/config/plugins/user.scripts/scripts/SCRIPT_NAME/schedule > \
    forex-command-centre/docs/cron-backup/SCRIPT_NAME.schedule
git add forex-command-centre/docs/cron-backup/
git commit -m "cron backup: update SCRIPT_NAME (describe what changed)"
git push
```

---

## Current backups (verify these match your live Unraid files)

| Script | Schedule | Purpose |
|--------|----------|---------|
| `mdi-scraper` | `0 */4 * * *` | MDI yields + policy rates, every 4h |
| `mdi_event_matcher` | `* * * * *` | Phase 3 event matcher, every minute |
| `forex-calendar-update` | `0 */6 * * *` | FF + TE calendar scrape + webroot copy, every 6h |
| `ig_sentiment_scraper` | `0 */4 * * *` | IG retail sentiment, every 4h |

---

## Verification

On Unraid, confirm backups match the live files:

```bash
for name in mdi-scraper mdi_event_matcher forex-calendar-update ig_sentiment_scraper; do
    echo "=== $name ==="
    diff /boot/config/plugins/user.scripts/scripts/$name/script \
         /mnt/user/appdata/forex-command-centre/docs/cron-backup/$name.script \
         && echo "  script: MATCH" || echo "  script: DIFFERS"
    diff /boot/config/plugins/user.scripts/scripts/$name/schedule \
         /mnt/user/appdata/forex-command-centre/docs/cron-backup/$name.schedule \
         && echo "  schedule: MATCH" || echo "  schedule: DIFFERS"
    echo ""
done
```

A `DIFFERS` means either you need to update the backup OR the live script
has drifted from what's intended. Either way, investigate before ignoring.

---

## Restore procedure (Unraid rebuild)

```bash
for name in mdi-scraper mdi_event_matcher forex-calendar-update ig_sentiment_scraper; do
    SCRIPT_DIR="/boot/config/plugins/user.scripts/scripts/$name"
    mkdir -p "$SCRIPT_DIR"
    echo "$name" > "$SCRIPT_DIR/name"
    cp "/mnt/user/appdata/forex-command-centre/docs/cron-backup/$name.script"   "$SCRIPT_DIR/script"
    cp "/mnt/user/appdata/forex-command-centre/docs/cron-backup/$name.schedule" "$SCRIPT_DIR/schedule"
    chmod +x "$SCRIPT_DIR/script"
done

/etc/rc.d/rc.crond restart
crontab -l | grep -E "mdi|calendar|sentiment"
```

---

## Known limitations

- Backup is **manual**. Nobody has automated it.
- Oanda credentials in `mdi_event_matcher.script` are pulled from the
  `trading-state` container via `docker exec printenv`. If the container
  is recreated with different env vars, the script continues to work —
  but if Oanda ever gets moved out of that container, the script will
  need updating.
- These backups do NOT include any secrets. All credentials continue
  to live in the `trading-state` Docker env.
