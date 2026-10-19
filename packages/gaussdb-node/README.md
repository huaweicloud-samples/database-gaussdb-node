# gaussdb-node

<!-- ### :star: [Documentation](https://node-gaussdb.com) :star: -->

### Features

- Connection pooling
- Extensible JS ↔ GaussDB data-type coercion

Non-blocking GaussDB client for Node.js.

## Install

```sh
$ npm install gaussdb-node
```

## Node.js 14 and 15 compatibility (0.2.3)

Version 0.2.3 fixes GaussDB SHA256 authentication in the Node.js 14 legacy
crypto implementation. Install the published package with:

```sh
npm install gaussdb-node@0.2.3
```

CI covers Node.js 14, 15, 16, 18, 20, 22, 23 and 24. Authentication defaults to
2048 iterations for JDBC compatibility. For servers requiring the iteration
count carried in their authentication challenge, set `sha256Iterations: 'server'`
in the Client/Pool configuration; an explicit numeric count is also supported.


---

## :star: Documentation :star:

### Features

- Connection pooling
- Extensible JS ↔ Gaussdb data-type coercion
- Supported Gaussdb features
  - Parameterized queries
  - Named statements with query plan caching
  - Bulk import & export with `COPY TO/COPY FROM`


## Support

gaussdb-node is free software. If you encounter a bug with the library please open an issue on the [GitHub repo](https://github.com/HuaweiCloudDeveloper/gaussdb-node). If you have questions unanswered by the documentation please open an issue pointing out how the documentation was unclear & I will do my best to make it better!

When you open an issue please provide:

- version of Node
- version of GaussDB
- smallest possible snippet of code to reproduce the problem

You can also follow me [@briancarlson](https://twitter.com/briancarlson) if that's your thing. I try to always announce noteworthy changes & developments with gaussdb-node on Twitter.

## Contributing

**:heart: contributions!**

I will **happily** accept your pull request if it:

- **has tests**
- looks reasonable
- does not break backwards compatibility

If your change involves breaking backwards compatibility please please point that out in the pull request & we can discuss & plan when and how to release it and what type of documentation or communicate it will require.


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
