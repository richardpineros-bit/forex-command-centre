# Authority Promotion Framework v1.0.0

**Status:** ACTIVE — no signals currently above SOFT
**Effective from:** 2026-05-06
**Owner:** Operator (Rianpi) + system enforcement
**Supersedes:** None (initial)

---

## 1. Purpose

This framework governs how a signal earns the right to influence trading
decisions inside the Forex Command Centre. It exists because the system has
satellite signals (MDI, IG sentiment, Myfxbook order book, news bias, and
future additions) that can usefully inform trading but must not be silently
promoted from "interesting display" to "blocks my trade" without an explicit,
audit-clean process.

The framework forces every promotion decision to be:

1. **Pre-committed** — criteria are written down before the data is examined.
2. **Evidence-based** — promotion requires statistical proof, not pattern-matching.
3. **Reversible** — demotion is automatic if performance regresses.
4. **Audit-clean** — every decision is logged with the data snapshot it was based on.

This document is the policy. It is consumed by future analysis tooling
(P6, P22) and by every signal added from this point forward.

> **Risk Committee principle this enforces:** *"Policy before code."*
> If we cannot describe how promotion happens before any signal is promoted,
> we will eventually promote one because a chart looks good — exactly the
> spec drift this system is built to prevent.

---

## 2. The three tiers

Every signal in the system holds exactly one authority tier at any point in
time. Tier transitions follow this framework. No signal starts above SOFT.

### 2.1 SOFT — display only

- **Authority:** None over trading decisions.
- **What it can do:** Render in the UI. Sit in Intel Hub. Be visible on the
  armed panel as context.
- **What it cannot do:** Block a trade. Adjust risk size. Change a gate
  outcome. Influence playbook selection.
- **Default state for all new signals.**

### 2.2 MEDIUM — risk modifier

- **Authority:** Can adjust position sizing or attach a warning to a trade.
  Cannot block.
- **What it can do:** Multiply risk (e.g. 0.75x, 0.5x). Surface a warning
  banner on the armed panel ("MDI says EUR is dominant against this trade").
- **What it cannot do:** Veto a trade. Force a stand-down. Override regime
  or playbook.
- **Risk multipliers compound** with existing capital governors (e.g. a
  MEDIUM signal at 0.75x combined with a -3% drawdown cap at 0.5x = 0.375x
  effective risk). They do not replace.

### 2.3 STRONG — gate authority

- **Authority:** Can block a trade. Force stand-down on a pair, currency,
  or session.
- **What it can do:** Veto execution. Add a hard gate condition that must
  pass alongside UTCC's existing 5 criteria.
- **What it cannot do:** Override the existing UTCC criteria themselves.
  STRONG signals add gates; they never relax them.
- **Reserved for signals with sustained, large effect sizes and out-of-sample
  validation.** Promotion to STRONG is rare and adversarial — assume the
  signal has not earned this until proven otherwise across multiple cohorts.

---

## 3. Decision rights map

| Action | Authority |
|---|---|
| Promote SOFT → MEDIUM | Operator decision, only when criteria met and logged |
| Promote MEDIUM → STRONG | Operator decision, only when criteria met and logged |
| Demote (any direction) | **Automatic** — system enforces, no operator override |
| Skip a tier (SOFT → STRONG directly) | **Forbidden** |
| Reverse a demotion | Forbidden until promotion criteria re-met from scratch |
| Modify this framework | Operator only, with version bump and changelog entry |
| Modify promotion criteria for a specific signal | **Forbidden** — criteria are global, not per-signal |

The operator is the only human in the loop, but the system enforces
demotion and prevents skipping tiers. There is no override flag.

---

## 4. Promotion criteria

A signal must satisfy **all** of the following to be promoted to a target tier.
"Promotion" means moving up exactly one tier. Skipping is forbidden.

### 4.1 SOFT → MEDIUM

