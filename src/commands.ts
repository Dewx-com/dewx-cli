// Every dewx command. Each one maps to one or more tools on the dewx.ai MCP server; nothing here sends, writes or
// decides on its own. Writes show what they will do first and ask, unless --yes.
import { Client, DewxError, EXIT, VERSION } from './api.js'
import { Flags, UsageError, int, list, str } from './args.js'
import { leadsFromCsv, type Lead } from './csv.js'
import { configSnippets, serve } from './mcp.js'
import { Store, TOKEN_RE } from './store.js'
import { cpSync, existsSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { redact } from './redact.js'

export type Io = {
  out(s: string): void
  err(s: string): void
  /** stdin is a terminal we can ask questions on */
  isTTY: boolean
  ask(q: string): Promise<string>
  askSecret(q: string): Promise<string>
  readStdin(): Promise<string>
  readFile(path: string): string
}
export type Ctx = { io: Io, store: Store, client(token: string, url?: string): Client, args: string[], flags: Flags, profile: string }

type Command = { usage: string, summary: string, write?: boolean, run(c: Ctx): Promise<void> }

// ---------- helpers ----------
const json = (c: Ctx) => c.flags.json === true
/** Print data: JSON with --json, else the human view. */
function show(c: Ctx, data: unknown, human: () => string) {
  c.io.out(json(c) ? JSON.stringify(data, null, 2) : human())
}

function api(c: Ctx): Client {
  const token = c.store.token(c.profile)
  if (!token) throw new DewxError(`You are not logged in${c.profile === 'default' ? '' : ` (profile ${c.profile})`}. Run: dewx login`, EXIT.auth)
  const url = c.store.config().profiles[c.profile]?.url
  return c.client(token, url)
}

/** Show what a write will do, then ask. Returns false on --dry-run or "no". */
async function confirm(c: Ctx, what: string[]): Promise<boolean> {
  c.io.err(['This will:', ...what.map(l => `  - ${l}`)].join('\n'))
  if (c.flags['dry-run'] === true) { c.io.err('Dry run: nothing was changed.'); return false }
  if (c.flags.yes === true) return true
  if (!c.io.isTTY) throw new DewxError('This changes your account. Add --yes to go ahead (there is no terminal to ask in).', EXIT.usage)
  const a = (await c.io.ask('Go ahead? [y/N] ')).trim().toLowerCase()
  if (a === 'y' || a === 'yes') return true
  c.io.err('Stopped. Nothing was changed.')
  return false
}

const need = (v: string | undefined, what: string) => { if (!v?.trim()) throw new UsageError(`${what} is required`); return v.trim() }
const cut = (s: unknown, n: number) => { const t = String(s ?? '').replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n - 1) + '…' : t }
const quote = (s: string) => `"${cut(s, 70)}"`

/** A plain text table. */
export function table(rows: Record<string, unknown>[], cols: [key: string, title: string, width?: number][]): string {
  if (!rows.length) return '(none)'
  const cells = rows.map(r => cols.map(([k, , w]) => cut(r[k] ?? '', w ?? 40)))
  const widths = cols.map(([, t], i) => Math.max(t.length, ...cells.map(r => r[i].length)))
  const line = (vals: string[]) => vals.map((v, i) => v.padEnd(widths[i])).join('  ').trimEnd()
  return [line(cols.map(([, t]) => t.toUpperCase())), ...cells.map(line)].join('\n')
}

const MAX_ROWS = 50
function more(total: number) { return total > MAX_ROWS ? `\n…and ${total - MAX_ROWS} more. Use --json to see all.` : '' }

