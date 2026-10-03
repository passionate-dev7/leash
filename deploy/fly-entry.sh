#!/bin/sh
# Materialize the API's secret files on the volume from fly secrets on first boot, then drop them from the env.
set -eu
umask 077
mkdir -p /data/api "$HOME/.config/leash-api"
put() { [ -s "$2" ] || { [ -n "$1" ] && printf '%s' "$1" > "$2"; }; }
put "${LEASH_MASTER_KEY:-}" "$HOME/.config/leash-api/master.key"
put "${LEASH_SPONSOR_KEY:-}" /data/api/vendor-sponsor.key
put "${LEASH_VENDOR_SECRET:-}" /data/api/vendor-secret
# A database uploaded as import.db replaces the live one before the API opens it.
if [ -s /data/api/import.db ]; then
  rm -f /data/api/leash.db-wal /data/api/leash.db-shm
  mv /data/api/import.db /data/api/leash.db
fi
unset LEASH_MASTER_KEY LEASH_SPONSOR_KEY LEASH_VENDOR_SECRET
cd /app/apps/api
exec node --import tsx src/index.ts
