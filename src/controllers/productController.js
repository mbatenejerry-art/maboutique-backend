'use strict';

const db = require('../config/db');
const { uid, nowISO } = require('../utils/ids');
const { asyncHandler, HttpError } = require('../utils/asyncHandler');
const { parsePagination, paginatedResponse } = require('../utils/pagination');

function validateProductInput(body, { partial = false } = {}) {
  const errors = [];
  const f = {};
  const req = (key, type) => {
    if (body[key] === undefined) { if (!partial) errors.push(`${key} requis`); return; }
    f[key] = body[key];
  };
  req('nom'); req('categorie'); req('prix_achat'); req('prix_vente'); req('quantite_stock'); req('seuil_alerte');
  if (body.fournisseur !== undefined) f.fournisseur = body.fournisseur;
  if (body.description !== undefined) f.description = body.description;

  ['prix_achat', 'prix_vente', 'quantite_stock', 'seuil_alerte'].forEach((k) => {
    if (f[k] !== undefined) {
      const n = Number(f[k]);
      if (!Number.isFinite(n) || n < 0) errors.push(`${k} doit etre un nombre positif`);
      f[k] = n;
    }
  });
  if (f.nom !== undefined && !String(f.nom).trim()) errors.push('nom ne peut pas etre vide');
  if (f.categorie !== undefined && !String(f.categorie).trim()) errors.push('categorie ne peut pas etre vide');

  if (errors.length) throw new HttpError(400, `Donnees produit invalides : ${errors.join(', ')}`, 'VALIDATION');
  return f;
}

/** GET /api/products?search=&category=&lowStock=true&page=1&limit=50 */
const list = asyncHandler(async (req, res) => {
  const { search = '', category = '', lowStock } = req.query;
  const { page, limit, offset } = parsePagination(req.query);

  let where = 'WHERE boutique_id = ? AND statut = ?';
  const params = [req.user.boutiqueId, 'actif'];
  if (search)                          { where += ' AND LOWER(nom) LIKE ?'; params.push(`%${String(search).toLowerCase()}%`); }
  if (category)                        { where += ' AND categorie = ?';     params.push(category); }
  if (String(lowStock) === 'true')     { where += ' AND quantite_stock <= seuil_alerte'; }

  const { rows: countRows } = await db.query(`SELECT COUNT(*) AS cnt FROM produits ${where}`, params);
  const total = Number(countRows[0]?.cnt ?? 0);

  const { rows } = await db.query(
    `SELECT * FROM produits ${where} ORDER BY nom ASC LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  // Le vendeur ne doit pas voir le prix d'achat (regle 7.8 du cahier des charges).
  const sanitized = req.user.role === 'proprietaire' ? rows : rows.map(({ prix_achat, ...rest }) => rest);
  res.json(paginatedResponse(sanitized, { page, limit, total }));
});

/** POST /api/products (proprietaire uniquement) */
const create = asyncHandler(async (req, res) => {
  const f = validateProductInput(req.body);
  const id = uid('prod');
  const now = nowISO();
  await db.run(
    `INSERT INTO produits (id, boutique_id, nom, categorie, prix_achat, prix_vente, quantite_stock, seuil_alerte, fournisseur, description, statut, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [id, req.user.boutiqueId, f.nom, f.categorie, f.prix_achat, f.prix_vente, f.quantite_stock, f.seuil_alerte, f.fournisseur || '', f.description || '', 'actif', now, now]
  );
  const product = (await db.query('SELECT * FROM produits WHERE id = ?', [id])).rows[0];
  res.status(201).json({ product });
});

async function getOwnedProduct(boutiqueId, id) {
  const { rows } = await db.query('SELECT * FROM produits WHERE id = ? AND boutique_id = ?', [id, boutiqueId]);
  if (!rows[0]) throw new HttpError(404, 'Produit introuvable.', 'NOT_FOUND');
  return rows[0];
}

/** PUT /api/products/:id (proprietaire uniquement) */
const update = asyncHandler(async (req, res) => {
  const existing = await getOwnedProduct(req.user.boutiqueId, req.params.id);
  const f = validateProductInput(req.body, { partial: true });
  const merged = { ...existing, ...f };
  await db.run(
    `UPDATE produits SET nom=?, categorie=?, prix_achat=?, prix_vente=?, quantite_stock=?, seuil_alerte=?, fournisseur=?, description=?, updated_at=?
     WHERE id = ? AND boutique_id = ?`,
    [merged.nom, merged.categorie, merged.prix_achat, merged.prix_vente, merged.quantite_stock, merged.seuil_alerte, merged.fournisseur || '', merged.description || '', nowISO(), existing.id, req.user.boutiqueId]
  );
  const product = (await db.query('SELECT * FROM produits WHERE id = ?', [existing.id])).rows[0];
  res.json({ product });
});

/** DELETE /api/products/:id (proprietaire uniquement) — suppression logique. */
const remove = asyncHandler(async (req, res) => {
  const existing = await getOwnedProduct(req.user.boutiqueId, req.params.id);
  await db.run('UPDATE produits SET statut = ?, updated_at = ? WHERE id = ?', ['inactif', nowISO(), existing.id]);
  res.status(204).end();
});

module.exports = { list, create, update, remove, getOwnedProduct, validateProductInput };