| Criterion | Threshold |
|---|---|
| Sample size (N events captured) | N ≥ 30 |
| Effect size (top tier vs baseline tier) | ≥ 15 percentage points absolute |
| Statistical significance | p < 0.05, two-proportion z-test |
| Out-of-sample validation window | ≥ 30 days of new data after initial criteria first met |
| No single-cohort dominance | No single currency, event type, or session contributes > 50% of N |
| Scraper health during cohort window | P1a fleet status was OK ≥ 95% of the period |

The OOS window is critical. A signal that hits the criteria on day 1 of
having N=30 must continue to meet them after another 30 days of fresh data.
If it does not, it stays SOFT.

### 4.2 MEDIUM → STRONG

| Criterion | Threshold |
|---|---|
| Time at MEDIUM | ≥ 90 days |
| Sample size | N ≥ 100 |
| Effect size | ≥ 20 percentage points absolute (stricter than MEDIUM) |
| Statistical significance | p < 0.01 (stricter than MEDIUM) |
| Out-of-sample validation | ≥ 60 days of new data after MEDIUM criteria first met |
| No single-cohort dominance | No single currency / event type / session > 40% of N |
| Real trades affected during MEDIUM period | ≥ 20 trades where the signal acted as a risk modifier — i.e. not a paper-only proof |
| Scraper health during cohort window | P1a fleet status OK ≥ 98% |

The "real trades affected" criterion exists because a signal that has
never bound on actual capital cannot be trusted with hard veto authority.
It must have shown its effect in live conditions.

---

## 5. Demotion criteria — automatic

Demotion is **system-enforced and not optional**. The operator does not
choose whether to demote; the system measures and the system acts.

### 5.1 Demotion triggers (any single trigger demotes one tier)

| Trigger | Window | Threshold |
|---|---|---|
| Rolling effect size collapses | 30 days | Drops below 50% of promotion threshold |
| Statistical significance lost | 30 days | p > 0.10 (relaxed slightly to avoid noise) |
| Sample staleness | 60 days | Fewer than 10 new events in the period |
| Scraper health failure | 30 days | Fleet OK < 90% over the period |
| Underlying scraper version change | Immediate | Any non-PATCH bump on the scraper that produces the data |

### 5.2 Demotion ceremony

When a demotion trigger fires:

1. Tier drops by exactly one level (STRONG → MEDIUM, MEDIUM → SOFT).
2. A `demotion` entry is written to `authority-decisions.json` with the
   trigger, the data window, and the metrics that crossed the line.
3. UI shows a "DEMOTED" banner next to the signal in Intel Hub for 7 days.
4. The signal cannot be re-promoted until **all** promotion criteria are
   met from scratch — there is no fast path back.

A demotion does not require operator approval. The operator is informed.

---

## 6. Out-of-sample protocol

OOS validation is not optional. It is the single strongest defence against
the "I tuned the thresholds until it looked good" failure mode.

### 6.1 Rule

When a signal first meets in-sample promotion criteria, the date is
recorded as `oos_start`. From that date, a fresh window (30 days for
MEDIUM, 60 days for STRONG) of new data must continue to satisfy the
same criteria. The in-sample data is **not** reused.

### 6.2 What "fresh data" means

- Events that happened **after** `oos_start`.
- The signal's parameters (thresholds, profile selection, weights) were
  **not changed** between `oos_start` and the OOS window end.
- If parameters changed, OOS clock resets. No exceptions.

### 6.3 Pine input changes during OOS

Any Pine input change captured by the audit log (P24) that affects this
signal during the OOS window resets the OOS clock to the date of the
change. This is non-negotiable.

---

## 7. Statistical test specification

The two-proportion z-test is the default test for comparing tier hit
rates. The following spec is non-negotiable.

### 7.1 Test definition

Compare the top-tier hit rate (e.g. DOMINANT REACTED_AND_RESUMED %)
against the baseline-tier hit rate (e.g. BALANCED REACTED_AND_RESUMED %).

```
H0:  p_top - p_baseline = 0
H1:  p_top - p_baseline > 0   (one-sided; we only care about top > baseline)

z = (p_top - p_baseline) / sqrt( p_pool * (1 - p_pool) * (1/n_top + 1/n_baseline) )

p_pool = (x_top + x_baseline) / (n_top + n_baseline)
```

