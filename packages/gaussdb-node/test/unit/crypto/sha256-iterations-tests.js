'use strict'
const helper = require('../test-helper')
const assert = require('assert')
const suite = new helper.Suite()

const { RFC5802Algorithm } = require('../../../lib/crypto/rfc5802')
const legacyCrypto = require('../../../lib/crypto/utils-legacy')
const activeCrypto = require('../../../lib/crypto/utils')
const ConnectionParameters = require('../../../lib/connection-parameters')

const PASSWORD = 'secret-password'
const RANDOM_CODE = 'A'.repeat(64)
const TOKEN = 'B'.repeat(8)

// GaussDB SHA256 auth message layout:
// [4 bytes method][64 bytes random code][8 bytes token][4 bytes iteration]
const buildAuthData = function (iteration) {
  const data = Buffer.alloc(80)
  data.writeInt32BE(2, 0) // password method: SHA256_PASSWORD
  data.write(RANDOM_CODE, 4, 'ascii')
  data.write(TOKEN, 68, 'ascii')
  data.writeInt32BE(iteration, 76)
  return data
}

const expectedProof = function (iterations) {
  return Buffer.from(RFC5802Algorithm(PASSWORD, RANDOM_CODE, TOKEN, '', iterations, 'sha256'), 'hex').toString('ascii')
}

// Regression: GaussDB servers verify the SHA256 proof with 2048 iterations even
// when the auth message advertises another count (e.g. 10000). Trusting the
// advertised value produced 28P01 invalid username/password, while the JDBC
// driver (hardcoded 2048 for protocol 3.0/3.50) logged in with the same password.
suite.testAsync('default iteration count is 2048 (JDBC compatible), not the server-advertised value', async () => {
  const hashed = await activeCrypto.gaussdbSha256PasswordHash('user', PASSWORD, buildAuthData(10000))
  assert.strictEqual(hashed, expectedProof(2048))
  assert.notStrictEqual(hashed, expectedProof(10000))
})

suite.testAsync("iteration option 'server' uses the count carried in the auth message", async () => {
  const hashed = await activeCrypto.gaussdbSha256PasswordHash('user', PASSWORD, buildAuthData(10000), 'server')
  assert.strictEqual(hashed, expectedProof(10000))
})

suite.testAsync('numeric iteration option overrides both default and server value', async () => {
  const hashed = await activeCrypto.gaussdbSha256PasswordHash('user', PASSWORD, buildAuthData(10000), 4096)
  assert.strictEqual(hashed, expectedProof(4096))
})

suite.testAsync('legacy implementation matches the active implementation', async () => {
  const hashedLegacy = legacyCrypto.gaussdbSha256PasswordHash('user', PASSWORD, buildAuthData(10000))
  const hashedActive = await activeCrypto.gaussdbSha256PasswordHash('user', PASSWORD, buildAuthData(10000))
  assert.strictEqual(hashedLegacy, hashedActive)
  assert.strictEqual(hashedLegacy, expectedProof(2048))
})

suite.testAsync('legacy implementation honors the same options', async () => {
  assert.strictEqual(legacyCrypto.gaussdbSha256PasswordHash('user', PASSWORD, buildAuthData(1000)), expectedProof(2048))
  assert.strictEqual(
    legacyCrypto.gaussdbSha256PasswordHash('user', PASSWORD, buildAuthData(1000), 'server'),
    expectedProof(1000)
  )
  assert.strictEqual(
    legacyCrypto.gaussdbSha256PasswordHash('user', PASSWORD, buildAuthData(1000), 4096),
    expectedProof(4096)
  )
})

suite.testAsync('invalid iteration options are rejected', async () => {
  for (const invalid of [0, -1, 10000001, 1.5, 'junk']) {
    assert.throws(
      () => legacyCrypto.gaussdbSha256PasswordHash('user', PASSWORD, buildAuthData(1000), invalid),
      RangeError,
      `expected RangeError for ${JSON.stringify(invalid)}`
    )
    await assert.rejects(
      activeCrypto.gaussdbSha256PasswordHash('user', PASSWORD, buildAuthData(1000), invalid),
      RangeError,
      `expected RangeError for ${JSON.stringify(invalid)}`
    )
  }
  // boundary values are accepted
  assert.strictEqual(
    legacyCrypto.gaussdbSha256PasswordHash('user', PASSWORD, buildAuthData(1000), 10000000),
    expectedProof(10000000)
  )
  assert.strictEqual(legacyCrypto.gaussdbSha256PasswordHash('user', PASSWORD, buildAuthData(1000), 1), expectedProof(1))
})

suite.testAsync('ConnectionParameters parses sha256Iterations', async () => {
  // default: JDBC-compatible 2048
  assert.strictEqual(new ConnectionParameters({}).sha256Iterations, 2048)
  assert.strictEqual(new ConnectionParameters({ sha256Iterations: 2048 }).sha256Iterations, 2048)
  // numeric config
  assert.strictEqual(new ConnectionParameters({ sha256Iterations: 4096 }).sha256Iterations, 4096)
  // numeric passed as string (e.g. from a connection string)
  assert.strictEqual(new ConnectionParameters({ sha256Iterations: '8192' }).sha256Iterations, 8192)
  // explicit server-message mode
  assert.strictEqual(new ConnectionParameters({ sha256Iterations: 'server' }).sha256Iterations, 'server')
})

suite.testAsync('sha256Iterations is read from the GAUSSSHA256ITERATIONS environment variable', async () => {
  process.env.GAUSSSHA256ITERATIONS = 'server'
  try {
    assert.strictEqual(new ConnectionParameters({}).sha256Iterations, 'server')
  } finally {
    delete process.env.GAUSSSHA256ITERATIONS
  }
  process.env.GAUSSSHA256ITERATIONS = '5000'
  try {
    assert.strictEqual(new ConnectionParameters({}).sha256Iterations, 5000)
  } finally {
    delete process.env.GAUSSSHA256ITERATIONS
  }
})

suite.testAsync('client passes sha256Iterations to the SHA256 auth handler', async () => {
  const { Client, MemoryStream } = helper
  const cryptoUtils = require('../../../lib/crypto/utils')
  const original = cryptoUtils.gaussdbSha256PasswordHash
  const captured = []
  cryptoUtils.gaussdbSha256PasswordHash = async function (user, password, data, iterationOption) {
    captured.push({ data, iterationOption })
    return '00'
  }
  try {
    const client = new Client({
      user: 'testuser',
      password: 'testpass',
      sha256Iterations: 'server',
      stream: new MemoryStream(),
    })
    client._handleAuthSHA256Password({ data: buildAuthData(10000) })

    const clientDefault = new Client({ user: 'testuser', password: 'testpass', stream: new MemoryStream() })
    clientDefault._handleAuthSHA256Password({ data: buildAuthData(10000) })

    await new Promise((resolve) => setImmediate(resolve))

    assert.strictEqual(captured.length, 2)
    assert.deepStrictEqual(captured[0].data, buildAuthData(10000))
    assert.strictEqual(captured[0].iterationOption, 'server')
    assert.strictEqual(captured[1].iterationOption, 2048)
  } finally {
    cryptoUtils.gaussdbSha256PasswordHash = original
  }
})
