// `dewx mcp`: a local MCP server on stdio for Claude Desktop, Claude Code, Cursor and any other MCP client.
// It forwards each JSON-RPC message to dewx.ai with your token from the keychain, so the token never sits in a
// client's config file. It adds nothing and removes nothing: the tools, their checks and their refusals are the
// server's own. stdout carries only JSON-RPC; anything else goes to stderr.
import { createInterface } from 'node:readline'
import { Client, DewxError } from './api.js'
import { redact } from './redact.js'

type Out = { write(s: string): unknown }

/** Handle one line from the client. Returns the reply line to write, or null when nothing is owed. */
export async function handleLine(client: Client, line: string): Promise<string | null> {
  if (!line.trim()) return null
  let m: any
  try { m = JSON.parse(line) } catch { return reply({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }) }
  if (Array.isArray(m)) return reply({ jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Send one JSON-RPC message at a time (no batches).' } })
  if (!m || typeof m !== 'object' || typeof m.method !== 'string') return null // a response or junk: the server never asks the client anything
  if (m.id === undefined || m.id === null) return null // a notification: the server is stateless, nothing to forward
  if (m.method === 'ping') return reply({ jsonrpc: '2.0', id: m.id, result: {} })
  try {
    const { body } = await client.post(m)
    return body ? reply(body) : null
  } catch (e) {
    const message = e instanceof DewxError ? e.message : redact(String((e as Error)?.message ?? e))
    return reply({ jsonrpc: '2.0', id: m.id, error: { code: -32000, message } })
  }
}

const reply = (v: unknown) => JSON.stringify(v)

/** Run the proxy until stdin closes. */
export function serve(client: Client, input: NodeJS.ReadableStream = process.stdin, out: Out = process.stdout): Promise<void> {
  const rl = createInterface({ input, crlfDelay: Infinity })
  const pending = new Set<Promise<void>>()
  rl.on('line', line => {
    const p = handleLine(client, line).then(r => { if (r) out.write(r + '\n') }).finally(() => pending.delete(p))
    pending.add(p)
  })
  return new Promise(resolve => rl.on('close', () => { Promise.allSettled([...pending]).then(() => resolve()) }))
}

/** Copy-paste config for the common clients. */
export function configSnippets(profile: string): string {
  const env = profile === 'default' ? '' : `, "env": { "DEWX_PROFILE": "${profile}" }`
  const envFlag = profile === 'default' ? '' : ` -e DEWX_PROFILE=${profile}`
  return `Claude Code (one line):
  claude mcp add dewx${envFlag} -- npx -y dewx mcp

Claude Desktop (Settings, Developer, Edit Config: claude_desktop_config.json), then restart Claude:
  {
    "mcpServers": {
      "dewx": { "command": "npx", "args": ["-y", "dewx", "mcp"]${env} }
    }
  }

Cursor (~/.cursor/mcp.json) and most other clients take the same "mcpServers" block.

No install at all? Connect straight to the remote server with your token in a header:
  claude mcp add --transport http dewx https://dewx.ai/api/mcp --header "Authorization: Bearer <your dxm_ token>"
  (The local way above keeps the token in your keychain instead of a config file.)`
}
