// A tiny argv parser: positionals, --flag, --flag value, --flag=value, and a few short flags.
// No dependency: we keep the install small and the behaviour easy to read.

export type Flags = Record<string, string | boolean>
export type Parsed = { args: string[], flags: Flags }

/** Flags that never take a value. Every other --flag takes the next word as its value. */
const BOOLEAN = new Set(['json', 'yes', 'help', 'version', 'debug', 'dry-run', 'oldest', 'file', 'all', 'approved'])
const SHORT: Record<string, string> = { y: 'yes', h: 'help', v: 'version', j: 'json' }

export function parse(argv: readonly string[]): Parsed {
  const args: string[] = [], flags: Flags = {}
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--') { args.push(...argv.slice(i + 1)); break }
    if (a.startsWith('--') && a.length > 2) {
      const eq = a.indexOf('=')
      const key = (eq === -1 ? a.slice(2) : a.slice(2, eq)).toLowerCase()
      if (eq !== -1) flags[key] = a.slice(eq + 1)
      else if (BOOLEAN.has(key)) flags[key] = true
      else if (i + 1 < argv.length && !argv[i + 1].startsWith('--')) flags[key] = argv[++i]
      else flags[key] = true
    } else if (/^-[a-z]$/i.test(a) && SHORT[a[1]]) flags[SHORT[a[1]]] = true
    else args.push(a)
  }
  return { args, flags }
}

/** A flag's text value, or undefined. `--name` with no value is an error, not an empty name. */
export function str(flags: Flags, key: string): string | undefined {
  const v = flags[key]
  if (v === undefined) return undefined
  if (v === true) throw new UsageError(`--${key} needs a value`)
  return v as string
}

export function int(flags: Flags, key: string): number | undefined {
  const v = str(flags, key)
  if (v === undefined) return undefined
  if (!/^\d+$/.test(v)) throw new UsageError(`--${key} must be a whole number`)
  return Number(v)
}

/** "a, b,c" -> ['a', 'b', 'c'] */
export const list = (v: string | undefined) => v?.split(',').map(s => s.trim()).filter(Boolean)

export class UsageError extends Error {}
