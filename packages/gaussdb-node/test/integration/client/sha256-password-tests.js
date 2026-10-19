'use strict'
const helper = require('./../test-helper')
const gaussdb = helper.gaussdb
const suite = new helper.Suite()
const assert = require('assert')

/**
 * This test only executes if the env variables SHA256_TEST_GAUSSUSER and
 * SHA256_TEST_GAUSSPASSWORD are defined. You can override additional values
 * for the host, port and database with other SHA256_TEST_ prefixed vars.
 * If the variables are not defined the test will be skipped.
 *
 * SQL to create test role:
 *
 *     gs_guc reload -D "$PGDATA" -c "password_encryption_type = 2"
 *     CREATE ROLE sha256_test login password 'test4@scram';
 *
 * Add the following entries to pg_hba.conf:
 *
 *     host   all   sha256_test   ::1/128    sha256
 *     host   all   sha256_test   0.0.0.0/0   sha256
 *
 * Then run this file with after exporting:
 *
 *     SHA256_TEST_GAUSSUSER=sha256_test
 *     SHA256_TEST_GAUSSPASSWORD=test4@scram
 */

// Base config for SHA256 tests
const config = {
  user: process.env.SHA256_TEST_GAUSSUSER,
  password: process.env.SHA256_TEST_GAUSSPASSWORD,
  host: process.env.SHA256_TEST_GAUSSHOST || 'localhost',
  port: process.env.SHA256_TEST_GAUSSPORT || 5432,
  database: process.env.SHA256_TEST_GAUSSDATABASE || 'ci_db_test',
}

if (!config.user || !config.password) {
  suite.testAsync('skipping SHA256 tests (missing env)', () => {})
  return
}

// Authentication failures can reject before the socket is closed. Always end
// the client so the test process can exit after checking the expected error.
async function withClient(options, test) {
  const client = new gaussdb.Client(options)
  try {
    await test(client)
  } finally {
    await client.end()
  }
}

suite.testAsync('can connect using sha256 password authentication', async () => {
  await withClient(config, async (client) => {
    let usingSha256 = false
    client.connection.once('authenticationSHA256Password', () => {
      usingSha256 = true
    })
    await client.connect()
    assert.strictEqual(usingSha256, true, 'Should use SHA256 authentication')
    const { rows } = await client.query('SELECT NOW()')
    assert.strictEqual(rows.length, 1)
  })
})

suite.testAsync('sha256 authentication fails when password is wrong', async () => {
  await withClient({ ...config, password: config.password + 'append-something-to-make-it-bad' }, async (client) => {
    await assert.rejects(() => client.connect(), { code: '28P01' }, 'Error code should be for a password error')
  })
})

suite.testAsync('sha256 authentication fails when password is empty', async () => {
  await withClient({ ...config, password: () => '' }, async (client) => {
    await assert.rejects(
      () => client.connect(),
      (err) => err.code === '28P01' || err.message.includes('password'),
      'Should fail with password-related error'
    )
  })
})
