'use strict'
const helper = require('../test-helper')
const assert = require('assert')
const suite = new helper.Suite()

// 测试Legacy实现的加密功能
suite.testAsync('legacy implementation tests', async () => {
  // 直接测试legacy实现
  const crypto = require('../../../lib/crypto/utils-legacy')

  // 检查模块是否导出了必要的函数
  assert.strictEqual(typeof crypto.gaussdbMd5PasswordHash, 'function')
  assert.strictEqual(typeof crypto.gaussdbSha256PasswordHash, 'function')
  assert.strictEqual(typeof crypto.randomBytes, 'function')
  assert.strictEqual(typeof crypto.deriveKey, 'function')
  assert.strictEqual(typeof crypto.sha256, 'function')
  assert.strictEqual(typeof crypto.hashByName, 'function')
  assert.strictEqual(typeof crypto.hmacSha256, 'function')
  assert.strictEqual(typeof crypto.md5, 'function')
})

suite.testAsync('legacy gaussdbMd5PasswordHash function', async () => {
  const crypto = require('../../../lib/crypto/utils-legacy')

  // 测试MD5密码哈希功能
  const user = 'testuser'
  const password = 'testpass'
  const salt = Buffer.from([1, 2, 3, 4])

  const hashed = crypto.gaussdbMd5PasswordHash(user, password, salt)
  assert.strictEqual(typeof hashed, 'string')
  assert(hashed.startsWith('md5'))
  assert.strictEqual(hashed.length, 35) // 'md5' + 32位十六进制字符
})

suite.testAsync('legacy gaussdbSha256PasswordHash function', async () => {
  const crypto = require('../../../lib/crypto/utils-legacy')

  // 测试SHA256密码哈希功能
  const user = 'testuser'
  const password = 'testpass'

  // 构造模拟的salt数据，符合GaussDB SHA256认证的数据结构
  // 结构: [4 bytes method][64 bytes random code][8 bytes token][4 bytes iteration]
  const data = Buffer.alloc(80)
  data.writeInt32BE(1, 0) // password method
  data.write('A'.repeat(64), 4, 'ascii') // 64-byte random code
  data.write('B'.repeat(8), 68, 'ascii') // 8-byte token
  data.writeInt32BE(1000, 76) // iteration count

  const hashed = crypto.gaussdbSha256PasswordHash(user, password, data)
  assert.strictEqual(typeof hashed, 'string')
})

suite.testAsync('legacy randomBytes function', async () => {
  const crypto = require('../../../lib/crypto/utils-legacy')

  // 测试随机字节生成功能
  const bytes1 = crypto.randomBytes(16)
  const bytes2 = crypto.randomBytes(16)

  assert(bytes1 instanceof Buffer)
  assert.strictEqual(bytes1.length, 16)
  assert(bytes2 instanceof Buffer)
  assert.strictEqual(bytes2.length, 16)

  // 两次生成的随机数据应该不同
  assert.notStrictEqual(bytes1.toString('hex'), bytes2.toString('hex'))
})

suite.testAsync('legacy sha256 function', async () => {
  const crypto = require('../../../lib/crypto/utils-legacy')

  // 测试SHA256哈希功能
  const data = Buffer.from('hello world')
  const hash = crypto.sha256(data)

  assert(hash instanceof Buffer)
  assert.strictEqual(hash.length, 32) // SHA256 produces 32-byte output
})

suite.testAsync('legacy md5 function', async () => {
  const crypto = require('../../../lib/crypto/utils-legacy')

  // 测试MD5哈希功能
  const hash = crypto.md5('hello world')
  assert.strictEqual(typeof hash, 'string')
  assert.strictEqual(hash.length, 32) // MD5 produces 32-character hex string
  assert.strictEqual(hash, '5eb63bbbe01eeed093cb22bb8f5acdc3') // known MD5 of 'hello world'
})

suite.testAsync('legacy deriveKey function', async () => {
  const crypto = require('../../../lib/crypto/utils-legacy')

  // 测试密钥派生功能
  const password = 'password'
  const salt = Buffer.from('salt')
  const iterations = 100

  const key = await crypto.deriveKey(password, salt, iterations)
  // nodeCrypto.pbkdf2Sync返回Buffer
  assert(key instanceof Buffer)
  assert.strictEqual(key.length, 32) // PBKDF2-SHA256 produces 32-byte key
})

suite.testAsync('legacy hashByName function', async () => {
  const crypto = require('../../../lib/crypto/utils-legacy')

  // 测试hashByName函数
  const data = Buffer.from('hello world')

  // 测试SHA-256
  const sha256Hash = crypto.hashByName('sha256', data)
  assert(sha256Hash instanceof Buffer)
  assert.strictEqual(sha256Hash.length, 32)

  // 测试SHA-1
  const sha1Hash = crypto.hashByName('sha1', data)
  assert(sha1Hash instanceof Buffer)
  assert.strictEqual(sha1Hash.length, 20)
})

