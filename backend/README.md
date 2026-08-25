# Jira AI Gherkin Generator (Capgemini Engineering Internship)

Automated pipeline converting Jira User Stories into BDD Gherkin (`.feature`) scenarios using Groq Cloud API & Qwen/Llama open-source LLM models.

## 🚀 Pipeline Architecture (Steps 1–3)

1. **Jira REST API v3 (`jira-fetcher.js`)**: Fetch user story title, summary, and ADF description from Jira Cloud.
2. **ADF Converter (`adf-to-text.js`)**: Transform Atlassian Document Format JSON into structured Markdown.
3. **LLM #1 Gherkin Generator (`gherkin-generator.js`)**: Extract business rules and generate standardized BDD Gherkin (`.feature`) files.

---

## 🛠️ Environment Configuration (`.env`)

```env
# Jira API Credentials
JIRA_DOMAIN=your_jira_domain
JIRA_EMAIL=your_email@domain.com
JIRA_API_TOKEN=your_jira_api_token

# Groq Cloud API Credentials (LLM Provider)
LLM_PROVIDER=groq
GROQ_API_KEY=gsk_your_groq_api_key_here
GROQ_BASE_URL=https://api.groq.com/openai/v1
GROQ_MODEL=llama-3.3-70b-versatile
```

---

## 🏃 Usage Commands

### 1. Run Pipeline (Steps 1–3)
```bash
npm run pipeline                # Process all Jira project tickets
npm run pipeline SCRUM-1        # Process single ticket
npm run pipeline:mock SCRUM-1   # Process single ticket using mock mode
```

### 2. Run Full Pipeline (Steps 1–5: Jira → Gherkin → Playwright → Execute)
```bash
npm run pipeline:full                # All tickets: fetch, Gherkin, generate tests, run, report
npm run pipeline:full SCRUM-1        # Single ticket
npm run pipeline:full -- --mock SCRUM-1
```

### 3. Run Gherkin Generator Directly
```bash
npm run generate:gherkin SCRUM-1
```

### 4. Analyze Failures (offline, against the last `report.json`)
```bash
npm run analyze:failures
# writes failure-reports/failure-report.json + one file per failed scenario
```

### 5. Generate Repair Proposals (offline, against the last failure report)
```bash
npm run repair:propose
# reads failure-reports/failure-report.json, writes repair-reports/repair-report.json + one plan per scenario
```

### 6. Auto-Repair & Retry (offline, deterministic patch + re-execution loop)
```bash
npm run repair:auto
# reads failure-reports/failure-report.json; for each repairable scenario:
#   validate plan -> back up -> patch -> re-run -> pass? save fix : re-analyze & retry
# up to 3 attempts, then rollback + escalate for human review
```

---

## 🤖 Agents

| Agent | Source | Purpose |
|-------|--------|---------|
| Requirement Agent | `gherkin-generator.js` (LLM) | Jira story -> BDD Gherkin scenarios |
| Website Understanding Agent | `src/agents/website-understanding.ts` | Browsers the live app, resolves & verifies unique selectors, persists them to the Knowledge Base (`selectors/<domain>.json`) |
| Test Generation Agent | `src/generator.ts` (LLM) | Gherkin -> selector-aware Playwright tests grounded in the Knowledge Base |
| **Failure Analysis Agent** | `src/agents/failure-analysis.ts` | Classifies why a test failed, produces a structured diagnostic report with confidence & reasoning |
| **Repair Agent** | `src/repair-agent/repair-agent.ts` | Consumes Failure Reports and emits deterministic `RepairPlan` proposals (**proposal mode only — never edits files**)
| **Auto-Repair Agent** | `src/agents/auto-repair.ts` | Validates & applies deterministic repairs, backs up the test, re-runs it (retry loop, max 3 attempts), saves fixes / rolls back & escalates |

---

## 🔍 Failure Analysis Agent

Runs after Playwright execution (Step 6 in `full-pipeline.ts`) and before any repair logic. For each failed scenario it produces a `FailureReport`:

