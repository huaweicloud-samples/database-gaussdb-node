'use strict'
const assert = require('assert')
const Cursor = require('../')

describe('cursor error callbacks', () => {
  it('rejects the active read and all queued reads with the server error', async () => {
    const cursor = new Cursor('invalid query')
    cursor.connection = {
      execute() {},
      flush() {},
      sync() {},
      removeListener() {},
    }
    cursor.state = 'submitted'
    const error = new Error('syntax error')
    const reads = [cursor.read(1), cursor.read(1), cursor.read(1)]
    const rejected = Promise.all(reads.map((read) => assert.rejects(read, (err) => err === error)))
    cursor.handleError(error)
    await rejected
    await assert.rejects(cursor.read(1), (err) => err === error)
    assert.strictEqual(cursor._queue.length, 0)
    assert.strictEqual(cursor._cb, null)
  })
})