Reject H0 if p < 0.05 (MEDIUM) or p < 0.01 (STRONG).

### 7.2 Small-sample fallback

If either tier has N < 30 events in the window, use **Fisher's exact test**
instead. The thresholds (0.05 / 0.01) carry over.

### 7.3 Confidence interval reporting

Every promotion decision must report the 95% Wilson confidence interval
on the effect size (top - baseline). The lower bound of the CI must be
≥ 0 for MEDIUM and ≥ 5 percentage points for STRONG.

### 7.4 Multiple comparisons

When multiple signals are being evaluated for promotion in the same window,
apply Bonferroni correction:

```
adjusted_alpha = alpha / number_of_signals_evaluated
```

This prevents fishing by evaluating ten signals and promoting whichever
happens to clear 0.05 by chance.

---

## 8. Snapshot integrity

Every promotion or demotion decision references an **immutable data
snapshot**, never "current data".

### 8.1 Rule

When a promotion is being considered:

1. Take a snapshot of the underlying event data — for MDI this is the
   `arm-history.json` and `mdi-events.json` filtered to the analysis window.
2. Hash the snapshot (SHA-256). Record the hash in the decision log.
3. Run the statistical analysis against the snapshot. Record the
   computed metrics in the decision log.
4. The snapshot is archived under `data/snapshots/<decision-id>.json.gz`.
5. Any future audit must be able to recompute the metrics from the
   snapshot and arrive at the same result.

### 8.2 What this prevents

- Re-running analysis with slightly different filters until promotion
  criteria are hit.
- Forgetting which subset of data was used.
- Disputes about whether the data was "the same" at decision time.

### 8.3 Operational note

Snapshot files can grow. Archive after 12 months to cold storage. Hash
record in `authority-decisions.json` is permanent.

---

## 9. Audit trail — `authority-decisions.json`

All authority decisions are written to a single append-only file. Entries
are immutable. Edits are forbidden — corrections are made by appending a
new `correction` entry that references the original.

### 9.1 File location

- **Live:** `/mnt/user/appdata/nginx/www/data/authority-decisions.json`
- **Repo:** `forex-command-centre/data/authority-decisions.json` (stub)

### 9.2 Schema

```json
{
  "schema_version": "1.0.0",
  "framework_version": "1.0.0",
  "created_at": "2026-05-06T00:00:00+10:00",
  "decisions": [
    {
      "decision_id": "AUTH-2026-001",
      "timestamp": "2026-07-15T19:30:00+10:00",
      "signal": "MDI",
      "signal_version": "1.0.3",
      "decision_type": "promotion",
      "from_tier": "SOFT",
      "to_tier": "MEDIUM",
      "criteria_met": {
        "sample_size": { "required": 30, "actual": 47, "passed": true },
        "effect_size_pp": { "required": 15, "actual": 22.4, "passed": true },
        "p_value": { "required_max": 0.05, "actual": 0.012, "passed": true },
        "oos_window_days": { "required": 30, "actual": 34, "passed": true },
        "single_cohort_max_pct": { "required_max": 50, "actual": 31, "passed": true },
        "scraper_health_pct": { "required_min": 95, "actual": 98.2, "passed": true }
      },
      "data_snapshot": {
        "snapshot_id": "snap-2026-07-15-mdi",
        "snapshot_path": "data/snapshots/snap-2026-07-15-mdi.json.gz",
        "sha256": "a1b2c3d4...",
        "window_start": "2026-04-21",
        "window_end": "2026-07-15",
        "event_count": 47
      },
      "wilson_ci_95": {
        "effect_lower_pp": 8.1,
        "effect_upper_pp": 36.7
      },
      "operator_signoff": "rianpi",
      "notes": "First signal promotion under v1.0.0 framework."
    },
    {
      "decision_id": "AUTH-2026-002",
      "timestamp": "2026-09-01T10:00:00+10:00",
      "signal": "MDI",
      "decision_type": "demotion",
      "from_tier": "MEDIUM",
      "to_tier": "SOFT",
      "trigger": "rolling_effect_size_collapsed",
      "trigger_metrics": {
        "window_days": 30,
        "current_effect_pp": 6.2,
        "promotion_threshold_pp": 15,
        "ratio_to_threshold": 0.41
      },
      "data_snapshot": {
        "snapshot_id": "snap-2026-09-01-mdi-demote",
        "sha256": "e5f6g7h8...",
        "window_start": "2026-08-01",
        "window_end": "2026-09-01"
      },
      "operator_signoff": "system_automatic",
      "notes": "Auto-demoted by rolling-30d watchdog."
    }
  ]
}
```

