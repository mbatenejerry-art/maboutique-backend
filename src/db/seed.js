'use strict';

require('dotenv').config();
const db = require('../config/db');
const { hashPassword } = require('../utils/password');
const { uid, nowISO } = require('../utils/ids');

function daysAgo(n, h = 10, m = 0) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(h, m, 0, 0);
  return d.toISOString();
}

async function seed() {
  console.log('[seed] Demarrage...');

  // ----- Boutique + utilisateurs -----
  const boutiqueId = uid('shop');
  const ownerId    = uid('user');
  const sellerId   = uid('user');
  const now        = nowISO();

  const ignore = db.driver === 'postgres' ? 'ON CONFLICT DO NOTHING' : 'OR IGNORE';
  const ins = (table) => `INSERT ${db.driver === 'sqlite' ? 'OR IGNORE' : ''} INTO ${table}`;
  const onc = db.driver === 'postgres' ? ' ON CONFLICT DO NOTHING' : '';

  await db.run(
    `${ins('boutiques')} (id, nom, telephone, adresse, devise, recu_info, created_at) VALUES (?,?,?,?,?,?,?)${onc}`,
    [boutiqueId, 'Boutique Marie', '+237 6 90 00 00 00', 'Carrefour Biyem-Assi, Yaoundé', 'FCFA', 'Merci pour votre achat ! Revenez bientôt.', now]
  );
  await db.run(
    `${ins('utilisateurs')} (id, boutique_id, nom, email, password_hash, role, statut, created_at) VALUES (?,?,?,?,?,?,?,?)${onc}`,
    [ownerId, boutiqueId, 'Marie Ngo', 'proprio@maboutique.cm', hashPassword('proprio123'), 'proprietaire', 'actif', now]
  );
  await db.run(
    `${ins('utilisateurs')} (id, boutique_id, nom, email, password_hash, role, statut, created_at) VALUES (?,?,?,?,?,?,?,?)${onc}`,
    [sellerId, boutiqueId, 'Junior Tchio', 'vendeur@maboutique.cm', hashPassword('vendeur123'), 'vendeur', 'actif', now]
  );

  // ----- Produits -----
  const PRODS = [
    { nom: 'Riz parfumé 25kg',      cat: 'Alimentation', pa: 14000, pv: 16000, qte: 18, seuil: 5,  fourn: 'Ets Fotso' },
    { nom: 'Huile végétale 5L',      cat: 'Alimentation', pa: 6500,  pv: 7500,  qte: 12, seuil: 4,  fourn: 'Ets Fotso' },
    { nom: 'Sucre en poudre 1kg',    cat: 'Alimentation', pa: 700,   pv: 900,   qte: 40, seuil: 10, fourn: 'SOSUCAM' },
    { nom: 'Lait en poudre 400g',    cat: 'Alimentation', pa: 1800,  pv: 2200,  qte: 25, seuil: 8,  fourn: 'Nestlé Distrib' },
    { nom: 'Savon de Marseille',     cat: 'Hygiène',      pa: 350,   pv: 500,   qte: 60, seuil: 15, fourn: 'Tradex Hygiène' },
    { nom: 'Eau minérale 1.5L',      cat: 'Boissons',     pa: 350,   pv: 500,   qte: 3,  seuil: 10, fourn: 'SEMC' },
    { nom: 'Boîte de tomate 400g',   cat: 'Alimentation', pa: 450,   pv: 600,   qte: 50, seuil: 12, fourn: 'Ets Fotso' },
    { nom: 'Cube Maggi (sachet)',     cat: 'Alimentation', pa: 1000,  pv: 1300,  qte: 30, seuil: 8,  fourn: 'Nestlé Distrib' },
    { nom: 'Farine de blé 1kg',      cat: 'Alimentation', pa: 600,   pv: 800,   qte: 2,  seuil: 6,  fourn: 'Ets Fotso' },
    { nom: 'Biscuits paquet',        cat: 'Divers',       pa: 300,   pv: 450,   qte: 45, seuil: 10, fourn: 'Filiale Choco' },
    { nom: 'Cahier 100 pages',       cat: 'Papeterie',    pa: 250,   pv: 400,   qte: 35, seuil: 10, fourn: 'Papeterie Centrale' },
    { nom: 'Recharge crédit 500F',   cat: 'Divers',       pa: 480,   pv: 500,   qte: 20, seuil: 5,  fourn: 'Distributeur Telecom' },
  ];

  const prodIds = [];
  for (const p of PRODS) {
    const id = uid('prod');
    prodIds.push({ id, ...p });
    await db.run(
      `${ins('produits')} (id, boutique_id, nom, categorie, prix_achat, prix_vente, quantite_stock, seuil_alerte, fournisseur, description, statut, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)${onc}`,
      [id, boutiqueId, p.nom, p.cat, p.pa, p.pv, p.qte, p.seuil, p.fourn, '', 'actif', now, now]
    );
  }

  // ----- Entrées de stock (historique) -----
  const stockEntries = [
    { prod: 0, qte: 20, pa: 14000, daysAgo_n: 7, h: 9 },
    { prod: 5, qte: 24, pa: 350,   daysAgo_n: 5, h: 10 },
    { prod: 8, qte: 10, pa: 600,   daysAgo_n: 3, h: 15 },
  ];
  for (const e of stockEntries) {
    const prod = prodIds[e.prod];
    const montant = e.qte * e.pa;
    await db.run(
      'INSERT INTO entrees_stock (id, boutique_id, produit_id, utilisateur_id, quantite_ajoutee, prix_achat_unitaire, montant_total, date_entree) VALUES (?,?,?,?,?,?,?,?)',
      [uid('entry'), boutiqueId, prod.id, ownerId, e.qte, e.pa, montant, daysAgo(e.daysAgo_n, e.h, 0)]
    );
  }

  // ----- Ventes historiques (7 jours) -----
  const dayPlans = [
    { daysAgo_n: 6, count: 3 }, { daysAgo_n: 5, count: 4 }, { daysAgo_n: 4, count: 2 },
    { daysAgo_n: 3, count: 5 }, { daysAgo_n: 2, count: 3 }, { daysAgo_n: 1, count: 4 },
    { daysAgo_n: 0, count: 3 },
  ];
  const MODES = ['cash', 'orange_money', 'mtn_momo', 'credit_client'];
  let counter = 0;

  for (const day of dayPlans) {
    for (let i = 0; i < day.count; i++) {
      const vendeur = counter % 2 === 0 ? sellerId : ownerId;
      const hour = 9 + Math.floor((counter * 7 + i * 3) % 9);
      const min  = (counter * 13 + i * 17) % 60;
      const venteDate = daysAgo(day.daysAgo_n, hour, min);
      const venteId = uid('vente');

      // Choisir 1 a 3 produits differents.
      const lineCount = 1 + (counter % 3);
      const chosenIdxs = new Set();
      while (chosenIdxs.size < lineCount) {
        chosenIdxs.add((counter * 3 + chosenIdxs.size * 7 + i) % prodIds.length);
      }

      const lignes = [];
      for (const idx of chosenIdxs) {
        const prod = prodIds[idx];
        const qte  = 1 + (counter % 3);
        lignes.push({
          id: uid('lv'),
          produit_id: prod.id,
          nom_produit: prod.nom,
          quantite: qte,
          prix_unitaire: prod.pv,
          prix_achat_unitaire: prod.pa,
          total_ligne: qte * prod.pv,
          benefice_ligne: qte * (prod.pv - prod.pa),
        });
      }

      const montant_total   = lignes.reduce((s, l) => s + l.total_ligne, 0);
      const benefice_estime = lignes.reduce((s, l) => s + l.benefice_ligne, 0);
      const mode = MODES[counter % MODES.length];

      await db.run(
        'INSERT INTO ventes (id, boutique_id, utilisateur_id, montant_total, benefice_estime, mode_paiement, date_vente) VALUES (?,?,?,?,?,?,?)',
        [venteId, boutiqueId, vendeur, montant_total, benefice_estime, mode, venteDate]
      );
      for (const l of lignes) {
        await db.run(
          'INSERT INTO lignes_vente (id, vente_id, produit_id, nom_produit, quantite, prix_unitaire, prix_achat_unitaire, total_ligne, benefice_ligne) VALUES (?,?,?,?,?,?,?,?,?)',
          [l.id, venteId, l.produit_id, l.nom_produit, l.quantite, l.prix_unitaire, l.prix_achat_unitaire, l.total_ligne, l.benefice_ligne]
        );
      }
      counter++;
    }
  }

  console.log(`[seed] Boutique créée : ${boutiqueId}`);
  console.log(`[seed] Propriétaire : proprio@maboutique.cm / proprio123`);
  console.log(`[seed] Vendeur      : vendeur@maboutique.cm / vendeur123`);
  console.log(`[seed] ${prodIds.length} produits, ${counter} ventes insérées.`);
  console.log('[seed] Terminé.');
  if (db.close) await db.close();
}

seed().catch((err) => {
  console.error('[seed] Erreur :', err);
  process.exit(1);
});
