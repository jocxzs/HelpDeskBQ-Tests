'use strict';

const crypto = require('node:crypto');
const { loadConfig } = require('./config');
const { systemClock } = require('./clock');
const { createLogger } = require('./logger');
const { createMemoryStore, createUnitOfWork } = require('./repositories/memory-store');
const { createRepositories } = require('./repositories');
const { createPasswordHasher } = require('./services/password');
const { createTokenService } = require('./services/token');
const { createAuthService } = require('./services/auth-service');
const { createTicketService } = require('./services/ticket-service');
const { createDirectoryService } = require('./services/directory-service');
const { seedDemo } = require('./seed');

/**
 * Composição das dependências. Tudo que é "não determinístico" (relógio, IDs,
 * logger, configuração) entra por parâmetro para que os testes possam controlá-lo.
 */
function createContainer(options = {}) {
  const config = options.config || loadConfig();
  const clock = options.clock || systemClock;
  const idGen = options.idGen || (() => crypto.randomUUID());
  const logger = options.logger || createLogger({ level: config.logLevel });

  const store = createMemoryStore();
  const uow = createUnitOfWork(store);
  const repositories = createRepositories(store);
  const passwords = createPasswordHasher({ cost: config.scryptCost });
  const tokens = createTokenService({ secret: config.sessionSecret, ttlSeconds: config.tokenTtlSeconds, clock });

  if (options.seed ?? config.seedDemo) seedDemo({ store, passwords, clock });

  const services = {
    auth: createAuthService({ repositories, passwords, tokens, clock, logger, loginPolicy: config.login }),
    tickets: createTicketService({ repositories, uow, clock, idGen, logger }),
    directory: createDirectoryService({ repositories }),
  };

  return { config, clock, logger, store, uow, repositories, passwords, tokens, services };
}

module.exports = { createContainer };
