# Architecture Review: Multi-Agent Framework vs. Current Orchestrator

> Review of whether CrewAI, LangGraph, AutoGen, or a custom orchestrator is the right
> architecture for the AI Testing Agent. Conclusion: the current TypeScript
> orchestrator-based design is the correct solution.

## Verdict up front

**The current orchestrator-based design is the correct solution.** These are workflow stages, not true agents — and that is a *strength* for this project, not a gap. CrewAI and LangGraph would both add complexity without adding capability to anything you actually do today. Keep the current orchestrator (Option A) and harden it, not migrate.

## How the system actually works

The system is a pipeline driven by `src/full-pipeline.ts` (Steps 1-8), with shared state
persisted as JSON artifacts on disk.

| Stage | Module | Mechanism | LLM? |
|---|---|---|---|
| Requirement | `gherkin-generator.js` | Jira REST -> ADF -> Gherkin | **LLM (Groq)** one-shot |
| Website Understanding | `src/agents/website-understanding.ts` | Playwright crawl -> `resolveUniqueSelector`/`classifyElement` | No |
| Knowledge Base | `selectors/<domain>.json` | persisted selector map (shared state) | No |
| Test Generation | `src/generator.ts` | Gherkin + KB -> Playwright specs | **LLM (Groq)** one-shot |
| Playwright Execution | `src/runner.ts` | `npx playwright test` | No |
| Failure Analysis | `src/failure-analysis/rules.ts` | first-match rule engine + evidence | No |
| Repair | `src/repair-agent/strategies.ts` (28KB) | deterministic KB-grounded plan builder | No |
| Auto-Repair | `src/agents/auto-repair.ts` | validate -> patch -> re-run loop (max 3) | No |

Communication is synchronous, typed function calls; shared state is JSON artifacts on disk
(`failure-reports/`, `repair-reports/`, `repair-history/`, `repair-backups/`). The flow is a
**DAG with exactly one bounded retry loop** (patch -> re-run -> re-analyze).

---

## Answers to the review questions

### 1. Are these true agents or workflow stages?

Workflow stages. "Agent" implies perception, autonomous decision-making, tool selection,
memory, and self-direction. Every stage here has a fixed single responsibility, is invoked in
a fixed sequence, and (outside the two LLM one-shot calls) executes deterministic code. Even
the Auto-Repair "retry loop" is a rule-driven bounded loop, not model-driven agency. Only the
Website Understanding Agent *looks* agentic (it browses and extracts), but it is a
deterministic crawler with zero discretion.

### 2. Does the project need a multi-agent framework?

No. Frameworks earn their cost when orchestration is *dynamic*: LLM-driven tool choice,
branching/cycling on outcomes, parallel delegation, replanning. Your topology is fixed and
known at compile time. The genuinely hard parts of this system — selector grounding,
rule-based diagnosis, deterministic patching, Windows/encoding traps in the runner — are
**domain logic**, which frameworks explicitly don't provide. The orchestration already
exists: it is ~200 lines of readable sequential code.

### 3. What would CrewAI provide?

Role/task/crew abstractions, declarative process (sequential or hierarchical), agent memory,
and LLM tool-calling. It would only add value if you planned to make Failure Analysis or
Repair *LLM-driven with tools*. It would NOT help your deterministic core, because there is
no autonomy to express — you would be wrapping `validateRepair()` and `computePatch()` in
"tools" so an LLM could re-decide what deterministic code already decides more reliably and
cheaper.

### 4. What would LangGraph provide?

A graph state machine: nodes, conditional edges, cycles, checkpointing, human-in-the-loop
interrupts, streaming, and a way to serialize/visualize state transitions. The one place it
maps to your system is the retry loop (`auto-repair.ts`), which is already implemented as a
bounded `for` loop. Its value scales with graph *dynamism*; a fixed pipeline with one cycle
gets none of that benefit and all of the abstraction tax.

### 5. What would a custom orchestrator provide?

Everything you already have: full type safety across stage boundaries (`FullReport`,
`FailureReport`, `RepairPlan`), zero dependency on framework churn, byte-exact control over
file/artifact handling (which the project has already fought to get right), testability, and a
codebase any contributor can trace by reading `full-pipeline.ts` top to bottom.

