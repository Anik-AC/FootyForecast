# /go

Go programs for FootyForecast: the Monte Carlo tournament simulator and the JSON API.

The simulator is concurrency-heavy (bracket simulation is embarrassingly parallel: each full tournament can be sampled independently) and is the primary Go learning vehicle for the project owner. Go's goroutines and channels make the parallelism explicit and structured in a way that is harder to achieve cleanly in Python.

The API reads precomputed predictions and simulation results from Postgres and serves them as JSON. It does not compute anything on request; Python batch jobs are the compute layer.

The interface contract between Python and Go is documented in docs/api/openapi.yaml. Python writes team parameters and per-pair scoring rates to Postgres; the Go simulator reads them, runs the Monte Carlo draws, and writes stage-advancement probabilities back.

PRD coverage: milestones 4 (simulator) and 5 (API).

No code yet.
