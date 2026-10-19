#!/usr/bin/env bash
set -euo pipefail
container=${1:?container name or ID required}
docker exec -i "$container" su - omm -c 'gsql -d ci_db_test -v ON_ERROR_STOP=1' <<'SQL'
SET password_encryption_type = 2;
CREATE ROLE sha256_test LOGIN PASSWORD 'test4@scram';
SQL
# The image uses pg_hba.conf (not gs_hba.conf). Put the SHA256 user before
# its general MD5 rule so the authentication test actually exercises SHA256.
docker exec "$container" bash -ec 'sed -i "1i host all sha256_test 0.0.0.0/0 sha256" "$PGDATA/pg_hba.conf"'
docker exec "$container" su - omm -c "gs_guc set -D /var/lib/opengauss/data -c 'wal_level = logical' -c 'max_replication_slots = 10' -c 'max_wal_senders = 10'"
docker exec "$container" su - omm -c "gs_guc set -D /var/lib/opengauss/data -h 'host replication all 0.0.0.0/0 md5'"
docker restart "$container"
bash "$(dirname "$0")/wait-for-db.sh" "$container"
docker exec "$container" su - omm -c 'gsql -d ci_db_test -v ON_ERROR_STOP=1 -c "SHOW wal_level; SHOW max_replication_slots; SHOW max_wal_senders;"'