### 6. Tradeoffs of each approach

| | CrewAI | LangGraph | Custom (current) |
|---|---|---|---|
| Orchestration power | High for role-based crews | High for cyclic graphs | Fixed DAG only |
| Determinism | LLM-dependent | LLM-dependent | Guaranteed |
| Debuggability | Opaque task queue | Good (state visible) | Best (linear trace) |
| Cost/latency | Per-task LLM calls | Per-node LLM calls | LLM only where needed (2 calls) |
| Framework lock-in | Yes | Yes | None |
| Ecosystem for TS | Maturing, thin | Maturing, thinner than Python | N/A |
| Learning curve | Medium | High | Zero |

### 7. Would CrewAI add complexity without value?

Yes — for the current design. The stages don't fit CrewAI's agent model (LLM + tools + memory
+ role). Forcing them in produces either (a) LLMs replacing deterministic rules (worse
correctness, cost, latency) or (b) deterministic code wrapped as tools (pure boilerplate). The
honest use case for CrewAI here would be if a future Failure Analysis Agent got a browser tool
and free-form reasoning over page state — that does not exist today.

### 8. Recommended production architecture for an AI Testing Agent

Keep the deterministic spine. Treat the LLM as a **callable capability inside nodes, never as
the orchestrator**. Formalize an **agent interface seam** (each stage: input contract ->
output contract -> artifact log) so any node can later be swapped for an LLM-tool agent or a
framework node without touching the spine. Only adopt a graph scheduler if flows become
genuinely dynamic. That is Option C interpreted correctly — and it is nearly identical to what
already exists.

---

## Option A — Current TypeScript Orchestrator

```
Jira ──▶ [Requirement Agent] ──▶ .feature
                                  │
              [Website Understanding Agent] ──▶ selectors/<domain>.json (KB)
                                  │              ▲
              [Test Generation Agent] ───────────┘  (LLM + KB-grounded)
                                  │
              [Playwright Execution] ──▶ report.json
                                  │
              [Failure Analysis Agent] ──▶ failure-reports/
                                  │
              [Repair Agent (proposal)] ──▶ repair-reports/
                                  │
              [Auto-Repair Agent] ──▶ patch → re-run ──▶ fixed / escalate
                                  │        (bounded retry loop, ≤3)
              [Final Report]
```

Sequential typed calls in `src/full-pipeline.ts`; shared state = JSON artifacts; one bounded
loop.

- **Pros:** Zero framework tax; fully deterministic outside two LLM calls; type-safe
  contracts; linear, debuggable trace; already proven end-to-end (3/4 tests pass, repair loop
  fixes/escalates correctly).
- **Cons:** Retry loop logic lives inside one agent; no built-in checkpoint/resume;
  parallelism would require manual work; artifact "message" format is informal (files).
- **Complexity:** Low (8 sequential steps, 1 loop).
- **Scalability:** Sequential only — fine for one story at a time; would need manual work for
  per-ticket parallelism.
- **Maintainability:** Excellent — readable spine, ~6k LOC of domain logic, standard TS
  toolchain.
- **Recommendation score: 9/10**

---

## Option B — CrewAI Multi-Agent System

```
        Crew (sequential process)
   ┌─────────────────────────────────────┐
   │  Role: Requirement Analyst          │──▶ task: Jira → Gherkin
   │  Role: Website Analyst   (tools)    │──▶ task: crawl + resolve selectors
   │  Role: Test Engineer     (tools)    │──▶ task: Gherkin+KB → specs
   │  Role: QA Triage         (tools)    │──▶ task: classify failures
   │  Role: Repair Specialist (tools)    │──▶ task: plan → patch → verify
   │  Role: Auto-Repair Lead  (tools)    │──▶ task: retry loop + escalate
   └─────────────────────────────────────┘
   Crew memory + shared files (KB, reports)
```

Each stage becomes a CrewAI `Agent` (role/goal/backstory) executing `Task`s; deterministic
logic becomes tools; the LLM decides.

- **Pros:** Declarative role/task/crew model; built-in crew memory and delegation; natural
  place to add LLM-reasoning stages later; marketing-friendly "real agents."
