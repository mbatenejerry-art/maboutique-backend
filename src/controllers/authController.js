'use strict';

const db = require('../config/db');
const jwt = require('../utils/jwt');
const { hashPassword, verifyPassword } = require('../utils/password');
const { uid, nowISO } = require('../utils/ids');
const { asyncHandler, HttpError } = require('../utils/asyncHandler');
const { JWT_SECRET } = require('../middleware/auth');

const EXPIRES_IN_SECONDS = Number(process.env.JWT_EXPIRES_IN_HOURS || 12) * 3600;

function isValidEmail(email) {
  // Verification basique : presence d'un @, d'un domaine et d'une extension.
  return typeof email === 'string' && /^[^\s@]+@[^\s@]{2,}\.[^\s@]{2,}$/.test(email.trim());
}

const PASSWORD_MIN = 8;

function issueToken(user) {
  return jwt.sign(
    { userId: user.id, boutiqueId: user.boutique_id, role: user.role, nom: user.nom },
    JWT_SECRET,
    EXPIRES_IN_SECONDS
  );
}

function publicUser(u) {
  return { id: u.id, nom: u.nom, email: u.email, role: u.role, statut: u.statut, boutiqueId: u.boutique_id };
}

/**
 * POST /api/auth/register
 * Cree une nouvelle boutique avec son compte proprietaire. Utilise une seule
 * fois au demarrage (ou via un futur "onboarding" commercial) ; les vendeurs,
 * eux, sont ajoutes ensuite par le proprietaire via /api/users.
 */
const register = asyncHandler(async (req, res) => {
  const { shopName, ownerName, email, password } = req.body || {};
  if (!shopName || !ownerName || !isValidEmail(email) || !password || String(password).length < PASSWORD_MIN) {
    throw new HttpError(400, `Champs invalides : nom de boutique, nom du proprietaire, e-mail valide et mot de passe (${PASSWORD_MIN} caracteres min.) sont requis.`, 'VALIDATION');
  }

  const existing = await db.query('SELECT id FROM utilisateurs WHERE email = ?', [email.toLowerCase()]);
  if (existing.rows.length > 0) {
    throw new HttpError(409, 'Cet e-mail est deja utilise.', 'EMAIL_TAKEN');
  }

  const result = await db.transaction(async (tx) => {
    const boutiqueId = uid('shop');
    const now = nowISO();
    await tx.run(
      'INSERT INTO boutiques (id, nom, telephone, adresse, devise, recu_info, created_at) VALUES (?,?,?,?,?,?,?)',
      [boutiqueId, shopName, '', '', 'FCFA', 'Merci pour votre achat !', now]
    );
    const ownerId = uid('user');
    await tx.run(
      'INSERT INTO utilisateurs (id, boutique_id, nom, email, password_hash, role, statut, created_at) VALUES (?,?,?,?,?,?,?,?)',
      [ownerId, boutiqueId, ownerName, email.toLowerCase(), hashPassword(password), 'proprietaire', 'actif', now]
    );
    return { boutiqueId, ownerId };
  });

  const userRow = (await db.query('SELECT * FROM utilisateurs WHERE id = ?', [result.ownerId])).rows[0];
  const token = issueToken(userRow);
  res.status(201).json({ token, user: publicUser(userRow) });
});

/** POST /api/auth/login */
const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body || {};
  if (!isValidEmail(email) || !password) {
    throw new HttpError(400, 'E-mail et mot de passe requis.', 'VALIDATION');
  }
  const row = (await db.query('SELECT * FROM utilisateurs WHERE email = ?', [email.toLowerCase()])).rows[0];
  if (!row || !verifyPassword(password, row.password_hash)) {
    throw new HttpError(401, 'E-mail ou mot de passe incorrect.', 'INVALID_CREDENTIALS');
  }
  if (row.statut !== 'actif') {
    throw new HttpError(403, 'Ce compte a ete desactive par le proprietaire de la boutique.', 'ACCOUNT_DISABLED');
  }
  const token = issueToken(row);
  res.json({ token, user: publicUser(row) });
});

/** GET /api/auth/me */
const me = asyncHandler(async (req, res) => {
  const row = (await db.query('SELECT * FROM utilisateurs WHERE id = ?', [req.user.id])).rows[0];
  if (!row) throw new HttpError(404, 'Utilisateur introuvable.', 'NOT_FOUND');
  const boutique = (await db.query('SELECT * FROM boutiques WHERE id = ?', [req.user.boutiqueId])).rows[0];
  res.json({ user: publicUser(row), boutique });
});

module.exports = { register, login, me };
