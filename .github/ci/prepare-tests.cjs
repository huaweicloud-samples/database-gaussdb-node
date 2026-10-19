// Transpile the existing TypeScript tests before switching to legacy runtimes.
// tsx itself requires modern Node.js; the package and test assertions do not.
const fs = require('fs')
const path = require('path')
const ts = require('typescript')
const root = path.resolve(__dirname, '../../packages/gaussdb-connection-string')
const dest = path.join(root, 'dist')
fs.mkdirSync(dest, { recursive: true })
for (const name of fs.readdirSync(path.join(root, 'test'))) {
  const input = path.join(root, 'test', name)
  if (name.endsWith('.ts')) {
    const result = ts.transpileModule(fs.readFileSync(input, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2018, esModuleInterop: true },
    })
    fs.writeFileSync(path.join(dest, name.replace(/\.ts$/, '.js')), result.outputText)
  } else {
    fs.copyFileSync(input, path.join(dest, name))
  }
}
