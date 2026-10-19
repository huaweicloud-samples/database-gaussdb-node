# gaussdb-node

Non-blocking GaussDB client for Node.js.

## Monorepo

This repo is a monorepo which contains the core [gaussdb-node](https://github.com/huaweicloud-samples/database-gaussdb-node/tree/master/packages/gaussdb-node) module as well as a handful of related modules.

- [gaussdb-node](https://github.com/huaweicloud-samples/database-gaussdb-node/tree/master/packages/gaussdb-node)
- [gaussdb-pool](https://github.com/huaweicloud-samples/database-gaussdb-node/tree/master/packages/gaussdb-pool)
- [gaussdb-cursor](https://github.com/huaweicloud-samples/database-gaussdb-node/tree/master/packages/gaussdb-cursor)
- [gaussdb-query-stream](https://github.com/huaweicloud-samples/database-gaussdb-node/tree/master/packages/gaussdb-query-stream)
- [gaussdb-connection-string](https://github.com/huaweicloud-samples/database-gaussdb-node/tree/master/packages/gaussdb-connection-string)
- [gaussdb-protocol](https://github.com/huaweicloud-samples/database-gaussdb-node/tree/master/packages/gaussdb-protocol)

## Install

### Published version 0.2.3

The maintained npm package is [gaussdb-nodejs](https://www.npmjs.com/package/gaussdb-nodejs).
Install it directly and import from `gaussdb-nodejs`:

```sh
npm install gaussdb-nodejs@0.2.3 --registry=https://registry.npmjs.org/
```

To keep existing `require('gaussdb-node')` or `import ... from 'gaussdb-node'`
code, install the same package using an npm alias:

```sh
npm install gaussdb-node@npm:gaussdb-nodejs@0.2.3 --registry=https://registry.npmjs.org/
```

The old unscoped `gaussdb-node` package has not received this release.
Do not use `npm install gaussdb-node@0.2.3` for this version.

The companion packages are `gaussdb-nodejs-connection-string`,
`gaussdb-nodejs-pool`, `gaussdb-nodejs-protocol`, `gaussdb-nodejs-cursor`,
and `gaussdb-nodejs-query-stream`. The pool package is version 0.2.5;
the other companion packages are version 0.2.3.
`gaussdb-cloudflare` remains the existing optional package.

Full database CI passes on Node.js 14, 15, 16, 18, 20, 22, 23 and 24.
Package loading and SHA256 authentication calculation have additionally been
checked on every major version from 14 through 26; this does not constitute
full database integration testing on the additional versions.


## Documentation

Each package in this repo should have its own readme more focused on how to develop/contribute. 
<!-- TODO: 构建文档后恢复 -->
<!-- For overall documentation on the project and the related modules managed by this repo please see: -->

### :star: Documentation:star:

The source repo for the documentation is available for contribution [here](https://github.com/huaweicloud-samples/database-gaussdb-node/tree/master/docs).

### Features

- Connection pooling
- Extensible JS ↔ GaussDB data-type coercion
- Supported GaussDB features
  - Parameterized queries
  - Named statements with query plan caching
  - Bulk import & export with `COPY TO/COPY FROM`

### Extras

gaussdb-node is by design pretty light on abstractions. These are some handy modules we've been using over the years to complete the picture.
<!-- TODO: 构建后恢复 -->
<!-- The entire list can be found on our [wiki](https://github.com/huaweicloud-samples/database-gaussdb-node/wiki/Extras). -->

## Support

gaussdb-node is free software. If you encounter a bug with the library please open an issue on the [GitHub repo](https://github.com/huaweicloud-samples/database-gaussdb-node). If you have questions unanswered by the documentation please open an issue pointing out how the documentation was unclear & I will do my best to make it better!

When you open an issue please provide:

- version of Node
- version of GaussDB
- smallest possible snippet of code to reproduce the problem


## Contributing

**:heart: contributions!**

I will **happily** accept your pull request if it:

- **has tests**
- looks reasonable
- does not break backwards compatibility

If your change involves breaking backwards compatibility please please point that out in the pull request & we can discuss & plan when and how to release it and what type of documentation or communication it will require.

### Setting up for local development

1. Clone the repo
2. From your workspace root run `yarn` and then `yarn lerna bootstrap`
3. Ensure you have a GaussDB instance running with SSL enabled and an empty database for tests
4. Ensure you have the proper environment variables configured for connecting to the instance
5. Run `yarn test` to run all the tests

## License

Copyright (c) 2010-2020 Brian Carlson (brian.m.carlson@gmail.com)

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
