'use strict';

const crypto = require('node:crypto');
const { domainError } = require('../errors');

/** Token assinado (HMAC-SHA256) com expiração: payload.assinatura, ambos base64url. */
function createTokenService({ secret, ttlSeconds, clock }) {
  const sign = (body) => crypto.createHmac('sha256', secret).update(body).digest('base64url');

  return {
    ttlSeconds,
    issue(payload) {
      const iat = Math.floor(clock.now() / 1000);
      const body = Buffer.from(JSON.stringify({ ...payload, iat, exp: iat + ttlSeconds })).toString('base64url');
      return `${body}.${sign(body)}`;
    },
    verify(token) {
      const unauthenticated = () => domainError('UNAUTHENTICATED');
      if (typeof token !== 'string') throw unauthenticated();
      const parts = token.split('.');
      if (parts.length !== 2) throw unauthenticated();
      const [body, signature] = parts;
      const expected = Buffer.from(sign(body));
      const received = Buffer.from(signature);
      if (expected.length !== received.length || !crypto.timingSafeEqual(expected, received)) throw unauthenticated();
      let payload;
      try {
        payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
      } catch {
        throw unauthenticated();
      }
      if (!payload || typeof payload.exp !== 'number' || payload.exp <= Math.floor(clock.now() / 1000)) {
        throw unauthenticated();
      }
      return payload;
    },
  };
}

module.exports = { createTokenService };
