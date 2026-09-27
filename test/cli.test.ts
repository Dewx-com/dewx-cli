import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, statSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { main } from '../src/cli.js'
import type { Io } from '../src/commands.js'
import { Store } from '../src/store.js'
import { mockApi, TOKEN } from './mock.js'

function setup(tools: Record<string, (a: any) => unknown> = {}, o: { tty?: boolean, answer?: string, stdin?: string, env?: Record<string, string>, readOnly?: boolean } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'dewx-test-'))
  const out: string[] = [], err: string[] = []
  const io: Io = { out: s => out.push(s), err: s => err.push(s), isTTY: o.tty ?? false,
    ask: async () => o.answer ?? 'n', askSecret: async () => TOKEN, readStdin: async () => o.stdin ?? '', readFile: p => readFileSync(p, 'utf8') }
  const store = new Store({ DEWX_CONFIG_DIR: dir, ...o.env }, null)
  const api = mockApi(tools, { readOnly: o.readOnly })
  const run = (...argv: string[]) => main(argv, { io, store, fetch: api.fetch })
  return { dir, out, err, store, api, run }
}
const loggedIn = (t: Record<string, (a: any) => unknown> = {}, o: Parameters<typeof setup>[1] = {}) => setup(t, { env: { DEWX_TOKEN: TOKEN }, ...o })

test('login from stdin checks the token, stores it in a 600 file, and never prints it', async () => {
  const s = setup({}, { stdin: TOKEN + '\n' })
  assert.equal(await s.run('login'), 0)
  const file = join(s.dir, 'credentials.json')
  if (process.platform !== 'win32') assert.equal(statSync(file).mode & 0o777, 0o600)
  assert.equal(JSON.parse(readFileSync(file, 'utf8')).default, TOKEN)
  assert.doesNotMatch(readFileSync(join(s.dir, 'config.json'), 'utf8'), /A{20}/)
  assert.ok(!s.err.join('\n').includes(TOKEN))
  assert.match(s.err.join('\n'), /write token/)
  assert.equal(s.store.token('default'), TOKEN)
})

test('login refuses something that is not a token', async () => {
  const s = setup({}, { stdin: 'sk_live_nope' })
  assert.equal(await s.run('login'), 2)
})

test('not logged in: a clear message and exit 3', async () => {
  const s = setup()
  assert.equal(await s.run('campaigns'), 3)
  assert.match(s.err.join(''), /dewx login/)
})

test('campaigns --json prints the API answer as JSON', async () => {
  const s = loggedIn({ list_campaigns: () => [{ name: 'Your campaign', status: 'draft', leads: 3 }] })
  assert.equal(await s.run('campaigns', '--json'), 0)
  assert.equal(JSON.parse(s.out.join(''))[0].status, 'draft')
})

test('a write without a terminal and without --yes is refused, and nothing is called', async () => {
  const s = loggedIn({ start_campaign: () => ({ status: 'running' }) })
  assert.equal(await s.run('campaigns', 'start'), 2)
  assert.match(s.err.join('\n'), /This will:[\s\S]*Start your campaign[\s\S]*--yes/)
  assert.equal(s.api.calls().length, 0)
})

test('--dry-run shows the preview and calls nothing', async () => {
  const s = loggedIn({ start_campaign: () => ({ status: 'running' }) })
  assert.equal(await s.run('campaigns', 'start', '--dry-run'), 0)
  assert.equal(s.api.calls().length, 0)
})

test('answering no at the prompt stops; yes goes ahead', async () => {
  const no = loggedIn({ pause_campaign: () => ({ status: 'paused' }) }, { tty: true, answer: 'n' })
  assert.equal(await no.run('campaigns', 'pause'), 0)
  assert.equal(no.api.calls().length, 0)
  const yes = loggedIn({ pause_campaign: () => ({ status: 'paused' }) }, { tty: true, answer: 'y' })
  assert.equal(await yes.run('campaigns', 'pause'), 0)
  assert.deepEqual(yes.api.calls(), [{ name: 'pause_campaign', arguments: {} }])
})

test('--yes starts the campaign', async () => {
  const s = loggedIn({ start_campaign: () => ({ status: 'running' }) })
  assert.equal(await s.run('campaigns', 'start', '--yes'), 0)
  assert.match(s.out.join(''), /running/)
})

test('create_campaign gets the preset and templates', async () => {
  const s = loggedIn({ create_campaign: a => ({ ok: true, a }) })
  assert.equal(await s.run('campaigns', 'create', '--preset', 'service-founder', '--m1', 'Hi {first_name}', '-y'), 0)
  assert.deepEqual(s.api.calls()[0].arguments, { preset: 'service-founder', templates: { m1: 'Hi {first_name}' } })
})

test('templates with double braces are refused before any call', async () => {
  const s = loggedIn({ set_templates: () => ({}) })
  assert.equal(await s.run('templates', 'set', '--m1', 'Hi {{first_name}}', '-y'), 2)
  assert.equal(s.api.calls().length, 0)
})

