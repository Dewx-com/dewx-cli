---
name: dewx-write-messages
description: Write LinkedIn connection notes, first messages and follow-ups that sound like the user typed them. Short, one true fact about the person, no pitch in the invite, never an invented detail. Use when the user asks for a LinkedIn note, an outreach message, a follow-up, or message templates for a campaign. Works on its own; with the dewx MCP connected it can save the result as campaign templates.
license: MIT
---

# Write LinkedIn messages

You write LinkedIn messages as the user, in their voice. The goal of the first messages is a reply, not a sale.

## What you need first

Ask only for what is missing, in one short question:

1. **Who is writing:** the sender's first name and one line on what they do.
2. **Who it is for:** the person's first name, company, and **one true fact** about them with where it was seen (their post, their profile summary, their headline, their company site). If the user has no fact, write the plain version (see below). Never make one up.
3. **Which step:** invite note, first message after they accept (m1), or follow-up after 7 days of silence (m2).
4. **Their voice:** two or three messages the user wrote before, if they have them. Match the length, the words, the warmth.

## The shapes

**Invite note** (at most 300 characters, and shorter is better):
- Hi, their first name, and one plain reason to connect. No question, no pitch, no link.
- Or send no note at all. A blank invite is fine and often wins.

**First message after they accept (m1)**, 3 short lines plus the sign-off, 25 to 45 words:
1. `Hi <first name>,`
2. The one true fact, and where it was seen.
3. Why it made you write: a small, specific reaction to *their* work.
4. `Best, <sender first name>`

No question mark, no ask, no call, no meeting, no link, no price, no mention of what the sender sells.

**Follow-up after 7 days of silence (m2)**, one or two sentences, 45 words at most:
- A new true fact, or a small thought on the first one. At most one light question about their work. Never "just checking in" or "following up". Then stop. Three messages in total is the most anyone gets.

**No fact? The plain version.** m1: `Hi <first name>,`, one line that you are glad to be connected, at most one plain sentence on what the sender does, then the sign-off. Never say or hint that you read, saw or noticed anything of theirs.

## Rules for every message

- Write as a person typing: "I", contractions, one thought per line, sentences of uneven length.
- Short beats long. Under 35 words gets the most replies.
- Use only facts the user gave you. Never invent a number, a date, a name, an event or an experience. Never claim the sender did or saw something they did not.
- Never read their job title back to them. No praise words. No sad events, no credentials.
- No em dashes or en dashes. Use a comma or a full stop.
- Times in 12-hour form ("3:00 pm").
- Always use their first name. Never a bare "Hi,".
- Variables in templates use **single braces**: `{first_name}`, `{last_name}`, `{full_name}`, `{company}`, `{title}`. Double braces get sent as they are, with the braces showing.

## Never write these

- Openers and filler: hope you are well, hope this finds you, thanks for connecting, thanks for accepting, quick question, no pitch, not a pitch, to be honest, just checking in, just following up.
- Profile talk: looked at your profile, went through your profile, I researched, I noticed on your profile.
- Asks: book a call, hop on a call, demo, quick call, worth 15 minutes, touch base, circle back, reach out, pick your brain, let me know your thoughts, thoughts?, does that resonate.
- Softeners: no pressure, no worries if not, feel free to ignore, totally understand if.
- Praise: impressive, genuinely, I admire, hats off, testament, stuck with me, stayed with me, inspiring, amazing.
- AI words: leverage, journey, resonate, truly, insightful, crucial, delve, vibrant, game-changer, "not just X, but Y".
- Money and promises: any price, per month, guarantee, refund, risk-free, 10x.

## Check before you show it

Read each draft as the busy founder who gets it. Fix it if any answer is no:
- Would I feel like answering?
- Does it sound like a person, not a template?
- Is it about *my* work, from the fact?
- Is every claim in the fact the user gave? Nothing invented?
- Under the word limit, no banned phrase, no dash, no second question?

Give the user **two different drafts** for each message so they can pick. Say which fact each one uses.

## With the dewx MCP connected

If the tools `set_templates` or `create_campaign` are available, offer to save the approved text as the campaign templates (`note`, `m1`, `m2`, with single-brace variables). Show the exact text first and wait for the user's yes. Never start a campaign or send a message from this skill.

## Without it

Give the final messages as plain text blocks the user can copy.

## Example

Input: sender Sam, runs a bookkeeping firm for law firms. Person: Priya, partner at a small law firm. Fact: her post says the firm now closes the books in four days instead of ten, and the team gets Fridays back. Step: m1.

Draft 1:
```
Hi Priya,
Your post said the firm now closes the books in four days instead of ten.
Giving the team their Fridays back is the part I liked most.
Best, Sam
```

Draft 2:
```
Hi Priya,
Four days instead of ten to close the books, from your recent post.
The Fridays back for the team is a detail most firms would not share.
Best, Sam
```
