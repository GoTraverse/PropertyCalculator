#!/usr/bin/env node
/**
 * one-engine-test.js — shared/rules.js is the only place a rule is defined.
 *
 * Fails when any site file other than shared/rules.js DEFINES one of the
 * rule identifiers below (a function, a var/let/const, an assignment or an
 * object key holding a function or a table), unless that file and that
 * identifier are on ALLOWLIST: the copies that existed when the rules file
 * was built (18 Nov 2026). Calls such as Rules.calcDuty(...) are fine.
 *
 * The allowlist only ever shrinks: phases 4 to 6 remove the copies (the test
 * prints the entries that can go) and phase 7 empties it. Adding a file or
 * an identifier to it means adding a second copy of a rule; don't.
 *
 *   node tests/one-engine-test.js                  every site file, allowlist applied
 *   node tests/one-engine-test.js --only a.js b.js  just these files, no allowlist:
 *                                                   clean means no copy at all
 *
 * Scanned: .js, .mjs, .cjs and .html files under the repository root (inline
 * scripts included), except tests/, bin/, build/, data/, db/, docs/, mcp/,
 * .claude/, node_modules/ and the generated suburb/, invest/ and blog/ pages.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { findDefs } = require('./lib/source-defs');

const ROOT = path.join(__dirname, '..');
const RULES = 'shared/rules.js';

// Rule identifiers. The first group is the build plan's list (section 5.3);
// the second names the other copies that existed on 18 Nov 2026.
const IDS = [
  'stateData', '_SD_STATE_DATA', 'calcDuty', 'calc\\w*Duty', 'qldHomeDuty', 'applyFhbConcession', 'fhbDuty', 'dutyAt',
  'ownerOccupierDuty', 'REG_FEES', 'REG_FLAT', 'regFeesTotal', 'lmiRate', 'lmiEstimate', 'estimateLmi', 'estimateLmiTier',
  'calcLMI', 'approxTax', 'hemMonthly', 'hecsAnnual', 'incomeTypeFactor', 'FDS_CAPS', 'H2B_CAPS', 'getFHOGAmt', 'calcStampDutyAmt',
  // also copies
  'qldFhbConcessionAmt', '_qldHomeDuty', '_calcDutyTiered', 'stampDutyEstimate', 'calc(?:NSW|VIC|Qld|QLD|SA|WA|TAS|ACT|NT)\\w*',
  '[A-Z]+_FOREIGN_RATE', 'SCALED_REG', 'LMI_TIERS', 'fdsEligibility', 'helpToBuyEligibility', 'H2B_INCOME', 'H2B_EQUITY',
  'HELP_TO_BUY_\\w+', 'FHSS_MAX_\\w+', 'INCOME_FACTOR', 'incomeTax', 'medicareLevy', 'TAX_BRACKETS', 'MEDICARE_\\w+', 'calcTax',
  'maxLoanFromRepayment', 'simulateAmortisation', 'simulateFortnightly'
];

// Today's copies (18 Nov 2026, tag review-base-b). Remove entries as the
// copies go; never add one.
const ALLOWLIST = {
  'app.js': ['calcLMI', 'calcStampDutyAmt', 'getFHOGAmt'],
  'journey.js': ['FDS_CAPS', 'FHSS_MAX_CONTRIB_ANNUAL', 'FHSS_MAX_TOTAL', 'H2B_CAPS', 'H2B_EQUITY', 'H2B_INCOME', 'INCOME_FACTOR', 'REG_FLAT', 'approxTax', 'calcDuty', 'fhbDuty', 'hemMonthly', 'lmiRate', 'qldFhbConcessionAmt', 'qldHomeDuty', 'regFeesTotal', 'stateData'],
  'tools/auction-budget-calculator.js': ['REG_FEES', 'SCALED_REG', 'applyFhbConcession', 'calcDuty', 'dutyAt', 'lmiRate', 'qldFhbConcessionAmt', 'qldHomeDuty', 'regFeesTotal', 'stateData'],
  'tools/borrowing-power-calculator.js': ['approxTax', 'hecsAnnual', 'hemMonthly', 'incomeTypeFactor', 'maxLoanFromRepayment'],
  'tools/capital-gains-calculator.js': ['calcTax'],
  'tools/cost-of-purchase-calculator.js': ['applyFhbConcession', 'calcDuty', 'lmiRate', 'qldHomeDuty', 'regFeesTotal', 'stateData'],
  'tools/deposit-calculator.js': ['_SD_STATE_DATA', '_calcDutyTiered', '_qldHomeDuty', 'lmiEstimate', 'stampDutyEstimate'],
  'tools/first-home-buyer-grants-calculator.js': ['FHSS_MAX_CONTRIB_ANNUAL', 'FHSS_MAX_TOTAL', 'HELP_TO_BUY_EQUITY_EXIST', 'HELP_TO_BUY_EQUITY_NEW', 'HELP_TO_BUY_INCOME_CAP_COUPLE', 'HELP_TO_BUY_INCOME_CAP_SINGLE', 'calcDuty', 'dutyAt', 'estimateLmi', 'fdsEligibility', 'fhbDuty', 'helpToBuyEligibility', 'ownerOccupierDuty'],
  'tools/loan-serviceability-calculator.js': ['approxTax', 'hemMonthly'],
  'tools/mortgage-repayment-calculator.js': ['LMI_TIERS', 'estimateLmi', 'simulateAmortisation', 'simulateFortnightly'],
  'tools/property-cashflow-calculator.js': ['MEDICARE_LOWER', 'MEDICARE_RATE', 'MEDICARE_SHADE_RATE', 'MEDICARE_UPPER', 'TAX_BRACKETS', 'incomeTax', 'medicareLevy'],
  'tools/stamp-duty-calculator-act.js': ['calcACTDuty', 'calcACTStandard', 'lmiRate'],
  'tools/stamp-duty-calculator-nsw.js': ['NSW_FOREIGN_RATE', 'calcNSWDuty', 'calcNSWStandard', 'lmiRate'],
  'tools/stamp-duty-calculator-nt.js': ['NT_FOREIGN_RATE', 'calcNTDuty', 'calcNTStandard', 'lmiRate'],
  'tools/stamp-duty-calculator-qld.js': ['QLD_FOREIGN_RATE', 'calcQldDuty', 'calcQldFhbHome', 'calcQldFhbLand', 'calcQldHome', 'calcQldStandard', 'lmiRate', 'qldFhbConcessionAmt'],
  'tools/stamp-duty-calculator-sa.js': ['SA_FOREIGN_RATE', 'calcSADuty', 'calcSAStandard', 'lmiRate'],
  'tools/stamp-duty-calculator-tas.js': ['TAS_FOREIGN_RATE', 'calcTASDuty', 'calcTASStandard', 'lmiRate'],
  'tools/stamp-duty-calculator-vic.js': ['VIC_FOREIGN_RATE', 'calcVICDuty', 'calcVICStandard', 'lmiRate'],
  'tools/stamp-duty-calculator-wa.js': ['WA_FOREIGN_RATE', 'calcWADuty', 'calcWAStandard', 'lmiRate'],
  'tools/stamp-duty-calculator.js': ['REG_FEES', 'SCALED_REG', 'applyFhbConcession', 'calcDuty', 'estimateLmiTier', 'qldFhbConcessionAmt', 'qldHomeDuty', 'regFeesTotal', 'stateData']
};

const SKIP_DIRS = new Set(['.git', 'node_modules', '.claude', '.cache', 'tests', 'bin', 'build', 'data', 'db', 'docs', 'mcp', 'suburb', 'invest', 'blog']);
const EXT = /\.(?:js|mjs|cjs|html?)$/;

function walk(dir, out) {
  for (const ent of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = dir ? dir + '/' + ent.name : ent.name;
    if (ent.isDirectory()) { if (!SKIP_DIRS.has(ent.name)) walk(rel, out); }
    else if (EXT.test(ent.name)) out.push(rel);
  }
  return out;
}

// For an HTML file, only the inline <script> bodies (a script with a src
// is its own file and is scanned on its own).
function sourceOf(rel) {
  const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  if (!/\.html?$/.test(rel)) return src;
  let out = '', last = 0;
  const re = /<script\b(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(src))) {
    // Keep line numbers: blank out everything outside the scripts.
    out += src.slice(last, m.index + m[0].indexOf('>') + 1).replace(/[^\n]/g, ' ') + m[1];
    last = m.index + m[0].length - '</script>'.length;
  }
  return out + src.slice(last).replace(/[^\n]/g, ' ');
}

function defsIn(rel) {
  return findDefs(sourceOf(rel), IDS);
}

const args = process.argv.slice(2);
const onlyAt = args.indexOf('--only');
const printAllow = args.indexOf('--print-allowlist') !== -1;

let files;
if (onlyAt !== -1) {
  files = args.slice(onlyAt + 1).join(',').split(',').map((s) => s.trim().replace(/^\.\//, '')).filter(Boolean);
  if (!files.length) { console.error('one-engine-test: --only needs at least one file'); process.exit(2); }
  const missing = files.filter((f) => !fs.existsSync(path.join(ROOT, f)));
  if (missing.length) { console.error('one-engine-test: no such file: ' + missing.join(', ')); process.exit(2); }
} else {
  files = walk('', []).sort();
}
files = files.filter((f) => f !== RULES);

if (printAllow) {
  const allow = {};
  for (const f of files) {
    const names = Array.from(new Set(defsIn(f).map((d) => d.name))).sort();
    if (names.length) allow[f] = names;
  }
  console.log(JSON.stringify(allow, null, 2));
  process.exit(0);
}

let fails = 0;
const shrink = [];
for (const f of files) {
  const defs = defsIn(f);
  const allowed = onlyAt === -1 ? (ALLOWLIST[f] || []) : [];
  for (const d of defs) {
    if (allowed.indexOf(d.name) !== -1) continue;
    fails++;
    console.error(`FAIL ${f}:${d.line} defines ${d.name}. Use window.Rules (shared/rules.js) instead of a copy.`);
  }
  if (onlyAt === -1) {
    const present = new Set(defs.map((d) => d.name));
    for (const n of allowed) if (!present.has(n)) shrink.push(f + ': ' + n);
  }
}
if (onlyAt === -1) {
  for (const f of Object.keys(ALLOWLIST)) if (!fs.existsSync(path.join(ROOT, f))) shrink.push(f + ' (file gone)');
}

// shared/rules.js itself must be there and define the rules.
if (!fs.existsSync(path.join(ROOT, RULES))) { fails++; console.error('FAIL shared/rules.js is missing'); }

if (shrink.length) console.log('one-engine-test: these copies are gone, so their allowlist entries can be removed:\n  ' + shrink.join('\n  '));
if (fails) {
  console.error(`\none-engine-test: ${fails} rule definition(s) outside shared/rules.js`);
  process.exit(1);
}
const left = onlyAt === -1 ? Object.keys(ALLOWLIST).filter((f) => fs.existsSync(path.join(ROOT, f))).length : 0;
console.log(onlyAt === -1
  ? `one-engine-test: no new copy of a rule in ${files.length} files (${left} files still hold an allowed old copy) ✓`
  : `one-engine-test: no copy of a rule in ${files.join(', ')} ✓`);
