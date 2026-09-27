// Read a CSV of leads (your own list, or a Sales Navigator export) into the fields dewx.ai takes.
// A small RFC 4180 parser: quoted fields, "" for a quote, commas and newlines inside quotes, a BOM, ; or , as separator.

export type Lead = { name: string, company: string, title: string, country: string, linkedinUrl: string }

export function parseCsv(text: string): string[][] {
  text = text.replace(/^﻿/, '')
  const firstLine = text.split(/\r?\n/, 1)[0] ?? ''
  const sep = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ';' : ','
  const rows: string[][] = []
  let row: string[] = [], cell = '', quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++ }
      else if (c === '"') quoted = false
      else cell += c
    } else if (c === '"' && cell === '') quoted = true
    else if (c === sep) { row.push(cell); cell = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(cell); rows.push(row); row = []; cell = ''
    } else cell += c
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row) }
  return rows.filter(r => r.some(c => c.trim() !== ''))
}

/** Header names we understand, lower-case with spaces and punctuation removed. */
const COLUMNS: Record<keyof Lead | 'first' | 'last', string[]> = {
  name: ['name', 'fullname', 'leadname', 'person'],
  first: ['firstname', 'first', 'givenname'],
  last: ['lastname', 'last', 'surname', 'familyname'],
  company: ['company', 'companyname', 'organization', 'organisation', 'account', 'accountname', 'currentcompany'],
  title: ['title', 'jobtitle', 'position', 'role', 'headline', 'currenttitle'],
  country: ['country', 'location', 'geography', 'region', 'personcountry', 'companycountry'],
  linkedinUrl: ['linkedinurl', 'linkedin', 'profileurl', 'linkedinprofile', 'linkedinprofileurl', 'url', 'personlinkedinurl'],
}
const key = (h: string) => h.toLowerCase().replace(/[^a-z]/g, '')

/** Turn CSV text into leads. Rows without a name are skipped and counted. */
export function leadsFromCsv(text: string): { leads: Lead[], skipped: number, columns: Record<string, string | null> } {
  const [header, ...rows] = parseCsv(text)
  if (!header) return { leads: [], skipped: 0, columns: {} }
  const keys = header.map(key)
  const at = (names: string[]) => keys.findIndex(k => names.includes(k))
  const idx = Object.fromEntries(Object.entries(COLUMNS).map(([f, names]) => [f, at(names)])) as Record<keyof typeof COLUMNS, number>
  const cell = (r: string[], i: number) => (i >= 0 ? (r[i] ?? '').trim() : '')
  const leads: Lead[] = []
  let skipped = 0
  for (const r of rows) {
    const name = cell(r, idx.name) || [cell(r, idx.first), cell(r, idx.last)].filter(Boolean).join(' ')
    if (!name) { skipped++; continue }
    // A "City, Region, Country" location keeps its last part: the country.
    const place = cell(r, idx.country)
    leads.push({ name, company: cell(r, idx.company), title: cell(r, idx.title),
      country: place.includes(',') ? place.split(',').pop()!.trim() : place, linkedinUrl: cell(r, idx.linkedinUrl) })
  }
  const columns = Object.fromEntries(Object.entries(idx).map(([f, i]) => [f, i >= 0 ? header[i] : null]))
  return { leads, skipped, columns }
}