```json
{
  "scenario": "Recherche d'événements par salle et par date",
  "status": "failed",
  "failureType": "data_issue",
  "confidence": 0.99,
  "rootCause": "bad_test_data",
  "repairRecommendation": "...",
  "reasoning": ["..."],
  "evidence": [{"source": "playwright_error", "content": "..."}]
}
```

- **Failure categories (12):** `selector_not_found`, `strict_mode_violation`, `visibility_issue`, `timeout`, `assertion_failure`, `navigation_failure`, `authentication_failure`, `data_issue`, `unsupported_interaction`, `application_bug`, `flaky_test`, `unknown`
- **Root-cause dimensions (5):** `bad_selector`, `bad_test_data`, `application_behavior`, `environment_issue`, `timing_issue` (+ `assertion_logic`, `unknown`)
- The agent cross-references the Knowledge Base: it checks whether the failing locator is a *verified* selector, whether the requested dropdown option exists among the widget's verified options, and whether scenario-outline placeholders survived into the test.
- Rule definitions live in `src/failure-analysis/rules.ts`; the engine in `src/failure-analysis/analyzer.ts`.

---

## 🔧 Repair Agent (Proposal Mode)

Runs after Failure Analysis (Step 7 in `full-pipeline.ts`). It converts each `FailureReport` into a **deterministic `RepairPlan`** — no LLM rewrites, no automatic file patching. The human applies the plan manually; only *known* failure categories are repaired, unknown failures are explicitly flagged as `no_repair`.

Each plan carries the same shape the repairer will act on:

```json
{
  "scenario": "Recherche d'événements par salle et par date",
  "repairType": "fix_examples_table",
  "target": "Examples Table",
  "currentValue": "<salle>, <date>",
  "replacementValue": "Amphithéâtre plein air Boukornine, 06 Septembre 2026",
  "confidence": 0.95,
  "repairable": true,
  "actions": [...],
  "explanation": [...]
}
```

- **Repair types (15):** `replace_selector`, `disambiguate_selector`, `use_choices_wrapper`, `add_visibility_guard`, `add_wait_strategy`, `update_expected_value`, `fix_navigation_url`, `ensure_credentials`, `fix_examples_table`, `replace_test_data`, `correct_interaction`, `stabilize_flaky_test`, `requiresHumanReview`, `no_repair`, `manual_review`
- Strategies are evidence-based: they resolve the failing widget in the Knowledge Base, read the generated test source at the reported line, and blend the Failure Analysis confidence into a plan confidence.
- Examples of deterministic repair: hidden Choices.js `<select>` → `use_choices_wrapper` with the verified wrapper/dropdown selectors; an option not in the KB → `replace_test_data` with a verified option; leftover `<placeholder>` tokens → `fix_examples_table` with per-dropdown verified values; conditionally-hidden "load more" button → guarded `add_visibility_guard`.
- Application bugs and unknown failures are **not** repaired (`no_repair`); assertion and credential failures require human review.
- Strategies live in `src/repair-agent/strategies.ts`; persistence in `src/repair-agent/report.ts`.

### Pipeline Architecture

```
Jira
↓
Requirement Agent
↓
Website Understanding Agent
↓
Knowledge Base (selectors/<domain>.json)
↓
Test Generation Agent
↓
Playwright Execution
↓
Failure Analysis Agent            ← Phase 2
↓
Structured Failure Report (failure-reports/)
↓
Repair Agent (proposal mode)      ← Phase 3 (no file changes)
↓
Repair Plans (repair-reports/)
↓
Auto-Repair Agent (retry loop)    ← Phase 4 (deterministic patch + re-execution)
↓
Fixed? save fix (repair-history/) : rollback + escalate for human review
↓
Final Report (report.json)
```

---

## 🔄 Auto-Repair Agent (deterministic patch + retry loop)

Runs after Failure Analysis + Repair Planning (Step 8 in `full-pipeline.ts`). It converts each **safe, repairable** `RepairPlan` into a concrete file edit, executes it against the failing test, and **re-runs the scenario** to verify — fully deterministic and grounded in the Knowledge Base (no LLM test rewrites).

### Safety rules (`src/repair-agent/validator.ts`)

