import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PassThrough } from 'node:stream'
import { Client } from '../src/api.js'
import { handleLine, serve } from '../src/mcp.js'
import { mockApi, TOKEN } from './mock.js'

test('requests are forwarded with the token; answers come back unchanged', async () => {
  const m = mockApi({ list_campaigns: () => [{ status: 'draft' }] })
  const c = new Client({ token: TOKEN, fetch: m.fetch })
  const r = JSON.parse((await handleLine(c, JSON.stringify({ jsonrpc: '2.0', id: 7, method: 'tools/call', params: { name: 'list_campaigns', arguments: {} } })))!)
  assert.equal(r.id, 7)
  assert.match(r.result.content[0].text, /draft/)
  assert.equal(m.seen[0].auth, `Bearer ${TOKEN}`)
})

test('notifications and ping never reach the server', async () => {
  const m = mockApi({})
  const c = new Client({ token: TOKEN, fetch: m.fetch })
  assert.equal(await handleLine(c, '{"jsonrpc":"2.0","method":"notifications/initialized"}'), null)
  assert.deepEqual(JSON.parse((await handleLine(c, '{"jsonrpc":"2.0","id":1,"method":"ping"}'))!), { jsonrpc: '2.0', id: 1, result: {} })
  assert.equal(m.seen.length, 0)
})

test('bad JSON, batches and a dead token become JSON-RPC errors', async () => {
  const c = new Client({ token: 'dxm_' + 'Z'.repeat(43), fetch: mockApi({}).fetch })
  assert.equal(JSON.parse((await handleLine(c, '{nope'))!).error.code, -32700)
  assert.equal(JSON.parse((await handleLine(c, '[]'))!).error.code, -32600)
  const r = JSON.parse((await handleLine(c, '{"jsonrpc":"2.0","id":2,"method":"tools/list"}'))!)
  assert.equal(r.id, 2)
  assert.match(r.error.message, /dewx login/)
})

test('serve: one line in, one line out, only JSON on stdout', async () => {
  const m = mockApi({})
  const input = new PassThrough(), lines: string[] = []
  const done = serve(new Client({ token: TOKEN, fetch: m.fetch }), input, { write: s => lines.push(s) })
  input.write('{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}\n{"jsonrpc":"2.0","method":"notifications/initialized"}\n{"jsonrpc":"2.0","id":2,"method":"tools/list"}\n')
  input.end()
  await done
  assert.equal(lines.length, 2)
  for (const l of lines) { assert.ok(l.endsWith('\n')); JSON.parse(l) }
})
