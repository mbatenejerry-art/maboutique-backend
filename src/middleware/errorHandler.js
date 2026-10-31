'use strict';

const { HttpError } = require('../utils/asyncHandler');

function notFoundHandler(req, res) {
  res.status(404).json({ error: 'Route introuvable.', path: req.originalUrl });
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  if (err instanceof HttpError) {
    return res.status(err.statusCode).json({ error: err.message, code: err.code });
  }
  console.error('[erreur non geree]', err);
  res.status(500).json({ error: "Une erreur interne est survenue.", code: 'INTERNAL_ERROR' });
}

module.exports = { notFoundHandler, errorHandler };
