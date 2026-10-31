'use strict';

const crypto = require('node:crypto');

/**
 * Implementation minimale de jetons type JWT (HS256), basee uniquement sur le
 * module natif "crypto". Evite une dependance externe (jsonwebtoken) pour un
 * besoin simple : signer/verifier un payload avec expiration.
 */

function base64url(input) {
  return Buffer.from(input).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function base64urlJSON(obj) {
  return base64url(JSON.stringify(obj));
}
function fromBase64url(str) {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  return Buffer.from(str, 'base64').toString('utf8');
}

function sign(payload, secret, expiresInSeconds = 12 * 3600) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const body = { ...payload, iat: now, exp: now + expiresInSeconds };
  const headerPart = base64urlJSON(header);
  const bodyPart = base64urlJSON(body);
  const signature = crypto.createHmac('sha256', secret).update(`${headerPart}.${bodyPart}`).digest();
  const sigPart = base64url(signature);
  return `${headerPart}.${bodyPart}.${sigPart}`;
}

function verify(token, secret) {
  if (typeof token !== 'string' || token.split('.').length !== 3) {
    throw new Error('Jeton malforme');
  }
  const [headerPart, bodyPart, sigPart] = token.split('.');
  const expectedSig = base64url(crypto.createHmac('sha256', secret).update(`${headerPart}.${bodyPart}`).digest());
  const a = Buffer.from(sigPart);
  const b = Buffer.from(expectedSig);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    throw new Error('Signature invalide');
  }
  const payload = JSON.parse(fromBase64url(bodyPart));
  if (payload.exp && Math.floor(Date.now() / 1000) > payload.exp) {
    throw new Error('Jeton expire');
  }
  return payload;
}

module.exports = { sign, verify };
