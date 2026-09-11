import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadDecisions } from './lib/key-decisions.mjs';
import {
  META_EIP_BY_FORK,
  fetchMetaEip,
  parseMetaEip,
  reconcileMetaEip,
} from './lib/meta-sip.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const EIPS_DIR = path.join(__dirname, '../src/data/sips');

// Active statuses — SIPs that are part of a fork pipeline (not declined/withdrawn)
const ACTIVE_STATUSES = new Set(['Proposed', 'Considered', 'Scheduled', 'Included']);

// Mirrors src/domain/sips/rankableEips.ts, which the audit cannot import (TS).
const RANK_FORK = 'hegota';
const RANKABLE_STATUSES = new Set(['Proposed', 'Considered']);

// Priority order for current fork status (higher index = more advanced)
const STATUS_PRIORITY = ['Proposed', 'Considered', 'Scheduled', 'Included'];

function loadEips() {
  const files = fs.readdirSync(EIPS_DIR).filter(f => f.endsWith('.json'));
  return files.map(f => JSON.parse(fs.readFileSync(path.join(EIPS_DIR, f), 'utf8')));
}

function getCurrentStatus(forkRelationship) {
  const history = forkRelationship.statusHistory;
  if (!history || history.length === 0) return null;
  return history[history.length - 1].status;
}

function getHighestActiveStatus(sip) {
  let highest = -1;
  let forkName = null;
  for (const fr of sip.forkRelationships) {
    const status = getCurrentStatus(fr);
    if (!status || !ACTIVE_STATUSES.has(status)) continue;
    const priority = STATUS_PRIORITY.indexOf(status);
    if (priority > highest) {
      highest = priority;
      forkName = fr.forkName;
    }
  }
  return highest >= 0 ? { status: STATUS_PRIORITY[highest], forkName } : null;
}

function audit(sips) {
  const issues = [];

  for (const sip of sips) {
    if (!sip.forkRelationships || sip.forkRelationships.length === 0) continue;

    const active = getHighestActiveStatus(sip);
    if (!active) continue; // all relationships are Declined/Withdrawn

    const eipIssues = [];

    if (!sip.layer) {
      eipIssues.push('missing layer (EL or CL)');
    }
    if (!sip.reviewer) {
      eipIssues.push('missing reviewer (bot, staff, or expert)');
    }
    if (!sip.laymanDescription) {
      eipIssues.push('missing laymanDescription');
    }
    if (!sip.benefits) {
      eipIssues.push('missing benefits');
    }

    if (eipIssues.length > 0) {
      issues.push({
        id: sip.id,
        title: sip.title,
        status: active.status,
        fork: active.forkName,
        issues: eipIssues,
      });
    }
  }

  // Sort by SIP id within each group
  issues.sort((a, b) => a.id - b.id);

  return issues;
}

// The proposals the rank page puts on its board: still-undecided SIPs for
// RANK_FORK, minus headliners and Informational SIPs.
function getRankableEips(sips) {
  return sips
    .filter(sip => {
      if (sip.type === 'Informational') return false;
      const fr = (sip.forkRelationships || []).find(
        r => r.forkName.toLowerCase() === RANK_FORK
      );
      if (!fr || fr.isHeadliner) return false;
      return RANKABLE_STATUSES.has(getCurrentStatus(fr));
    })
    .sort((a, b) => a.id - b.id);
}

// SIPs whose spec PR has not merged upstream yet, so their spec link points at
// the PR rather than sila.org.
function getPendingEips(sips) {
  return sips
    .flatMap(sip => {
      if (!sip.pendingPullRequest) return [];
      const active = getHighestActiveStatus(sip);
      return active ? [{ id: sip.id, ...active }] : [];
    })
    .sort((a, b) => a.id - b.id);
}

