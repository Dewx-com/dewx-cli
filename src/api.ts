// The dewx.ai API client. Our API is an MCP server (JSON-RPC 2.0 over HTTPS, one message per POST), so the CLI and
// the local MCP proxy speak the same protocol to the same endpoint. Every action runs on our server, through the same
// safety checks as the app: this client cannot skip them, because it only asks.
import { readFileSync } from 'node:fs'
import { redact } from './redact.js'

export const DEFAULT_URL = 'https://dewx.ai/api/mcp'
export const PROTOCOL = '2025-06-18'
/** From package.json (two folders up from dist/src), so a release only bumps one place. */
export const VERSION: string = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')).version

/** Exit codes, documented in the README. */
export const EXIT = { ok: 0, error: 1, usage: 2, auth: 3, refused: 4, rate: 5 } as const

export class DewxError extends Error {
  constructor(message: string, readonly exit: number = EXIT.error) { super(redact(message)) }
}

export type Fetch = typeof fetch
export type ClientOptions = {
  token: string
  url?: string
  fetch?: Fetch
  debug?: (line: string) => void
  sleep?: (ms: number) => Promise<void>
  /** How many times to wait and retry after "too many calls". */
  retries?: number
}

type RpcResponse = { jsonrpc: '2.0', id: unknown, result?: any, error?: { code: number, message: string, data?: any } }
export type ToolInfo = { name: string, description?: string, annotations?: { readOnlyHint?: boolean } }

export class Client {
  readonly url: string
  private n = 0
  private readonly f: Fetch
  private readonly sleep: (ms: number) => Promise<void>

  constructor(private readonly o: ClientOptions) {
    this.url = o.url ?? DEFAULT_URL
    this.f = o.fetch ?? fetch
    this.sleep = o.sleep ?? (ms => new Promise(r => setTimeout(r, ms)))
  }

  /** POST one JSON-RPC message; returns the HTTP status and the parsed body (null for 202). Retries on 429. */
  async post(message: unknown): Promise<{ status: number, body: RpcResponse | null }> {
    const retries = this.o.retries ?? 2
    for (let attempt = 0; ; attempt++) {
      let res: Response
      try {
        res = await this.f(this.url, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            accept: 'application/json, text/event-stream',
            authorization: `Bearer ${this.o.token}`,
            'mcp-protocol-version': PROTOCOL,
            'user-agent': `dewx-cli/${VERSION}`,
          },
          body: JSON.stringify(message),
        })
      } catch (e) {
        throw new DewxError(`Could not reach ${new URL(this.url).host}. Check your internet connection. (${(e as Error).message})`)
      }
      this.o.debug?.(`POST ${this.url} ${(message as any)?.method ?? ''} ${(message as any)?.params?.name ?? ''} -> ${res.status}`)
      if (res.status === 429 && attempt < retries) {
        const wait = Math.min(60, Number(res.headers.get('retry-after')) || 5)
        this.o.debug?.(`too many calls, waiting ${wait}s`)
        await this.sleep(wait * 1000)
        continue
      }
      if (res.status === 202) return { status: 202, body: null }
      const text = await res.text()
      let body: RpcResponse | null = null
      try { body = text ? JSON.parse(text) : null } catch { /* not JSON: handled below */ }
      if (res.status === 401) throw new DewxError('Your token was not accepted. It may be revoked or mistyped. Run: dewx login', EXIT.auth)
      if (res.status === 403) throw new DewxError(`dewx.ai refused this call: ${messageOf(body, text)}`, EXIT.auth)
      if (res.status === 429) throw new DewxError('Too many calls for this token (60 a minute, 1,000 a day). Wait a minute and try again.', EXIT.rate)
      if (res.status >= 500) throw new DewxError(`dewx.ai had a problem (HTTP ${res.status}). Try again in a minute.`)
      if (!body) throw new DewxError(`Unexpected answer from dewx.ai (HTTP ${res.status}).`)
      return { status: res.status, body }
    }
  }

  /** One JSON-RPC call; returns its result or throws its error in plain words. */
  async rpc(method: string, params?: unknown): Promise<any> {
    const { body } = await this.post({ jsonrpc: '2.0', id: ++this.n, method, ...(params === undefined ? {} : { params }) })
    if (body?.error) throw new DewxError(body.error.message)
    return body?.result
  }

  async tools(): Promise<ToolInfo[]> {
    return (await this.rpc('tools/list')).tools ?? []
  }

  /** Call one tool. A refusal (the safety guard, a cap, a missing LinkedIn) throws with the server's own words. */
  async tool<T = any>(name: string, args: Record<string, unknown> = {}): Promise<T> {
    const r = await this.rpc('tools/call', { name, arguments: args })
    const text = (r?.content ?? []).filter((c: any) => c?.type === 'text').map((c: any) => c.text).join('\n')
    if (r?.isError) throw new DewxError(text || 'dewx.ai refused this action.', EXIT.refused)
    if (r?.structuredContent !== undefined) return r.structuredContent
    try { return JSON.parse(text) } catch { return text as T }
  }
}

const messageOf = (body: any, text: string) => body?.error?.message ?? body?.message ?? (text.slice(0, 200) || 'no reason given')
