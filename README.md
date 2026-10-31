# MaBoutique Pro — Backend API

API REST Node.js + Express pour la gestion de stock et de ventes des petites boutiques camerounaises.

## Stack technique

| Composant | Choix |
|---|---|
| Runtime | Node.js >= 22.5 |
| Framework | Express 4 |
| Base de données dev | SQLite via **`node:sqlite`** (module intégré Node, aucune dépendance native) |
| Base de données prod | **PostgreSQL** (via `pg`) |
| Hachage mot de passe | `scrypt` (module natif `node:crypto`) |
| Jetons de session | HMAC-SHA256 maison (module natif `node:crypto`) |
| Déploiement | **PM2** + **Cloudflare Tunnel** |

---

## Démarrage rapide (local / SQLite)

```bash
# 1. Cloner / copier les fichiers
cd maboutique-backend

# 2. Installer les dépendances
npm install

# 3. Copier et éditer la config
cp .env.example .env
# Seul JWT_SECRET mérite d'être changé en dev :
#   JWT_SECRET=une-chaine-quelconque

# 4. Créer les tables SQLite
npm run migrate

# 5. Injecter les données de démonstration
npm run seed

# 6. Démarrer le serveur
npm run dev
# → API disponible sur http://localhost:4000
# → Health check : http://localhost:4000/api/health
```

Comptes de démonstration :
- Propriétaire : `proprio@maboutique.cm` / `proprio123`
- Vendeur : `vendeur@maboutique.cm` / `vendeur123`

---

## Déploiement VPS (PostgreSQL + PM2 + Cloudflare Tunnel)

### 1. Préparer le serveur Ubuntu

```bash
# Node.js 22
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs

# PM2
npm install -g pm2

# PostgreSQL
sudo apt install postgresql postgresql-contrib
```

### 2. Créer la base de données PostgreSQL

```bash
sudo -u postgres psql << 'SQL'
CREATE USER maboutique_user WITH ENCRYPTED PASSWORD 'CHANGER_CE_MOT_DE_PASSE';
CREATE DATABASE maboutique OWNER maboutique_user;
GRANT ALL PRIVILEGES ON DATABASE maboutique TO maboutique_user;
SQL
```

### 3. Configurer l'application

```bash
cp .env.example .env
# Éditer .env :
#   DB_DRIVER=postgres
#   PGPASSWORD=CHANGER_CE_MOT_DE_PASSE
#   JWT_SECRET=valeur-aleatoire-longue
#   CORS_ORIGIN=https://app.maboutique.cm
```

Générer un secret fort :
```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

### 4. Installer les dépendances et migrer

```bash
npm install --omit=dev
npm run migrate
npm run seed   # optionnel : données de démo
```

### 5. Démarrer avec PM2

```bash
# Démarrer en mode production (PostgreSQL)
pm2 start pm2.config.js --env prod

# Vérifier que l'API répond
curl http://localhost:4000/api/health

# Sauvegarder + activer le démarrage auto au reboot
pm2 save
pm2 startup   # copier-coller la commande affichée
```

### 6. Exposer via Cloudflare Tunnel

```bash
# Installer cloudflared
curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb -o cloudflared.deb
sudo dpkg -i cloudflared.deb

# Authentifier (ouvre le navigateur → choisir votre zone Cloudflare)
cloudflared tunnel login

# Créer le tunnel
cloudflared tunnel create maboutique-api

# Créer le fichier de config Cloudflare
mkdir -p ~/.cloudflared
cat > ~/.cloudflared/config.yml << 'EOF'
tunnel: maboutique-api
credentials-file: /root/.cloudflared/<VOTRE_UUID>.json

ingress:
  - hostname: api.maboutique.cm
    service: http://localhost:4000
  - service: http_status:404
EOF

# Créer l'entrée DNS CNAME (remplacer <UUID> par l'UUID réel du tunnel)
cloudflared tunnel route dns maboutique-api api.maboutique.cm

# Démarrer cloudflared en service système
cloudflared service install
sudo systemctl start cloudflared
sudo systemctl enable cloudflared
```

L'API est alors accessible sur `https://api.maboutique.cm`.

---

## Référence de l'API

Toutes les routes protégées nécessitent le header :
```
Authorization: Bearer <token>
```

### Authentification

| Méthode | Route | Accès | Description |
|---------|-------|-------|-------------|
| POST | `/api/auth/register` | Public | Créer boutique + propriétaire |
| POST | `/api/auth/login` | Public | Se connecter |
| GET  | `/api/auth/me` | Auth | Profil courant |

**Register body :**
```json
{ "shopName": "Boutique Marie", "ownerName": "Marie Ngo", "email": "...", "password": "..." }
```