test('leads import sends batches of 50 and reports refusals per row', async () => {
  const s = loggedIn({ add_leads: a => ({ leads: a.leads.map((l: any, i: number) => (i === 0 ? { name: l.name, ok: false, error: 'You already have this lead.' } : { name: l.name, ok: true })) }) })
  const file = join(s.dir, 'leads.csv')
  writeFileSync(file, 'name,company,country\n' + Array.from({ length: 120 }, (_, i) => `Person ${i},Co ${i},Germany`).join('\n'))
  assert.equal(await s.run('leads', 'import', file, '--yes'), 0)
  const calls = s.api.calls()
  assert.deepEqual(calls.map(c => c.arguments.leads.length), [50, 50, 20])
  assert.match(s.out.join('\n'), /Added 117 of 120/)
})

test('leads salesnav passes the link, limit and countries', async () => {
  const s = loggedIn({ add_leads: () => ({ salesnav: { jobId: '42' } }) })
  const url = 'https://www.linkedin.com/sales/search/people?query=(x)'
  assert.equal(await s.run('leads', 'salesnav', url, '--limit', '100', '--countries', 'Germany,Netherlands', '-y'), 0)
  assert.deepEqual(s.api.calls()[0].arguments, { salesnav_url: url, limit: 100, countries: ['Germany', 'Netherlands'] })
  assert.match(s.out.join(''), /dewx jobs 42/)
})

test('inbox reply: the guard says no, exit 4, and the words are shown', async () => {
  const s = loggedIn({ send_reply: () => { throw new Error('Not sent: outside office hours') } })
  assert.equal(await s.run('inbox', 'reply', 't1', 'Thanks', 'Ana', '-y'), 4)
  assert.deepEqual(s.api.calls()[0].arguments, { thread_id: 't1', text: 'Thanks Ana' })
  assert.match(s.err.join(''), /office hours/)
})

test('mode cannot be changed with a token', async () => {
  const s = loggedIn({ get_stats: () => ({ mode: 'dew' }) })
  assert.equal(await s.run('mode', 'off'), 4)
  assert.equal(s.api.calls().length, 0)
  assert.equal(await s.run('mode'), 0)
  assert.match(s.out.join(''), /Dew is on/)
})

test('unknown command and --help', async () => {
  const s = setup()
  assert.equal(await s.run('frobnicate'), 2)
  assert.equal(await s.run('leads', '--help'), 0)
  assert.match(s.out.join(''), /dewx leads/)
})

test('workspaces lists profiles without tokens, and switches', async () => {
  const s = setup({}, { stdin: TOKEN })
  await s.run('login', '--profile', 'acme')
  assert.equal(await s.run('workspaces', '--json'), 0)
  assert.ok(!s.out.join('').includes(TOKEN))
  assert.equal(JSON.parse(s.out.join('')).find((p: any) => p.name === 'acme').prefix, TOKEN.slice(0, 8) + '****')
  assert.equal(await s.run('workspaces', 'use', 'nobody'), 2)
})

test('skills install copies every skill folder, after a yes', async () => {
  const s = setup()
  const dest = join(s.dir, 'claude-skills')
  assert.equal(await s.run('skills', 'install', '--dir', dest, '--yes'), 0)
  for (const n of ['dewx-write-messages', 'dewx-lead-research', 'dewx-list-builder', 'dewx-reply-handler'])
    assert.match(readFileSync(join(dest, n, 'SKILL.md'), 'utf8'), new RegExp(`^---\\nname: ${n}\\n`))
})

test('messages: list, approve --all takes only clean drafts, edit, skip', async () => {
  const drafts = { status: 'draft', total: 2, messages: [
    { id: 'm-clean', step: 'm1', text: 'Hi Ana,\nline', reasons: [], lead: { name: 'Ana', company: 'Acme' } },
    { id: 'm-flag', step: 'm1', text: 'Hi Bo, quick call?', reasons: ['asks for a call'], lead: { name: 'Bo', company: 'Beta' } }] }
  const s = loggedIn({ list_messages: () => drafts, approve_messages: a => ({ approved: a.approve ?? [], refused: [], skipped: a.skip ?? [],
    edited: (a.edit ?? []).map((e: any) => ({ id: e.id, approved: true, reasons: [] })) }) })
  assert.equal(await s.run('messages'), 0)
  assert.match(s.out.join('\n'), /asks for a call[\s\S]*2 waiting for you/)
  assert.equal(await s.run('messages', 'approve', '--all', '-y'), 0)
  assert.deepEqual(s.api.calls().at(-1)!.arguments, { approve: ['m-clean'] })
  assert.equal(await s.run('messages', 'edit', 'm-flag', 'Hi Bo,\\nnew words', '-y'), 0)
  assert.deepEqual(s.api.calls().at(-1)!.arguments, { edit: [{ id: 'm-flag', text: 'Hi Bo,\nnew words' }] })
  assert.match(s.out.join('\n'), /Saved and approved/)
  assert.equal(await s.run('messages', 'skip', 'm-clean', '-y'), 0)
  assert.deepEqual(s.api.calls().at(-1)!.arguments, { skip: ['m-clean'] })
  const before = s.api.calls().length
  assert.equal(await s.run('messages', 'approve', 'm-clean'), 2, 'no terminal, no --yes: refused')
  assert.equal(s.api.calls().length, before)
})