### 9.3 Mutation rules

- `decision_id` is monotonic — `AUTH-YYYY-NNN` zero-padded to 3 digits per year.
- Once a decision is appended, it is never modified.
- Errors in a decision are corrected via a new `decision_type: "correction"`
  entry that references the `decision_id` being corrected.
- The file is append-only. Tooling enforces this; manual edits are forbidden.

---

## 10. The ban list

The following are explicitly forbidden under this framework. Each is the
flip side of an institutional integrity failure mode this document exists
to prevent.

| Ban | Why |
|---|---|
| Retroactive threshold tuning | Removes the OOS guarantee. If you change the threshold and re-test on the same data, you are guaranteed to hit any target. |
| Mid-session authority overrides | A STRONG signal blocking a trade cannot be overridden mid-session. If the framework is wrong, fix the framework — don't reach around it. |
| Promotion without all criteria met | "Close enough" is the on-ramp to spec drift. All criteria, no exceptions. |
| Skipping tiers | SOFT → STRONG directly is forbidden. Every signal must serve at MEDIUM long enough to demonstrate behaviour under live capital. |
| Per-signal criteria customisation | The criteria are global. A signal that needs special-case rules to look promotable is exactly the signal that should not be promoted. |
| Re-evaluating immediately after demotion | After demotion, the signal cannot be re-promoted until criteria are re-met from scratch. No "it was just a bad month" fast-track. |
| Promoting during scraper health degradation | If P1a says scraper health was sub-95% during the cohort window, the data is not trustworthy enough to support promotion. |

---

## 11. Promotion ceremony

The exact procedural steps. Following these in order is the only way a
promotion is valid.

1. **Verify candidacy.** The Intel Hub MDI tab (P6, when shipped) shows
   "promotion eligible" or equivalent for a signal. Do not initiate from
   gut feel.
2. **Take snapshot.** Run the snapshot tool against the signal's source
   data filtered to the analysis window. Record SHA-256.
3. **Run analysis.** Compute hit rates per tier, effect size, p-value,
   Wilson CI. Capture into a candidate decision record.
4. **Verify criteria checklist.** Every row in §4 must be `passed: true`.
   If a single row fails, abandon the promotion. Do not attempt to "fix"
   the failing criterion by adjusting the window or thresholds.
5. **Write decision record.** Append to `authority-decisions.json`.
   Operator signoff captured.
6. **Update signal config.** Frontend or alert server config that consumes
   the tier (when this layer exists) reads from `authority-decisions.json`
   and applies the new tier from the next event onward.
7. **Visibility.** Intel Hub shows the new tier with the decision-id link.
   A "PROMOTED" banner is shown for 7 days.

The ceremony is the same for promotion and demotion, except demotion
skips step 1 (the trigger fired automatically) and step 5's signoff is
`system_automatic`.

---

## 12. Review cadence

Even a STRONG-tier signal is re-validated periodically. Promotion is not
permanent.

| Tier | Review cadence | Action if review fails criteria |
|---|---|---|
| SOFT | None — display only | N/A |
| MEDIUM | Every 30 days, automated | Demote on first failure |
| STRONG | Every 30 days, automated | Demote to MEDIUM on first failure; do not skip back to SOFT |

