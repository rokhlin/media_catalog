#!/usr/bin/env bash
# Quick runner script for Media Cataloger Web UI on Linux / macOS / WSL

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

CMD="${1:-server}"
shift || true

case "$CMD" in
    dev|client)
        npm run dev "$@"
        ;;
    server|server:dev|api)
        npm run server:dev "$@"
        ;;
    build)
        npm run build && npm run server:build
        ;;
    test)
        npm test "$@"
        ;;
    typecheck)
        npm run typecheck
        ;;
    up|docker)
        docker compose up -d "$@"
        ;;
    down)
        docker compose down "$@"
        ;;
    *)
        npm run server:dev "$@"
        ;;
esac
