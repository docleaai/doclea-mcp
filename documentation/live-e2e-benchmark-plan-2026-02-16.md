# Live E2E Benchmark Plan (2026-02-16)

## Goal
Replace modeled LLM timing with real wall-clock, live-inference measurements so results reflect agent-like production behavior.

## Scope
- Keep current retrieval quality metrics (recall, precision, wrong-path ratio, hallucinated/nonexistent path ratio).
- Replace estimated timing with measured end-to-end latency per query and per mode.
- Keep token accounting (input/output) from real requests.
- Regenerate the HTML deck with explicit labels for what is measured vs modeled.

## Decision (Doc Drift)
For **Doc Drift Detection Workload**, we standardize on:
- `Doclea Guardrail` as the Doclea mode.
- No `Doclea Full` row in doc-drift comparison charts/tables.

Reason: doc-drift is a high-precision triage workflow where guardrail constraints are the intended production mode.

## Tomorrow Execution Steps
1. Add live-inference runner
- Add a mode in benchmark scripts to call the selected LLM provider for actual completion.
- Capture timestamps around full request lifecycle:
  - retrieval start/end
  - prompt build end
  - model request start/end
  - total end-to-end

2. Enforce apples-to-apples prompts
- Same task framing and answer format across all non-Doclea baselines and Doclea mode.
- Same max output tokens and temperature for all modes.
- Store raw prompt token count and output token count per run.

3. Update doc-drift benchmark wiring
- Filter doc-drift comparison to `Doclea Guardrail` vs non-Doclea methods only.
- Remove `Doclea Full` from doc-drift tables/charts in the presentation layer.
- Keep `Doclea Full` in other sections where relevant.

4. Add realism controls
- Run each query with cold/warm cache variants.
- Include concurrency setting (serial and small parallel batch) and report both.
- Record p50/p95, not just averages.

5. Expand hard multi-file tasks
- Ensure each benchmark query requires cross-app/package traversal.
- Keep expected-file ground truth for correctness scoring.
- Add at least one code+docs drift triage task and one dependency-chain task.

6. Output + report updates
- Regenerate JSON + HTML.
- Add clear “Measured live E2E” badges where applicable.
- Keep a separate “Modeled” badge only where unavoidable, and isolate those charts.

## Acceptance Criteria
- No sub-ms “LLM traversal” claims in live sections.
- For every reported timing chart: source is explicit (`measured` vs `modeled`).
- Doc-drift section shows only `Doclea Guardrail` for Doclea side.
- Per-mode report includes: recall, precision, wrong-path ratio, input tokens, output tokens, p50/p95 end-to-end.

## Run Checklist
- Confirm active model and region.
- Confirm cache state (cold/warm).
- Confirm token caps and output caps.
- Run benchmark suite.
- Regenerate presentation.
- Sanity-check one query trace end-to-end with raw logs.
