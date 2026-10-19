import assert from 'assert'
import QueryStream from '../src'

describe('Readable lifecycle', () => {
  it('emits end once when the cursor also completes', async () => {
    const stream = new QueryStream('SELECT 1')
    let ends = 0
    const rows: any[] = []
    stream.cursor.close = (cb: () => void) => setImmediate(cb)
    stream.cursor.read = (_size: number, cb: Function) => {
      setImmediate(() => {
        cb(null, [{ value: 1 }])
        stream.cursor.emit('end', { rows })
      })
    }
    await new Promise<void>((resolve, reject) => {
      stream.on('data', (row) => rows.push(row))
      stream.on('end', () => ends++)
      stream.on('error', reject)
      stream.on('close', resolve)
    })
    assert.deepStrictEqual(rows, [{ value: 1 }])
    assert.strictEqual(ends, 1)
  })

  it('emits one error when both the read callback and cursor report it', async () => {
    const stream = new QueryStream('invalid query')
    const error = new Error('syntax error')
    const errors: Error[] = []
    stream.cursor.close = (cb: () => void) => setImmediate(cb)
    stream.cursor.read = (_size: number, cb: Function) => {
      setImmediate(() => {
        cb(error)
        stream.cursor.emit('error', error)
      })
    }
    await new Promise<void>((resolve) => {
      stream.on('error', (err) => errors.push(err))
      stream.on('close', resolve)
      stream.resume()
    })
    assert.deepStrictEqual(errors, [error])
  })
})
