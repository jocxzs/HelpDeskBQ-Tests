'use strict';

const crypto = require('node:crypto');

/**
 * Lê a configuração a partir de variáveis de ambiente.
 * Funciona sem .env em desenvolvimento/teste; em produção exige SESSION_SECRET.
 */
function loadConfig(env = process.env) {
  const nodeEnv = env.NODE_ENV || 'development';
  const isProduction = nodeEnv === 'production';
  const isTest = nodeEnv === 'test';

  let sessionSecret = env.SESSION_SECRET;
  if (!sessionSecret) {
    if (isProduction) throw new Error('SESSION_SECRET é obrigatório em produção.');
    sessionSecret = crypto.randomBytes(32).toString('hex'); // válido só enquanto o processo viver
  }

  return {
    nodeEnv,
    port: Number(env.PORT) || 3000,
    sessionSecret,
    tokenTtlSeconds: Number(env.TOKEN_TTL_SECONDS) || 3600,
    login: {
      maxFailures: 3, // RF02
      windowMs: 5 * 60 * 1000, // 5 min
      lockMs: 10 * 60 * 1000, // 10 min
    },
    scryptCost: isTest ? 1024 : 16384, // custo reduzido apenas nos testes
    logLevel: env.LOG_LEVEL || (isTest ? 'silent' : 'info'),
    seedDemo: env.SEED_DEMO !== 'false',
  };
}

module.exports = { loadConfig };