// Check that each recorded stage-change decision is reflected in the SIP's
// forkRelationships (a statusHistory entry with the same status + call ref).
function auditDecisions(sips, decisions) {
  const byId = new Map(sips.map(e => [e.id, e]));
  const issues = [];

  for (const d of decisions) {
    const sip = byId.get(d.id);
    if (!sip) {
      issues.push({ ...d, reason: 'no SIP data file' });
      continue;
    }

    const fr = (sip.forkRelationships || []).find(
      r => r.forkName.toLowerCase() === d.fork.toLowerCase()
    );
    if (!fr) {
      issues.push({ ...d, reason: `no "${d.fork}" fork relationship` });
      continue;
    }

    const history = fr.statusHistory || [];
    const exact = history.some(h => h.status === d.status && h.call === d.call);
    if (exact) continue; // decision reflected

    const statusPresent = history.some(h => h.status === d.status);
    issues.push({
      ...d,
      reason: statusPresent
        ? `status "${d.status}" present but not attributed to call ${d.call}`
        : `status "${d.status}" not recorded`,
    });
  }

  issues.sort((a, b) => a.id - b.id || a.call.localeCompare(b.call));
  return issues;
}

// Compare each fork's Hardfork Meta SIP against our data. The meta SIP is the
// canonical record, so anything it lists that we do not know about is a gap.
async function auditMetaEips(sips, forkFilter) {
  const forks = Object.keys(META_EIP_BY_FORK).filter(
    (f) => !forkFilter || f === forkFilter.toLowerCase()
  );

  const results = [];
  for (const fork of forks) {
    const metaEipNumber = META_EIP_BY_FORK[fork];
    try {
      const markdown = await fetchMetaEip(metaEipNumber);
      const entries = parseMetaEip(markdown);
      if (entries.size === 0) {
        // Otherwise an upstream restructure reads as a clean audit.
        throw new Error('parsed 0 SIPs; the meta SIP layout likely changed');
      }
      results.push({
        fork,
        metaEipNumber,
        issues: reconcileMetaEip(entries, sips, fork),
      });
    } catch (error) {
      results.push({ fork, metaEipNumber, error: error.message });
    }
  }
  return results;
}

function parseArgs() {
  const args = process.argv.slice(2);
  const options = { fork: null, help: false, skipMeta: false };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--fork' || args[i] === '-f') {
      options.fork = args[++i];
    } else if (args[i] === '--no-meta') {
      options.skipMeta = true;
    } else if (args[i] === '--help' || args[i] === '-h') {
      options.help = true;
    }
  }
  return options;
}

function printHelp() {
  console.log(`
SIP Audit
=========

Detects SIPs with active fork designations that are missing data.

Usage:
  node scripts/audit-sips.mjs [options]

Options:
  -f, --fork <name>   Only check SIPs active in this fork (e.g., Glamsterdam)
      --no-meta       Skip the Hardfork Meta SIP reconciliation (avoids network)
  -h, --help          Show this help message

Checks for:
  - layer             (EL or CL)
  - reviewer          (bot, staff, or expert)
  - laymanDescription
  - benefits

Also checks that stage-change decisions recorded in call
key_decisions.json files are reflected in the SIP forkRelationships,
and that every SIP listed in a fork's Hardfork Meta SIP is present in
Forkcast at the same stage or further along.

Reports how many SIPs make up the rank page's board, and how many
active SIPs are awaiting an upstream spec PR merge.
`);
}

