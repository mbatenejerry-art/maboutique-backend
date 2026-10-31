'use strict';

function asyncHandler(fn) {
  return function wrapped(req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/** Erreur HTTP explicite (statusCode + message + code optionnel pour le client) */
class HttpError extends Error {
  constructor(statusCode, message, code) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}

module.exports = { asyncHandler, HttpError };
