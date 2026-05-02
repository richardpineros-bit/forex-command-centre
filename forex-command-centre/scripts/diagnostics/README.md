# Diagnostics Scripts

One-shot diagnostic scripts for investigating system behaviour. Each
script is versioned and self-contained. Run on Unraid host.

## Conventions

- File naming: `<purpose>_v<MAJOR>.<MINOR>.<PATCH>.sh`
- Never overwrite — bump version and add new file
- Output goes to stdout; redirect to file if needed
- Read-only: scripts query APIs and JSON files, never mutate state

## Index

| Script | Purpose | TODO refs | Date |
|--------|---------|-----------|------|
| `diagnostic_p15_p16_v1.0.0.sh` | STRUCT EXT epidemic + LOW CONF dominance investigation. Pulls last 7 days of `loc-history` events via `/location-history` API and `utcc-alerts.json`. Prints 8 distribution tables: grade, sweep_risk, joint grade×sweep→structExt, final structExt, sweep override impact on FRESH grades, per-asset-class breakdown, UTCC score buckets, alert type×tier. | P15, P16 | 2026-05-02 |

## Usage

```bash
chmod +x <script>.sh
./<script>.sh > output.txt 2>&1
cat output.txt
```

Paste output into chat for analysis.
