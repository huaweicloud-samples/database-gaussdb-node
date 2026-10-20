# gaussdb-node

<!-- ### :star: [Documentation](https://node-gaussdb.com) :star: -->

### Features

- Connection pooling
- Extensible JS ↔ GaussDB data-type coercion

Non-blocking GaussDB client for Node.js.

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


## SHA256 认证迭代次数（0.2.3）

`sha256Iterations` 控制客户端计算 SHA256 密码认证结果时使用的迭代次数。
它不会修改数据库密码或服务端配置。

| 配置 | 含义 |
| --- | --- |
| 不配置 | 当前 0.2.3 默认使用 **2048** 次 |
| `sha256Iterations: 'server'` | 使用服务端在**本次登录认证报文**中下发的迭代次数 |
| `sha256Iterations: 10000` | 显式使用指定次数；数字须为 1 到 10000000 之间的整数 |

如果服务端要求 10000 次，而客户端使用默认 2048 次，即使账号密码正确，
也可能收到 `Invalid username/password,login denied.`。
本地 GaussDB 507 对照测试已复现这一情况：默认 2048 登录失败，
使用 `'server'` 或显式 10000 后登录和查询成功。
这不是所有认证失败的唯一原因，也不表示所有 GaussDB 实例都要求 10000 次。

对于需要按服务端下发次数认证的实例，可以在 `Client` 或 `Pool` 的配置中加入：

```js
const { Client } = require('gaussdb-nodejs')

const client = new Client({
  host: process.env.GAUSSHOST,
  port: Number(process.env.GAUSSPORT || 8000),
  user: process.env.GAUSSUSER,
  password: process.env.GAUSSPASSWORD,
  database: process.env.GAUSSDATABASE,
  sha256Iterations: 'server',
})
```

通过 npm 别名安装的项目可以继续使用 `require('gaussdb-node')`，参数含义相同。

这里的 `'server'` 是读取认证报文，不是执行 `SHOW auth_iteration_count` 查询配置。
对于当前这类 **80 字节 SHA256 认证数据**，最后 **4 字节**是大端编码的迭代次数：
例如调试日志 `AUTH ... hex=` 的末尾为 `00002710`，表示十进制 **10000**。
驱动直接解析原始字节，不依赖日志文字。

DBA 可以用 `SHOW auth_iteration_count;` 查看数据库当前配置，但不要仅凭配置值
或报文值断定所有协议、历史账号的认证行为相同；应结合实际实例和连接结果验证。
排查问题时，应先核对包版本、账号密码和连接目标，再比较默认配置与 `'server'` 的结果，
无需为了适配客户端而直接修改数据库的迭代次数。

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

gaussdb-node is free software. If you encounter a bug with the library please open an issue on the [GitHub repo](https://github.com/huaweicloud-samples/database-gaussdb-node). If you have questions unanswered by the documentation please open an issue pointing out how the documentation was unclear & I will do my best to make it better!

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
