# Database fixture for CI

The Node.js matrix runs against an isolated openGauss container, not a production
GaussDB service. The image digest matches the image from the failed September
2026 jobs. That image cannot start without `libopenblas.so.0`; the Dockerfile
installs the pinned OpenBLAS package with RPM signature verification enabled and
checks the database executable during the image build.

The wait script requires a named container and an authenticated TCP query. It
fails immediately if the container exits, preserving the initialization logs.
It does not accept the temporary Unix-socket server used during initialization.
The initialization SQL creates the test database explicitly in PG compatibility
mode because inherited node-postgres tests require empty strings to stay empty
strings rather than becoming NULL in the image's default A mode.
The configuration script creates a SHA256 test user and configures logical
replication before restarting and checking readiness again.

```sh
docker build -f .github/ci/Dockerfile.opengauss -t gaussdb-node-ci:openblas .github/ci
docker run -d --name gaussdb-node-ci -p 127.0.0.1:55480:5432 \
  -e GS_USERNAME=ci_user -e GS_PASSWORD=openGauss@123 \
  -e GS_USER_PASSWORD=openGauss@123 -e GS_DB=postgres \
  -e GS_HOST_AUTH_METHOD=md5 gaussdb-node-ci:openblas
bash .github/ci/wait-for-db.sh gaussdb-node-ci
bash .github/ci/configure-db.sh gaussdb-node-ci
# Run tests with GAUSSPORT=55480 and SHA256_TEST_GAUSSPORT=55480 locally.
docker rm -fv gaussdb-node-ci
```

These fixed credentials belong only to the disposable CI fixture. The scripts
must not be pointed at an existing database container. CI removes the container
and anonymous volumes even after failure.

Dependencies are installed and built on Node.js 18. Tests then run on the target
runtime. Node.js 14 uses legacy crypto, so WebCrypto-only tests do not run there.
For Node.js <18, the modern node:test import suite is replaced by a direct ESM
import smoke test; driver unit/integration tests and other package tests still
run on the target runtime. Node.js >=18 retains the existing full test command.
