// Package db handles all Postgres access for the simulator.
// It reads DATABASE_URL from the environment and uses pgx/v5.
package db

import (
	"context"
	"fmt"
	"os"

	"github.com/jackc/pgx/v5"
)

// Connect opens a single pgx connection using DATABASE_URL from the environment.
// The caller is responsible for calling Close when done.
func Connect(ctx context.Context) (*pgx.Conn, error) {
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		return nil, fmt.Errorf("DATABASE_URL environment variable is not set")
	}

	cfg, err := pgx.ParseConfig(dsn)
	if err != nil {
		return nil, fmt.Errorf("parse DATABASE_URL: %w", err)
	}

	// Disable server-side prepared statements: required for Supabase's
	// transaction pooler (pgbouncer in transaction mode rejects PREPARE).
	cfg.DefaultQueryExecMode = pgx.QueryExecModeSimpleProtocol

	conn, err := pgx.ConnectConfig(ctx, cfg)
	if err != nil {
		return nil, fmt.Errorf("connect to database: %w", err)
	}
	return conn, nil
}
