# CLAUDE.md: FootyForecast

This file governs how AI coding agents work in this repository. Read it fully before any task.

## What this project is
FootyForecast produces calibrated probabilistic predictions for every FIFA World Cup 2026 match, simulates the full bracket, and benchmarks against prediction markets. The source of truth is `docs/FootyForecast_PRD.md`. Read the PRD before proposing any design.

## Tech stack
- Python: data ingestion, feature engineering, Bayesian hierarchical goals model (PyMC), gradient boosting (LightGBM), ensemble. Batch jobs only, not a live service.
- Go: Monte Carlo tournament simulator and the JSON API. (Owner is learning Go: see Learning mode.)
- TypeScript / Next.js: frontend.
- PostgreSQL (Supabase in production): system of record.

## Repo layout
- `/python`  models, ingestion, features
- `/go`      simulator and API
- `/web`     Next.js frontend
- `/docs`    PRD, decision log, build log, learning notes

## Working agreements
- PRD-first. If a request conflicts with the PRD, stop and flag it rather than silently diverging.
- Plan before code. For any non-trivial task, propose the approach and wait for approval before writing code.
- Push back. If an instruction is wrong, risky, or has a better alternative, say so plainly. Do not be agreeable by default.
- No sycophancy. Skip praise and filler. State reasoning directly.
- Reversibility. Before any destructive action (git history rewrites, force pushes, database migrations, dropping tables, deleting files), state what is irreversible and confirm first.
- Minimal in-place edits over full rewrites unless a rewrite is justified and stated.

## Style
- No em dashes anywhere, in code comments, docs, or commit messages. Use commas, colons, or parentheses.
- Prose over bullet soup in docs. Bullets only where they aid clarity.
- Clear commit messages describing why, not just what.

## Correctness guardrails (critical, do not violate)
These are the parts an agent can break silently and make the whole project worthless. Treat them as non-negotiable.

- Point-in-time correctness. Any feature used to predict a match must use only information available before that match kicked off. Every feature row carries an as-of timestamp.
- No data leakage. Never fit xG models, aggregates, or scalers on data from after the match being predicted. No global normalization across the full dataset.
- Walk-forward validation only. Train on everything before date D, predict D, never peek forward. Any backtest that does not do this is invalid and must be flagged, not shipped.
- Tournament tiebreakers. The simulator must implement the 2026 group tiebreaker chain and best-third-placed selection exactly as specified in the PRD, and must have unit tests covering known and edge scenarios before its output is trusted.

If a requested change would weaken any of the above, refuse and explain.

## Definition of done (every task)
A task is complete only when all of these are true:
1. Code works and has tests where logic is non-trivial (especially the guardrail areas above).
2. `docs/build-log.md` has a dated entry describing what changed and why.
3. A decision record is added under `docs/decisions/` if a significant choice was made.
4. A plain-English walkthrough is provided for the owner (see Learning mode).

## Learning mode (owner is learning, especially Go)
The owner wants to understand the code, not just accept it. For every task:
- Before coding, explain the approach in plain language and the tradeoffs considered.
- After coding, write a short walkthrough: what was built, why this way, and the key concept behind it.
- For Go specifically, call out idioms and language features being used (goroutines, channels, interfaces, error handling) and why, since the owner is learning Go and the simulator is the main learning vehicle.
- For the Python modeling, explain the statistical reasoning (priors, pooling, validation), not just the API calls.
- Prefer teaching the owner to fix a thing over silently fixing it, when the owner is present and learning is the point.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