**Login body :**
```json
{ "email": "proprio@maboutique.cm", "password": "proprio123" }
```

**Login response :**
```json
{ "token": "...", "user": { "id": "...", "nom": "Marie Ngo", "role": "proprietaire", ... } }
```

---

### Boutique

| Méthode | Route | Accès | Description |
|---------|-------|-------|-------------|
| GET | `/api/boutique` | Auth | Lire les paramètres |
| PUT | `/api/boutique` | Propriétaire | Modifier |

---

### Produits

| Méthode | Route | Accès | Description |
|---------|-------|-------|-------------|
| GET | `/api/products` | Auth | Liste (search=, category=, lowStock=true) |
| POST | `/api/products` | Propriétaire | Créer |
| PUT | `/api/products/:id` | Propriétaire | Modifier |
| DELETE | `/api/products/:id` | Propriétaire | Désactiver (soft delete) |

> Le **vendeur ne voit pas le prix d'achat** dans les réponses.

---

### Entrées de stock

| Méthode | Route | Accès | Description |
|---------|-------|-------|-------------|
| GET | `/api/stock-entries` | Propriétaire | Historique |
| POST | `/api/stock-entries` | Propriétaire | Nouvelle entrée (incrémente le stock automatiquement) |

**Body POST :**
```json
{ "produit_id": "prod_...", "quantite_ajoutee": 10, "prix_achat_unitaire": 14000 }
```

---

### Ventes

| Méthode | Route | Accès | Description |
|---------|-------|-------|-------------|
| POST | `/api/sales` | Auth | Créer une vente (décrémente le stock, atomique) |
| GET  | `/api/sales` | Auth | Historique (date=YYYY-MM-DD, userId=) |

**Body POST :**
```json
{
  "lignes": [
    { "produit_id": "prod_...", "quantite": 2 }
  ],
  "mode_paiement": "orange_money"
}
```

Modes acceptés : `cash`, `orange_money`, `mtn_momo`, `credit_client`

---

### Rapports

| Méthode | Route | Accès | Description |
|---------|-------|-------|-------------|
| GET | `/api/reports/dashboard` | Auth | Chiffres du jour (léger) |
| GET | `/api/reports/daily?date=YYYY-MM-DD` | Propriétaire | Rapport complet |

---

### Employés

| Méthode | Route | Accès | Description |
|---------|-------|-------|-------------|
| GET | `/api/users` | Propriétaire | Liste |
| POST | `/api/users` | Propriétaire | Créer un vendeur |
| PATCH | `/api/users/:id/status` | Propriétaire | Activer / désactiver |
| PUT | `/api/users/:id/password` | Propriétaire | Réinitialiser le mot de passe |

---

### Messages

| Méthode | Route | Accès | Description |
|---------|-------|-------|-------------|
| GET | `/api/messages` | Propriétaire | Voir tous les messages |
| POST | `/api/messages` | Auth | Envoyer un message (vendeur → propriétaire) |
| PATCH | `/api/messages/:id/read` | Propriétaire | Marquer comme lu |

---

## Structure du projet

```
src/
├── config/
│   └── db.js              # Couche d'abstraction SQLite/PostgreSQL
├── controllers/
│   ├── authController.js
│   ├── productController.js
│   ├── stockEntryController.js
│   ├── saleController.js
│   ├── reportController.js
│   ├── userController.js
│   └── boutiqueController.js
├── db/
│   ├── schema.postgres.sql
│   ├── schema.sqlite.sql
│   ├── migrate.js
│   └── seed.js
├── middleware/
│   ├── auth.js
│   └── errorHandler.js
├── routes/
│   └── index.js
├── utils/
│   ├── asyncHandler.js
│   ├── ids.js
│   ├── jwt.js
│   └── password.js
└── server.js
```

---

## Règles métier implémentées (cahier des charges §11)

- ✅ Une boutique ne voit que ses propres données (filtre `boutique_id` sur toutes les requêtes)
- ✅ Une vente validée décrémente le stock (transaction atomique)
- ✅ Une entrée de stock incrémente le stock (transaction atomique)
- ✅ Stock faible : `quantite_stock <= seuil_alerte`
- ✅ Bénéfice = prix_vente_total − prix_achat_total
- ✅ Vente bloquée si stock insuffisant (HTTP 409)
- ✅ Vendeur ne voit pas les prix d'achat ni les bénéfices
- ✅ Vendeur ne peut pas supprimer de produit
- ✅ Vendeur peut envoyer un message au propriétaire
- ✅ Montants positifs vérifiés par contraintes SQL et validation applicative
