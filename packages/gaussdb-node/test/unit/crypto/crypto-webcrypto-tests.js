'use strict'
const helper = require('../test-helper')
const assert = require('assert')
const suite = new helper.Suite()

// Node.js 14 uses utils-legacy; WebCrypto is available starting with Node.js 15.
if (!require('crypto').webcrypto) {
  console.log('Skipping WebCrypto-only tests: runtime uses legacy crypto')
  return
}

// 测试WebCrypto实现的加密功能
suite.testAsync('webcrypto implementation tests', async () => {
  // 直接测试webcrypto实现
  const crypto = require('../../../lib/crypto/utils-webcrypto')

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

suite.testAsync('webcrypto gaussdbSha256PasswordHash with various inputs', async () => {
  const crypto = require('../../../lib/crypto/utils-webcrypto')

  // 测试不同的输入参数
  const user = 'testuser'
  const password = 'testpass'

  // 测试正常输入
  const data1 = Buffer.alloc(80)
  data1.writeInt32BE(1, 0)
  data1.write('A'.repeat(64), 4, 'ascii')
  data1.write('B'.repeat(8), 68, 'ascii')
  data1.writeInt32BE(4096, 76)

  const result1 = await crypto.gaussdbSha256PasswordHash(user, password, data1)
  assert.strictEqual(typeof result1, 'string')

  // 测试空密码
  const result2 = await crypto.gaussdbSha256PasswordHash(user, '', data1)
  assert.strictEqual(typeof result2, 'string')

  // 测试特殊字符密码
  const result3 = await crypto.gaussdbSha256PasswordHash(user, 'p@ssw0rd!#$', data1)
  assert.strictEqual(typeof result3, 'string')
})

suite.testAsync('webcrypto hashByName function', async () => {
  const crypto = require('../../../lib/crypto/utils-webcrypto')

  // 测试hashByName函数
  const data = Buffer.from('hello world')

  // 测试SHA-256
  const sha256Hash = await crypto.hashByName('SHA-256', data)
  // WebCrypto返回ArrayBuffer而不是Buffer
  assert(sha256Hash instanceof ArrayBuffer)
  assert.strictEqual(sha256Hash.byteLength, 32)

  // 测试SHA-1
  const sha1Hash = await crypto.hashByName('SHA-1', data)
  assert(sha1Hash instanceof ArrayBuffer)
  assert.strictEqual(sha1Hash.byteLength, 20)
})

suite.testAsync('webcrypto hmacSha256 function', async () => {
  const crypto = require('../../../lib/crypto/utils-webcrypto')

  // 测试hmacSha256函数
  const key = Buffer.from('key')
  const message = 'message'

  const hmac = await crypto.hmacSha256(key, message)
  // WebCrypto的hmacSha256返回ArrayBuffer而不是Buffer
  assert(hmac instanceof ArrayBuffer)
  assert.strictEqual(hmac.byteLength, 32) // SHA-256 HMAC produces 32-byte output
})

suite.testAsync('webcrypto deriveKey function', async () => {
  const crypto = require('../../../lib/crypto/utils-webcrypto')

  // 测试密钥派生函数
  const password = 'password'
  const salt = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8])
  const iterations = 1000

  const key = await crypto.deriveKey(password, salt, iterations)
  assert(key instanceof ArrayBuffer || Buffer.isBuffer(key))
  assert.strictEqual(key.byteLength, 32) // Should be 32 bytes for SHA-256
  assert.deepStrictEqual(Buffer.from(key), require('crypto').pbkdf2Sync(password, salt, iterations, 32, 'sha256'))
})

suite.testAsync('webcrypto edge cases', async () => {
  const crypto = require('../../../lib/crypto/utils-webcrypto')

  // 测试边界情况
  // 1. 空输入
  const emptyHash = await crypto.md5('')
  assert.strictEqual(typeof emptyHash, 'string')

  // 2. 长输入
  const longString = 'a'.repeat(10000)
  const longHash = await crypto.md5(longString)
  assert.strictEqual(typeof longHash, 'string')
  assert.strictEqual(longHash.length, 32)
})
