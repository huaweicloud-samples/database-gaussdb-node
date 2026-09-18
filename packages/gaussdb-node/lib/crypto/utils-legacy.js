'use strict'
// This file contains crypto utility functions for versions of Node.js < 15.0.0,
// which does not support the WebCrypto.subtle API.

const nodeCrypto = require('crypto')
const { RFC5802Algorithm } = require('./rfc5802')

function md5(string) {
  return nodeCrypto.createHash('md5').update(string, 'utf-8').digest('hex')
}

// See AuthenticationMD5Password at https://www.postgresql.org/docs/current/static/protocol-flow.html
function gaussdbMd5PasswordHash(user, password, salt) {
  const inner = md5(password + user)
  const outer = md5(Buffer.concat([Buffer.from(inner), salt]))
  return 'md5' + outer
}

// GaussDB SHA256 authentication
//
// Iteration-count resolution (JDBC compatibility):
// The official JDBC driver (openGauss-connector-jdbc) only honors the iteration
// count carried in the authentication message for protocol 3.51 clients. For
// protocol 3.0/3.50 clients it hardcodes PBKDF2 iterations to 2048, and GaussDB
// servers verify the proof with 2048 even when the auth message advertises a
// different count (e.g. 10000). Trusting the advertised value produces a wrong
// ClientProof and the server rejects the login with 28P01
// (invalid username/password). So the default here is 2048, matching JDBC;
// pass 'server' to use the count from the auth message instead.
const JDBC_COMPAT_ITERATIONS = 2048
// Same client-side bound as JDBC ConnectionFactoryImpl.MAX_ITERATIONS
const MAX_ITERATIONS = 10000000

const PASSWORD_METHOD_OFFSET = 0
const PASSWORD_METHOD_SIZE = 4
const RANDOM_CODE_SIZE = 64
const TOKEN_SIZE = 8
const ITERATION_SIZE = 4

function resolveSha256Iterations(dataBuffer, iterationOption) {
  const serverIteration = dataBuffer.readInt32BE(dataBuffer.length - ITERATION_SIZE)
  if (iterationOption === 'server') {
    return serverIteration
  }
  const iterations =
    typeof iterationOption === 'number' ? iterationOption : iterationOption === undefined ? JDBC_COMPAT_ITERATIONS : NaN
  if (!Number.isInteger(iterations) || iterations < 1 || iterations > MAX_ITERATIONS) {
    throw new RangeError(
      'sha256Iterations must be an integer between 1 and ' +
        MAX_ITERATIONS +
        ", or 'server'; got " +
        JSON.stringify(iterationOption)
    )
  }
  return iterations
}

function gaussdbSha256PasswordHash(user, password, data, iterationOption) {
  const dataBuffer = Buffer.from(data)
  dataBuffer.readInt32BE(PASSWORD_METHOD_OFFSET)

  const randomCode = dataBuffer.slice(PASSWORD_METHOD_SIZE, PASSWORD_METHOD_SIZE + RANDOM_CODE_SIZE).toString('ascii')

  const tokenOffset = PASSWORD_METHOD_SIZE + RANDOM_CODE_SIZE
  const token = dataBuffer.slice(tokenOffset, tokenOffset + TOKEN_SIZE).toString('ascii')

  const iterations = resolveSha256Iterations(dataBuffer, iterationOption)

  const hashResult = RFC5802Algorithm(password, randomCode, token, '', iterations, 'sha256')

  return Buffer.from(hashResult, 'hex').toString('ascii')
}

function sha256(text) {
  return nodeCrypto.createHash('sha256').update(text).digest()
}

function hashByName(hashName, text) {
  hashName = hashName.replace(/(\D)-/, '$1') // e.g. SHA-256 -> SHA256
  return nodeCrypto.createHash(hashName).update(text).digest()
}

function hmacSha256(key, msg) {
  return nodeCrypto.createHmac('sha256', key).update(msg).digest()
}

async function deriveKey(password, salt, iterations) {
  return nodeCrypto.pbkdf2Sync(password, salt, iterations, 32, 'sha256')
}

module.exports = {
  gaussdbMd5PasswordHash,
  gaussdbSha256PasswordHash,
  randomBytes: nodeCrypto.randomBytes,
  deriveKey,
  sha256,
  hashByName,
  hmacSha256,
  md5,
}
