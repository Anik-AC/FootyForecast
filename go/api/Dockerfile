# ---- build stage ----
FROM golang:1.23-alpine AS builder

WORKDIR /src

# Copy dependency manifests first so Docker can cache the module download
# layer separately from the source code.
COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /api ./cmd/api

# ---- run stage ----
# distroless/static has no shell, which reduces attack surface.
FROM gcr.io/distroless/static:nonroot

COPY --from=builder /api /api

EXPOSE 8080

ENTRYPOINT ["/api"]
