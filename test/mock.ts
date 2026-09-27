// A fake dewx.ai MCP server for tests: answers tools/list and tools/call from a table, and records every request.
import type { Fetch } from '../src/api.js'

export const TOKEN = 'dxm_' + 'A'.repeat(43)
export type Seen = { auth: string | null, body: any }

const TOOLS = [
  { name: 'list_campaigns', annotations: { readOnlyHint: true } },
  { name: 'start_campaign', annotations: { readOnlyHint: false } },
]

export function mockApi(tools: Record<string, (args: any) => unknown>, opts: { status?: number, readOnly?: boolean, headers?: Record<string, string> } = {}) {
  const seen: Seen[] = []
  const fetch: Fetch = (async (_url: any, init: any) => {
    const body = JSON.parse(init.body)
    seen.push({ auth: init.headers.authorization ?? null, body })
    if (opts.status) return new Response(JSON.stringify({ error: { code: 'x', message: 'nope' } }), { status: opts.status, headers: opts.headers })
    if (init.headers.authorization !== `Bearer ${TOKEN}`) return new Response('{"error":{"code":"unauthorized"}}', { status: 401 })
    const ok = (result: unknown) => new Response(JSON.stringify({ jsonrpc: '2.0', id: body.id, result }), { status: 200 })
    if (body.method === 'tools/list') return ok({ tools: opts.readOnly ? TOOLS.slice(0, 1) : TOOLS })
    if (body.method === 'initialize') return ok({ protocolVersion: '2025-06-18', serverInfo: { name: 'dewx' } })
    if (body.method === 'tools/call') {
      const run = tools[body.params.name]
      if (!run) return new Response(JSON.stringify({ jsonrpc: '2.0', id: body.id, error: { code: -32602, message: 'Unknown tool' } }), { status: 200 })
      try {
        const r = run(body.params.arguments)
        return ok({ content: [{ type: 'text', text: JSON.stringify(r) }], ...(r && typeof r === 'object' && !Array.isArray(r) ? { structuredContent: r } : {}) })
      } catch (e) {
        return ok({ isError: true, content: [{ type: 'text', text: (e as Error).message }] })
      }
    }
    return new Response(JSON.stringify({ jsonrpc: '2.0', id: body.id, error: { code: -32601, message: 'Method not found' } }), { status: 200 })
  }) as Fetch
  return { fetch, seen, calls: () => seen.filter(s => s.body.method === 'tools/call').map(s => s.body.params) }
}
