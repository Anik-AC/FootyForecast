# Learning notes

This directory holds walkthroughs written for the project owner as features are built. Two tracks run through the project that the owner is actively learning: Go (the simulator and API are the primary Go vehicle) and applied Bayesian statistics (the PyMC goals model).

Each walkthrough is written after the corresponding code is built. Format: what was built, why this approach was chosen over the alternatives, and the single most important concept to take away.

For Go walkthroughs, the focus is on language idioms: goroutines and channels for concurrency, interfaces for testable seams, explicit error handling, and the Go module system. The "why" section explains why a Go idiom fits the problem, not just what the idiom does.

For Python modeling walkthroughs, the focus is on statistical reasoning: what the priors encode, why partial pooling matters for sparse international match data, what walk-forward validation is protecting against, and how the posterior predictive distribution translates into the scoreline grid the API serves.

No walkthroughs yet. This directory populates as milestones are completed.
