import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'
import { spawn } from 'node:child_process'

export const digest = value => crypto.createHash('sha256').update(value).digest('hex')
export async function readJson(file, fallback = null) {
  try { return JSON.parse(await fs.readFile(file, 'utf8')) } catch (error) { if (error.code === 'ENOENT') return fallback; throw error }
}
export async function atomicJson(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true })
  const temporary = `${file}.${crypto.randomUUID()}.tmp`
  try { await fs.writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`); await fs.rename(temporary, file) }
  finally { await fs.rm(temporary, { force: true }) }
}
export async function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { ...options, stdio: ['ignore', 'pipe', 'pipe'] })
    let output = ''
    child.stdout.on('data', chunk => { output = (output + chunk).slice(-100000) })
    child.stderr.on('data', chunk => { output = (output + chunk).slice(-100000) })
    const timer = setTimeout(() => child.kill('SIGTERM'), 240000)
    child.on('error', error => { clearTimeout(timer); reject(error) })
    child.on('close', code => { clearTimeout(timer); code === 0 ? resolve(output) : reject(Object.assign(new Error(`结构采集命令失败（${code ?? '超时'}）`), { output })) })
  })
}

// Parse simple local assignments without evaluating shell code. Credentials never reach the browser.
export function parseEnv(text) {
  const result = {}
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?(RHN_ORACLE_(?:URL|USER|PASSWORD))\s*=\s*(.*?)\s*$/)
    if (!match) continue
    let value = match[2]
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1)
    else value = value.replace(/\s+#.*$/, '')
    result[match[1]] = value
  }
  return result
}

export async function inputFingerprint(root) {
  const inputs = ['docs/foundation/rhn-physical-schema-map.json', 'scripts/schema-workbench/SchemaSnapshot.java',
    'backend/rhn-analytics/src/main/resources/semantic/outpatient-ontology.v1.yaml']
  for (const folder of ['migration', 'local', 'h2', 'oracle']) {
    const directory = `backend/src/main/resources/db/${folder}`
    for (const file of (await fs.readdir(path.join(root, directory))).filter(name => name.endsWith('.sql')).sort()) inputs.push(`${directory}/${file}`)
  }
  const hash = crypto.createHash('sha256')
  for (const file of inputs) hash.update(file).update(await fs.readFile(path.join(root, file)))
  return hash.digest('hex')
}

async function runtimeClasspath(root) {
  const jar = path.join(root, 'backend/rhn-app/target/rhn-application-0.1.0-SNAPSHOT.jar')
  try { await fs.access(jar) } catch { throw new Error('请先在 backend 执行 mvn -DskipTests package，准备项目已锁定的 JDBC / Flyway 依赖。') }
  const jarDigest = digest(await fs.readFile(jar)).slice(0, 20)
  const directory = path.join(root, '.runtime/schema-workbench/dependencies', jarDigest)
  const marker = path.join(directory, '.ready')
  try { await fs.access(marker) } catch {
    await fs.mkdir(directory, { recursive: true })
    await run('jar', ['xf', jar, 'BOOT-INF/lib'], { cwd: directory })
    await fs.writeFile(marker, '')
  }
  return path.join(directory, 'BOOT-INF/lib/*')
}

export async function captureSnapshot(root, mode) {
  if (!['expected', 'oracle'].includes(mode)) throw new Error('未知结构来源')
  const classpath = await runtimeClasspath(root)
  const directory = path.join(root, '.runtime/schema-workbench')
  const file = path.join(directory, `${mode}.json`)
  const temporary = `${file}.${crypto.randomUUID()}.tmp`
  let env = { ...process.env }
  if (mode === 'oracle') {
    try { env = { ...parseEnv(await fs.readFile(process.env.RHN_ORACLE_ENV_FILE || path.join(root, '.env.oracle.local'), 'utf8')), ...env } }
    catch (error) { if (error.code !== 'ENOENT') throw error }
    if (!['RHN_ORACLE_URL', 'RHN_ORACLE_USER', 'RHN_ORACLE_PASSWORD'].every(key => env[key])) throw new Error('Oracle 开发连接未配置，请配置 .env.oracle.local 或 RHN_ORACLE_* 环境变量。')
  }
  const before = await inputFingerprint(root)
  try {
    await run('java', [`-Dspring.profiles.active=${mode === 'expected' ? 'test' : 'oracle-local'}`, '--class-path', classpath,
      path.join(root, 'scripts/schema-workbench/SchemaSnapshot.java'), mode, root, temporary], { cwd: root, env })
    if (before !== await inputFingerprint(root)) throw new Error('采集期间迁移或目录发生变化，请重新刷新结构。')
    const snapshot = await readJson(temporary)
    snapshot.inputFingerprint = before
    const previous = await readJson(file)
    const previousFile = path.join(directory, `previous-${mode}.json`)
    if (previous?.formatVersion === snapshot.formatVersion) await atomicJson(previousFile, previous)
    else await fs.rm(previousFile, { force: true }) // Collector upgrades must not appear as database changes.
    await atomicJson(file, snapshot)
    return snapshot
  } catch (error) {
    // Driver errors can contain connection details; persist neither credentials nor raw errors.
    throw new Error(error.output ? `结构采集失败，请检查数据库连接、JDK 与迁移兼容性。${mode === 'expected' ? '\n' + error.output.slice(-5000) : ''}` : error.message)
  } finally { await fs.rm(temporary, { force: true }) }
}
