# dewx

Run your [dewx.ai](https://dewx.ai) LinkedIn campaign from the terminal, and connect Claude (or any MCP tool) to it.

- **Small:** no runtime dependencies. The whole package is about 20 kB.
- **Safe:** every change shows what it will do and asks first. Every action runs on dewx.ai through the same safety checks as the app, so nothing here can skip them.
- **Private:** your token lives in your keychain. No telemetry, ever.

## Before you start

dewx is invite-only for now. **Request early access at [dewx.com/early-access](https://dewx.com/early-access).** You need a dewx.ai workspace with your LinkedIn connected.

## Two minutes: from zero to a running campaign

**1. Make a token.** In the app: Settings, MCP tokens, New token. Name it ("my laptop"), pick **Write**, copy it. You see it once.

**2. Install and log in.** Needs Node.js 20 or newer.

```sh
npm install -g dewx       # or use npx dewx <command> without installing
dewx login                # paste the token; it stays hidden and goes to your keychain
```

**3. Look at your campaign.**

```sh
dewx campaigns
```

**4. Set it up and add people.**

```sh
dewx campaigns create --preset service-founder \
  --note "Hi {first_name}, good to connect." \
  --m1 "Hi {first_name}, glad we are connected. I run a small bookkeeping firm for law firms."

dewx leads add --name "Jane Doe" --company "Example Co" --country "United States" --title Founder
dewx leads import leads.csv                                    # your own list or a Sales Navigator export
dewx leads salesnav "https://www.linkedin.com/sales/search/people?query=..." --limit 200
```

**5. Start it.**

```sh
dewx campaigns start
```

```
This will:
  - Start your campaign: invites and messages go out from your LinkedIn, inside its daily limits and office hours, through the dewx.ai safety checks
Go ahead? [y/N] y
Campaign is active. Pause any time: dewx campaigns pause
```

If dewx.ai says no, you get its reason in plain words and nothing happens. The usual ones: LinkedIn is not connected, your balance is low, or no first message is approved yet (approve them in the app, then run `start` again).

## Connect Claude and other AI tools

`dewx mcp` runs a small MCP server on your computer. It passes each request to dewx.ai with the token from your keychain, so the token is never written into a config file.

**Claude Code:**

```sh
claude mcp add dewx -- npx -y dewx mcp
```

**Claude Desktop:** Settings, Developer, Edit Config. Add this to `claude_desktop_config.json`, then restart Claude:

```json
{
  "mcpServers": {
    "dewx": { "command": "npx", "args": ["-y", "dewx", "mcp"] }
  }
}
```

**Cursor, Windsurf and most other clients** take the same `mcpServers` block.

**No install at all:** connect straight to the remote server, with the token in a header:

```sh
claude mcp add --transport http dewx https://dewx.ai/api/mcp --header "Authorization: Bearer dxm_your_token"
```

`dewx mcp config` prints these snippets for your profile. Then ask Claude things like *"How is my campaign doing?"*, *"Who is waiting on a reply, oldest first?"* or *"Add these five people to my leads."* Claude asks before it changes anything; dewx.ai checks every send again.

Claude Desktop says the server failed? It often cannot find `npx` when Node was installed with nvm. Run `which npx` and put that full path in `"command"`.

## Commands

| Command | What it does |
|---|---|
| `dewx login` | Save your token (hidden prompt, or pipe it: `echo $TOKEN \| dewx login`) |
| `dewx logout` | Forget the token on this computer (revoke it in Settings to kill it everywhere) |
| `dewx whoami` | Which token, what it may do, Dew on or off, LinkedIn status |
| `dewx workspaces` | Your saved workspaces. One token is one workspace. `dewx workspaces use acme` switches |
| `dewx accounts` | Your LinkedIn account: connected, used today, can send |
| `dewx campaigns` | Your campaign: status, leads, messages, sequence |
| `dewx campaigns create` | `--preset service-founder\|saas-founder\|coach` or `--steps steps.json`, plus `--note --m1 --m2`. Does not start it |
| `dewx campaigns start` / `pause` | Start or pause |
| `dewx leads` | Your leads, best fit first. `--stage Replied` to filter |
| `dewx leads add` | `--name --company --country` (required), `--title --linkedin` |
| `dewx leads import <file.csv>` | Adds a CSV in batches of 50. Understands name, first/last name, company, title, country or location, LinkedIn URL |
| `dewx leads salesnav <link>` | Pulls people from a Sales Navigator search with your own LinkedIn. `--limit 200 --countries "United States"` |
| `dewx jobs <id>` | Progress of a Sales Navigator pull |
| `dewx templates set` | `--note --m1 --m2` or `--file templates.json`. Variables use single braces: `{first_name}` `{company}` `{title}` |
| `dewx inbox` | Your conversations. `--oldest` puts the people waiting on you first |
| `dewx inbox read <id>` | One conversation, oldest message first |
| `dewx inbox reply <id> "text"` | Reply. Goes through the safety guard, caps, office hours and never-contact list |
| `dewx stats` | Leads per stage, what needs you, LinkedIn use today, balance, Dew on or off |
| `dewx mode` | Dew on or off. Change it in the app: a token can never change your mode or money |
| `dewx skills` | AI skills for messages, research, lists and replies. `dewx skills install` adds them to Claude Code |
| `dewx mcp` | The local MCP server. `dewx mcp config` prints setup snippets |

**Options for every command:** `--json` (JSON for scripts), `--yes` / `-y` (do not ask), `--dry-run` (show what would change, change nothing), `--profile <name>`, `--debug` (each API call, tokens hidden), `--help`.

## Scripts and CI

```sh
export DEWX_TOKEN=dxm_...          # wins over the keychain; nothing is written to disk
dewx inbox --oldest --json | jq '.[0]'
dewx campaigns pause --yes
```

A change without a terminal and without `--yes` is refused, so a script never changes your account by accident.

| Exit code | Meaning |
|---|---|
| 0 | Done |
| 1 | Something failed (network, server) |
| 2 | Wrong usage, or a change was not confirmed |
| 3 | Not logged in, or the token was refused |
| 4 | dewx.ai said no (the safety guard, a cap, a missing LinkedIn), with its reason |
| 5 | Too many calls (60 a minute, 1,000 a day per token). The CLI waits and retries twice first |

Environment: `DEWX_TOKEN`, `DEWX_PROFILE` (which saved workspace), `DEWX_CONFIG_DIR` (default `~/.config/dewx`).

## Safety and privacy

- **The server decides.** The CLI only asks. Sends pass the dewx.ai safety guard, each LinkedIn account's daily limits and warm-up, your never-contact list, office hours in the other person's time zone, and your balance. A paused account stays paused.
- **Tokens are scoped.** A Read token can only look. A Write token can run the campaign. No token can touch your money, your mode or other tokens.
- **Your token is kept safe.** macOS Keychain or Linux Secret Service, passed on stdin (never visible in `ps`). Without a keychain, or with `dewx login --file`, it goes to `~/.config/dewx/credentials.json` with mode 600. Tokens are masked (`dxm_AbCd****`) in every message, error and debug line.
- **No telemetry.** The only network calls go to the dewx.ai API, and only when a command needs it.
- **Lost a laptop?** Revoke the token in Settings. It stops at once.

## AI skills

[`skills/`](skills/) holds four skills that work in Claude, ChatGPT or any AI: write messages, research a lead, build a Sales Navigator list, and handle a reply. They work alone, and better with the dewx MCP connected. See [skills/README.md](skills/README.md).

## Develop

```sh
npm install
npm test        # type check, build, and run the tests (the API is mocked)
node dist/src/cli.js --help
```

Why it is built this way, and how it compares with other tools: [DESIGN.md](DESIGN.md).

## Maintainers

Release checklist. Nothing is pushed or published without the owner's go.

```sh
# one time: create the public repo and push (run from this folder)
gh repo create Dewx-com/dewx-cli --public --source . --push \
  --description "Run your dewx.ai LinkedIn campaign from the terminal, and connect Claude to it"

# each release
npm test
npm version patch            # or minor; the CLI reads its version from package.json
git push --follow-tags
npm publish --access public
```

## License

MIT. See [LICENSE](LICENSE).
