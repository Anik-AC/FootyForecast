// Package middleware provides HTTP middleware for the API server.
package middleware

import (
	"net/http"
	"os"
)

// CORS adds permissive CORS headers so the Next.js frontend can call the API
// from any origin in development. Set CORS_ALLOWED_ORIGIN to restrict in prod.
func CORS(next http.Handler) http.Handler {
	origin := os.Getenv("CORS_ALLOWED_ORIGIN")
	if origin == "" {
		origin = "*"
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", origin)
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}
