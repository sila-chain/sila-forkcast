import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parseFrontmatter, mapOfficialToLocal } from './lib/sip-parsing.mjs';
import { getPendingPullRequestNumber } from './sip-record-sync.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const EIPS_DIR = path.join(__dirname, '../src/data/sips');
const OFFICIAL_EIP_BASE_URL = 'https://raw.githubusercontent.com/sila/SIPs/refs/heads/master/EIPS/sip-';

// Fields to compare between local and official
const FIELDS_TO_CHECK = ['title', 'description', 'author', 'status', 'category', 'createdDate', 'type', 'discussionLink', 'requires'];
const OPTIONAL_METADATA_FIELDS = new Set(['category', 'discussionLink', 'requires']);

// Rate limiting: delay between requests (ms)
const REQUEST_DELAY = 200;

/**
 * Parse command line arguments
 */
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    fork: null,
    sip: null,
    help: false,
    fix: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--fork' || arg === '-f') {
      options.fork = args[++i];
    } else if (arg === '--sip' || arg === '-e') {
      options.sip = parseInt(args[++i], 10);
    } else if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg === '--fix') {
      options.fix = true;
    }
  }

  return options;
}

/**
 * Print usage help
 */
function printHelp() {
  console.log(`
SIP Metadata Validator
======================

Compares local SIP metadata against the official sila/SIPs repository.

Usage:
  npm run validate-sips [options]

Options:
  -f, --fork <name>   Only check SIPs with a relationship to this fork
                      (e.g., Pectra, Fusaka, Glamsterdam)
  -e, --sip <number>  Only check a specific SIP by number
  --fix               Update local files with official metadata
  -h, --help          Show this help message

Examples:
  npm run validate-sips                     # Check all SIPs
  npm run validate-sips -- --fork Pectra    # Only Pectra SIPs
  npm run validate-sips -- -f Glamsterdam   # Only Glamsterdam SIPs
  npm run validate-sips -- --sip 7702       # Only SIP-7702
  npm run validate-sips -- -e 7702          # Only SIP-7702
  npm run validate-sips -- --sip 7702 --fix # Check and fix SIP-7702
  npm run validate-sips -- --fix            # Fix all mismatched SIPs
`);
}

/**
 * Filter SIPs based on CLI options
 */
function filterEips(sips, options) {
  let filtered = sips;

  if (options.sip) {
    filtered = filtered.filter(e => e.id === options.sip);
  }

  if (options.fork) {
    const forkName = options.fork.toLowerCase();
    filtered = filtered.filter(e =>
      e.forkRelationships?.some(
        fr => fr.forkName.toLowerCase() === forkName
      )
    );
  }

  return filtered;
}

/**
 * Fetch official SIP from GitHub (master branch, falling back to open PR)
 */
async function fetchOfficialEIP(eipNumber, localEip) {
  const url = `${OFFICIAL_EIP_BASE_URL}${eipNumber}.md`;
  try {
    const response = await fetch(url);
    if (!response.ok) {
      if (response.status === 404) {
        // Try fetching from an open PR if the local SIP is still pending.
        const prNumber = getPendingPullRequestNumber(localEip);
        if (prNumber) {
          return fetchEIPFromPR(eipNumber, prNumber);
        }
        return { error: 'NOT_FOUND' };
      }
      return { error: `HTTP ${response.status}` };
    }
    const content = await response.text();
    return { content };
  } catch (error) {
    return { error: error.message };
  }
}

/**
 * Fetch SIP from an open PR's head branch
 */
async function fetchEIPFromPR(eipNumber, prNumber) {
  const url = `https://raw.githubusercontent.com/sila/SIPs/refs/pull/${prNumber}/head/EIPS/sip-${eipNumber}.md`;
  try {
    const response = await fetch(url);
    if (!response.ok) {
      if (response.status === 404) {
        return { error: 'NOT_FOUND' };
      }
      return { error: `HTTP ${response.status} (from PR #${prNumber})` };
    }
    const content = await response.text();
    return { content, source: `PR #${prNumber}` };
  } catch (error) {
    return { error: error.message };
  }
}

