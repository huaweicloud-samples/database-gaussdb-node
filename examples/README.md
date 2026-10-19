# GaussDB Node.js Examples

这里包含了 gaussdb-node 的各种使用示例。

## 文件夹结构

### `async-await/` - 现代异步语法示例
使用 async/await 语法的示例。

### `promises/` - 传统 Promise 语法示例
使用 Promise 链式语法的示例。

## 快速开始

安装 gaussdb-node 
```bash
npm install gaussdb-node@npm:gaussdb-nodejs@0.2.3
```

## 环境变量配置

大部分示例会使用环境变量来配置数据库连接：

```bash
export GAUSSUSER=user
export GAUSSPASSWORD=openGauss@123
export GAUSSHOST=localhost
export GAUSSPORT=5432
export GAUSSDATABASE=data
export GAUSSTESTNOSSL=false
```

## 示例类型

### 基础连接
- 最简单的连接和查询示例
- 使用配置对象连接数据库

### 连接池
- 基础连接池使用
- 连接池错误处理
- 手动检出和释放连接

### 查询操作
- 参数化查询防止SQL注入
- 预编译语句使用
- 事务处理

### 高级功能
- 游标查询大结果集
- 流式查询处理

## 运行示例

```bash
# 运行 async/await 示例
cd async-await
node basic-connection.js

# 运行 Promise 示例
cd promises
node basic-connection.js

# 使用环境变量运行
GAUSSUSER=user GAUSSPASSWORD=openGauss@123 GAUSSHOST=localhost node basic-connection.js
```
