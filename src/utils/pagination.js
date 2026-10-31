'use strict';

/**
 * Extrait les parametres de pagination depuis req.query.
 * Retourne { limit, offset, page } a injecter dans le SQL.
 * Valeurs par defaut : page 1, 50 resultats. Maximum autorise : 200.
 */
function parsePagination(query) {
  const page  = Math.max(1, parseInt(query.page  ?? 1,  10) || 1);
  const limit = Math.min(200, Math.max(1, parseInt(query.limit ?? 50, 10) || 50));
  const offset = (page - 1) * limit;
  return { page, limit, offset };
}

/**
 * Enveloppe les resultats dans un objet de pagination standard.
 * `total` est le nombre total de lignes (issu d'un COUNT(*) prealable).
 */
function paginatedResponse(rows, { page, limit, total }) {
  return {
    data: rows,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      hasNext: page * limit < total,
    },
  };
}

module.exports = { parsePagination, paginatedResponse };
