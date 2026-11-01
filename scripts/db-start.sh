#!/usr/bin/env bash
# Local PostgreSQL cluster. Docker is not available in this environment.
# PostgreSQL refuses to run as root, so when invoked as root we drop to $PGUSER_OS.
set -euo pipefail

PGBIN="${PGBIN:-/usr/lib/postgresql/16/bin}"
PGDATA="${PGDATA:-$(pwd)/.pgdata}"
PGSOCK="${PGSOCK:-/tmp/jaco-pg}"
PGPORT="${PGPORT:-5433}"
DBNAME="${DBNAME:-jaco}"
PGUSER_OS="${PGUSER_OS:-postgres}"

mkdir -p "$PGDATA" "$PGSOCK"

# Run a command as the database OS user when we are root.
as_pg() {
  if [ "$(id -u)" = "0" ]; then
    runuser -u "$PGUSER_OS" -- "$@"
  else
    "$@"
  fi
}

if [ "$(id -u)" = "0" ]; then
  chown -R "$PGUSER_OS" "$PGDATA" "$PGSOCK"
fi

if [ ! -f "$PGDATA/PG_VERSION" ]; then
  echo "==> initdb $PGDATA"
  as_pg "$PGBIN/initdb" -D "$PGDATA" -U postgres --auth=trust -E UTF8 >/dev/null
fi

if as_pg "$PGBIN/pg_isready" -h "$PGSOCK" -p "$PGPORT" -q 2>/dev/null; then
  echo "==> already running on $PGSOCK:$PGPORT"
else
  echo "==> starting postgres on $PGSOCK:$PGPORT"
  as_pg "$PGBIN/pg_ctl" -D "$PGDATA" \
    -o "-k $PGSOCK -p $PGPORT -c listen_addresses=''" \
    -w -l "$PGDATA/server.log" start
fi

if ! as_pg "$PGBIN/psql" -h "$PGSOCK" -p "$PGPORT" -U postgres -Atqc \
      "SELECT 1 FROM pg_database WHERE datname='$DBNAME'" | grep -q 1; then
  echo "==> createdb $DBNAME"
  as_pg "$PGBIN/createdb" -h "$PGSOCK" -p "$PGPORT" -U postgres "$DBNAME"
fi

echo "==> ready"
echo "DATABASE_URL=postgresql://postgres@localhost:$PGPORT/$DBNAME?host=$PGSOCK"
