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
| `diagnostic_p15_p16_v1.0.1.sh` | (current) STRUCT EXT epidemic + LOW CONF dominance investigation. Fixes: host-mapped port 3001 (was 3847 internal); removes silent set -e exit; explicit error reporting on curl failure. | P15, P16 | 2026-05-02 |
| `diagnostic_p15_p16_v1.0.0.sh` | (superseded — wrong port, silent abort) | P15, P16 | 2026-05-02 |

## Usage

```bash
chmod +x <script>.sh
./<script>.sh > output.txt 2>&1
cat output.txt
```

Paste output into chat for analysis.
