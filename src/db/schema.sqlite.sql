-- ===========================================================================
-- MaBoutique Pro - Schema SQLite (developpement local / module node:sqlite)
-- Miroir fonctionnel de schema.postgres.sql, syntaxe adaptee.
-- ===========================================================================

CREATE TABLE IF NOT EXISTS boutiques (
  id            TEXT PRIMARY KEY,
  nom           TEXT NOT NULL,
  telephone     TEXT,
  adresse       TEXT,
  devise        TEXT NOT NULL DEFAULT 'FCFA',
  logo_url      TEXT,
  recu_info     TEXT,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS utilisateurs (
  id             TEXT PRIMARY KEY,
  boutique_id    TEXT NOT NULL REFERENCES boutiques(id) ON DELETE CASCADE,
  nom            TEXT NOT NULL,
  email          TEXT NOT NULL UNIQUE,
  password_hash  TEXT NOT NULL,
  role           TEXT NOT NULL CHECK (role IN ('proprietaire', 'vendeur')),
  statut         TEXT NOT NULL DEFAULT 'actif' CHECK (statut IN ('actif', 'inactif')),
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS produits (
  id             TEXT PRIMARY KEY,
  boutique_id    TEXT NOT NULL REFERENCES boutiques(id) ON DELETE CASCADE,
  nom            TEXT NOT NULL,
  categorie      TEXT NOT NULL,
  prix_achat     INTEGER NOT NULL CHECK (prix_achat >= 0),
  prix_vente     INTEGER NOT NULL CHECK (prix_vente >= 0),
  quantite_stock INTEGER NOT NULL DEFAULT 0 CHECK (quantite_stock >= 0),
  seuil_alerte   INTEGER NOT NULL DEFAULT 0 CHECK (seuil_alerte >= 0),
  fournisseur    TEXT,
  description    TEXT,
  statut         TEXT NOT NULL DEFAULT 'actif' CHECK (statut IN ('actif', 'inactif')),
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_produits_boutique ON produits(boutique_id);

CREATE TABLE IF NOT EXISTS entrees_stock (
  id                    TEXT PRIMARY KEY,
  boutique_id           TEXT NOT NULL REFERENCES boutiques(id) ON DELETE CASCADE,
  produit_id            TEXT NOT NULL REFERENCES produits(id) ON DELETE CASCADE,
  utilisateur_id        TEXT NOT NULL REFERENCES utilisateurs(id),
  quantite_ajoutee      INTEGER NOT NULL CHECK (quantite_ajoutee > 0),
  prix_achat_unitaire   INTEGER NOT NULL CHECK (prix_achat_unitaire >= 0),
  montant_total         INTEGER NOT NULL CHECK (montant_total >= 0),
  date_entree           TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_entrees_boutique ON entrees_stock(boutique_id);

CREATE TABLE IF NOT EXISTS ventes (
  id                TEXT PRIMARY KEY,
  boutique_id       TEXT NOT NULL REFERENCES boutiques(id) ON DELETE CASCADE,
  utilisateur_id    TEXT NOT NULL REFERENCES utilisateurs(id),
  montant_total     INTEGER NOT NULL CHECK (montant_total >= 0),
  benefice_estime   INTEGER NOT NULL,
  mode_paiement     TEXT NOT NULL CHECK (mode_paiement IN ('cash', 'orange_money', 'mtn_momo', 'credit_client')),
  nom_client        TEXT,     -- rempli quand mode_paiement = 'credit_client'
  credit_rembourse  INTEGER NOT NULL DEFAULT 0 CHECK (credit_rembourse IN (0, 1)),
  date_vente        TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ventes_boutique ON ventes(boutique_id);
CREATE INDEX IF NOT EXISTS idx_ventes_date ON ventes(date_vente);

CREATE TABLE IF NOT EXISTS lignes_vente (
  id                    TEXT PRIMARY KEY,
  vente_id              TEXT NOT NULL REFERENCES ventes(id) ON DELETE CASCADE,
  produit_id            TEXT NOT NULL REFERENCES produits(id),
  nom_produit           TEXT NOT NULL,
  quantite              INTEGER NOT NULL CHECK (quantite > 0),
  prix_unitaire         INTEGER NOT NULL CHECK (prix_unitaire >= 0),
  prix_achat_unitaire   INTEGER NOT NULL CHECK (prix_achat_unitaire >= 0),
  total_ligne           INTEGER NOT NULL,
  benefice_ligne        INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_lignes_vente ON lignes_vente(vente_id);

CREATE TABLE IF NOT EXISTS messages (
  id             TEXT PRIMARY KEY,
  boutique_id    TEXT NOT NULL REFERENCES boutiques(id) ON DELETE CASCADE,
  produit_id     TEXT REFERENCES produits(id) ON DELETE SET NULL,
  produit_nom    TEXT,
  utilisateur_id TEXT NOT NULL REFERENCES utilisateurs(id),
  texte          TEXT NOT NULL,
  lu             INTEGER NOT NULL DEFAULT 0 CHECK (lu IN (0, 1)),
  date_message   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_messages_boutique ON messages(boutique_id);
