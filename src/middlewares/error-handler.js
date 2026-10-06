'use strict';

const { DomainError, domainError } = require('../errors');

/**
 * Tratador global (último middleware). Contrato único de erro (RF15):
 * { error: { code, message, correlationId } } — sem stack, SQL ou dados internos (RNF05).
 */
function createErrorHandler(logger) {
  return (error, req, res, next) => {
    if (res.headersSent) return next(error);

    let known = error;
    if (!(error instanceof DomainError)) {
      if (error.type === 'entity.parse.failed') known = domainError('INVALID_JSON');
      else if (error.type === 'entity.too.large') known = domainError('PAYLOAD_TOO_LARGE');
      else {
        known = domainError('INTERNAL_ERROR');
        logger.error('error.unhandled', {
          correlationId: req.correlationId,
          message: error.message,
          stack: error.stack, // somente no log interno
        });
      }
    }

    const body = { code: known.code, message: known.publicMessage, correlationId: req.correlationId };
    if (known.details) body.details = known.details;
    return res.status(known.status).json({ error: body });
  };
}

module.exports = { createErrorHandler };
