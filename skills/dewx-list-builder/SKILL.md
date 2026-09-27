---
name: dewx-list-builder
description: Turn a plain-words ICP ("founders of 10 to 50 person law firms in the US") into LinkedIn Sales Navigator filters and a ready search link, with a note on how big and how clean the list will be. Use when the user wants to find leads, build a prospect list, target a market on LinkedIn, or asks for a Sales Navigator search. Works on its own; with the dewx MCP connected it can pull the people from the link into the user's campaign.
license: MIT
---

# Build a lead list

You turn who the user sells to into a Sales Navigator search: the filters, the link, and what to expect. You never guess a filter id.

## What you need first

Ask only for what is missing, in one short question:
1. **Who buys:** job titles or roles (the person who says yes, not a junior user).
2. **What kind of company:** industry, and size in employees.
3. **Where:** countries.
4. **Who to leave out:** competitors, current clients, agencies, students, anyone the user must not contact.

## Turn it into filters

- **Titles:** 3 to 8 real titles, as people write them ("Founder", "Co-Founder", "Managing Partner", "Owner"). Titles are free text, so include the common spellings.
- **Seniority:** Owner / Partner, CXO, Vice President, Director, Experienced Manager. Pick the level that decides.
- **Industry:** LinkedIn's own names ("Business Consulting and Services", not "Management Consulting").
- **Headcount:** LinkedIn's bands: 1-10, 11-50, 51-200, 201-500, 501-1000, 1001-5000, 5001-10,000, 10,000+.
- **Region:** countries.
- **Extras that raise replies:** "Posted on LinkedIn in the past 30 days" (active people answer more), 2nd degree connections (warmer).
- **Keywords:** only when titles and industry are not enough; `OR` between words.

Explain each choice in one line, so the user can say "more CEOs, no agencies" and you change just that part.

## Build the link

If you can run code, use the script in this folder, which has the filter ids LinkedIn uses:

```
node build-url.mjs '{"titles":["Founder","Managing Partner"],"regions":["United States"],"industries":["Legal Services"],"headcount":["11-50"],"seniority":["Owner / Partner"],"postedRecently":true}'
```

It prints the link. If a value is not in `filters.json`, it stops and says so. Do not invent the id. Tell the user to run that one filter in Sales Navigator once, and copy the id from the address bar into `filters.json`.

If you cannot run code, give the filters as a checklist the user clicks in Sales Navigator, in this order: Current job title, Seniority level, Industry, Company headcount, Geography, then the spotlights.

## Say what to expect

- A good first list is **200 to 2,000 people**. Over 5,000 is too loose: add a title or narrow the size. Under 100 is too tight.
- Name the likely noise: agencies, freelancers, people with the title at a one-person company, wrong country in the headline.
- Suggest running the lead research skill on a sample of 10 before pulling everyone.

## With the dewx MCP connected

After the user says yes to the link, `add_leads` with `salesnav_url` (and `limit`, and `countries` to keep only some countries) pulls the people into their campaign with their own LinkedIn account, slowly and inside LinkedIn's limits. Show the link, the limit and the countries first and wait for the yes. Then `get_job` with the job id shows progress.
From the terminal: `dewx leads salesnav "<link>" --limit 200`.

## Without it

Give the link and the filter checklist as text.

## Example

"I sell bookkeeping to US law firms with 10 to 50 people. Find me the partners who run the business side."
