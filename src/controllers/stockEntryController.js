'use strict';

const db = require('../config/db');
const { uid, nowISO } = require('../utils/ids');
const { asyncHandler, HttpError } = require('../utils/asyncHandler');
const { parsePagination, paginatedResponse } = require('../utils/pagination');
const { getOwnedProduct } = require('./productController');

/** GET /api/stock-entries?page=1&limit=50 */
const list = asyncHandler(async (req, res) => {
  const { page, limit, offset } = parsePagination(req.query);
  const bid = req.user.boutiqueId;

  const { rows: countRows } = await db.query(
    'SELECT COUNT(*) AS cnt FROM entrees_stock WHERE boutique_id = ?', [bid]
  );
  const total = Number(countRows[0]?.cnt ?? 0);

  const { rows } = await db.query(
    `SELECT e.*, p.nom AS produit_nom, u.nom AS utilisateur_nom
     FROM entrees_stock e
     JOIN produits p ON p.id = e.produit_id
     JOIN utilisateurs u ON u.id = e.utilisateur_id
     WHERE e.boutique_id = ?
     ORDER BY e.date_entree DESC LIMIT ? OFFSET ?`,
    [bid, limit, offset]
  );
  res.json(paginatedResponse(rows, { page, limit, total }));
});

/**
 * POST /api/stock-entries (proprietaire uniquement)
 * Regle metier 7.4 / 11 : lorsqu'une entree de stock est enregistree, la
 * quantite du produit augmente automatiquement. Le prix d'achat courant du
 * produit est mis a jour avec celui du reassort (comme dans le cahier des
 * charges : "enregistrer le prix d'achat lors du reassort").
 */
const create = asyncHandler(async (req, res) => {
  const { produit_id, quantite_ajoutee, prix_achat_unitaire } = req.body || {};
  const qte = Number(quantite_ajoutee);
  const cout = Number(prix_achat_unitaire);

  if (!produit_id || !Number.isFinite(qte) || qte <= 0 || !Number.isFinite(cout) || cout < 0) {
    throw new HttpError(400, 'Quantite ajoutee (> 0) et cout unitaire (>= 0) requis.', 'VALIDATION');
  }

  const product = await getOwnedProduct(req.user.boutiqueId, produit_id);
  const montant_total = qte * cout;
  const id = uid('entry');
  const now = nowISO();

  await db.transaction(async (tx) => {
    await tx.run(
      `INSERT INTO entrees_stock (id, boutique_id, produit_id, utilisateur_id, quantite_ajoutee, prix_achat_unitaire, montant_total, date_entree)
       VALUES (?,?,?,?,?,?,?,?)`,
      [id, req.user.boutiqueId, product.id, req.user.id, qte, cout, montant_total, now]
    );
    await tx.run(
      'UPDATE produits SET quantite_stock = quantite_stock + ?, prix_achat = ?, updated_at = ? WHERE id = ?',
      [qte, cout, now, product.id]
    );
  });

  const updatedProduct = (await db.query('SELECT * FROM produits WHERE id = ?', [product.id])).rows[0];
  res.status(201).json({ entryId: id, product: updatedProduct });
});

module.exports = { list, create };