suite.testAsync('legacy hmacSha256 function', async () => {
  const crypto = require('../../../lib/crypto/utils-legacy')

  // 测试hmacSha256函数
  const key = Buffer.from('key')
  const message = 'message'

  const hmac = crypto.hmacSha256(key, message)
  assert(hmac instanceof Buffer)
  assert.strictEqual(hmac.length, 32) // SHA-256 HMAC produces 32-byte output
})

// ──────────────────────────────────────────────
// Edge case tests for gaussdbSha256PasswordHash (commit 57874239/03acbad5)
// ──────────────────────────────────────────────

suite.testAsync('legacy gaussdbSha256PasswordHash: deterministic output', async () => {
  const crypto = require('../../../lib/crypto/utils-legacy')

  const password = 'mypassword'
  const data = Buffer.alloc(80)
  data.writeInt32BE(1, 0)
  data.write('A'.repeat(64), 4, 'ascii')
  data.write('B'.repeat(8), 68, 'ascii')
  data.writeInt32BE(4096, 76)

  const hash1 = crypto.gaussdbSha256PasswordHash('user1', password, data)
  const hash2 = crypto.gaussdbSha256PasswordHash('user1', password, data)
  assert.strictEqual(hash1, hash2, 'same inputs should produce same hash')
})

suite.testAsync('legacy gaussdbSha256PasswordHash: different iteration counts produce different hashes', async () => {
  const crypto = require('../../../lib/crypto/utils-legacy')

  const makeData = function (iteration) {
    const data = Buffer.alloc(80)
    data.writeInt32BE(1, 0)
    data.write('A'.repeat(64), 4, 'ascii')
    data.write('B'.repeat(8), 68, 'ascii')
    data.writeInt32BE(iteration, 76)
    return data
  }

  // 'server' mode: honor the iteration count carried in the auth message
  const hash1 = crypto.gaussdbSha256PasswordHash('user', 'pass', makeData(1000), 'server')
  const hash2 = crypto.gaussdbSha256PasswordHash('user', 'pass', makeData(4096), 'server')
  assert.notStrictEqual(hash1, hash2, 'different iterations should produce different hashes')
})

suite.testAsync('legacy gaussdbSha256PasswordHash: different random codes produce different hashes', async () => {
  const crypto = require('../../../lib/crypto/utils-legacy')

  const makeData = function (randomCode) {
    const data = Buffer.alloc(80)
    data.writeInt32BE(1, 0)
    data.write(randomCode, 4, 'ascii')
    data.write('B'.repeat(8), 68, 'ascii')
    data.writeInt32BE(4096, 76)
    return data
  }

  const hash1 = crypto.gaussdbSha256PasswordHash('user', 'pass', makeData('A'.repeat(64)))
  const hash2 = crypto.gaussdbSha256PasswordHash('user', 'pass', makeData('C'.repeat(64)))
  assert.notStrictEqual(hash1, hash2, 'different random codes should produce different hashes')
})

suite.testAsync('legacy gaussdbSha256PasswordHash: different tokens produce different hashes', async () => {
  const crypto = require('../../../lib/crypto/utils-legacy')

  const makeData = function (token) {
    const data = Buffer.alloc(80)
    data.writeInt32BE(1, 0)
    data.write('A'.repeat(64), 4, 'ascii')
    data.write(token, 68, 'ascii')
    data.writeInt32BE(4096, 76)
    return data
  }

  const hash1 = crypto.gaussdbSha256PasswordHash('user', 'pass', makeData('BBBBBBBB'))
  const hash2 = crypto.gaussdbSha256PasswordHash('user', 'pass', makeData('CCCCCCCC'))
  assert.notStrictEqual(hash1, hash2, 'different tokens should produce different hashes')
})

suite.testAsync(
  'legacy gaussdbSha256PasswordHash: user parameter does not affect hash (RFC5802 ignores user)',
  async () => {
    const crypto = require('../../../lib/crypto/utils-legacy')

    const data = Buffer.alloc(80)
    data.writeInt32BE(1, 0)
    data.write('A'.repeat(64), 4, 'ascii')
    data.write('B'.repeat(8), 68, 'ascii')
    data.writeInt32BE(1000, 76)

    // gaussdbSha256PasswordHash signature is (user, password, data)
    // but the RFC5802 implementation only uses password, not user
    const hash1 = crypto.gaussdbSha256PasswordHash('userA', 'pass', data)
    const hash2 = crypto.gaussdbSha256PasswordHash('userB', 'pass', data)
    assert.strictEqual(hash1, hash2, 'user parameter should not affect hash output')
  }
)

suite.testAsync('legacy gaussdbSha256PasswordHash: result is ascii hex string', async () => {
  const crypto = require('../../../lib/crypto/utils-legacy')

  const data = Buffer.alloc(80)
  data.writeInt32BE(1, 0)
  data.write('A'.repeat(64), 4, 'ascii')
  data.write('B'.repeat(8), 68, 'ascii')
  data.writeInt32BE(4096, 76)

  const hash = crypto.gaussdbSha256PasswordHash('user', 'password123', data)
  assert.strictEqual(typeof hash, 'string')
  assert.ok(/^[0-9a-f]+$/.test(hash), 'hash should be lowercase hex string: ' + hash)
})
