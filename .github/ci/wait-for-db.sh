#!/usr/bin/env bash
set -euo pipefail
container=${1:?container name or ID required}
for ((attempt=0; attempt<90; attempt++)); do
  if [[ $(docker inspect --format '{{.State.Running}}' "$container") != true ]]; then
    echo 'Database container exited before becoming ready' >&2
    docker logs "$container"
    exit 1
  fi
  # A successful TCP query also ensures initialization's temporary server has
  # finished; checking gs_ctl alone can accept that temporary server too early.
  if docker exec "$container" su - omm -c \
    'gsql -h 127.0.0.1 -p 5432 -U ci_user -d ci_db_test -W openGauss@123 -t -c "SELECT 1"' \
    > /dev/null 2>&1; then
    echo 'Database accepts authenticated queries'
    exit 0
  fi
  sleep 2
done
echo 'Database readiness timed out after 180 seconds' >&2
docker logs "$container"
exit 1
