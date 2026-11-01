#!/usr/bin/env bash
set -euo pipefail
PGBIN="${PGBIN:-/usr/lib/postgresql/16/bin}"
PGDATA="${PGDATA:-$(pwd)/.pgdata}"
PGUSER_OS="${PGUSER_OS:-postgres}"
if [ "$(id -u)" = "0" ]; then
  runuser -u "$PGUSER_OS" -- "$PGBIN/pg_ctl" -D "$PGDATA" -w stop || echo "not running"
else
  "$PGBIN/pg_ctl" -D "$PGDATA" -w stop || echo "not running"
fi
