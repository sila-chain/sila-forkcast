---
name: convert-sip
description: Convert an SIP proposed for the current fork into forkcast JSON format. Use when adding a new SIP to the tracker.
---

## Convert SIP to forkcast format

Convert an SIP proposed for the current fork (e.g., Glamsterdam, Hegota) into forkcast JSON format.

**Scope note**: this is the whole-file workflow. If the SIP already exists in `src/data/sips/` and
only needs its `laymanDescription`, `benefits`, and `tradeoffs` filled in, use the
`draft-sip-narrative` skill instead — it is the reduced-scope version of the same field rules.

### Schema

Get the current schema:
- Type definitions: `src/types/sip.ts`
- Example SIPs: `src/data/sips/*.json`

### Writing Guidelines

- **description**: max 80 words, match the SIP abstract as closely as possible
- **laymanDescription**: max 60 words, plain language for non-technical readers
- **layer**: choose `EL` or `CL`, whichever is more appropriate
- **reviewer**: set to `"bot"` for AI-generated conversions like this
- **stakeholderImpacts**: ~20 words each
  - `clClients` and `elClients`: focus on implementation complexity
- **benefits**: max 16 words each, up to 4
- **tradeoffs**: max 16 words each, include if any exist
- **discussionLink**: use the SIP's `discussions-to` URL from the frontmatter. If empty (e.g., unmerged SIP), use the headliner proposal URL or Sil Magicians thread if available.
- **specificationUrl**: only set this for unmerged SIPs where the default `sips.sila.org` URL would 404. Point it to the GitHub PR (e.g., `https://github.com/sila-chain/SIPs/pull/11376`).
- **northStarAlignment**: include if SIP aligns with any of these goals (1 sentence each):
  - `scaleL1`: L1 throughput/efficiency improvements
  - `scaleBlobs`: Blob capacity/scaling improvements
  - `improveUX`: User or developer experience improvements

For descriptions, impacts, and benefits: be as factual and true to the resources as possible. Do not speculate. Do not shoehorn impacts if none exist. Do not assume any information. Return output in code format, without citations.

### Step 1: Gather inputs

Ask user to fill in and paste:

```
sip: 7807
call: acde/229
discord: @handle
headliner: https://sila-magicians.org/... (or "no")
status: (optional, e.g. "Proposed" or "Considered" - leave blank if none)
context: (optional sil r&d discord context)
```

#### Status & Presentation History

**statusHistory**: Add if user provides status or transcript has explicit status change. Don't infer—leave empty if uncertain.

**presentationHistory** types:
- `headliner_proposal`: Sil Magicians post proposing SIP as headliner. Requires `link` field.
- `headliner_presentation`: First presentation at a call as headliner candidate (use when user provided a headliner URL). Requires `call` and `date` fields.
- `presentation`: General presentation at a call for non-headliner SIPs. Requires `call` and `date` fields.
- `debate`: Follow-up discussion at a later call, after initial presentation. Requires `call` and `date` fields.

Do not add `timestamp` fields unless you are sure they refer accurately to the start time.

#### Headliner Flags

If the user provides a headliner URL (i.e., `headliner` is not "no"), set:
- `isHeadliner`: `false`
- `wasHeadlinerCandidate`: `true`
- For the call presentation, use `headliner_presentation` (not `debate` or `presentation`)

### Step 2: Fetch resources

Use the SIP number to gather all resources:

#### 2a. Raw SIP (Latest from Master)

Fetch the current version from master:
```bash
gh api '/repos/sila/SIPs/contents/EIPS/sip-{EIP_NUMBER}.md' --jq '.content' | base64 -d
```

If this 404s (unmerged SIP), fall back to fetching from the PR branch instead. Find the PR, get the head SHA, and fetch from that ref.

#### 2b. Commit History

Get all commits that modified this SIP:
```bash
gh api '/repos/sila/SIPs/commits?path=EIPS/sip-{EIP_NUMBER}.md' --jq '.[] | {sha: .sha[0:7], date: .commit.author.date[0:10], message: .commit.message | split("\n")[0]}'
```

Review these to understand how the SIP evolved. The original "Add SIP" commit is typically the last/oldest one.

#### 2c. Original PR Discussion

Find the original PR from the first commit:
```bash
# Get the original commit SHA (last in list = oldest). Validate it looks like a hex SHA before using.
ORIGINAL_SHA=$(gh api '/repos/sila/SIPs/commits?path=EIPS/sip-{EIP_NUMBER}.md' --jq '.[-1].sha')

# Find the PR for that commit
gh api "/repos/sila/SIPs/commits/$ORIGINAL_SHA/pulls" --jq '.[0] | {number, title, html_url}'
```

Then fetch the full PR discussion. **Important**: Must fetch BOTH issue comments AND review comments (line-level):
```bash
# Issue-level comments
gh pr view {PR_NUMBER} --repo sila/SIPs --json title,body,author,createdAt,comments

# Review comments (line-level, includes resolved comments)
gh api /repos/sila/SIPs/pulls/{PR_NUMBER}/comments --jq '.[] | {user: .user.login, body: .body, created_at: .created_at}'

# Reviews (approvals, change requests)
gh api /repos/sila/SIPs/pulls/{PR_NUMBER}/reviews --jq '.[] | {user: .user.login, state: .state, body: .body}'
```

