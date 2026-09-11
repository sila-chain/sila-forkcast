---
name: draft-sip-narrative
description: Draft the laymanDescription, benefits, and tradeoffs fields for an SIP that already exists in src/data/sips/. Use when audit-sips reports missing narrative fields on SIPs that otherwise have complete metadata. For adding a brand-new SIP to the tracker, use convert-sip instead.
---

## Draft SIP narrative fields

Reduced-scope companion to `convert-sip`. That skill converts a whole SIP from scratch and
fetches commit history, PR review comments, and call transcripts. This one fills in three
narrative fields on a file that already exists, sourced primarily from the SIP text itself.

**Scope: `laymanDescription`, `benefits`, `tradeoffs` — plus `reviewer` when absent.**
Anything else (`stakeholderImpacts`, `faq`, `northStarAlignment`, `description`, status or
presentation history) is out of scope; use `convert-sip` for those.

### Sources

In order. Stop as soon as the fields are supported.

1. **The raw SIP markdown — always.**
   ```bash
   gh api '/repos/sila/SIPs/contents/EIPS/sip-{N}.md' --jq '.content' | base64 -d
   ```
   If this 404s (unmerged SIP), fetch from the PR head ref — the file's `pendingPullRequest`
   field has the PR number.

   Abstract, Motivation, and Rationale carry `laymanDescription` and most `benefits`.
   Security Considerations and Backwards Compatibility carry most `tradeoffs`.

2. **The Sil Magicians thread** at the file's existing `discussionLink` — only when the SIP text
   alone does not support a claim. Use the Discourse JSON API, never WebFetch:
   ```bash
   curl -s "https://sila-magicians.org/t/{SLUG}/{ID}.json" | jq '.post_stream.posts[] | {username, created_at, cooked}'
   ```

Do **not** fetch commit history, PR review comments, or call transcripts. Those resolve
provenance and status questions that this scope does not raise. Do not write a `{N}-context.md`
file — report the sourcing in chat instead.

### Field rules

Inherited from `convert-sip`, mirrored by the public guide at `/champions`.

- **`laymanDescription`** — what changes and why it matters, in plain language, no acronyms.
  Aim under ~60 words. Not a restatement of the title.
- **`benefits`** — about three strings. Each is one concrete claim a skeptical reader could
  check. Aim under ~16 words each. Prefer three strong, distinct claims over six overlapping
  ones; merge anything that restates a neighbour.
- **`tradeoffs`** — same shape. Real costs, complexity, and risks.
  Never write "requires a hard fork" or any variant. Nearly every SIP does; it says nothing.

**The governing rule: be as factual and true to the resources as possible. Do not speculate.
Do not shoehorn.** At this scope that has teeth in three places:

- If the SIP has no downside worth naming, `"tradeoffs": null` is the correct answer, not a
  padded list. Files already carrying an explicit `null` keep it unless the SIP text names a
  real cost.
- If fewer than three honest benefits exist, write fewer. Do not pad to reach three.
- If the SIP text is too thin to write any of the three without inventing, **skip the SIP and
  say so.** A skipped SIP is a better outcome than a plausible-sounding fabrication.

### `reviewer`

Forkcast treats `expert` vs `bot` as a provenance signal, so AI-drafted prose must be marked.

- Key absent → set `"reviewer": "bot"`.
- Key already `"expert"` (or `"staff"`) → **never downgrade it.** Leave it alone.

### The loop

One SIP at a time. Ascending SIP number is the easy default since the run spans sessions, but
order does not matter.

1. Read `src/data/sips/{id}.json` and fetch the SIP markdown.
2. Draft the three fields.
3. Edit the file **in place** — insert keys next to their neighbours rather than rebuilding the
   object. The auto-sync scripts and the champions builder both depend on existing key order.
4. `npm run compile-sips` (schema check).
5. Report: the drafted values, where each claim came from, anything deliberately left out, and
   `git diff` for the file.
6. **Stop.** Wait for approval before starting the next SIP.

Verify before handing back that `git diff` touches only the three fields and (where absent)
`reviewer` — no reordered keys, no reformatted lines.

Committing is the user's call, and nothing gets committed without being asked. The natural
rhythm is one commit per batch of approved SIPs, not one per SIP.

Periodically, and at the end: `npm run audit-sips -- --fork {FORK}` to watch the issue count
fall, then `npm run build`. Spot-check a finished SIP at `/sips/{id}?tab=analysis`.