// ---------- the commands ----------
export const COMMANDS: Record<string, Command> = {
  login: {
    usage: 'dewx login [--profile <name>] [--file]',
    summary: 'Save your dewx token (from Settings in the app). Stored in your keychain.',
    async run(c) {
      let token = str(c.flags, 'token')
      if (token) c.io.err('Tip: --token puts the token in your shell history. Next time, run `dewx login` and paste it.')
      else if (!c.io.isTTY) token = (await c.io.readStdin()).trim()
      else {
        c.io.err('Make a token in the app: Settings, MCP tokens, New token. Pick Write to run campaigns.')
        token = (await c.io.askSecret('Paste your token (it stays hidden): ')).trim()
      }
      if (!TOKEN_RE.test(token)) throw new DewxError('That does not look like a dewx token. It starts with dxm_ and is about 47 characters.', EXIT.usage)
      const url = str(c.flags, 'api-url')
      const tools = await c.client(token, url).tools() // proves the token works before we keep it
      const scope = tools.some(t => t.annotations?.readOnlyHint === false) ? 'write' : 'read'
      const where = c.store.save(c.profile, token, { forceFile: c.flags.file === true, scope, url })
      const place = where === 'keychain' ? 'your keychain' : `${c.store.dir}/credentials.json (only you can read it)`
      c.io.err(`Logged in as profile "${c.profile}" with a ${scope} token (${redact(token)}). Saved in ${place}.`)
      if (scope === 'read') c.io.err('This token can only look. To start campaigns or reply, make a Write token and log in again.')
      c.io.err('Next: dewx campaigns')
    },
  },

  logout: {
    usage: 'dewx logout [--profile <name>]',
    summary: 'Forget the token on this computer. (To kill it everywhere, revoke it in Settings.)',
    async run(c) {
      const had = c.store.remove(c.profile)
      c.io.err(had ? `Removed profile "${c.profile}" from this computer. Revoke the token in Settings too if you will not use it again.` : `No profile "${c.profile}" here.`)
    },
  },

  whoami: {
    usage: 'dewx whoami',
    summary: 'Which workspace token you are using, and what it may do.',
    async run(c) {
      const client = api(c)
      const [tools, stats] = await Promise.all([client.tools(), client.tool('get_stats')])
      const p = c.store.config().profiles[c.profile]
      const scope = tools.some(t => t.annotations?.readOnlyHint === false) ? 'write' : 'read'
      const data = { profile: c.profile, token: redact(c.store.token(c.profile) ?? ''), fromEnv: c.store.fromEnv,
        storedIn: p?.where ?? null, scope, api: client.url, mode: stats.mode, linkedin: stats.linkedin?.status ?? null }
      show(c, data, () => [
        `Profile:  ${data.profile}${data.fromEnv ? ' (token from DEWX_TOKEN)' : ''}`,
        `Token:    ${data.token} (${scope === 'write' ? 'can read and change' : 'read only'})`,
        `Stored:   ${data.fromEnv ? 'environment' : data.storedIn ?? 'unknown'}`,
        `Dew:      ${data.mode === 'dew' ? 'on (Dew runs it)' : 'off (you run it)'}`,
        `LinkedIn: ${li({ linkedin: { status: data.linkedin } })}`,
      ].join('\n'))
    },
  },

  workspaces: {
    usage: 'dewx workspaces [use <profile>]',
    summary: 'Your saved workspaces. One token is one workspace; log in once per workspace with --profile.',
    async run(c) {
      const cfg = c.store.config()
      if (c.args[0] === 'use') {
        const name = need(c.args[1], 'the profile name')
        if (!cfg.profiles[name]) throw new DewxError(`No profile "${name}". Run: dewx login --profile ${name}`, EXIT.usage)
        c.store.saveConfig({ ...cfg, current: name })
        return c.io.err(`Now using "${name}".`)
      }
      const rows = Object.entries(cfg.profiles).map(([name, p]) => ({ name, current: name === cfg.current ? '*' : '', ...p, prefix: redact(p.prefix + 'xxxx') }))
      show(c, rows, () => rows.length
        ? table(rows, [['current', ' '], ['name', 'profile'], ['prefix', 'token'], ['scope', 'can'], ['where', 'stored']]) +
          '\n\nSwitch: dewx workspaces use <profile>. Add one: dewx login --profile <name>'
        : 'No workspaces yet. Run: dewx login')
    },
  },

  accounts: {
    usage: 'dewx accounts',
    summary: 'Your LinkedIn account: connected or not, and what it used today.',
    async run(c) {
      const s = await api(c).tool('get_stats')
      const data = { linkedin: s.linkedin ?? null, canSend: s.canSend, paused: s.paused }
      show(c, data, () => [
        `LinkedIn: ${li(s)}`,
        `Used today: ${fmt(s.linkedin?.usedToday)}`,
        `Can send: ${s.canSend === false ? 'no' : 'yes'}`, ...(s.paused ? ['Account: paused (start it again in the app)'] : []),
        'Connect or add LinkedIn accounts in the app: Settings, LinkedIn.',
      ].join('\n'))
    },
  },

  campaigns: {
    usage: 'dewx campaigns [list | create | start | pause]',
    summary: 'See, set up, start or pause your campaign (one per workspace).',
    async run(c) {
      const sub = c.args[0] ?? 'list'
      if (sub === 'list') {
        const list = await api(c).tool<any[]>('list_campaigns')
        return show(c, list, () => list.map(k => [
          `Campaign: ${k.name}  [${k.status}]`,
          `Leads: ${k.leads}   Needs you: ${fmt(k.needsYou)}   Sent today: ${fmt(k.sentToday)}`,
          `Messages: ${Object.entries(k.messages ?? {}).map(([a, b]) => `${b} ${a}`).join(', ')}`,
          `Sequence: ${k.sequence?.summary ?? '(not set)'}`,
        ].join('\n')).join('\n\n'))
      }
      if (sub === 'create') {
        const preset = str(c.flags, 'preset'), stepsFile = str(c.flags, 'steps')
        const templates = templatesFrom(c)
        const args: Record<string, unknown> = {}
        if (preset) args.preset = preset
        if (stepsFile) args.steps = readJson(c, stepsFile)
        if (Object.keys(templates).length) args.templates = templates
        if (!Object.keys(args).length) throw new UsageError('give --preset (service-founder, saas-founder or coach), --steps <file.json>, or templates (--note, --m1, --m2)')
        if (!await confirm(c, [
          ...(preset ? [`Use the "${preset}" sequence`] : []), ...(stepsFile ? [`Use your own steps from ${stepsFile}`] : []),
          ...Object.entries(templates).map(([k, v]) => `Save template ${k}: ${quote(v)}`), 'It will NOT start the campaign.'])) return
        const r = await api(c).tool('create_campaign', args)
        return show(c, r, () => 'Campaign set up. Next: add leads (dewx leads add, import or salesnav), then dewx campaigns start')
      }
      if (sub === 'start') {
        if (!await confirm(c, ['Start your campaign: invites and messages go out from your LinkedIn, inside its daily limits ' +
          'and office hours, through the dewx.ai safety checks'])) return
        const r = await api(c).tool('start_campaign').catch(e => {
          if (/approve/i.test(e.message)) e.message += '\nSee them: dewx messages. Approve: dewx messages approve --all. Then run this again.'
          throw e
        })
        return show(c, r, () => `Campaign is ${r.status}. Pause any time: dewx campaigns pause`)
      }
      if (sub === 'pause') {
        if (!await confirm(c, ['Pause your campaign. Nothing new goes out until you start it again.'])) return
        const r = await api(c).tool('pause_campaign')
        return show(c, r, () => `Campaign is ${r.status}.`)
      }
      throw new UsageError(`unknown: campaigns ${sub}. Try: list, create, start, pause`)
    },
  },

  leads: {
    usage: 'dewx leads [list | add | import <file.csv> | salesnav <url>]',
    summary: 'See your leads, add them by hand, from a CSV, or from a Sales Navigator search link.',
    async run(c) {
      const sub = c.args[0] ?? 'list'
      if (sub === 'list') {
        const stage = str(c.flags, 'stage')
        const leads = await api(c).tool<any[]>('list_leads', stage ? { stage } : {})
        return show(c, leads, () => table(leads.slice(0, MAX_ROWS), [['name', 'name', 28], ['company', 'company', 24], ['country', 'country', 14],
          ['stage', 'stage', 16], ['fit', 'fit', 4]]) + more(leads.length))
      }
      if (sub === 'add') {
        const lead: Lead = { name: need(str(c.flags, 'name'), '--name'), company: need(str(c.flags, 'company'), '--company'),
          country: need(str(c.flags, 'country'), '--country'), title: str(c.flags, 'title') ?? '', linkedinUrl: str(c.flags, 'linkedin') ?? '' }
        if (!await confirm(c, [`Add ${lead.name} (${[lead.title, lead.company, lead.country].filter(Boolean).join(', ')}) to your leads`])) return
        return addLeads(c, [lead])
      }
      if (sub === 'import') {
        const file = need(c.args[1], 'the CSV file')
        const { leads, skipped, columns } = leadsFromCsv(c.io.readFile(file))
        if (!leads.length) throw new DewxError(`No leads found in ${file}. It needs a header row with a name column (or first and last name).`, EXIT.usage)
        const missing = ['company', 'country'].filter(k => !columns[k])
        if (!await confirm(c, [`Add ${leads.length} leads from ${file}${skipped ? ` (${skipped} rows without a name skipped)` : ''}`,
          `Columns used: ${Object.entries(columns).filter(([, v]) => v).map(([k, v]) => `${k}=${v}`).join(', ')}`,
          ...(missing.length ? [`No ${missing.join(' or ')} column: dewx.ai will refuse rows without them`] : []),
          `First: ${leads.slice(0, 3).map(l => `${l.name} (${l.company || '?'})`).join('; ')}`,
          'Duplicates, your never-contact list and people outside your countries are refused by dewx.ai, row by row'])) return
        return addLeads(c, leads)
      }
      if (sub === 'salesnav') {
        const url = need(c.args[1] ?? str(c.flags, 'url'), 'the Sales Navigator search link')
        const limit = int(c.flags, 'limit'), countries = list(str(c.flags, 'countries'))
        if (!await confirm(c, [`Pull up to ${limit ?? 'the default number of'} people from this search with your own LinkedIn account`,
          ...(countries?.length ? [`Keep only people in: ${countries.join(', ')}`] : []), 'It runs slowly in the background, inside LinkedIn limits'])) return
        const r = await api(c).tool('add_leads', { salesnav_url: url, ...(limit ? { limit } : {}), ...(countries?.length ? { countries } : {}) })
        const job = r?.salesnav?.jobId
        return show(c, r, () => job ? `Started. Check progress: dewx jobs ${job}` : 'Started.')
      }
      throw new UsageError(`unknown: leads ${sub}. Try: list, add, import, salesnav`)
    },
  },

  jobs: {
    usage: 'dewx jobs <id>',
    summary: 'How a background job is going (a Sales Navigator pull).',
    async run(c) {
      const r = await api(c).tool('get_job', { id: need(c.args[0], 'the job id') })
      show(c, r, () => [`Status: ${r.status}`, ...(r.error ? [`Error: ${r.error}`] : []), ...(r.result ? [`Result: ${JSON.stringify(r.result)}`] : [])].join('\n'))
    },
  },

  messages: {
    usage: 'dewx messages [list [--approved] | approve <id...> | approve --all | edit <id> <text> | skip <id...>]',
    summary: 'Drafts waiting for you: read them, approve, edit or skip. A campaign only sends approved messages.',
    async run(c) {
      const sub = c.args[0] ?? 'list'
      const waiting = async () => (await api(c).tool('list_messages', { limit: 200 })).messages as any[]
      if (sub === 'list') {
        const r = await api(c).tool('list_messages', { limit: 200, ...(c.flags.approved === true ? { status: 'approved' } : {}) })
        return show(c, r, () => r.messages.length ? [
          ...r.messages.slice(0, MAX_ROWS).map((m: any) => [`${m.id}  ${m.step}  ${m.lead?.name ?? ''} (${m.lead?.company ?? ''})`,
            ...String(m.text).split('\n').map((l: string) => `    ${l}`),
            ...(m.reasons?.length ? [`    ! ${m.reasons.join('; ')}`] : [])].join('\n')),
          `${r.total} ${c.flags.approved === true ? 'approved, not sent yet' : 'waiting for you'}.${more(r.total).replace('\n', ' ')}`,
          ...(c.flags.approved === true ? [] : ['Approve: dewx messages approve <id> (or --all for every clean one). Edit: dewx messages edit <id> "text"']),
        ].join('\n\n') : (c.flags.approved === true ? 'No approved messages waiting to send.' : 'Nothing waiting for you.'))
      }
      if (sub === 'approve') {
        let ids = c.args.slice(1)
        if (c.flags.all === true) ids = (await waiting()).filter(m => !m.reasons?.length).map(m => m.id)
        if (!ids.length) throw new UsageError(c.flags.all === true ? 'no clean drafts to approve' : 'give message ids, or --all')
        if (!await confirm(c, [`Approve ${ids.length} message${ids.length === 1 ? '' : 's'}${c.flags.all === true ? ' (every draft with no flagged rule)' : ''}`,
          'Approving sends nothing now: the campaign sends them when it runs, through the safety checks'])) return
        const r = await api(c).tool('approve_messages', { approve: ids.slice(0, 100) })
        return show(c, r, () => [`Approved ${r.approved.length}.`, ...r.refused.map((x: any) => `  not approved: ${x.id}: ${x.reasons.join('; ')}`),
          ...(ids.length > 100 ? ['Only the first 100 were sent. Run it again for the rest.'] : [])].join('\n'))
      }
      if (sub === 'edit') {
        const id = need(c.args[1], 'the message id')
        const text = need(str(c.flags, 'text') ?? c.args.slice(2).join(' '), 'the new text').replace(/\\n/g, '\n')
        if (!await confirm(c, [`Change message ${id} to:`, `"${text}"`, 'It is checked again and approved only if it passes'])) return
        const r = await api(c).tool('approve_messages', { edit: [{ id, text }] })
        const e = r.edited?.[0]
        return show(c, r, () => r.refused?.length ? `Not changed: ${r.refused[0].reasons.join('; ')}`
          : e?.approved ? 'Saved and approved.' : `Saved, not approved: ${(e?.reasons ?? []).join('; ')}`)
      }
      if (sub === 'skip') {
        const ids = c.args.slice(1)
        if (!ids.length) throw new UsageError('give message ids')
        if (!await confirm(c, [`Hold back ${ids.length} message${ids.length === 1 ? '' : 's'}: they will not go unless you approve them again`])) return
        const r = await api(c).tool('approve_messages', { skip: ids })
        return show(c, r, () => [`Skipped ${r.skipped.length}.`, ...r.refused.map((x: any) => `  not skipped: ${x.id}: ${x.reasons.join('; ')}`)].join('\n'))
      }
      throw new UsageError(`unknown: messages ${sub}. Try: list, approve, edit, skip`)
    },
  },

  templates: {
    usage: 'dewx templates set [--note <text>] [--m1 <text>] [--m2 <text>] [--file templates.json]',
    summary: 'Save your own messages (used while Dew is off). Variables: {first_name} {company} {title}...',
    async run(c) {
      if (c.args[0] !== 'set') {
        return c.io.out(`Save your templates with:
  dewx templates set --note "Hi {first_name}, ..." --m1 "..." --m2 "..."
note = connection note (300 characters at most), m1 = first message after they accept, m2 = follow-up.
Variables use single braces: {first_name} {last_name} {full_name} {company} {title}.
To see what is saved, open the app (the API does not read templates back yet).`)
      }
      const t = { ...(str(c.flags, 'file') ? readJson(c, str(c.flags, 'file')!) : {}), ...templatesFrom(c) }
      if (!Object.keys(t).length) throw new UsageError('give --note, --m1, --m2 or --file')
      const bad = Object.values(t).find(v => /\{\{|\}\}/.test(String(v)))
      if (bad !== undefined) throw new DewxError('Use single braces for variables, like {first_name}. Double braces are sent as they are.', EXIT.usage)
      if (!await confirm(c, Object.entries(t).map(([k, v]) => `Save ${k}: ${quote(String(v))}`))) return
      const r = await api(c).tool('set_templates', t)
      show(c, r, () => 'Templates saved.')
    },
  },

  inbox: {
    usage: 'dewx inbox [list [--oldest] | read <id> | reply <id> <text>]',
    summary: 'Your conversations: list them, read one, reply.',
    async run(c) {
      const sub = c.args[0] ?? 'list'
      if (sub === 'list') {
        const rows = await api(c).tool<any[]>('list_inbox', c.flags.oldest === true ? { order: 'oldest' } : {})
        const view = rows.slice(0, MAX_ROWS).map(t => ({ id: t.id, name: t.lead?.name, company: t.lead?.company,
          last: t.last ? `${t.last.from === 'them' ? 'them' : 'you'}: ${t.last.text}` : '', flag: t.dnc ? 'do not contact' : t.unread ? 'new' : '' }))
        return show(c, rows, () => table(view, [['id', 'id', 36], ['name', 'name', 22], ['company', 'company', 18], ['last', 'last message', 50], ['flag', '', 14]])
          + more(rows.length) + (rows.length ? '\nRead one: dewx inbox read <id>' : ''))
      }
      if (sub === 'read') {
        const t = await api(c).tool('get_thread', { id: need(c.args[1], 'the conversation id') })
        return show(c, t, () => [...(t.messages ?? []).map((m: any) => `[${day(m.at)}] ${m.from === 'them' ? 'Them' : 'You'}: ${m.text}`),
          ...(t.dnc ? ['(This person is on your never-contact list. Nothing can be sent.)'] : []),
          '', `Reply: dewx inbox reply ${t.id} "your words"`].join('\n'))
      }
      if (sub === 'reply') {
        const id = need(c.args[1], 'the conversation id')
        const text = need(str(c.flags, 'text') ?? c.args.slice(2).join(' '), 'your reply text')
        if (!await confirm(c, [`Send this reply in conversation ${id}:`, `"${text}"`, 'It goes through the safety guard, caps, office hours and never-contact list first'])) return
        const r = await api(c).tool('send_reply', { thread_id: id, text })
        return show(c, r, () => r?.status === 'sent' ? 'Sent.' : r?.status === 'dry-run' ? 'Dry run on the server: checked, not sent.' : `Result: ${r?.status ?? 'done'}`)
      }
      throw new UsageError(`unknown: inbox ${sub}. Try: list, read, reply`)
    },
  },

  stats: {
    usage: 'dewx stats',
    summary: 'Leads per stage, what needs you, today\'s LinkedIn use, balance, and Dew on or off.',
    async run(c) {
      const s = await api(c).tool('get_stats')
      show(c, s, () => [
        `Dew: ${s.mode === 'dew' ? 'on' : 'off'}${s.paused ? '   Account: paused' : ''}`,
        `Leads by stage: ${s.counts && typeof s.counts === 'object' ? Object.entries(s.counts).map(([k, v]) => `${k} ${v}`).join(', ') : fmt(s.counts)}`,
        `Needs you: ${fmt(s.needsYou)}`,
        `LinkedIn: ${li(s)}, used today ${fmt(s.linkedin?.usedToday)}`,
        `Balance: ${typeof s.balanceCents === 'number' ? `$${(s.balanceCents / 100).toFixed(2)}` : 'n/a'}`,
      ].join('\n'))
    },
  },

  mode: {
    usage: 'dewx mode',
    summary: 'Whether Dew is on (Dew runs it) or off (you run it). Change it in the app.',
    async run(c) {
      if (c.args[0]) {
        throw new DewxError('Tokens cannot change your mode, on purpose: the mode changes what you pay. ' +
          'Switch it in the app: Settings, Mode.', EXIT.refused)
      }
      const s = await api(c).tool('get_stats')
      show(c, { mode: s.mode }, () => s.mode === 'dew' ? 'Dew is on: Dew writes and runs your campaign.' : 'Dew is off: you run it (app, CLI or MCP).')
    },
  },

  skills: {
    usage: 'dewx skills [install [--dir <folder>]]',
    summary: 'AI skills for writing messages, research, lists and replies. `install` copies them into Claude.',
    async run(c) {
      const src = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'skills')
      const names = existsSync(src) ? readdirSync(src, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name) : []
      if (!names.length) throw new DewxError('No skills found in this install. Get them from github.com/Dewx-com/dewx-cli/tree/main/skills')
      if (c.args[0] !== 'install') return show(c, { skills: names, folder: src }, () =>
        `Skills: ${names.join(', ')}
Folder: ${src}
Install into Claude Code: dewx skills install
ChatGPT and others: see ${join(src, 'README.md')}`)
      const dest = str(c.flags, 'dir') ?? join(homedir(), '.claude', 'skills')
      if (!await confirm(c, [`Copy ${names.length} skills (${names.join(', ')}) into ${dest}`, 'Existing dewx skills there are replaced'])) return
      for (const n of names) cpSync(join(src, n), join(dest, n), { recursive: true })
      c.io.err(`Installed. Restart Claude Code, then ask: "write a first LinkedIn message for ..."`)
    },
  },

  mcp: {
    usage: 'dewx mcp [config]',
    summary: 'Run a local MCP server for Claude and other AI tools. `dewx mcp config` prints the setup.',
    async run(c) {
      if (c.args[0] === 'config') return c.io.out(configSnippets(c.profile))
      const client = api(c)
      c.io.err(`dewx MCP server ${VERSION} on stdio, forwarding to ${client.url}. Waiting for a client.`)
      await serve(client)
    },
  },
}

