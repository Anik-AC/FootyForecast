# FootyForecast

Calibrated probabilistic predictions for every FIFA World Cup 2026 match, with Monte Carlo tournament simulation and model-versus-market benchmarking.

The core deliverable is a probability distribution per match, not a winner pick. Distributions can be scored (log loss, Brier score), benchmarked against prediction markets, and trusted in proportion to the model's demonstrated calibration.

## Repository layout

| Directory | Language | What it contains |
|---|---|---|
| `/python` | Python | Data ingestion, feature engineering, Bayesian goals model (PyMC), gradient-boosted model (LightGBM), ensemble blending |
| `/go` | Go | Monte Carlo tournament simulator and JSON API |
| `/web` | TypeScript | Next.js frontend |
| `/docs` | | PRD, decision records, build log, learning notes, API spec |

## Design documents

- Product requirements: [docs/FootyForecast_PRD.md](docs/FootyForecast_PRD.md)
- Decision records: [docs/decisions/](docs/decisions/)
- API contract: [docs/api/openapi.yaml](docs/api/openapi.yaml)
- Build log: [docs/build-log.md](docs/build-log.md)
- Learning walkthroughs: [docs/learning/](docs/learning/)

## Status

Repository scaffolded. Tournament in progress (started 2026-06-11). No application code yet.
