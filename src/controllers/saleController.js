'use strict';

const db = require('../config/db');
const { uid, nowISO } = require('../utils/ids');
const { localDayToUTCRange } = require('../utils/dateLocal');
const { asyncHandler, HttpError } = require('../utils/asyncHandler');
const { parsePagination, paginatedResponse } = require('../utils/pagination');

/**
 * POST /api/sales
 * Regles metier 7.5 / 11 :
 *   - Une vente ne peut pas etre validee si le stock est insuffisant.
 *   - Lorsqu'une vente est validee, le stock diminue automatiquement.
 *   - Benefice = prix_vente - prix_achat (par ligne, puis somme).
 * Toute la mutation est dans une transaction pour garantir la coherence.
 */
const create = asyncHandler(async (req, res) => {
  const { lignes, mode_paiement, nom_client } = req.body || {};
  const MODES = ['cash', 'orange_money', 'mtn_momo', 'credit_client'];

  if (!Array.isArray(lignes) || lignes.length === 0) {
    throw new HttpError(400, 'Le panier est vide.', 'EMPTY_CART');
  }
  if (!MODES.includes(mode_paiement)) {
    throw new HttpError(400, `Mode de paiement invalide. Valeurs acceptees : ${MODES.join(', ')}`, 'VALIDATION');
  }
  // Le nom du client est obligatoire pour les ventes a credit.
  if (mode_paiement === 'credit_client' && !String(nom_client || '').trim()) {
    throw new HttpError(400, 'Le nom du client est obligatoire pour une vente a credit.', 'VALIDATION');
  }

  // Validation basique des quantites avant d'ouvrir la transaction.
  const prodIds = [...new Set(lignes.map((l) => l.produit_id))];
  for (const ligne of lignes) {
    const qte = Number(ligne.quantite);
    if (!Number.isFinite(qte) || qte <= 0 || !Number.isInteger(qte)) {
      throw new HttpError(400, `Quantite invalide pour le produit ${ligne.produit_id}`, 'VALIDATION');
    }
  }

  const venteId = uid('vente');
  const now = nowISO();
  let lignesEnrichies;

  await db.transaction(async (tx) => {
    // -----------------------------------------------------------------------
    // Verrouillage pessimiste : on relit les produits DANS la transaction.
    // PostgreSQL : SELECT ... FOR UPDATE pose un verrou de ligne qui empeche
    // deux ventes simultanees de lire le meme stock et de le sur-decrementer.
    // SQLite     : ecriture serialisee nativement ; FOR UPDATE est ignore mais
    //              la contrainte CHECK (quantite_stock >= 0) bloque quand meme
    //              tout UPDATE qui mettrait le stock a negatif.
    // -----------------------------------------------------------------------
    const forUpdate = db.driver === 'postgres' ? ' FOR UPDATE' : '';
    const { rows: prods } = await tx.query(
      `SELECT * FROM produits WHERE boutique_id = ? AND statut = 'actif' AND id IN (${prodIds.map(() => '?').join(',')})${forUpdate}`,
      [req.user.boutiqueId, ...prodIds]
    );
    const prodMap = Object.fromEntries(prods.map((p) => [p.id, p]));

    for (const ligne of lignes) {
      const prod = prodMap[ligne.produit_id];
      if (!prod) throw new HttpError(404, `Produit introuvable : ${ligne.produit_id}`, 'NOT_FOUND');
      const qte = Number(ligne.quantite);
      if (qte > prod.quantite_stock) {
        throw new HttpError(409, `Stock insuffisant pour "${prod.nom}" — disponible : ${prod.quantite_stock}, demande : ${qte}`, 'INSUFFICIENT_STOCK');
      }
    }

    // Construction des lignes enrichies.
    lignesEnrichies = lignes.map((l) => {
      const prod = prodMap[l.produit_id];
      const qte = Number(l.quantite);
      const total_ligne = qte * prod.prix_vente;
      const benefice_ligne = qte * (prod.prix_vente - prod.prix_achat);
      return {
        id: uid('lv'),
        produit_id: prod.id,
        nom_produit: prod.nom,
        quantite: qte,
        prix_unitaire: prod.prix_vente,
        prix_achat_unitaire: prod.prix_achat,
        total_ligne,
        benefice_ligne,
      };
    });

    const montant_total   = lignesEnrichies.reduce((s, l) => s + l.total_ligne, 0);
    const benefice_estime = lignesEnrichies.reduce((s, l) => s + l.benefice_ligne, 0);

    // Inserer la vente.
    const clientNom = mode_paiement === 'credit_client' ? String(nom_client).trim() : null;
    await tx.run(
      `INSERT INTO ventes (id, boutique_id, utilisateur_id, montant_total, benefice_estime, mode_paiement, nom_client, credit_rembourse, date_vente)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [venteId, req.user.boutiqueId, req.user.id, montant_total, benefice_estime, mode_paiement, clientNom, 0, now]
    );
    // Inserer les lignes et decrementer les stocks.
    for (const l of lignesEnrichies) {
      await tx.run(
        `INSERT INTO lignes_vente (id, vente_id, produit_id, nom_produit, quantite, prix_unitaire, prix_achat_unitaire, total_ligne, benefice_ligne)
         VALUES (?,?,?,?,?,?,?,?,?)`,
        [l.id, venteId, l.produit_id, l.nom_produit, l.quantite, l.prix_unitaire, l.prix_achat_unitaire, l.total_ligne, l.benefice_ligne]
      );
      await tx.run(
        'UPDATE produits SET quantite_stock = quantite_stock - ?, updated_at = ? WHERE id = ?',
        [l.quantite, now, l.produit_id]
      );
    }
  });

  const vente = await getSaleById(venteId, req.user.boutiqueId);
  res.status(201).json({ sale: vente });
});

/** GET /api/sales?date=YYYY-MM-DD&userId=&page=1&limit=50 */
const list = asyncHandler(async (req, res) => {
  const { date, userId } = req.query;
  const { page, limit, offset } = parsePagination(req.query);

  let where = 'WHERE v.boutique_id = ?';
  const params = [req.user.boutiqueId];

  // Un vendeur ne voit que ses propres ventes (regle 7.8).
  if (req.user.role === 'vendeur') {
    where += ' AND v.utilisateur_id = ?';
    params.push(req.user.id);
  } else if (userId) {
    where += ' AND v.utilisateur_id = ?';
    params.push(userId);
  }
  if (date) {
    const [start, end] = localDayToUTCRange(date);
    where += ' AND v.date_vente >= ? AND v.date_vente <= ?';
    params.push(start, end);
  }

  const { rows: countRows } = await db.query(`SELECT COUNT(*) AS cnt FROM ventes v ${where}`, params);
  const total = Number(countRows[0]?.cnt ?? 0);

  const { rows: ventes } = await db.query(
    `SELECT v.*, u.nom AS vendeur_nom
     FROM ventes v JOIN utilisateurs u ON u.id = v.utilisateur_id
     ${where} ORDER BY v.date_vente DESC LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  // Charger les lignes de chaque vente de la page courante.
  const venteIds = ventes.map((v) => v.id);
  let lignesMap = {};
  if (venteIds.length > 0) {
    const { rows: lignes } = await db.query(
      `SELECT * FROM lignes_vente WHERE vente_id IN (${venteIds.map(() => '?').join(',')})`,
      venteIds
    );
    lignes.forEach((l) => {
      lignesMap[l.vente_id] = lignesMap[l.vente_id] || [];
      lignesMap[l.vente_id].push(l);
    });
  }

  const sales = ventes.map((v) => ({ ...v, lignes: lignesMap[v.id] || [] }));

  // Masquer le benefice aux vendeurs.
  const sanitized = req.user.role === 'vendeur'
    ? sales.map(({ benefice_estime, ...rest }) => ({ ...rest, lignes: rest.lignes.map(({ benefice_ligne, prix_achat_unitaire, ...l }) => l) }))
    : sales;

  res.json(paginatedResponse(sanitized, { page, limit, total }));
});

/**
 * GET /api/sales/credit  (proprietaire uniquement)
 * Liste les ventes a credit non encore remboursees.
 */
const listCredit = asyncHandler(async (req, res) => {
  const { rows } = await db.query(
    `SELECT v.*, u.nom AS vendeur_nom
     FROM ventes v JOIN utilisateurs u ON u.id = v.utilisateur_id
     WHERE v.boutique_id = ? AND v.mode_paiement = 'credit_client' AND v.credit_rembourse = ?
     ORDER BY v.date_vente DESC`,
    [req.user.boutiqueId, 0]
  );
  const venteIds = rows.map((v) => v.id);
  let lignesMap = {};
  if (venteIds.length > 0) {
    const { rows: lignes } = await db.query(
      `SELECT * FROM lignes_vente WHERE vente_id IN (${venteIds.map(() => '?').join(',')})`,
      venteIds
    );
    lignes.forEach((l) => { lignesMap[l.vente_id] = lignesMap[l.vente_id] || []; lignesMap[l.vente_id].push(l); });
  }
  const totalDu = rows.reduce((s, v) => s + Number(v.montant_total), 0);
  res.json({
    credits: rows.map((v) => ({ ...v, lignes: lignesMap[v.id] || [] })),
    totalDu,
    count: rows.length,
  });
});

/**
 * PATCH /api/sales/:id/paid  (proprietaire uniquement)
 * Marque une vente a credit comme remboursee.
 */
const markCreditPaid = asyncHandler(async (req, res) => {
  const { rows } = await db.query(
    "SELECT * FROM ventes WHERE id = ? AND boutique_id = ? AND mode_paiement = 'credit_client'",
    [req.params.id, req.user.boutiqueId]
  );
  if (!rows[0]) throw new HttpError(404, 'Vente a credit introuvable.', 'NOT_FOUND');
  if (rows[0].credit_rembourse) throw new HttpError(409, 'Cette vente est deja marquee comme remboursee.', 'ALREADY_PAID');
  await db.run('UPDATE ventes SET credit_rembourse = ? WHERE id = ?', [1, rows[0].id]);
  res.json({ ok: true, venteId: rows[0].id, client: rows[0].nom_client });
});

async function getSaleById(id, boutiqueId) {
  const { rows } = await db.query(
    `SELECT v.*, u.nom AS vendeur_nom FROM ventes v JOIN utilisateurs u ON u.id = v.utilisateur_id WHERE v.id = ? AND v.boutique_id = ?`,
    [id, boutiqueId]
  );
  if (!rows[0]) throw new HttpError(404, 'Vente introuvable.', 'NOT_FOUND');
  const { rows: lignes } = await db.query('SELECT * FROM lignes_vente WHERE vente_id = ?', [id]);
  return { ...rows[0], lignes };
}

module.exports = { create, list, listCredit, markCreditPaid };
