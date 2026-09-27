#!/usr/bin/env node
// Build a LinkedIn Sales Navigator people-search link from a small JSON spec. No dependencies.
// Usage: node build-url.mjs '{"titles":["Founder"],"regions":["United States"],"headcount":["11-50"]}'
//    or: node build-url.mjs spec.json
// Spec keys: titles (free text), keywords (free text), regions, industries, headcount, seniority, relationship,
// yearsInPosition (values from filters.json), postedRecently (true = posted on LinkedIn in the past 30 days).
// Filter order and encoding match URLs that Sales Navigator itself builds. It never guesses an id: an unknown value stops with a list of what it knows.
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ids = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'filters.json'), 'utf8'))
const arg = process.argv[2]
if (!arg) { console.error('Give a spec: node build-url.mjs \'{"titles":["Founder"],"regions":["United States"]}\''); process.exit(2) }
const spec = JSON.parse(existsSync(arg) ? readFileSync(arg, 'utf8') : arg)

const enc = s => encodeURIComponent(s)
const twice = s => enc(enc(s)) // text inside a value is encoded twice, as LinkedIn does
const idValue = (id, text) => `(id%3A${id}%2Ctext%3A${twice(text)}%2CselectionType%3AINCLUDED)`
const textValue = text => `(text%3A${twice(text)}%2CselectionType%3AINCLUDED)`
const filter = (type, values) => `(type%3A${type}%2Cvalues%3AList(${values.join('%2C')}))`

const filters = [], missing = [], verify = []
if (spec.titles?.length) filters.push(filter('CURRENT_TITLE', spec.titles.map(textValue)))
for (const [key, table, type] of [['regions', 'region', 'REGION'], ['headcount', 'headcount', 'COMPANY_HEADCOUNT'], ['industries', 'industry', 'INDUSTRY'],
  ['seniority', 'seniority', 'SENIORITY_LEVEL'], ['relationship', 'relationship', 'RELATIONSHIP'], ['yearsInPosition', 'yearsInPosition', 'YEARS_IN_CURRENT_POSITION']]) {
  const values = []
  for (const v of spec[key] ?? []) {
    const id = ids[table]?.[v] ?? ids[`${table}_verify`]?.[v]
    if (id === undefined) { missing.push(`${key}: "${v}" (known: ${Object.keys({ ...ids[table], ...ids[`${table}_verify`] }).join(', ')})`); continue }
    if (ids[table]?.[v] === undefined) verify.push(`${key}: "${v}"`)
    values.push(idValue(id, v))
  }
  if (values.length) filters.push(filter(type, values))
}
if (spec.postedRecently) filters.push(filter('POSTED_ON_LINKEDIN', ['(id%3ARPOL%2CselectionType%3AINCLUDED)']))

if (missing.length) {
  console.error('Unknown values (no id in filters.json). Run the search once in Sales Navigator, copy the id from the URL, add it to filters.json:')
  for (const m of missing) console.error('  - ' + m)
  process.exit(1)
}
if (verify.length) console.error('Check these once, their ids are not confirmed yet: ' + verify.join('; '))
const keywords = spec.keywords ? `%2Ckeywords%3A${twice(spec.keywords)}` : ''
console.log(`https://www.linkedin.com/sales/search/people?query=(filters%3AList(${filters.join('%2C')})${keywords})`)
