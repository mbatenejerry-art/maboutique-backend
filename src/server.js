'use strict';

require('dotenv').config();

const http    = require('node:http');
const express = require('express');
const cors    = require('cors');

const routes              = require('./routes/index');
const { notFoundHandler, errorHandler } = require('./middleware/errorHandler');

const app  = express();
const PORT = Number(process.env.PORT || 4000);

/* ---------------------------------------------------------------------- */
/* CORS                                                                    */
/* ---------------------------------------------------------------------- */
const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:3000')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

app.use(cors({
  origin(origin, cb) {
    // Autoriser les appels sans Origin (curl, Postman) et les origines listees.
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
    cb(new Error(`Origine CORS non autorisee : ${origin}`));
  },
  credentials: true,
}));

/* ---------------------------------------------------------------------- */
/* Parsers                                                                 */
/* ---------------------------------------------------------------------- */
app.use(express.json({ limit: '256kb' }));
app.use(express.urlencoded({ extended: true }));

/* ---------------------------------------------------------------------- */
/* Logging minimal (utile pour debug PM2 / systemd)                       */
/* ---------------------------------------------------------------------- */
app.use((req, _res, next) => {
  process.stdout.write(`${new Date().toISOString()} ${req.method} ${req.originalUrl}\n`);
  next();
});

/* ---------------------------------------------------------------------- */
/* Routes                                                                  */
/* ---------------------------------------------------------------------- */
app.use('/api', routes);

/* ---------------------------------------------------------------------- */
/* 404 + gestionnaire d'erreurs global                                     */
/* ---------------------------------------------------------------------- */
app.use(notFoundHandler);
app.use(errorHandler);

/* ---------------------------------------------------------------------- */
/* Demarrage                                                               */
/* ---------------------------------------------------------------------- */
const server = http.createServer(app);

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[MaBoutique Pro] API demarree sur le port ${PORT} (${process.env.DB_DRIVER || 'sqlite'})`);
  console.log(`[MaBoutique Pro] Health check : http://localhost:${PORT}/api/health`);
});

/* ---------------------------------------------------------------------- */
/* Arret propre (PM2 SIGINT / SIGTERM)                                     */
/* ---------------------------------------------------------------------- */
async function shutdown(signal) {
  console.log(`\n[MaBoutique Pro] Reception du signal ${signal}, arret propre...`);
  server.close(async () => {
    const db = require('./config/db');
    if (db.close) await db.close().catch(() => {});
    console.log('[MaBoutique Pro] Arrete.');
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 8000);
}
process.on('SIGINT',  () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

module.exports = app;
