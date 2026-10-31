'use strict';

/**
 * Utilitaires de dates pour le fuseau Cameroun (WAT = UTC+1).
 *
 * Les dates sont stockees en UTC dans la base (format ISO 8601).
 * Quand l'utilisateur demande "le rapport du 15 janvier", il entend le 15
 * janvier a Yaounde (UTC+1), pas a Londres. Ce module convertit un simple
 * "YYYY-MM-DD" local en bornes UTC appropriees.
 *
 * TZ_OFFSET_HOURS peut etre surchargee via la variable d'env TZ_OFFSET_HOURS.
 * Valeur par defaut : 1 (Africa/Douala, UTC+1).
 */

const TZ_OFFSET_HOURS = Number(process.env.TZ_OFFSET_HOURS ?? 1);
const TZ_OFFSET_MS = TZ_OFFSET_HOURS * 60 * 60 * 1000;

/**
 * Retourne [startUTC, endUTC] pour une date locale donnee (YYYY-MM-DD).
 * Exemple pour le 15/01/2024 en UTC+1 :
 *   startUTC = '2024-01-14T23:00:00.000Z'
 *   endUTC   = '2024-01-15T22:59:59.999Z'
 */
function localDayToUTCRange(dateStr) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    throw new Error(`Format de date invalide : "${dateStr}". Attendu : YYYY-MM-DD`);
  }
  // Minuit heure locale = minuit UTC - offset
  const startLocal = new Date(`${dateStr}T00:00:00.000Z`);
  const startUTC   = new Date(startLocal.getTime() - TZ_OFFSET_MS);
  const endUTC     = new Date(startUTC.getTime() + 24 * 60 * 60 * 1000 - 1);
  return [startUTC.toISOString(), endUTC.toISOString()];
}

/**
 * Retourne la date locale du jour au format YYYY-MM-DD.
 */
function todayLocal() {
  const now = new Date(Date.now() + TZ_OFFSET_MS);
  return now.toISOString().slice(0, 10);
}

module.exports = { localDayToUTCRange, todayLocal, TZ_OFFSET_HOURS };
