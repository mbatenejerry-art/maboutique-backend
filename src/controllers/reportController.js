'use strict';

const db = require('../config/db');
const { asyncHandler } = require('../utils/asyncHandler');
const { localDayToUTCRange, todayLocal } = require('../utils/dateLocal');

/**
 * GET /api/reports/daily?date=YYYY-MM-DD  (proprietaire uniquement)
 * Calcul le rapport journalier : total ventes, benefice, nb ventes,
 * top produits, repartition par mode de paiement, repartition par vendeur.
 * Utilise des requetes simples compatibles avec SQLite et PostgreSQL.
 */
const daily = asyncHandler(async (req, res) => {
  const date = req.query.date || todayLocal();
  const [start, end] = localDayToUTCRange(date);
  const bid = req.user.boutiqueId;

  // Toutes les ventes de la journee.
  const { rows: ventes } = await db.query(
    `SELECT v.*, u.nom AS vendeur_nom
     FROM ventes v JOIN utilisateurs u ON u.id = v.utilisateur_id
     WHERE v.boutique_id = ? AND v.date_vente >= ? AND v.date_vente <= ?
     ORDER BY v.date_vente ASC`,
    [bid, start, end]
  );

  if (ventes.length === 0) {
    return res.json({
      date, totalSales: 0, totalProfit: 0, salesCount: 0,
      topProducts: [], byPayment: {}, bySeller: [], sales: [],
    });
  }

  const venteIds = ventes.map((v) => v.id);
  const { rows: lignes } = await db.query(
    `SELECT * FROM lignes_vente WHERE vente_id IN (${venteIds.map(() => '?').join(',')})`,
    venteIds
  );

  // Totaux globaux.
  const totalSales  = ventes.reduce((s, v) => s + Number(v.montant_total), 0);
  const totalProfit = ventes.reduce((s, v) => s + Number(v.benefice_estime), 0);
  const salesCount  = ventes.length;

  // Top produits.
  const prodAgg = {};
  lignes.forEach((l) => {
    if (!prodAgg[l.produit_id]) prodAgg[l.produit_id] = { produit_id: l.produit_id, nom: l.nom_produit, quantite: 0, total: 0 };
    prodAgg[l.produit_id].quantite += Number(l.quantite);
    prodAgg[l.produit_id].total   += Number(l.total_ligne);
  });
  const topProducts = Object.values(prodAgg).sort((a, b) => b.quantite - a.quantite).slice(0, 10);

  // Par mode de paiement.
  const byPayment = {};
  ventes.forEach((v) => {
    byPayment[v.mode_paiement] = (byPayment[v.mode_paiement] || 0) + Number(v.montant_total);
  });

  // Par vendeur.
  const sellerAgg = {};
  ventes.forEach((v) => {
    if (!sellerAgg[v.utilisateur_id]) {
      sellerAgg[v.utilisateur_id] = { utilisateur_id: v.utilisateur_id, nom: v.vendeur_nom, count: 0, total: 0 };
    }
    sellerAgg[v.utilisateur_id].count++;
    sellerAgg[v.utilisateur_id].total += Number(v.montant_total);
  });
  const bySeller = Object.values(sellerAgg).sort((a, b) => b.total - a.total);

  // Lignes par vente.
  const lignesMap = {};
  lignes.forEach((l) => { lignesMap[l.vente_id] = lignesMap[l.vente_id] || []; lignesMap[l.vente_id].push(l); });
  const sales = ventes.map((v) => ({ ...v, lignes: lignesMap[v.id] || [] }));

  res.json({ date, totalSales, totalProfit, salesCount, topProducts, byPayment, bySeller, sales });
});

/**
 * GET /api/reports/dashboard  (proprietaire et vendeur)
 * Donnees legeres pour le tableau de bord : chiffres du jour + stock faible.
 */
const dashboard = asyncHandler(async (req, res) => {
  const bid = req.user.boutiqueId;
  const today = todayLocal();
  const [start, end] = localDayToUTCRange(today);

  const userFilter = req.user.role === 'vendeur' ? ' AND v.utilisateur_id = ?' : '';
  const userParams = req.user.role === 'vendeur' ? [req.user.id] : [];

  const { rows: todaySales } = await db.query(
    `SELECT montant_total, benefice_estime FROM ventes WHERE boutique_id = ? AND date_vente >= ? AND date_vente <= ?${userFilter}`,
    [bid, start, end, ...userParams]
  );
  const { rows: lowStock } = await db.query(
    "SELECT COUNT(*) AS cnt FROM produits WHERE boutique_id = ? AND statut = 'actif' AND quantite_stock <= seuil_alerte",
    [bid]
  );
  const { rows: total } = await db.query(
    "SELECT COUNT(*) AS cnt FROM produits WHERE boutique_id = ? AND statut = 'actif'",
    [bid]
  );
  const { rows: recentSales } = await db.query(
    `SELECT v.id, v.montant_total, v.date_vente, v.mode_paiement, u.nom AS vendeur_nom
     FROM ventes v JOIN utilisateurs u ON u.id = v.utilisateur_id
     WHERE v.boutique_id = ?${userFilter}
     ORDER BY v.date_vente DESC LIMIT 8`,
    [bid, ...userParams]
  );

  res.json({
    todaySales: {
      count: todaySales.length,
      total: todaySales.reduce((s, r) => s + Number(r.montant_total), 0),
      profit: todaySales.reduce((s, r) => s + Number(r.benefice_estime), 0),
    },
    lowStockCount: Number(lowStock[0]?.cnt || 0),
    totalProducts: Number(total[0]?.cnt || 0),
    recentSales,
  });
});

module.exports = { daily, dashboard };
