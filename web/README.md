# /web

TypeScript / Next.js frontend for FootyForecast.

This directory will contain the scoreline heatmap (grid of P(each scoreline) per match), the live Monte Carlo bracket (per-team stage probabilities updated after every result), the model-versus-market comparison panel, post-match scorecards with honest grading, an auto-generated trivia feed, and the user prediction leaderboard. Server-side rendering is used for heavier dashboard pages.

The frontend consumes the Go API. The contract is documented in docs/api/openapi.yaml; TypeScript types will be generated from that spec rather than written by hand.

PRD coverage: milestones 6 onward.

No code yet.
