# Design notes

What we studied before building dewx, what those tools do well and badly, and the rules we took from them.
Studied 27 Sep 2026.

## HeyReach (CLI and MCP)

Sources: [HeyReach CLI releases](https://github.com/HeyReach/HeyReach-CLI-releases), [HeyReach MCP help](https://help.heyreach.io/en/articles/12117291-how-does-heyreach-mcp-work-with-popular-tools), and daily use of the CLI (v1.0.2).

Good:
- One static binary, installed with Homebrew or a curl line, and it updates itself.
- Clear `heyreach <resource> <action>` command shape.
- A `skill install` command that puts a skill file into Claude Code and other editors. Nice onboarding.
- A remote MCP server per workspace, so any MCP client can connect.

Bad:
- **Writes never ask.** Starting a campaign or sending a LinkedIn message runs at once, with no preview and no `--yes`.
- **Keys sit in plain files** under `~/.config/heyreach/`, and old keys pile up next to live ones.
- **Two key types** (workspace and organisation). A command that needs the other one fails with a 403 and no hint.
- **No `--json` switch**, so scripts guess the output shape.
- Complex writes take raw `--body '<json>'`, which is easy to get wrong. Template tokens are a known trap: `{{FIRST_NAME}}` is sent with the braces showing.
- About 10 MB to install.

## Best in class

- **GitHub `gh`:** keychain first, a plain file only with `--insecure-storage`. `--json` with named fields on reads. Destructive commands ask, `--yes` skips, `GH_NO_PROMPT` for CI. Documented exit codes. ([formatting](https://cli.github.com/manual/gh_help_formatting))
- **Stripe CLI:** `stripe login` through the browser is smooth, but the key ends up in a plain `config.toml`, and people have [complained about it](https://dev.to/the_seventeen/the-stripe-cli-stores-your-api-key-in-plaintext-heres-the-fix-3imi). ([docs](https://docs.stripe.com/cli))
- **Linear MCP:** remote only, one `claude mcp add` line, OAuth in the browser, no key to copy. For stdio-only clients they suggest `npx mcp-remote`. ([docs](https://linear.app/docs/mcp))
- **Vercel CLI:** device login, and a config file that says "never commit this". ([docs](https://vercel.com/docs/cli/login))

## What "better" means for dewx

Simpler, safer, and clear enough for a fifth grader.

1. **Every write previews and asks.** "This will: ..." then `Go ahead? [y/N]`. `--yes` for scripts, `--dry-run` to only look. With no terminal and no `--yes`, it refuses.
2. **The server decides.** The CLI is a thin client over the same MCP endpoint the app's tools use. The safety guard, caps, office hours, never-contact list and balance all run on dewx.ai, so no client, ours or anyone's, can skip them.
3. **Keychain first.** macOS Keychain or Linux Secret Service, with the token passed on stdin (never in `ps`). A mode-600 file only when there is no keychain or you ask. `DEWX_TOKEN` for CI.
4. **One token type, two scopes.** Read or Write, one workspace each. No token can reach money, the mode or other tokens. A Read token says so at login.
5. **`--json` everywhere**, and preview text goes to stderr so JSON on stdout stays clean.
6. **Documented exit codes** (0 to 5), including one for "dewx.ai said no" with the server's own words.
7. **Tokens masked everywhere** (`dxm_AbCd****`): output, errors, debug lines.
8. **No telemetry.** The only calls go to the API you logged in to.
9. **MCP both ways.** Remote HTTP for tools that support it; `dewx mcp` on stdio for the ones that do not, with the token read from the keychain instead of pasted into a config file.
10. **Tiny.** No runtime dependencies, about 20 kB. Node's own `fetch`, `readline` and `child_process` do the work.
11. **Single braces checked.** `dewx templates set` refuses `{{...}}` before anything is sent.
12. **Skills included.** `dewx skills install` adds our writing, research, list and reply skills to Claude Code; the same files work in ChatGPT and other tools.

## Not done, on purpose (for now)

- Browser login (OAuth). The API uses tokens made in Settings today; a paste is one step and honest about what it is.
- Self-update. `npx dewx` always runs the latest; `npm i -g dewx@latest` updates.
- Reading templates back, approving drafts and changing the mode. The API does not offer the first two to tokens yet, and the mode is kept owner-only on purpose.
