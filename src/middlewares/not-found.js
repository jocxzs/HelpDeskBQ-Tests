'use strict';

const { domainError } = require('../errors');

function notFound(req, res, next) {
  next(domainError('NOT_FOUND'));
}

module.exports = notFound;
