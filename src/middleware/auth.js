'use strict';

const jwt = require('../utils/jwt');
const { HttpError } = require('../utils/asyncHandler');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';

// Alerte au demarrage si le secret par defaut est utilise en production.
if (process.env.NODE_ENV === 'production' && JWT_SECRET === 'dev-secret-change-me') {
  console.error('[SECURITE] ATTENTION : JWT_SECRET n\'est pas defini ! Definissez-le dans votre fichier .env avant toute mise en production.');
}

/**
 * Verifie le JWT ET confirme en base que le compte est toujours actif.
 * Cela permet de revoquer l'acces immediatement quand un proprietaire
 * desactive un vendeur, sans attendre l'expiration naturelle du token.
 */
async function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return next(new HttpError(401, 'Authentification requise.', 'NO_TOKEN'));

  let payload;
  try {
    payload = jwt.verify(token, JWT_SECRET);
  } catch (err) {
    return next(new HttpError(401, 'Session invalide ou expiree, veuillez vous reconnecter.', 'BAD_TOKEN'));
  }

  try {
    const db = require('../config/db');
    const { rows } = await db.query(
      'SELECT id, nom, role, statut, boutique_id FROM utilisateurs WHERE id = ? AND boutique_id = ?',
      [payload.userId, payload.boutiqueId]
    );
    const user = rows[0];
    if (!user)                    return next(new HttpError(401, 'Compte introuvable. Veuillez vous reconnecter.', 'USER_NOT_FOUND'));
    if (user.statut !== 'actif')  return next(new HttpError(403, 'Ce compte a ete desactive. Contactez le proprietaire.', 'ACCOUNT_DISABLED'));

    req.user = { id: user.id, boutiqueId: user.boutique_id, role: user.role, nom: user.nom };
    next();
  } catch (err) {
    next(err);
  }
}

/** Reserve une route au role "proprietaire" (ex: supprimer un produit, voir les rapports). */
function requireOwner(req, res, next) {
  if (!req.user || req.user.role !== 'proprietaire') {
    return next(new HttpError(403, 'Action reservee au proprietaire de la boutique.', 'FORBIDDEN_ROLE'));
  }
  next();
}

module.exports = { requireAuth, requireOwner, JWT_SECRET };
