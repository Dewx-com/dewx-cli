import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Client, DewxError, EXIT } from '../src/api.js'
import { redact } from '../src/redact.js'
import { mockApi, TOKEN } from './mock.js'

test('a tool call sends the bearer token and returns the result', async () => {
  const m = mockApi({ start_campaign: () => ({ status: 'running' }) })
  const r = await new Client({ token: TOKEN, fetch: m.fetch }).tool('start_campaign')
  assert.deepEqual(r, { status: 'running' })
  assert.equal(m.seen[0].auth, `Bearer ${TOKEN}`)
  assert.deepEqual(m.calls(), [{ name: 'start_campaign', arguments: {} }])
})

test('an array result comes back parsed from the text', async () => {
  const m = mockApi({ list_leads: () => [{ name: 'Ana' }] })
  assert.deepEqual(await new Client({ token: TOKEN, fetch: m.fetch }).tool('list_leads'), [{ name: 'Ana' }])
})

test('a refusal from the server (the safety guard) is an error with its own words, exit 4', async () => {
  const m = mockApi({ send_reply: () => { throw new Error('Not sent: this person is on your never-contact list') } })
  await assert.rejects(new Client({ token: TOKEN, fetch: m.fetch }).tool('send_reply', { thread_id: 't', text: 'hi' }),
    (e: DewxError) => e.exit === EXIT.refused && /never-contact/.test(e.message))
})

test('401 says to log in again, exit 3', async () => {
  const m = mockApi({})
  await assert.rejects(new Client({ token: 'dxm_' + 'B'.repeat(43), fetch: m.fetch }).tool('list_campaigns'),
    (e: DewxError) => e.exit === EXIT.auth && /dewx login/.test(e.message))
})

test('429 waits for Retry-After and tries again, then gives up with exit 5', async () => {
  const m = mockApi({}, { status: 429, headers: { 'retry-after': '2' } })
  const waits: number[] = []
  await assert.rejects(new Client({ token: TOKEN, fetch: m.fetch, sleep: async ms => { waits.push(ms) } }).tool('list_campaigns'),
    (e: DewxError) => e.exit === EXIT.rate)
  assert.deepEqual(waits, [2000, 2000])
  assert.equal(m.seen.length, 3)
})

test('a network failure never prints the token', async () => {
  const fetch = (async () => { throw new Error(`boom ${TOKEN}`) }) as typeof globalThis.fetch
  await assert.rejects(new Client({ token: TOKEN, fetch }).tool('list_campaigns'), (e: Error) => !e.message.includes(TOKEN) && /Could not reach dewx.ai/.test(e.message))
})

test('redact keeps a short prefix only', () => {
  assert.equal(redact(`token ${TOKEN} here`), 'token dxm_AAAA**** here')
  assert.equal(redact(redact(TOKEN)), 'dxm_AAAA****')
})