/**
 * Normalize strings for comparison (trim, collapse whitespace)
 */
function normalize(str) {
  if (!str) return '';
  return str.toString().trim().replace(/\s+/g, ' ');
}

function formatValue(value) {
  if (value === undefined || value === null) return '(empty)';
  if (Array.isArray(value)) return value.join(', ');
  return value;
}

/**
 * Compare a field between local and official
 */
function compareField(fieldName, localValue, officialValue) {
  const localNorm = normalize(localValue);
  const officialNorm = normalize(officialValue);

  if (localNorm === officialNorm) {
    return null; // No difference
  }

  return {
    field: fieldName,
    local: formatValue(localValue),
    official: formatValue(officialValue),
  };
}

/**
 * Get local title without SIP prefix for comparison
 */
function getLocalTitleForComparison(localEip) {
  // Local titles are stored as "SIP-XXXX: Title" but official is just "Title"
  const match = localEip.title?.match(/^(?:SIP|RIP)-\d+:\s*(.*)$/);
  return match ? match[1] : localEip.title;
}

/**
 * Sleep for a given number of milliseconds
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Load all SIP files from the individual JSON files directory
 */
function loadEipsFromDir() {
  const files = fs.readdirSync(EIPS_DIR).filter(f => f.endsWith('.json'));
  const sips = [];
  for (const file of files) {
    const filePath = path.join(EIPS_DIR, file);
    const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    sips.push(content);
  }
  return sips;
}

/**
 * Update a local SIP file with official metadata
 */
function updateLocalEip(eipNumber, localEip, officialMapped) {
  const filePath = path.join(EIPS_DIR, `${eipNumber}.json`);

  // Create updated SIP object, preserving fields not in FIELDS_TO_CHECK
  const updated = { ...localEip };

  // Update each field with official value
  for (const field of FIELDS_TO_CHECK) {
    if (field === 'title') {
      // Preserve "SIP-XXXX:" prefix format
      if (officialMapped.title) {
        updated.title = `SIP-${eipNumber}: ${officialMapped.title}`;
      }
    } else if (officialMapped[field] !== undefined && officialMapped[field] !== null) {
      updated[field] = officialMapped[field];
    } else if (OPTIONAL_METADATA_FIELDS.has(field) && field in updated) {
      delete updated[field];
    }
  }

  // Write updated file
  fs.writeFileSync(filePath, JSON.stringify(updated, null, 2) + '\n');
  return true;
}

/**
 * Main validation function
 */
