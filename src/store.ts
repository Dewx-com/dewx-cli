// Where your token lives. In order of preference:
//   1. DEWX_TOKEN in the environment (for CI and scripts; never written anywhere)
//   2. the OS keychain: macOS Keychain (`security`), or Linux Secret Service (`secret-tool`)
//   3. a file only you can read (mode 600) at ~/.config/dewx/credentials.json, when there is no keychain or you ask
// The token is passed to the keychain on stdin, never as a command argument, so it never shows in `ps`.
// config.json holds your profiles (name, token prefix, where the token is kept). It never holds a token.
import { spawnSync } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir, platform } from 'node:os'
import { join } from 'node:path'
import { DewxError, EXIT } from './api.js'

export const SERVICE = 'dewx-cli'
export const TOKEN_RE = /^dxm_[A-Za-z0-9_-]{20,100}$/
export const PROFILE_RE = /^[a-z0-9][a-z0-9_-]{0,31}$/i

export type Where = 'keychain' | 'file'
export type Profile = { prefix: string, where: Where, scope?: 'read' | 'write', url?: string, savedAt: string }
export type Config = { current: string, profiles: Record<string, Profile> }

export function configDir(env = process.env): string {
  if (env.DEWX_CONFIG_DIR) return env.DEWX_CONFIG_DIR
  if (platform() === 'win32' && env.APPDATA) return join(env.APPDATA, 'dewx')
  return join(env.XDG_CONFIG_HOME || join(homedir(), '.config'), 'dewx')
}

/** A keychain: get, set and remove one token per profile. */
export type Keychain = { name: string, get(p: string): string | null, set(p: string, token: string): boolean, remove(p: string): void }

const run = (cmd: string, args: string[], input?: string) => spawnSync(cmd, args, { input, encoding: 'utf8', timeout: 10_000 })

const macos: Keychain = {
  name: 'macOS Keychain',
  get: p => { const r = run('security', ['find-generic-password', '-s', SERVICE, '-a', p, '-w']); return r.status === 0 ? r.stdout.trim() || null : null },
  // `security -i` reads commands from stdin, so the token is not in the process list.
  set: (p, t) => run('security', ['-i'], `add-generic-password -U -s ${SERVICE} -a ${p} -l dewx-cli -w ${t}\n`).status === 0 && macos.get(p) === t,
  remove: p => { run('security', ['delete-generic-password', '-s', SERVICE, '-a', p]) },
}
const libsecret: Keychain = {
  name: 'Secret Service',
  get: p => { const r = run('secret-tool', ['lookup', 'service', SERVICE, 'account', p]); return r.status === 0 ? r.stdout.trim() || null : null },
  set: (p, t) => run('secret-tool', ['store', '--label', `dewx CLI (${p})`, 'service', SERVICE, 'account', p], t).status === 0 && libsecret.get(p) === t,
  remove: p => { run('secret-tool', ['clear', 'service', SERVICE, 'account', p]) },
}

/** The keychain on this machine, or null (Windows, or Linux without secret-tool). */
export function systemKeychain(): Keychain | null {
  if (platform() === 'darwin') return macos
  if (platform() === 'linux' && run('which', ['secret-tool']).status === 0) return libsecret
  return null
}

export class Store {
  readonly dir: string
  constructor(private readonly env: NodeJS.ProcessEnv = process.env, private readonly keychain: Keychain | null = systemKeychain()) {
    this.dir = configDir(env)
  }

  /** The token comes from DEWX_TOKEN, not from a saved profile. */
  get fromEnv(): boolean { return !!this.env.DEWX_TOKEN }

  private path(name: string) { return join(this.dir, name) }
  private read<T>(name: string, empty: T): T {
    try { return JSON.parse(readFileSync(this.path(name), 'utf8')) as T } catch { return empty }
  }
  private write(name: string, data: unknown) {
    mkdirSync(this.dir, { recursive: true, mode: 0o700 })
    writeFileSync(this.path(name), JSON.stringify(data, null, 2) + '\n', { mode: 0o600 })
    chmodSync(this.path(name), 0o600) // an existing file keeps its old mode otherwise
  }

  config(): Config { return this.read<Config>('config.json', { current: 'default', profiles: {} }) }
  saveConfig(c: Config) { this.write('config.json', c) }

  /** The profile to use: --profile, then DEWX_PROFILE, then the one you picked last. */
  profileName(flag?: string): string {
    const name = flag || this.env.DEWX_PROFILE || this.config().current || 'default'
    if (!PROFILE_RE.test(name)) throw new DewxError(`"${name}" is not a valid profile name (letters, numbers, - and _).`, EXIT.usage)
    return name
  }

  /** Save a token. Returns where it went. */
  save(profile: string, token: string, opts: { forceFile?: boolean, scope?: 'read' | 'write', url?: string } = {}): Where {
    if (!TOKEN_RE.test(token)) throw new DewxError('That does not look like a dewx token. It starts with dxm_ (Settings, MCP tokens, in the app).', EXIT.usage)
    let where: Where = 'file'
    if (!opts.forceFile && this.keychain?.set(profile, token)) where = 'keychain'
    const creds = this.read<Record<string, string>>('credentials.json', {})
    if (where === 'file') this.write('credentials.json', { ...creds, [profile]: token })
    else if (creds[profile]) { delete creds[profile]; this.write('credentials.json', creds) } // never keep two copies
    const c = this.config()
    c.profiles[profile] = { prefix: token.slice(0, 8), where, savedAt: new Date().toISOString(),
      ...(opts.scope ? { scope: opts.scope } : {}), ...(opts.url ? { url: opts.url } : {}) }
    c.current = profile
    this.saveConfig(c)
    return where
  }

  /** The token for a profile, or null. DEWX_TOKEN wins over anything stored. */
  token(profile: string): string | null {
    if (this.env.DEWX_TOKEN) return this.env.DEWX_TOKEN.trim()
    const p = this.config().profiles[profile]
    if (p?.where === 'keychain') return this.keychain?.get(profile) ?? null
    return this.read<Record<string, string>>('credentials.json', {})[profile] ?? null
  }

  remove(profile: string): boolean {
    const c = this.config()
    const had = !!c.profiles[profile]
    this.keychain?.remove(profile)
    const creds = this.read<Record<string, string>>('credentials.json', {})
    if (creds[profile]) { delete creds[profile]; this.write('credentials.json', creds) }
    delete c.profiles[profile]
    if (c.current === profile) c.current = Object.keys(c.profiles)[0] ?? 'default'
    if (had || existsSync(this.path('config.json'))) this.saveConfig(c)
    return had
  }
}
