import { execFileSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { arch, platform } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const GO_VERSION = '1.24.6'
const demoRoot = fileURLToPath(new URL('..', import.meta.url))
const repoRoot = fileURLToPath(new URL('../..', import.meta.url))
const goModule = join(repoRoot, 'go')
const buildDir = join(repoRoot, 'build')
const wasmPublicDir = join(demoRoot, '.wasm-public')
const wasmOut = join(buildDir, 'thue.wasm')
const wasmExecOut = join(buildDir, 'wasm_exec.js')

const required = [
  join(goModule, 'go.mod'),
  join(goModule, 'cmd', 'thue-wasm', 'main.go'),
  join(repoRoot, 'README.md'),
  join(repoRoot, 'examples', 'hello', 'hello.thue'),
]

for (const path of required) {
  if (!existsSync(path)) {
    throw new Error(`demo WASM build requires ${path}. Build from a full checkout so go/, examples/, and README.md are available.`)
  }
}

const toolchain = await resolveGo()
const env = {
  ...process.env,
  GOROOT: toolchain.goroot,
  GOTOOLCHAIN: 'local',
  GOOS: 'js',
  GOARCH: 'wasm',
  CGO_ENABLED: '0',
  PATH: `${dirname(toolchain.bin)}${delimiter()}${process.env.PATH ?? ''}`,
}

mkdirSync(buildDir, { recursive: true })
execFileSync(toolchain.bin, ['build', '-o', wasmOut, './cmd/thue-wasm'], {
  cwd: goModule,
  env,
  stdio: 'inherit',
})

const wasmExecSrc = join(toolchain.goroot, 'lib', 'wasm', 'wasm_exec.js')
if (!existsSync(wasmExecSrc)) {
  throw new Error(`Go toolchain ${toolchain.text} is missing ${wasmExecSrc}`)
}
copyFileSync(wasmExecSrc, wasmExecOut)

rmSync(wasmPublicDir, { recursive: true, force: true })
mkdirSync(wasmPublicDir, { recursive: true })
copyFileSync(wasmOut, join(wasmPublicDir, 'thue.wasm'))
copyFileSync(wasmExecOut, join(wasmPublicDir, 'wasm_exec.js'))

assertNonEmpty(join(wasmPublicDir, 'thue.wasm'))
assertNonEmpty(join(wasmPublicDir, 'wasm_exec.js'))
console.log(`demo WASM ready (${toolchain.text})`)

function delimiter() {
  return platform() === 'win32' ? ';' : ':'
}

function assertNonEmpty(path) {
  const stat = statSync(path)
  if (!stat.isFile() || stat.size === 0) {
    throw new Error(`expected non-empty file at ${path}`)
  }
}

async function resolveGo() {
  const onPath = readGo('go')
  if (onPath) return finish(onPath)
  const cachedBin = join(demoRoot, '.cache', `go${GO_VERSION}`, 'go', 'bin', goBinaryName())
  const cached = readGo(cachedBin)
  if (cached) return finish(cached)
  if (platform() !== 'linux') {
    throw new Error(`Go 1.24 or newer is required to build demo WASM. No usable toolchain is on PATH, and automatic download is only implemented for linux (this host is ${platform()} ${arch()}).`)
  }
  const downloaded = await downloadGo()
  return finish(downloaded)
}

function finish(found) {
  const goroot = execFileSync(found.bin, ['env', 'GOROOT'], { encoding: 'utf8' }).trim()
  if (!goroot) throw new Error(`go env GOROOT returned an empty value for ${found.bin}`)
  return { ...found, goroot }
}

function readGo(bin) {
  try {
    const text = execFileSync(bin, ['version'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
    const match = text.match(/go(\d+)\.(\d+)(?:\.(\d+))?/)
    if (!match) return null
    const major = Number(match[1])
    const minor = Number(match[2])
    if (major !== 1 || minor < 24) return null
    return { bin, text }
  } catch {
    return null
  }
}

function goBinaryName() {
  return platform() === 'win32' ? 'go.exe' : 'go'
}

function goArch() {
  if (arch() === 'x64') return 'amd64'
  if (arch() === 'arm64') return 'arm64'
  throw new Error(`unsupported architecture for the Go ${GO_VERSION} download: ${arch()}`)
}

async function downloadGo() {
  const root = join(demoRoot, '.cache', `go${GO_VERSION}`)
  const archive = join(demoRoot, '.cache', `go${GO_VERSION}.tar.gz`)
  const goarch = goArch()
  const url = `https://go.dev/dl/go${GO_VERSION}.linux-${goarch}.tar.gz`
  mkdirSync(join(demoRoot, '.cache'), { recursive: true })
  console.log(`downloading ${url}`)
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`failed to download ${url}: HTTP ${response.status}`)
  }
  const bytes = Buffer.from(await response.arrayBuffer())
  if (bytes.length === 0) throw new Error(`downloaded empty archive from ${url}`)
  writeFileSync(archive, bytes)
  rmSync(root, { recursive: true, force: true })
  mkdirSync(root, { recursive: true })
  execFileSync('tar', ['-C', root, '-xzf', archive], { stdio: 'inherit' })
  const bin = join(root, 'go', 'bin', goBinaryName())
  const found = readGo(bin)
  if (!found) throw new Error(`Go ${GO_VERSION} archive did not produce a usable toolchain at ${bin}`)
  return found
}