| Category | Failure types | Repair types | Policy |
|----------|---------------|--------------|--------|
| Safe & patchable | `selector_not_found`, `strict_mode_violation`, `visibility_issue`, `timeout`, `data_issue`, `unsupported_interaction` | `replace_selector`, `disambiguate_selector`, `use_choices_wrapper`, `add_visibility_guard`, `add_wait_strategy`, `increase_timeout`, `fix_examples_table`, `replace_test_data`, `correct_interaction` | Auto-patched, re-run |
| Escalate (`requires human review`) | `application_bug`, `authentication_failure`, `navigation_failure`, `assertion_failure`, `flaky_test`, `unknown` | `manual_review`, `no_repair` | Original test restored, escalated with reason |

Validation gates: the failure type must be auto-safe, the repair type must be patchable, the target file must live under the test directory (`*.spec.ts`), the replacement selector must be a **verified Knowledge Base selector** (or a derived/`.first()`/`.last()` chain), replacement data must be a KB-verified option, and the patched file must pass a TypeScript syntax check (`ts.transpileModule`) — broken tests are never written to disk.

### Repair loop (`src/agents/auto-repair.ts`)

For each scenario in the failure report (up to `MAX_REPAIR_ATTEMPTS = 3`):

1. Validate the plan (safe + patchable + syntax).
2. `applyRepair` (patcher) — backs up `original.spec.ts` + `attempt-<n>-before.spec.ts`, writes the patched file.
3. Re-run the scenario (`runScenario`) and parse the fresh Playwright JSON.
4. On pass → `fixed`; the patched test is saved to `repair-history/fixed/<scenario>.spec.ts`.
5. On fail → re-analyze the new failure and rebuild a plan:
   - new patch changes nothing → re-run the same patch (flakiness guard);
   - next repair not auto-safe → rollback + escalate;
   - otherwise apply the new patch and retry.
6. After `MAX_REPAIR_ATTEMPTS` → `rollbackRepair` restores the original test, outcome is `escalated` for human review.

### Artifacts

- `repair-reports/auto-repair-report.json` — run summary per scenario (status, attempts, reason).
- `repair-history/history.json` — append-only history, one entry per attempt: `{ scenario, failureType, repairType, before, after, attempt, result }`.
- `repair-history/<scenario>-attempt-<n>.json` — per-attempt detail (before/after source, error, duration).
- `repair-history/fixed/` — saved passing versions.
- `repair-backups/<scenario>/` — `original.spec.ts` + per-attempt snapshots used for rollback.

Deterministic patches live in `src/repair-agent/patcher.ts` (locator rewrite with re-quoting, `isVisible()` guards, `test.setTimeout(...)`, dropdown-option / placeholder replacement); retry execution lives in `src/repair-agent/retry-runner.ts`.

---

## 📁 Project Structure

- `jira-fetcher.js`: Fetches Jira issues via REST API v3.
- `adf-to-text.js`: Converts Jira ADF JSON content to readable Markdown text.
- `gherkin-generator.js`: Core LLM module generating `.feature` files via Groq Cloud API.
- `pipeline.js`: Pipeline orchestrator running Step 1 -> Step 2 -> Step 3.
- `features/`: Output directory storing generated `.feature` Gherkin files.
- `selectors/`: Knowledge Base of verified selectors, keyed by domain.
- `failure-reports/`: Structured diagnostic reports produced by the Failure Analysis Agent.
- `repair-reports/`: Deterministic Repair Plan proposals produced by the Repair Agent (proposal mode — never edits tests) + Auto-Repair run summaries.
- `repair-history/`: Append-only repair attempt history (`history.json`), per-attempt details, and saved `fixed/` tests.
- `repair-backups/`: Per-scenario backups (`original.spec.ts` + attempt snapshots) used to roll back failed repairs.
- `src/failure-analysis/`: Failure Analysis Agent types, classification rules, engine and report writer.
- `src/repair-agent/`: Repair Agent types, deterministic strategies, engine and report writer + Phase 4 `validator.ts`, `patcher.ts`, `retry-runner.ts`, `history.ts`.
- `src/agents/auto-repair.ts`: Auto-Repair Agent orchestrator (validate → patch → re-run → save/escalate).
