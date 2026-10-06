'use strict';

/** Entrega qualquer erro (síncrono ou assíncrono) ao tratador global. */
const asyncHandler = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);

module.exports = asyncHandler;
