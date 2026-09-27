import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseCsv, leadsFromCsv } from '../src/csv.js'

test('quotes, escaped quotes, commas and newlines inside quotes, BOM', () => {
  assert.deepEqual(parseCsv('﻿a,b\n"x, y","say ""hi""\nthere"\n'), [['a', 'b'], ['x, y', 'say "hi"\nthere']])
})

test('semicolon files work too', () => {
  assert.deepEqual(parseCsv('name;company\nAna;Acme'), [['name', 'company'], ['Ana', 'Acme']])
})

test('a Sales Navigator style export maps to leads; location keeps the country', () => {
  const csv = 'First Name,Last Name,Company Name,Job Title,Location,LinkedIn URL\n' +
    'Ana,Ruiz,Acme,Founder,"Berlin, Berlin, Germany",https://www.linkedin.com/in/example-ana\n,,,,,\nBo,,Beta,,Netherlands,'
  const r = leadsFromCsv(csv)
  assert.equal(r.leads.length, 2)
  assert.deepEqual(r.leads[0], { name: 'Ana Ruiz', company: 'Acme', title: 'Founder', country: 'Germany', linkedinUrl: 'https://www.linkedin.com/in/example-ana' })
  assert.equal(r.leads[1].country, 'Netherlands')
  assert.equal(r.columns.company, 'Company Name')
})

test('rows without a name are skipped and counted', () => {
  const r = leadsFromCsv('name,company\n,Acme\nAna,Acme')
  assert.equal(r.leads.length, 1)
  assert.equal(r.skipped, 1)
})
