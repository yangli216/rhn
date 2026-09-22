import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createService } from './service.mjs'
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const service = createService(root)
const [command = 'check', ...args] = process.argv.slice(2)
const option = name => { const index = args.indexOf(name); return index < 0 ? undefined : args[index + 1] }
try {
  if (command === 'refresh') {
    const { completion } = await service.refresh(option('--source') ?? 'all')
    await completion
    const job = service.job()
    console.log(job.message)
    if (job.status === 'failed') process.exitCode = 1
  } else if (command === 'context') {
    console.log(await service.context({ table: option('--table'), domain: option('--domain') }))
  } else if (command === 'export') console.log(await service.exportCatalog())
  else if (command === 'check') {
    const data = await service.catalog()
    const errors = data.issues.filter(i => i.severity === 'error')
    console.log(JSON.stringify({ tables: data.tables.length, relationships: data.relations.length, entities: data.semantic.nodes.length,
      structureAvailable: Boolean(data.expected), stale: data.stale, errors, warnings: data.issues.filter(i => i.severity === 'warning').length }, null, 2))
    if (!data.expected || data.stale || errors.length) process.exitCode = 1
  } else throw new Error('命令支持 refresh、context、export、check')
} catch (error) { console.error(error.message); process.exitCode = 1 }