- **Cons:** Forces an LLM to coordinate what deterministic code already coordinates; per-task
  LLM calls = cost + latency + nondeterminism in the worst place (test reliability); wraps
  6k LOC of correct deterministic logic in an opaque framework; TS ecosystem is thin;
  debugging a 3-attempt retry through crew abstractions is painful; adds a framework
  dependency with its own churn.
- **Complexity:** High (new paradigm, new concepts, all existing logic re-wrapped).
- **Scalability:** Better for parallel *independent* tasks (e.g., many stories), but that is
  a trivial `Promise.all` away from Option A anyway.
- **Maintainability:** Worse — the domain logic is unchanged, now buried under abstractions
  the framework owns.
- **Recommendation score: 4/10**

---

## Option C — Hybrid Architecture

```
        Custom Orchestrator (spine — typed, deterministic)
   ┌─────────────────────────────────────────────────────────────┐
   │  Step 1-3  Requirement  ── artifact: features/*.feature      │
   │  Step 4    Test Gen     ── artifact: tests/generated/*.ts    │
   │  Step 5    Execution    ── artifact: report.json             │
   │  Step 6    Failure An.  ── artifact: failure-reports/        │
   │  Step 7    Repair Plan  ── artifact: repair-reports/         │
   │  Step 8    Auto-Repair  ── loop ≤3, artifacts: repair-*/     │
   └─────────────────────────────────────────────────────────────┘
        ▲
        │ agent interface seam (input→output contract per stage)
   ┌────┴────────────────────────────────────────────────────────┐
   │  Optional future: LLM-tool node (e.g. LangGraph) for one     │
   │  stage only (diagnosis/repair) without touching the spine    │
   └──────────────────────────────────────────────────────────────┘
```

- **Pros:** All of Option A's determinism and clarity; an explicit seam so a stage can be
  swapped for an LLM-tool agent or a framework node later; standardized artifact "messages"
  give free audit trail + checkpoint/resume; the LLM stays a capability inside nodes, never
  the orchestrator.
- **Cons:** You must define and enforce the seam yourself (no framework does it for you);
  slight upfront discipline in documenting each contract.
- **Complexity:** Low-to-medium (the seam is mostly TypeScript interfaces that largely exist).
- **Scalability:** Sequential today; can add per-ticket fan-out or a graph scheduler for one
  stage without rework.
- **Maintainability:** Very good — same readable spine, plus explicit extension points.
- **Recommendation score: 8/10**

---

## Recommendation for THIS project

**Adopt Option A now; keep Option C's seam in mind (and partially in place already).**
Scores: A 9, C 8, B 4.

Reasons specific to the project constraints:

- **Jira integration:** a simple REST fetch, already encapsulated in `jira-fetcher.js` +
  `gherkin-generator.js`. A framework adds nothing.
- **Playwright execution:** the real pain points — shell encoding, relative-path regex
  filters, JSON-result parsing, whole-file vs `-g` matching — are infra concerns a framework
  neither knows nor fixes.
- **Website Understanding Agent:** deterministic crawler by design ("no invention allowed").
  That discipline is why the selector KB is trustworthy. CrewAI would dilute it.
- **Failure Analysis Agent:** rule engine with evidence + confidence (first-match ordering,
  `hasResolved`, placeholders). A framework would only add an LLM in front of rules already
  tuned.
- **Auto-Repair Agent:** the retry loop, safety validator, patcher, and history are exactly
  the kind of bounded, auditable logic that must stay out of a black box.

The only scenario where a framework should be revisited: if Failure Analysis or Repair should
*reason* over live page state with tools and free-form LLM reasoning. At that point, LangGraph
is the better fit (state graph, HITL, checkpointing) — but it should wrap **one node**, not
the whole pipeline.

### Concrete hardening steps for production-grade Option A

1. Formalize per-stage input/output contracts as TypeScript interfaces (mostly done) and log
   each handoff artifact with a schema version.
2. Move the retry-loop condition out of `auto-repair.ts` into an explicit small state machine
   so the loop is unit-testable without running Playwright.
3. Add a `--resume-from=step` CLI flag (artifacts already make this trivial) for long runs.
4. Keep LLM calls pinned to the two generation stages only.
