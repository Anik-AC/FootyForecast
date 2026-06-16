# /python

Python batch jobs for FootyForecast. No live service; everything here runs on a schedule and writes results to Postgres.

This directory will contain data ingestion ETL (international results, xG and event data, fixture and lineup feeds), feature engineering (point-in-time features with as-of timestamps on every row), the Bayesian hierarchical goals model in PyMC, a LightGBM gradient-boosted model, ensemble blending, and the walk-forward backtest harness.

Walk-forward validation is the only valid backtest mode here. Training on everything before date D, predicting D, and never peeking forward is a hard constraint enforced by the as-of timestamps on feature rows.

PRD coverage: milestones 2 (ingestion) and 3 (ratings and goals model).

No code yet.