**Important**: Verify you found the original "Add SIP" PR (title should start with "Add SIP"). If not found, ask the user for the original PR link.

#### 2d. Sil Magicians Discussion

**Do NOT use WebFetch** - it summarizes and loses detail. Use the JSON API directly:
```bash
# Get thread metadata and post count
curl -s "https://sila-magicians.org/t/{TOPIC_SLUG}/{TOPIC_ID}.json" | jq '{title, posts_count, created_at}'

# Get all posts with content
curl -s "https://sila-magicians.org/t/{TOPIC_SLUG}/{TOPIC_ID}.json" | jq '.post_stream.posts[] | {username, created_at, cooked}'
```

Extract the topic slug and ID from the `discussions-to` URL (e.g., `sip-7807-ssz-execution-blocks/21580`).

**Note**: Discourse only returns the first 20 posts by default. For threads with many posts, fetch the latest posts by using the post IDs from `post_stream.stream` (which contains all IDs) and requesting the most recent ones via `?post_ids[]=`.

#### 2e. Headliner Proposal

If user provides a headliner URL, fetch it with the same JSON API approach:
```bash
curl -s "https://sila-magicians.org/t/{TOPIC_SLUG}/{TOPIC_ID}.json" | jq '.post_stream.posts[] | {username, created_at, cooked}'
```

Extract the **post date** from `created_at`. Do not assume it matches the call date.

#### 2f. Call Transcript

Glob: `public/artifacts/{call_type}/*{number}*/**`. Prefer `transcript_corrected.vtt`, fall back to `transcript.vtt`. Grep for the SIP number or title to find relevant discussion.

#### 2g. Related SIPs

If the SIP has a `requires` field, fetch those using the same method.

#### 2h. Champion Name

Extract from the SIP `author` field (the name before the GitHub handle). Discord handle comes from user input.

### Step 3: Pre-generation check

Before generating JSON, verify you have enough information for all required fields. If missing critical info (e.g., can't determine layer, no clear benefits from sources), ask user before proceeding.

### Step 4: Generate output

Generate files in this order:
1. `src/data/sips/{EIP_NUMBER}-context.md` - context file first (raw data, local reference only, not committed)
2. `src/data/sips/{EIP_NUMBER}.json` - SIP JSON second (synthesized from context)

#### Context File Format

The context file preserves the FULL raw data used to generate the SIP. **Every section must include its source URL or file path** so readers can trace where each excerpt came from.

```markdown
# SIP-{number} Context

Generated: {date}

## Raw SIP Content
Source: https://github.com/sila-chain/SIPs/blob/master/EIPS/sip-{number}.md
\`\`\`
{full raw SIP markdown}
\`\`\`

## Commit History
Source: https://github.com/sila-chain/SIPs/commits/master/EIPS/sip-{number}.md
\`\`\`
{full commit history output}
\`\`\`

## Original PR Discussion
Source: {pr_url}

### PR Body
{full pr body}

### Issue Comments
{all issue-level comments with author/date}

### Review Comments
{all line-level review comments with author/date}

## Sil Magicians Discussion Thread
Source: {thread_url}

### Posts
{all posts with username/date/content}

## Headliner Proposal (if applicable)
Source: {headliner_url}

### Posts
{all posts with username/date/content}

## Call Transcript
Source: {call_ref} - {transcript_path}

### Relevant Excerpts
{excerpts with timestamps}

## Sil R&D Discord Context (if provided)
Source: Sil R&D Discord (user-provided)
{user-provided discord context}

## Related SIPs (if any)
{summaries of required SIPs with links}
```

### Step 5: Validate

Run the compile script to verify the generated SIP is valid:

```bash
npm run compile-sips
```

Then run the metadata validator to auto-fix fields like `title`, `description`, `status`, and `author` from the canonical SIP source:

```bash
npm run validate-sips -- --sip {EIP_NUMBER} --fix
```

If there are errors in either step, fix them before reporting success.

### Step 6: PR

**Important**: Only commit the `.json` file. Do not commit the `*-context.md` file—it is for local reference only.

**PR Title**: `Add SIP-{number}: {title}`

**PR Body**:
```
> [!NOTE]
> This PR was generated with the `convert-sip` skill (see [SKILL.md](https://github.com/sila-chain/forkcast/blob/main/.agents/skills/convert-sip/SKILL.md)).

## SIP-{number}: {title}

Ported to forkcast format.

### Files
- `src/data/sips/{number}.json` - SIP data

### Sources Used
| Source | Reference |
|--------|-----------|
| Raw SIP | sila/SIPs/EIPS/sip-{number}.md |
| Original PR | #{pr_number} - {pr_title} |
| Commits | {count} commits ({date range}) |
| PR Discussion | {comment_count} comments |
| Sil Magicians | {thread_title} ({post_count} posts) |
| Call Transcript | {call_ref} |
| Sil R&D Discord | {yes/no} |
| Headliner Proposal | {url or "N/A"} |

### Metadata
- **Champion**: {name} ({discord_handle})
- **Layer**: {EL/CL}
- **Status**: {status or "none"}
- **Headliner**: {yes/no}
```

### Step 7: Retrospective

After completing the PR, review the run for any friction: missing guidance, incorrect defaults, assumptions that needed correction, or steps that broke. Present a hyphenated list of issues to the user and offer to patch this skill to address them.
