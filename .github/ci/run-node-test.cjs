const { spawn } = require('child_process')
const file = process.argv[2]
if (!file) throw new Error('Test filename is required')
const child = spawn(process.execPath, process.argv.slice(2), { stdio: 'inherit' })
let timedOut = false
let killTimer
const timer = setTimeout(() => {
  timedOut = true
  console.error('\nTest process did not exit within 90 seconds: ' + file)
  child.kill('SIGTERM')
  killTimer = setTimeout(() => child.kill('SIGKILL'), 5000)
}, 90000)
child.on('error', error => {
  clearTimeout(timer)
  console.error(error)
  process.exitCode = 1
})
child.on('exit', code => {
  clearTimeout(timer)
  clearTimeout(killTimer)
  // xargs stops immediately on 255, preserving the first failing filename.
  process.exitCode = timedOut || code !== 0 ? 255 : 0
})
