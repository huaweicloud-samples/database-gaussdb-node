import assert from 'assert'
import gaussdb, { Client, Pool, Connection, types, DatabaseError } from 'gaussdb-node'
import Cursor from 'gaussdb-cursor'
import QueryStream from 'gaussdb-query-stream'
import { parse } from 'gaussdb-connection-string'
import { CloudflareSocket } from 'gaussdb-cloudflare'
assert.strictEqual(typeof Client, 'function')
assert.strictEqual(typeof Pool, 'function')
assert.strictEqual(typeof Connection, 'function')
assert.strictEqual(gaussdb.Client, Client)
assert.strictEqual(typeof types.getTypeParser, 'function')
assert.strictEqual(typeof DatabaseError, 'function')
assert.strictEqual(typeof Cursor, 'function')
assert.strictEqual(typeof QueryStream, 'function')
assert.strictEqual(typeof parse, 'function')
assert.strictEqual(typeof CloudflareSocket, 'function')
console.log('Public ESM imports passed on ' + process.version)
