'use strict';

const { randomUUID } = require('node:crypto');

function uid(prefix) {
  const id = randomUUID();
  return prefix ? `${prefix}_${id}` : id;
}

function nowISO() {
  return new Date().toISOString();
}

function dateKeyOf(isoString) {
  return new Date(isoString).toISOString().slice(0, 10);
}

module.exports = { uid, nowISO, dateKeyOf };