async function validateMetadata() {
  const options = parseArgs();

  if (options.help) {
    printHelp();
    process.exit(0);
  }

  console.log('SIP Metadata Validator');
  console.log('======================\n');
  console.log('Comparing local SIP data against official sila/SIPs repository...\n');

  // Load local SIPs from individual files
  if (!fs.existsSync(EIPS_DIR)) {
    console.error(`Error: SIPs directory not found at ${EIPS_DIR}`);
    process.exit(1);
  }

  const allEips = loadEipsFromDir();
  const localEips = filterEips(allEips, options);

  // Show filter info
  if (options.sip) {
    console.log(`Filtering: SIP-${options.sip}`);
  }
  if (options.fork) {
    console.log(`Filtering: Fork "${options.fork}"`);
  }
  console.log(`Found ${localEips.length} SIP(s) to validate (of ${allEips.length} total).\n`);

  if (localEips.length === 0) {
    console.log('No SIPs match the specified filters.');
    process.exit(0);
  }

  const results = {
    matched: [],
    mismatched: [],
    notFound: [],
    errors: [],
  };

  // Process each SIP
  for (let i = 0; i < localEips.length; i++) {
    const localEip = localEips[i];
    const eipNumber = localEip.id;

    process.stdout.write(`\rChecking SIP-${eipNumber} (${i + 1}/${localEips.length})...`);

    // Fetch official SIP
    const result = await fetchOfficialEIP(eipNumber, localEip);

    if (result.error === 'NOT_FOUND') {
      results.notFound.push(eipNumber);
      await sleep(REQUEST_DELAY);
      continue;
    }

    if (result.error) {
      results.errors.push({ sip: eipNumber, error: result.error });
      await sleep(REQUEST_DELAY);
      continue;
    }

    // Parse frontmatter
    const official = parseFrontmatter(result.content);
    if (!official) {
      results.errors.push({ sip: eipNumber, error: 'Could not parse frontmatter' });
      await sleep(REQUEST_DELAY);
      continue;
    }

    // Map to local schema
    const officialMapped = mapOfficialToLocal(official);

    // Compare fields
    const differences = [];

    for (const field of FIELDS_TO_CHECK) {
      let localValue = localEip[field];
      const officialValue = officialMapped[field];

      // Special handling for title (local has "SIP-XXXX:" prefix)
      if (field === 'title') {
        localValue = getLocalTitleForComparison(localEip);
      }

      const diff = compareField(field, localValue, officialValue);
      if (diff) {
        differences.push(diff);
      }
    }

    if (differences.length === 0) {
      results.matched.push(eipNumber);
    } else {
      results.mismatched.push({
        sip: eipNumber,
        differences,
        localEip,
        officialMapped,
      });
    }

    await sleep(REQUEST_DELAY);
  }

  // Clear progress line
  process.stdout.write('\r' + ' '.repeat(50) + '\r');

  // Print results
  console.log('\n==================== RESULTS ====================\n');

  // Summary
  console.log('SUMMARY');
  console.log('-------');
  console.log(`  Matched:     ${results.matched.length}`);
  console.log(`  Mismatched:  ${results.mismatched.length}`);
  console.log(`  Not found:   ${results.notFound.length}`);
  console.log(`  Errors:      ${results.errors.length}`);
  console.log();

  // Mismatches (the important part)
  if (results.mismatched.length > 0) {
    console.log('\nMISMATCHES');
    console.log('----------');
    for (const item of results.mismatched) {
      console.log(`\nEIP-${item.sip}:`);
      for (const diff of item.differences) {
        console.log(`  ${diff.field}:`);
        console.log(`    Local:    ${truncate(diff.local, 100)}`);
        console.log(`    Official: ${truncate(diff.official, 100)}`);
      }
    }
  }

  // Not found
  if (results.notFound.length > 0) {
    console.log('\n\nNOT FOUND ON OFFICIAL REPO');
    console.log('--------------------------');
    console.log(`  SIPs: ${results.notFound.join(', ')}`);
    console.log('  (These may be RIPs or drafts not yet merged)');
  }

  // Errors
  if (results.errors.length > 0) {
    console.log('\n\nERRORS');
    console.log('------');
    for (const item of results.errors) {
      console.log(`  SIP-${item.sip}: ${item.error}`);
    }
  }

  // Apply fixes if requested
  if (options.fix && results.mismatched.length > 0) {
    console.log('\n\nAPPLYING FIXES');
    console.log('--------------');
    let fixedCount = 0;
    for (const item of results.mismatched) {
      try {
        updateLocalEip(item.sip, item.localEip, item.officialMapped);
        console.log(`  Fixed SIP-${item.sip}`);
        fixedCount++;
      } catch (err) {
        console.log(`  Failed to fix SIP-${item.sip}: ${err.message}`);
      }
    }
    console.log(`\nUpdated ${fixedCount} file(s) in src/data/sips/`);
    console.log('Run "npm run compile-sips" to rebuild sips.json');
  }

  // Final summary
  console.log('\n=================================================\n');

  if (results.mismatched.length === 0 && results.errors.length === 0) {
    console.log('All SIP metadata is in sync with the official repository.');
  } else if (results.mismatched.length > 0) {
    if (options.fix) {
      console.log(`Fixed ${results.mismatched.length} SIP(s) with metadata differences.`);
    } else {
      console.log(`Found ${results.mismatched.length} SIP(s) with metadata differences.`);
      console.log('Run with --fix to update local files.');
    }
  }
}

/**
 * Truncate string for display
 */
function truncate(str, maxLen) {
  if (!str) return str;
  if (str.length <= maxLen) return str;
  return str.substring(0, maxLen - 3) + '...';
}

// Run
validateMetadata().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
