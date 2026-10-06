'use strict';

const path = require('node:path');
const express = require('express');
const helmet = require('helmet');
const { createContainer } = require('./container');
const { createRoutes } = require('./routes');
const correlationId = require('./middlewares/correlation-id');
const requestLogger = require('./middlewares/request-logger');
const notFound = require('./middlewares/not-found');
const { createErrorHandler } = require('./middlewares/error-handler');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');

/**
 * Configura o Express SEM abrir porta (server.js faz o listen).
 * Testes importam o app diretamente com Supertest.
 */
function createApp(options = {}) {
  const container = options.container || createContainer(options);
  const app = express();

  app.use(correlationId); // antes de tudo, para que até erros de JSON tenham identificador
  app.use(
    helmet({
      contentSecurityPolicy: { useDefaults: true, directives: { 'upgrade-insecure-requests': null } },
    }),
  );
  app.use(requestLogger(container.logger));
  app.use(express.json({ limit: '100kb' }));
  app.use(express.static(PUBLIC_DIR));
  app.use('/api', createRoutes(container));
  app.use(notFound);
  app.use(createErrorHandler(container.logger)); // sempre por último

  app.container = container;
  return app;
}

const app = createApp();

module.exports = app;
module.exports.createApp = createApp;
