-- The suite is inherited from node-postgres and requires PostgreSQL semantics
-- (in particular, an empty text value must not become NULL as in A mode).
CREATE DATABASE ci_db_test WITH DBCOMPATIBILITY = 'PG';
