'use strict';

require('dotenv').config();
const fs = require('node:fs');
const path = require('node:path');
const db = require('../config/db');

async function migrate() {
  const fileName = db.driver === 'postgres' ? 'schema.postgres.sql' : 'schema.sqlite.sql';
  const sqlPath = path.join(__dirname, fileName);
  const sql = fs.readFileSync(sqlPath, 'utf8');

  console.log(`[migrate] Moteur detecte : ${db.driver}`);
  console.log(`[migrate] Application du schema (${fileName})...`);

  if (db.driver === 'postgres') {
    await db.raw.query(sql);
  } else {
    // node:sqlite n'accepte qu'une instruction a la fois avec exec() pour
    // certains cas ; en pratique exec() supporte un script multi-instructions.
    db.raw.exec(sql);
  }

  console.log('[migrate] Termine avec succes.');
  if (db.close) await db.close();
}

migrate().catch((err) => {
  console.error('[migrate] Echec :', err);
  process.exit(1);
});
