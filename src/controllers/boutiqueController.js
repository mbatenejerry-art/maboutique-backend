'use strict';

const db = require('../config/db');
const { uid, nowISO } = require('../utils/ids');
const { asyncHandler, HttpError } = require('../utils/asyncHandler');

/* =========================================================================
   Parametres boutique (7.9)
   ========================================================================= */

/** GET /api/boutique */
const getBoutique = asyncHandler(async (req, res) => {
  const { rows } = await db.query('SELECT * FROM boutiques WHERE id = ?', [req.user.boutiqueId]);
  if (!rows[0]) throw new HttpError(404, 'Boutique introuvable.', 'NOT_FOUND');
  res.json({ boutique: rows[0] });
});

/** PUT /api/boutique  (proprietaire uniquement) */
const updateBoutique = asyncHandler(async (req, res) => {
  const { nom, telephone, adresse, devise, recu_info } = req.body || {};
  if (nom !== undefined && !String(nom).trim()) throw new HttpError(400, 'Le nom de la boutique ne peut pas etre vide.', 'VALIDATION');
  const { rows } = await db.query('SELECT * FROM boutiques WHERE id = ?', [req.user.boutiqueId]);
  const current = rows[0];
  if (!current) throw new HttpError(404, 'Boutique introuvable.', 'NOT_FOUND');
  await db.run(
    'UPDATE boutiques SET nom=?, telephone=?, adresse=?, devise=?, recu_info=? WHERE id=?',
    [nom ?? current.nom, telephone ?? current.telephone, adresse ?? current.adresse, devise ?? current.devise, recu_info ?? current.recu_info, current.id]
  );
  const updated = (await db.query('SELECT * FROM boutiques WHERE id = ?', [current.id])).rows[0];
  res.json({ boutique: updated });
});

/* =========================================================================
   Messages vendeur -> proprietaire (7.8 : "contacter le proprietaire")
   ========================================================================= */

/** GET /api/messages  (proprietaire uniquement : voir tous les messages) */
const listMessages = asyncHandler(async (req, res) => {
  const { rows } = await db.query(
    `SELECT m.*, u.nom AS expediteur_nom FROM messages m
     JOIN utilisateurs u ON u.id = m.utilisateur_id
     WHERE m.boutique_id = ? ORDER BY m.date_message DESC`,
    [req.user.boutiqueId]
  );
  res.json({ messages: rows });
});

/**
 * POST /api/messages  (vendeur et proprietaire)
 * Le vendeur signale un souci sur un produit. Le produit doit appartenir a la meme boutique.
 */
const sendMessage = asyncHandler(async (req, res) => {
  const { produit_id, texte } = req.body || {};
  if (!texte || !String(texte).trim()) throw new HttpError(400, 'Le message est vide.', 'VALIDATION');

  let produit_nom = null;
  if (produit_id) {
    const { rows } = await db.query('SELECT nom FROM produits WHERE id = ? AND boutique_id = ?', [produit_id, req.user.boutiqueId]);
    if (!rows[0]) throw new HttpError(404, 'Produit introuvable.', 'NOT_FOUND');
    produit_nom = rows[0].nom;
  }

  const id = uid('msg');
  const now = nowISO();
  await db.run(
    'INSERT INTO messages (id, boutique_id, produit_id, produit_nom, utilisateur_id, texte, lu, date_message) VALUES (?,?,?,?,?,?,?,?)',
    [id, req.user.boutiqueId, produit_id || null, produit_nom, req.user.id, String(texte).trim(), 0, now]
  );
  res.status(201).json({ messageId: id });
});

/** PATCH /api/messages/:id/read  (proprietaire uniquement) */
const markRead = asyncHandler(async (req, res) => {
  const { rows } = await db.query('SELECT * FROM messages WHERE id = ? AND boutique_id = ?', [req.params.id, req.user.boutiqueId]);
  if (!rows[0]) throw new HttpError(404, 'Message introuvable.', 'NOT_FOUND');
  await db.run('UPDATE messages SET lu = ? WHERE id = ?', [1, rows[0].id]);
  res.json({ ok: true });
});

module.exports = { getBoutique, updateBoutique, listMessages, sendMessage, markRead };
