'use strict';

const crypto = require('node:crypto');

/** Gera um identificador por requisição (RNF07) e o devolve no cabeçalho x-correlation-id. */
function correlationId(req, res, next) {
  req.correlationId = `req_${crypto.randomUUID()}`;
  res.set('x-correlation-id', req.correlationId);
  next();
}

module.exports = correlationId;
