# gaussdb-query-stream

Receive result rows from [gaussdb](https://github.com/huaweicloud-samples/database-gaussdb-node) as a readable (object) stream.

## installation

```bash
$ npm install gaussdb-node@npm:gaussdb-nodejs@0.2.3 --save
$ npm install gaussdb-query-stream@npm:gaussdb-nodejs-query-stream@0.2.3 --save
```

_Use with gaussdb-nodejs 0.2.3 or later._

## use

```js
const gaussdb = require('gaussdb-node')
const pool = new gaussdb.Pool()
const QueryStream = require('gaussdb-query-stream')
const JSONStream = require('JSONStream')

// pipe 1,000,000 rows to stdout without blowing up your memory usage
pool.connect((err, client, done) => {
  if (err) throw err
  const query = new QueryStream('SELECT * FROM generate_series(0, $1) num', [1000000])
  const stream = client.query(query)
  // release the client when the stream is finished
  stream.on('end', done)
  stream.pipe(JSONStream.stringify()).pipe(process.stdout)
})
```

The stream uses a cursor on the server so it efficiently keeps only a low number of rows in memory.

This is especially useful when doing [ETL](http://en.wikipedia.org/wiki/Extract,_transform,_load) on a huge table. Using manual `limit` and `offset` queries to fake out async itteration through your data is cumbersome, and _way way way_ slower than using a cursor.


## contribution

I'm very open to contribution! Open a pull request with your code or idea and we'll talk about it. If it's not way insane we'll merge it in too: isn't open source awesome?

## license

The MIT License (MIT)

Copyright (c) 2013-2020 Brian M. Carlson
Copyright (c) 2025 happy-game

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
