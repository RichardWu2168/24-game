import { cp, mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import { get } from 'node:http'

const project = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const temporary = await mkdtemp(join(tmpdir(), 'math24-production-'))
const environment = {
  ...process.env,
  DATABASE_URL: 'postgresql://smoke:smoke@127.0.0.1:1/smoke',
  PORT: '0',
  FRONTEND_URL: 'http://localhost:5173',
}
let server
let exited

async function npm(cwd, args) {
  await new Promise((resolveRun, reject) => {
    const windows = process.platform === 'win32'
    const child = spawn(windows ? process.env.ComSpec ?? 'cmd.exe' : 'npm', windows ? ['/d', '/s', '/c', 'npm', ...args] : args, {
      cwd, env: environment, stdio: 'inherit', windowsHide: true,
    })
    child.once('error', reject)
    child.once('exit', code => code === 0 ? resolveRun() : reject(new Error(`npm ${args.join(' ')} exited with ${code}`)))
  })
}

async function copyCleanPackage(name, files) {
  for (const file of files) {
    await cp(join(project, name, file), join(temporary, name, file), {
      recursive: true,
      // A clean checkout has no generated client, node_modules, dist, or .env.
      filter: source => basename(source) !== 'generated',
    })
  }
}

try {
  await copyCleanPackage('backend', ['package.json', 'package-lock.json', 'tsconfig.json', 'tsconfig.build.json', 'prisma7.config.ts', 'prisma', 'src'])
  await copyCleanPackage('frontend', ['package.json', 'package-lock.json', 'tsconfig.json', 'tsconfig.app.json', 'tsconfig.node.json', 'vite.config.ts', 'index.html', 'public', 'src'])
  const backend = join(temporary, 'backend')
  const frontend = join(temporary, 'frontend')
  await npm(backend, ['ci'])
  await npm(backend, ['run', 'build'])
  await npm(backend, ['ci', '--omit=dev', '--ignore-scripts'])
  await npm(frontend, ['ci'])
  await npm(frontend, ['run', 'build'])

  server = spawn(process.execPath, ['dist/server.js'], {
    cwd: backend, env: { ...environment, NODE_ENV: 'production' }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
  })
  exited = new Promise(resolveExit => server.once('exit', resolveExit))
  const port = await new Promise((resolvePort, reject) => {
    const timeout = setTimeout(() => reject(new Error('Production server startup timed out')), 15_000)
    let output = ''
    server.stdout.on('data', chunk => {
      process.stdout.write(chunk)
      output += chunk.toString()
      const match = output.match(/http:\/\/localhost:(\d+)/)
      if (match) { clearTimeout(timeout); resolvePort(Number(match[1])) }
    })
    server.stderr.on('data', chunk => process.stderr.write(chunk))
    server.once('error', error => { clearTimeout(timeout); reject(error) })
    server.once('exit', code => { clearTimeout(timeout); reject(new Error(`Production server exited with ${code}`)) })
  })
  const health = await new Promise((resolveHealth, reject) => {
    const request = get(`http://127.0.0.1:${port}/api/health`, response => {
      let body = ''
      response.on('data', chunk => { body += chunk })
      response.on('error', reject)
      response.on('end', () => {
        try {
          const data = JSON.parse(body)
          if (response.statusCode !== 200 || data.status !== 'OK') throw new Error('Production health check failed')
          resolveHealth(data)
        } catch (error) { reject(error) }
      })
    })
    request.setTimeout(5000, () => request.destroy(new Error('Production health check timed out')))
    request.on('error', reject)
  })
  console.log(`Clean install, Prisma generation, frontend build, and production-only startup passed (${health.status}).`)
} finally {
  if (server && server.exitCode === null) server.kill('SIGTERM')
  if (exited) await exited
  const actual = await realpath(temporary)
  const parent = await realpath(tmpdir())
  if (dirname(actual) !== parent || !basename(actual).startsWith('math24-production-')) {
    throw new Error('Refusing to remove an unexpected temporary directory')
  }
  await rm(actual, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
}
