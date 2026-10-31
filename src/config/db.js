'use strict';

/**
 * Couche d'acces base de donnees unifiee.
 *
 * Toutes les requetes de l'application sont ecrites avec des placeholders "?"
 * (style SQLite/MySQL). Ce module les adapte automatiquement au format "$1,
 * $2..." attendu par PostgreSQL. Cela permet d'ecrire les controleurs une
 * seule fois et de les faire tourner indifferemment sur SQLite (developpement
 * local, zero dependance native grace au module integre node:sqlite) ou sur
 * PostgreSQL (production / VPS).
 *
 * API exposee :
 *   db.query(sql, params)        -> Promise<{ rows: Array<object> }>
 *   db.run(sql, params)          -> Promise<{ changes, lastID }>
 *   db.transaction(async (tx) => { ... tx.query(...) ... tx.run(...) })
 *   db.driver                    -> 'postgres' | 'sqlite'
 */

const driver = (process.env.DB_DRIVER || 'sqlite').toLowerCase();

function toPostgresPlaceholders(sql) {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

/* ---------------------------------------------------------------------- */
/* Driver PostgreSQL                                                       */
/* ---------------------------------------------------------------------- */
function createPostgresDriver() {
  const { Pool } = require('pg');
  const pool = new Pool({
    host: process.env.PGHOST,
    port: Number(process.env.PGPORT || 5432),
    database: process.env.PGDATABASE,
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
    ssl: process.env.PGSSL === 'true' ? { rejectUnauthorized: false } : false,
  });

  async function query(sql, params = [], client = pool) {
    const res = await client.query(toPostgresPlaceholders(sql), params);
    return { rows: res.rows };
  }

  async function run(sql, params = [], client = pool) {
    const res = await client.query(toPostgresPlaceholders(sql), params);
    return { changes: res.rowCount, lastID: res.rows && res.rows[0] ? res.rows[0].id : undefined };
  }

  async function transaction(fn) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const tx = {
        query: (sql, params) => query(sql, params, client),
        run: (sql, params) => run(sql, params, client),
      };
      const result = await fn(tx);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async function close() {
    await pool.end();
  }

  return { driver: 'postgres', query, run, transaction, close, raw: pool };
}

/* ---------------------------------------------------------------------- */
/* Driver SQLite (module integre node:sqlite, aucune dependance native)    */
/* ---------------------------------------------------------------------- */
function createSqliteDriver() {
  const path = require('node:path');
  const fs = require('node:fs');
  const { DatabaseSync } = require('node:sqlite');

  const file = process.env.SQLITE_FILE || './data/maboutique.db';
  if (file !== ':memory:') {
    fs.mkdirSync(path.dirname(file), { recursive: true });
  }
  const conn = new DatabaseSync(file);
  conn.exec('PRAGMA foreign_keys = ON;');

  function runStatement(sql, params) {
    const stmt = conn.prepare(sql);
    return stmt.run(...params);
  }
  function allStatement(sql, params) {
    const stmt = conn.prepare(sql);
    return stmt.all(...params);
  }

  async function query(sql, params = []) {
    const rows = allStatement(sql, params);
    return { rows: rows.map(stripNullProto) };
  }

  async function run(sql, params = []) {
    const res = runStatement(sql, params);
    return { changes: res.changes, lastID: res.lastInsertRowid };
  }

  function stripNullProto(row) {
    return { ...row };
  }

  async function transaction(fn) {
    conn.exec('BEGIN');
    try {
      const tx = { query, run };
      const result = await fn(tx);
      conn.exec('COMMIT');
      return result;
    } catch (err) {
      try { conn.exec('ROLLBACK'); } catch (_e) { /* noop */ }
      throw err;
    }
  }

  async function close() {
    conn.close();
  }

  return { driver: 'sqlite', query, run, transaction, close, raw: conn };
}

const db = driver === 'postgres' ? createPostgresDriver() : createSqliteDriver();

module.exports = db;
