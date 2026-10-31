'use strict';

const db = require('../config/db');
const { hashPassword } = require('../utils/password');
const { uid, nowISO } = require('../utils/ids');
const { asyncHandler, HttpError } = require('../utils/asyncHandler');

function publicUser(u) {
  return { id: u.id, nom: u.nom, email: u.email, role: u.role, statut: u.statut, boutiqueId: u.boutique_id, created_at: u.created_at };
}

/** GET /api/users  (proprietaire uniquement) */
const list = asyncHandler(async (req, res) => {
  const { rows } = await db.query(
    'SELECT * FROM utilisateurs WHERE boutique_id = ? ORDER BY created_at ASC',
    [req.user.boutiqueId]
  );
  res.json({ users: rows.map(publicUser) });
});

/**
 * POST /api/users  (proprietaire uniquement)
 * Cree un compte vendeur pour cette boutique.
 */
const create = asyncHandler(async (req, res) => {
  const { nom, email, password } = req.body || {};
  const PASSWORD_MIN = 8;
  const isValidEmail = (e) => typeof e === 'string' && /^[^\s@]+@[^\s@]{2,}\.[^\s@]{2,}$/.test(e.trim());
  if (!nom || !isValidEmail(email) || !password || String(password).length < PASSWORD_MIN) {
    throw new HttpError(400, `Nom, e-mail valide et mot de passe (${PASSWORD_MIN} car. min.) requis.`, 'VALIDATION');
  }
  const existing = await db.query('SELECT id FROM utilisateurs WHERE email = ?', [email.toLowerCase()]);
  if (existing.rows.length > 0) throw new HttpError(409, 'Cet e-mail est deja utilise.', 'EMAIL_TAKEN');

  const id = uid('user');
  await db.run(
    'INSERT INTO utilisateurs (id, boutique_id, nom, email, password_hash, role, statut, created_at) VALUES (?,?,?,?,?,?,?,?)',
    [id, req.user.boutiqueId, nom, email.toLowerCase(), hashPassword(password), 'vendeur', 'actif', nowISO()]
  );
  const row = (await db.query('SELECT * FROM utilisateurs WHERE id = ?', [id])).rows[0];
  res.status(201).json({ user: publicUser(row) });
});

/**
 * PATCH /api/users/:id/status  (proprietaire uniquement)
 * Active ou desactive un vendeur. Le proprietaire ne peut pas se desactiver lui-meme.
 */
const toggleStatus = asyncHandler(async (req, res) => {
  const { rows } = await db.query('SELECT * FROM utilisateurs WHERE id = ? AND boutique_id = ?', [req.params.id, req.user.boutiqueId]);
  const target = rows[0];
  if (!target) throw new HttpError(404, 'Utilisateur introuvable.', 'NOT_FOUND');
  if (target.role === 'proprietaire') throw new HttpError(403, 'Impossible de modifier le statut du proprietaire.', 'FORBIDDEN');
  const newStatus = target.statut === 'actif' ? 'inactif' : 'actif';
  await db.run('UPDATE utilisateurs SET statut = ? WHERE id = ?', [newStatus, target.id]);
  const updated = (await db.query('SELECT * FROM utilisateurs WHERE id = ?', [target.id])).rows[0];
  res.json({ user: publicUser(updated) });
});

/**
 * PUT /api/users/:id/password  (proprietaire uniquement)
 * Reinitialise le mot de passe d'un vendeur.
 */
const resetPassword = asyncHandler(async (req, res) => {
  const { password } = req.body || {};
  if (!password || String(password).length < 8) throw new HttpError(400, 'Mot de passe trop court (8 car. min.).', 'VALIDATION');
  const { rows } = await db.query('SELECT * FROM utilisateurs WHERE id = ? AND boutique_id = ?', [req.params.id, req.user.boutiqueId]);
  if (!rows[0]) throw new HttpError(404, 'Utilisateur introuvable.', 'NOT_FOUND');
  await db.run('UPDATE utilisateurs SET password_hash = ? WHERE id = ?', [hashPassword(password), rows[0].id]);
  res.json({ ok: true });
});

module.exports = { list, create, toggleStatus, resetPassword };
