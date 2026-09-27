# dewx skills

Four skills for LinkedIn outreach. Each works on its own in Claude, ChatGPT or any other AI, and works better with the dewx MCP connected, because it can then save templates, add leads and send replies (always after your yes).

| Skill | What it does |
|---|---|
| [dewx-write-messages](dewx-write-messages/) | Invite notes, first messages and follow-ups in your voice. Short, one true fact, nothing invented. |
| [dewx-lead-research](dewx-lead-research/) | One lead or company into sourced facts, a fit verdict and one true observation. |
| [dewx-list-builder](dewx-list-builder/) | Your ICP into Sales Navigator filters and a ready search link. |
| [dewx-reply-handler](dewx-reply-handler/) | Sort a reply (is it a real yes?) and draft the answer. |

## Install

- **Claude Code:** `npx dewx skills install` copies them to `~/.claude/skills/`. Or copy the folders yourself.
- **Claude (web and desktop):** zip one folder (`zip -r dewx-write-messages.zip dewx-write-messages`) and upload it in Settings, Capabilities, Skills.
- **ChatGPT:** make a GPT (Explore GPTs, Create). Paste the skill's `SKILL.md` into Instructions. Upload any other files in its folder as Knowledge. Each `SKILL.md` is under ChatGPT's 8,000 character limit.
- **Gemini, and any other AI:** paste `SKILL.md` at the start of the chat, then ask.

## Connect dewx (optional)

With the dewx MCP connected, the skills can push results into your campaign. See the main [README](../README.md#connect-claude-and-other-ai-tools).

The rules in these skills come from our own measured outreach: short notes with one true fact and no ask get the most replies, a link or a pitch in the first message cuts them, and invented details get caught.
