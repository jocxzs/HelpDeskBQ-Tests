'use strict';

/** Registra uma linha estruturada por requisição à API: evento, rota, status, duração e correlationId. */
function requestLogger(logger) {
  return (req, res, next) => {
    if (!req.originalUrl.startsWith('/api')) return next();
    const start = process.hrtime.bigint();
    res.on('finish', () => {
      const durationMs = Math.round(Number(process.hrtime.bigint() - start) / 1e5) / 10;
      logger.info('http.request', {
        correlationId: req.correlationId,
        method: req.method,
        route: req.originalUrl.split('?')[0], // sem query string, para não registrar dados do usuário
        status: res.statusCode,
        durationMs,
        actorId: req.user ? req.user.id : null,
      });
    });
    return next();
  };
}

module.exports = requestLogger;
