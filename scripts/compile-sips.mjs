import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Ajv from 'ajv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const EIPS_DIR = path.join(__dirname, '../src/data/sips');
const OUTPUT_FILE = path.join(__dirname, '../src/data/sips.json');
const SCHEMA_FILE = path.join(__dirname, 'sip-schema.json');

// Initialize JSON Schema validator
const ajv = new Ajv({ allErrors: true });
const schema = JSON.parse(fs.readFileSync(SCHEMA_FILE, 'utf8'));
const validate = ajv.compile(schema);

/**
 * Compiles individual SIP JSON files into a single sips.json file
 */
function compileEips() {
  console.log('Compiling SIP files...');

  // Check if sips directory exists
  if (!fs.existsSync(EIPS_DIR)) {
    console.error(`Error: SIPs directory not found at ${EIPS_DIR}`);
    process.exit(1);
  }

  // Read all JSON files from the sips directory
  const files = fs.readdirSync(EIPS_DIR).filter(file => file.endsWith('.json'));

  if (files.length === 0) {
    console.error(`Error: No JSON files found in ${EIPS_DIR}`);
    process.exit(1);
  }

  // Read, parse, and validate each SIP file
  const sips = [];
  const errors = [];

  for (const file of files) {
    const filePath = path.join(EIPS_DIR, file);
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const sip = JSON.parse(content);

      // Validate against schema
      const valid = validate(sip);
      if (!valid) {
        const errorMessages = validate.errors
          .map(err => {
            const path = err.instancePath || '/';
            const extra = err.params?.additionalProperty
              ? ` (property: "${err.params.additionalProperty}")`
              : '';
            return `  - ${path}: ${err.message}${extra}`;
          })
          .join('\n');
        errors.push(`${file}:\n${errorMessages}`);
      }

      // Exclude SIPs with "Moved" status (e.g., SRCs moved to their own repo)
      if (sip.status === 'Moved') continue;

      sips.push(sip);
    } catch (error) {
      console.error(`Error reading/parsing ${file}:`, error.message);
      process.exit(1);
    }
  }

  // Report validation errors
  if (errors.length > 0) {
    console.error('\nSchema validation errors:\n');
    console.error(errors.join('\n\n'));
    console.error(`\n${errors.length} file(s) failed validation.`);
    process.exit(1);
  }

  // Sort by SIP id
  sips.sort((a, b) => a.id - b.id);

  // Write compiled output
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(sips, null, 2));

  console.log(`✓ Compiled ${sips.length} SIPs to ${OUTPUT_FILE}`);
}

compileEips();
