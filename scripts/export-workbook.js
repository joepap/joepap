'use strict';
/*
 * Build ONE Excel workbook containing every dataset from the ratification
 * event — a sheet per export, plus a Summary tab, the full roster snapshot,
 * and the question-line log. Read-only: nothing is modified or deleted.
 *
 * Run on the mini, from the project folder:
 *     node scripts/export-workbook.js
 * Output:  ~/Desktop/Local36_Ratification_<date>.xlsx
 *
 * (The same workbook is downloadable from Admin → Exports on any computer.)
 */
const path = require('path');
const os = require('os');
const fs = require('fs');
const XLSX = require('xlsx');
const Database = require('better-sqlite3');
const { buildWorkbook } = require('../lib/workbook');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const checkinDbFile = path.join(DATA_DIR, 'checkin.db');
const queueDbFile = path.join(DATA_DIR, 'queue.db');

if (!fs.existsSync(checkinDbFile)) {
  console.error('No database at ' + checkinDbFile + ' — run this on the machine that ran the event.');
  process.exit(1);
}
const db = new Database(checkinDbFile, { readonly: true });
const qdb = fs.existsSync(queueDbFile) ? new Database(queueDbFile, { readonly: true }) : null;

const wb = buildWorkbook(db, qdb, (name, n) => console.log(`  ${name}: ${n} rows`));

const desktop = path.join(os.homedir(), 'Desktop');
const outDir = fs.existsSync(desktop) ? desktop : process.cwd();
const out = path.join(outDir,
  'Local36_Ratification_' + new Date().toISOString().slice(0, 10) + '.xlsx');
XLSX.writeFile(wb, out);
console.log('\nWorkbook written to: ' + out);
console.log('Databases were opened read-only — nothing was changed or deleted.');
