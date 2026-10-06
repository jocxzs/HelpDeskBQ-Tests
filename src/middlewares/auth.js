'use strict';

const { domainError } = require('../errors');

function bearerToken(req) {
  const header = req.get('authorization') || '';
  const [scheme, token] = header.split(' ');
  return scheme === 'Bearer' && token ? token : null;
}

/** Autenticação (quem é) e autorização por papel (o que pode) sempre no servidor. */
function createAuthMiddleware({ authService }) {
  const requireAuth = async (req, res, next) => {
    try {
      const token = bearerToken(req);
      if (!token) throw domainError('UNAUTHENTICATED');
      req.user = await authService.authenticate(token);
      next();
    } catch (error) {
      next(error);
    }
  };

  const requireRole =
    (...roles) =>
    (req, res, next) =>
      roles.includes(req.user.role) ? next() : next(domainError('FORBIDDEN'));

  return { requireAuth, requireRole };
}

module.exports = { createAuthMiddleware };