// ---------- shared pieces ----------
function templatesFrom(c: Ctx): Record<string, string> {
  const t: Record<string, string> = {}
  for (const k of ['note', 'm1', 'm2']) { const v = str(c.flags, k); if (v !== undefined) t[k] = v }
  return t
}

function readJson(c: Ctx, path: string): any {
  try { return JSON.parse(c.io.readFile(path)) } catch (e) { throw new DewxError(`Could not read ${path} as JSON: ${(e as Error).message}`, EXIT.usage) }
}

/** add_leads takes 50 a call; send in batches and add up the answers. */
async function addLeads(c: Ctx, leads: Lead[]) {
  const client = api(c)
  const results: any[] = []
  for (let i = 0; i < leads.length; i += 50) {
    const r = await client.tool('add_leads', { leads: leads.slice(i, i + 50).map(l => ({ name: l.name, company: l.company, country: l.country,
      ...(l.title ? { title: l.title } : {}), ...(l.linkedinUrl ? { linkedinUrl: l.linkedinUrl } : {}) })) })
    results.push(...(r?.leads ?? []))
    if (leads.length > 50 && !json(c)) c.io.err(`${Math.min(i + 50, leads.length)} of ${leads.length} sent…`)
  }
  const ok = results.filter(r => r.ok).length
  show(c, results, () => {
    const refused = results.filter(r => !r.ok)
    return [`Added ${ok} of ${leads.length}.`, ...refused.slice(0, 20).map(r => `  not added: ${r.name}: ${r.error}`),
      ...(refused.length > 20 ? [`  …and ${refused.length - 20} more (use --json)`] : [])].join('\n')
  })
}

const fmt = (v: unknown): string => v === undefined || v === null ? 'n/a'
  : typeof v === 'object' ? Object.entries(v as object).map(([k, x]) => `${k} ${fmt(x)}`).join(', ') : String(v)
const li = (s: any) => !s?.linkedin?.status || s.linkedin.status === 'none' ? 'not connected' : String(s.linkedin.status)
const day = (at: unknown) => { const d = new Date(String(at)); return isNaN(+d) ? '' : d.toISOString().slice(0, 16).replace('T', ' ') }
