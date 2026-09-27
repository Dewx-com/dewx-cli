import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parse, str, int, list, UsageError } from '../src/args.js'

test('positionals, value flags, = flags and booleans', () => {
  const p = parse(['leads', 'add', '--name', 'Ana Ruiz', '--company=Acme', '--json', '-y'])
  assert.deepEqual(p.args, ['leads', 'add'])
  assert.deepEqual(p.flags, { name: 'Ana Ruiz', company: 'Acme', json: true, yes: true })
})

test('a boolean flag never eats the next word', () => {
  const p = parse(['inbox', '--oldest', 'list'])
  assert.deepEqual(p.args, ['inbox', 'list'])
  assert.equal(p.flags.oldest, true)
})

test('-- stops flag parsing, so a reply can start with dashes', () => {
  const p = parse(['inbox', 'reply', 't1', '--', '--not a flag'])
  assert.deepEqual(p.args, ['inbox', 'reply', 't1', '--not a flag'])
})

test('a value flag at the end without a value is an error when read', () => {
  const p = parse(['leads', '--stage'])
  assert.throws(() => str(p.flags, 'stage'), UsageError)
})

test('int and list helpers', () => {
  assert.equal(int(parse(['--limit', '25']).flags, 'limit'), 25)
  assert.throws(() => int(parse(['--limit', 'ten']).flags, 'limit'), UsageError)
  assert.deepEqual(list('Germany, Netherlands ,'), ['Germany', 'Netherlands'])
})
