'use strict';

/**
 * Rate limiter in-memory — aucune dependance externe.
 * Par defaut : 5 tentatives max sur une fenetre glissante de 15 minutes par IP.
 * Utilise pour proteger POST /api/auth/login contre le brute-force.
 */

const store = new Map(); // ip -> { count, resetAt }

function createRateLimiter({ maxAttempts = 5, windowMs = 15 * 60 * 1000 } = {}) {
  // Nettoyer les entrees expirees toutes les 5 minutes pour eviter les fuites memoire.
  setInterval(() => {
    const now = Date.now();
    for (const [key, val] of store.entries()) {
      if (val.resetAt <= now) store.delete(key);
    }
  }, 5 * 60 * 1000).unref(); // .unref() : ne bloque pas l'arret du process

  return function rateLimitMiddleware(req, res, next) {
    // Utilise l'IP reelle meme derriere Cloudflare Tunnel (CF-Connecting-IP).
    const ip = req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
    const now = Date.now();

    let entry = store.get(ip);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      store.set(ip, entry);
    }

    entry.count += 1;

    if (entry.count > maxAttempts) {
      const retryAfterSec = Math.ceil((entry.resetAt - now) / 1000);
      res.set('Retry-After', String(retryAfterSec));
      return res.status(429).json({
        error: `Trop de tentatives. Reessayez dans ${Math.ceil(retryAfterSec / 60)} minute(s).`,
        code: 'RATE_LIMITED',
        retryAfterSeconds: retryAfterSec,
      });
    }

    next();
  };
}

module.exports = { createRateLimiter };
