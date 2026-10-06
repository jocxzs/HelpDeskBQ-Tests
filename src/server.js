'use strict';

require('dotenv').config({ quiet: true });

const app = require('./app');

/** Apenas inicia a porta; toda a configuração do Express está em app.js. */
function start(port = app.container.config.port) {
  const server = app.listen(port, () => {
    app.container.logger.info('server.started', { port: server.address().port });
    if (app.container.config.seedDemo) {
      app.container.logger.info('server.demo', { message: 'Dados de demonstração carregados (veja o README).' });
    }
  });
  return server;
}

if (require.main === module) {
  const server = start();
  const shutdown = () => server.close(() => process.exit(0));
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

module.exports = { start };
