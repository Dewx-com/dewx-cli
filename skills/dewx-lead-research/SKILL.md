---
name: dewx-lead-research
description: Research one lead or company from public sources and return a sourced fact, an ICP fit verdict (PASS, FAIL or UNSURE) and one true observation a first message can open on. Every claim carries its link and the date it was read. Use when the user asks to research a person or company, check if a lead fits, qualify a list, or find something to say in a first message. Works on its own; with the dewx MCP connected it can read the user's leads and add the ones that pass.
license: MIT
---

# Research a lead

You turn a name (and a company, or a LinkedIn link) into a short, sourced record. You never guess. "I could not find it" is a good answer; an invented fact is the worst one.

## What you need first

1. **The lead:** name, company, and a LinkedIn or website link if there is one.
2. **The ICP (who the user sells to):** industry, role, company size, countries, and anything that rules a company out. If the user has not said, ask once in one line. If they still have not, research anyway and mark fit UNSURE.

## How to research

Use public sources only, in this order, and stop when you have enough:
1. The company's own website (about, team, services, news or blog pages).
2. The person's public LinkedIn profile and recent public posts, if you can open them.
3. Public registers, press, interviews, podcasts, conference talks.

If you cannot browse, say so and work only from what the user pasted.

Rules:
- Every fact gets the **link** it came from and the **date you read it**.
- Check you have the right entity: same name, same country, same person. If two companies share a name, say which one you mean and why.
- Recent beats old. A fact older than 12 months is marked as old.
- Never use: private or leaked data, a guessed email, anything about health, family, religion or politics, or a sad event (a layoff, an illness, a death).
- Headcount and founding year: give the number and its source, or "not found". Never estimate silently.

## The record

Return exactly this, in plain text:

```
Lead: <full name>, <title> at <company> (<country>)
Entity check: <how you know this is the right person and company>

Facts (each with source and date read):
1. <fact> | <link> | read <date>
2. ...

ICP fit: PASS | FAIL | UNSURE
Why: <one line per ICP rule: met, not met, or unknown, with the fact that shows it>

Observation for a first message:
<one true, specific thing about their work, from fact N, that a person would notice and react to>
Seen in: <their post | their profile summary | their headline | their site>

Not found: <what you looked for and could not find>
```

A good observation is about something they chose or said: a way they work, a decision, a number they shared. Not their job title, not praise, not a sad event. If no fact is good enough, say "No observation. Use the plain first message."

## With the dewx MCP connected

- `list_leads` shows the user's current leads; research the ones they pick.
- After the user says yes, `add_leads` can add the leads that PASS (name, company, country, title, LinkedIn link). Show the list first and wait for the yes. Leads that FAIL or are UNSURE are never added without the user asking.
- The observation can go straight to the `dewx-write-messages` skill.

## Without it

Give the records as text, and for several leads also a CSV with the columns `name,company,title,country,linkedinUrl,fit,observation,source` so the user can import it (`dewx leads import file.csv`).

## Example

"Research Priya Shah at Example Legal (UK). My ICP: law firms, 5 to 50 staff, UK, the partner who runs operations."
