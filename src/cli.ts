#!/usr/bin/env node
// dewx: run your dewx.ai LinkedIn campaign from the terminal. No telemetry: the only network call this program makes
// is to the dewx.ai API you are logged in to, and only when a command needs it.
import { readFileSync, realpathSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { Client, DewxError, EXIT, VERSION, type Fetch } from './api.js'
import { UsageError, parse } from './args.js'
import { COMMANDS, type Io } from './commands.js'

export type Deps = { io: Io, store: Store, fetch?: Fetch, sleep?: (ms: number) => Promise<void> }
import { redact } from './redact.js'
import { Store } from './store.js'

const HELP = `dewx ${VERSION}: run your dewx.ai LinkedIn campaign from the terminal.

Start here:
  dewx login                      paste your token (Settings, MCP tokens, in the app)
  dewx campaigns                  see your campaign
  dewx campaigns start            start it (asks first)

Commands:
${Object.entries(COMMANDS).map(([n, c]) => `  ${n.padEnd(12)} ${c.summary}`).join('\n')}

Options for every command:
  --json          print JSON (for scripts)
  --yes, -y       do not ask before a change (for scripts)
  --dry-run       show what a change would do, change nothing
  --profile <n>   use another saved workspace
  --debug         show each API call (tokens are hidden)

Help for one command: dewx <command> --help
Every action runs on dewx.ai through the same safety checks as the app. No telemetry.`

export async function main(argv: readonly string[], deps: Deps): Promise<number> {
  const { io } = deps
  try {
    const { args, flags } = parse(argv)
    if (flags.version) { io.out(VERSION); return EXIT.ok }
    const [name, ...rest] = args
    if (!name || name === 'help') {
      const topic = rest[0] && COMMANDS[rest[0]]
      io.out(topic ? `${topic.usage}\n\n${topic.summary}` : HELP)
      return EXIT.ok
    }
    const cmd = COMMANDS[name]
    if (!cmd) throw new UsageError(`unknown command "${name}". Run: dewx help`)
    if (flags.help) { io.out(`${cmd.usage}\n\n${cmd.summary}`); return EXIT.ok }
    const profile = deps.store.profileName(typeof flags.profile === 'string' ? flags.profile : undefined)
    const debug = flags.debug === true ? (l: string) => io.err('[debug] ' + redact(l)) : undefined
    const client = (token: string, url?: string) => new Client({ token, url, debug, fetch: deps.fetch, sleep: deps.sleep })
    await cmd.run({ io, store: deps.store, client, args: rest, flags, profile })
    return EXIT.ok
  } catch (e) {
    if (e instanceof UsageError) { io.err(`dewx: ${e.message}`); return EXIT.usage }
    if (e instanceof DewxError) { io.err(`dewx: ${e.message}`); return e.exit }
    io.err(`dewx: unexpected error: ${redact(String((e as Error)?.stack ?? e))}`)
    return EXIT.error
  }
}

// ---------- the real terminal ----------
function ask(q: string, hidden: boolean): Promise<string> {
  return new Promise((resolve, reject) => {
    const stdin = process.stdin
    process.stderr.write(q)
    if (!hidden || !stdin.isTTY) {
      stdin.resume(); stdin.setEncoding('utf8')
      stdin.once('data', d => { stdin.pause(); resolve(String(d).split(/\r?\n/)[0]) })
      return
    }
    let value = ''
    stdin.setRawMode(true); stdin.resume(); stdin.setEncoding('utf8')
    const done = (err?: Error) => { stdin.setRawMode(false); stdin.pause(); stdin.off('data', onData); process.stderr.write('\n'); err ? reject(err) : resolve(value) }
    const onData = (chunk: string) => {
      for (const ch of chunk) {
        if (ch === '\r' || ch === '\n') return done()
        if (ch === '\u0003') return done(new DewxError('Cancelled.', EXIT.usage))
        if (ch === '\u007f' || ch === '\b') value = value.slice(0, -1)
        else if (ch >= ' ') value += ch
      }
    }
    stdin.on('data', onData)
  })
}

async function readStdin(): Promise<string> {
  let s = ''
  for await (const chunk of process.stdin) s += chunk
  return s
}

export const nodeIo: Io = {
  out: s => { process.stdout.write(redact(s) + '\n') },
  err: s => { process.stderr.write(redact(s) + '\n') },
  isTTY: !!process.stdin.isTTY,
  ask: q => ask(q, false),
  askSecret: q => ask(q, true),
  readStdin,
  readFile: p => readFileSync(p, 'utf8'),
}

// Run when called as a program (also through the npm bin symlink), not when imported by the tests.
const self = fileURLToPath(import.meta.url)
const invoked = (() => { try { return realpathSync(process.argv[1] ?? '') } catch { return '' } })()
if (invoked === self) {
  main(process.argv.slice(2), { io: nodeIo, store: new Store() })
    .then(code => { process.exitCode = code })
}
