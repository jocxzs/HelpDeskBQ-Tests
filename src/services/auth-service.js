'use strict';

const crypto = require('node:crypto');
const { domainError } = require('../errors');

const loginKey = (email) => crypto.createHash('sha256').update(String(email).trim().toLowerCase()).digest('hex');

const toPublicUser = (user) => ({ id: user.id, name: user.name, email: user.email, role: user.role });

/**
 * Autenticação e bloqueio temporário (RF01, RF02).
 * Regras: 3 falhas em 5 min bloqueiam por 10 min, contados da terceira falha.
 * A terceira resposta já é 423. Durante o bloqueio, nem a senha correta entra
 * e o prazo NÃO é reiniciado. Contas inexistentes se comportam igual às reais.
 */
function createAuthService({ repositories, passwords, tokens, clock, logger, loginPolicy }) {
  const { users, loginAttempts } = repositories;
  let dummyHash;

  async function login({ email, password }) {
    const key = loginKey(email);
    const now = clock.now();

    const lockedUntil = await loginAttempts.getLock(key);
    if (lockedUntil && lockedUntil > now) {
      logger.warn('auth.login.blocked', { emailHash: key.slice(0, 12) });
      throw domainError('ACCOUNT_LOCKED');
    }

    const user = await users.findByEmail(email);
    if (!user) dummyHash = dummyHash || (await passwords.hash('senha-inexistente'));
    const passwordOk = await passwords.verify(password, user ? user.passwordHash : dummyHash);

    if (user && user.active && passwordOk) {
      await loginAttempts.clearFailures(key);
      logger.info('auth.login.success', { actorId: user.id, role: user.role });
      return {
        token: tokens.issue({ sub: user.id, role: user.role }),
        tokenType: 'Bearer',
        expiresIn: tokens.ttlSeconds,
        user: toPublicUser(user),
      };
    }

    await loginAttempts.addFailure(key, now);
    const failures = await loginAttempts.countFailuresSince(key, now - loginPolicy.windowMs);
    logger.warn('auth.login.failed', { emailHash: key.slice(0, 12), failures });

    if (failures >= loginPolicy.maxFailures) {
      await loginAttempts.setLock(key, now + loginPolicy.lockMs);
      await loginAttempts.clearFailures(key);
      logger.warn('auth.account.locked', { emailHash: key.slice(0, 12), lockMs: loginPolicy.lockMs });
      throw domainError('ACCOUNT_LOCKED');
    }
    throw domainError('INVALID_CREDENTIALS');
  }

  /** Valida o token e carrega o usuário atual (conta desativada perde o acesso na hora). */
  async function authenticate(token) {
    const payload = tokens.verify(token);
    const user = await users.findById(payload.sub);
    if (!user || !user.active) throw domainError('UNAUTHENTICATED');
    return toPublicUser(user);
  }

  return { login, authenticate };
}

module.exports = { createAuthService };
