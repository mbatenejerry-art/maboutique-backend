'use strict';

const { scryptSync, randomBytes, timingSafeEqual } = require('node:crypto');

const KEY_LEN = 64;

/**
 * Hashe un mot de passe avec scrypt (module natif "crypto" de Node, aucune
 * dependance externe ni binaire a compiler — important pour un deploiement
 * simple sur VPS via PM2).
 * Format stocke : scrypt:<salt_hex>:<hash_hex>
 */
function hashPassword(plain) {
  const salt = randomBytes(16);
  const hash = scryptSync(String(plain), salt, KEY_LEN);
  return `scrypt:${salt.toString('hex')}:${hash.toString('hex')}`;
}

function verifyPassword(plain, stored) {
  if (!stored || typeof stored !== 'string' || !stored.startsWith('scrypt:')) return false;
  const [, saltHex, hashHex] = stored.split(':');
  const salt = Buffer.from(saltHex, 'hex');
  const expected = Buffer.from(hashHex, 'hex');
  const actual = scryptSync(String(plain), salt, expected.length);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

module.exports = { hashPassword, verifyPassword };