The review is run by the same statistical machinery as promotion. It
reads the live data, applies the criteria for the current tier (not the
target tier — i.e. MEDIUM is reviewed against MEDIUM criteria), and emits
a decision record either confirming or demoting.

---

## 13. Generalisation — applies to every signal

This framework is signal-agnostic. It applies to:

- **MDI** (current candidate, expected first promotion ~2026-07)
- **IG sentiment** (currently SOFT)
- **Myfxbook order book** (currently SOFT)
- **News bias** (currently SOFT)
- **Any future signal** added to the system

Per-signal nuances (which tiers compare against which baseline, what counts
as a "hit") are captured in a per-signal **adapter spec** that translates
the signal's data into the (top-tier hit rate vs baseline-tier hit rate)
form the framework expects.

The adapter spec lives alongside the signal, e.g.
`docs/MDI_AUTHORITY_ADAPTER_v1.0.0.md`. It is governed by this framework;
it cannot relax any criterion.

---

## 14. Initial register — current authority levels

As of `2026-05-06`, every signal in the system is at SOFT.

| Signal | Tier | Since | Notes |
|---|---|---|---|
| MDI (Macro Dominance Index) | SOFT | 2026-04-21 | Phase 3 data accumulating; ~N=10–15 currently. Trigger for first review: N≥30. |
| IG sentiment | SOFT | n/a | No promotion in scope. |
| Myfxbook order book | SOFT | 2026-05-02 | Replaces Oanda OB. Display only. |
| News bias (FF + TE) | SOFT | n/a | Used by news safety gate (existing UTCC criterion #5), not via this framework. |

The news safety gate is intentionally outside this framework — it is part
of the original 5 UTCC criteria and predates the framework. It is
grandfathered as an effective STRONG-tier gate, but is not subject to
this framework's promotion / demotion machinery. Future news-derived
signals (e.g. event surprise quantification) would be governed here.

---

## 15. Versioning of this framework

This document follows the project semantic versioning rules.

| Bump | Trigger |
|---|---|
| PATCH | Typo, formatting, clarifying language with no change in meaning. |
| MINOR | New criterion added, threshold tightened, new tier definition refined, ban list expanded. Cannot loosen any criterion at MINOR. |
| MAJOR | Threshold loosened, tier removed, ban list reduced, decision-rights map changed. Operator-initiated, requires written justification in CHANGELOG. |

Every framework change rev-bumps this file's filename
(`AUTHORITY_PROMOTION_FRAMEWORK_v1.0.0.md` → `_v1.1.0.md`) and creates a
CHANGELOG entry. The framework version active at the time of a decision is
recorded in that decision's record (`framework_version` field).

---

## 16. Implementation roadmap (informational, not policy)

This framework is policy. The implementation that consumes it ships in
phases.

| Component | Status | Carries this framework's logic |
|---|---|---|
| `authority-decisions.json` (stub) | **Shipped with this framework** | File exists, schema fixed, zero decisions yet |
| P6 (Intel Hub MDI analysis) | TODO | Reads framework criteria; surfaces "promotion eligible" UI |
| Snapshot tool | TODO (small) | Writes immutable hashed snapshot to `data/snapshots/` |
| Authority watchdog (30-day review) | TODO | Cron-driven; writes auto-demotions |
| Frontend tier consumer | TODO | Reads `authority-decisions.json` to render banners |
| Signal-config hot-load | TODO | Alert server or frontend re-reads file on a tier change |

Until these ship, the framework is in force as policy: no signal can be
promoted because no machinery exists to capture the criteria record.
This is intentional — the framework is the policy that will gate the
machinery, not the other way round.

---

## 17. Sign-off

| Role | Name | Date |
|---|---|---|
| Operator | Rianpi | 2026-05-06 |
| System enforcement | Forex Command Centre v3.6.x | n/a |

There is no second human reviewer. The system itself is the second
reviewer — the criteria, snapshot integrity, and automatic demotion all
exist precisely because the operator cannot be trusted to reject a
promotion that "feels right but doesn't pass". That is the entire
point.

---

*End of framework v1.0.0.*