async function main() {
  const options = parseArgs();
  if (options.help) {
    printHelp();
    process.exit(0);
  }

  const sips = loadEips();
  let results = audit(sips);
  let decisionIssues = auditDecisions(sips, loadDecisions());

  if (options.fork) {
    const forkLower = options.fork.toLowerCase();
    results = results.filter(r => r.fork.toLowerCase() === forkLower);
    decisionIssues = decisionIssues.filter(r => r.fork.toLowerCase() === forkLower);
  }

  console.log('SIP Audit');
  console.log('=========\n');

  if (options.fork) {
    console.log(`Fork filter: ${options.fork}\n`);
  }

  // --- Data completeness ---
  console.log('Data completeness');
  console.log('-'.repeat(40));
  let totalIssues = 0;
  if (results.length === 0) {
    console.log('  No issues. All active SIPs have complete data.\n');
  } else {
    const grouped = {};
    for (const r of results) {
      if (!grouped[r.fork]) grouped[r.fork] = [];
      grouped[r.fork].push(r);
    }
    for (const fork of Object.keys(grouped).sort()) {
      const group = grouped[fork];
      console.log(`  ${fork} (${group.length})`);
      for (const r of group) {
        console.log(`    SIP-${r.id} (${r.status})`);
        for (const issue of r.issues) {
          console.log(`      - ${issue}`);
          totalIssues++;
        }
      }
    }
    console.log();
  }

  // --- Inclusion decisions reflected in SIP data ---
  console.log('Inclusion decisions vs. SIP data');
  console.log('-'.repeat(40));
  if (decisionIssues.length === 0) {
    console.log('  No issues. All recorded stage-change decisions are reflected.\n');
  } else {
    for (const d of decisionIssues) {
      console.log(`  SIP-${d.id} — ${d.fork} → ${d.status} (${d.call}, ${d.date})`);
      console.log(`    - ${d.reason}`);
    }
    console.log();
  }

  // --- Rank page board size ---
  if (!options.fork || options.fork.toLowerCase() === RANK_FORK) {
    const rankable = getRankableEips(sips);
    const byLayer = { EL: 0, CL: 0, none: 0 };
    for (const sip of rankable) byLayer[sip.layer || 'none']++;
    console.log('Rank page');
    console.log('-'.repeat(40));
    console.log(
      `  ${rankable.length} SIP(s) on the board ` +
      `(${byLayer.EL} EL, ${byLayer.CL} CL, ${byLayer.none} without a layer).\n`
    );
  }

  // --- Pending spec PRs ---
  let pending = getPendingEips(sips);
  if (options.fork) {
    const forkLower = options.fork.toLowerCase();
    pending = pending.filter(p => p.forkName.toLowerCase() === forkLower);
  }
  console.log('Pending spec PRs (awaiting an upstream merge)');
  console.log('-'.repeat(40));
  if (pending.length === 0) {
    console.log('  None.\n');
  } else {
    const byFork = {};
    for (const p of pending) (byFork[p.forkName] ||= []).push(p);
    for (const fork of Object.keys(byFork).sort()) {
      const group = byFork[fork];
      console.log(`  ${fork} (${group.length}): ${group.map(p => p.id).join(', ')}`);
    }
    console.log();
  }

  // --- Hardfork Meta SIP reconciliation ---
  let metaIssueCount = 0;
  let metaErrorCount = 0;
  if (!options.skipMeta) {
    console.log('Hardfork Meta SIP vs. Forkcast data');
    console.log('-'.repeat(40));
    for (const { fork, metaEipNumber, issues, error } of await auditMetaEips(sips, options.fork)) {
      if (error) {
        console.log(`  ${fork} (SIP-${metaEipNumber}) — could not check: ${error}`);
        metaErrorCount++;
        continue;
      }
      if (issues.length === 0) continue;
      console.log(`  ${fork} (SIP-${metaEipNumber})`);
      for (const i of issues) {
        console.log(`    SIP-${i.id} — ${i.reason}`);
        metaIssueCount++;
      }
    }
    if (metaIssueCount === 0 && metaErrorCount === 0) {
      console.log('  No issues. Forkcast covers everything in the meta SIPs.');
    }
    console.log();
  }

  const hasIssues =
    results.length > 0 ||
    decisionIssues.length > 0 ||
    metaIssueCount > 0 ||
    metaErrorCount > 0;
  console.log(
    `${results.length} SIP(s) with ${totalIssues} data issue(s); ` +
    `${decisionIssues.length} unreflected decision(s); ` +
    `${metaIssueCount} meta SIP gap(s)` +
    `${metaErrorCount > 0 ? `; ${metaErrorCount} meta SIP(s) unchecked` : ''}.`
  );
  process.exit(hasIssues ? 1 : 0);
}

await main();
