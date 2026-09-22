import { createService } from './service.mjs'
import { fileURLToPath } from 'node:url'

export function allowedRequest(request) {
  const address = request.socket.remoteAddress
  if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(address)) return false
  if (!/^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(request.headers.host ?? '')) return false
  if (request.headers['x-rhn-dev-workbench'] !== '1') return false
  const origin = request.headers.origin
  if (!origin) return true // Local CLI clients still require the explicit header.
  try { const url = new URL(origin); return ['http:', 'https:'].includes(url.protocol) && url.host === request.headers.host }
  catch { return false }
}

async function body(request) {
  if (!request.headers['content-type']?.startsWith('application/json')) throw Object.assign(new Error('需要 JSON 请求'), { status: 415 })
  const chunks = []; let size = 0
  for await (const chunk of request) {
    size += chunk.length
    if (size > 256000) throw Object.assign(new Error('请求过大'), { status: 413 })
    chunks.push(chunk)
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')) } catch { throw Object.assign(new Error('JSON 格式不正确'), { status: 400 }) }
}

export function schemaWorkbenchPlugin(root = fileURLToPath(new URL('../..', import.meta.url))) {
  const service = createService(root)
  return {
    name: 'rhn-development-schema-workbench', apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__dev/schema', async (request, response) => {
        response.setHeader('Cache-Control', 'no-store')
        response.setHeader('Content-Type', 'application/json; charset=utf-8')
        response.setHeader('X-Content-Type-Options', 'nosniff')
        const send = (code, value) => { response.statusCode = code; response.end(JSON.stringify(value)) }
        if (!allowedRequest(request)) { send(403, { message: '工作台仅允许本机开发请求，请使用 localhost 打开。' }); return }
        try {
          const url = new URL(request.url ?? '/', 'http://localhost'), route = url.pathname, method = request.method
          if (method === 'GET' && route === '/catalog') return send(200, await service.catalog())
          if (method === 'GET' && route === '/job') return send(200, service.job())
          if (method === 'GET' && route === '/document') return send(200, await service.document(url.searchParams.get('id')))
          if (method === 'GET' && route === '/actual') return send(200, await service.actualTable(url.searchParams.get('table')))
          if (method === 'GET' && route === '/context') return send(200, { markdown: await service.context({ table: url.searchParams.get('table'), domain: url.searchParams.get('domain') }) })
          if (method === 'POST' && route === '/refresh') { const result = await service.refresh((await body(request)).mode); return send(202, result.job) }
          if (method === 'POST' && route === '/export') { await body(request); return send(200, await service.exportCatalog()) }
          if (method === 'PUT' && route === '/annotation') { const value = await body(request); return send(200, await service.saveAnnotation(value.table, value.annotation, value.expectedRevision)) }
          if (method === 'POST' && route === '/proposals') return send(201, await service.saveProposal(await body(request)))
          if (method === 'PUT' && route === '/proposals') { const value = await body(request); return send(200, await service.reviewProposal(value.id, value)) }
          return send(404, { message: '工作台接口不存在' })
        } catch (error) { send(error.status ?? 500, { message: error.status ? error.message : '读取工作区资料失败，请检查本地文件或重新刷新结构。' }) }
      })
    },
  }
}
