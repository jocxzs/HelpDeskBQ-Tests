'use strict';

const { domainError } = require('../errors');

/** RF11: aberto -> em análise -> em atendimento -> resolvido -> fechado (+ reabertura). */
const ALLOWED = {
  open: ['analysis'],
  analysis: ['in_progress'],
  in_progress: ['resolved'],
  resolved: ['closed', 'in_progress'],
  closed: [],
};

function hasText(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Regra pura de transição.
 * - INVALID_STATE: salto ou origem sem saída (ex.: open -> closed, closed -> qualquer)
 * - RESOLUTION_COMMENT_REQUIRED: resolver ou fechar exige comentário (cobre RF12)
 * - REOPEN_COMMENT_REQUIRED: reabertura (resolved -> in_progress) exige justificativa
 */
function assertTransition(from, to, comment) {
  if (!ALLOWED[from]?.includes(to)) throw domainError('INVALID_STATE');
  if ((to === 'resolved' || to === 'closed') && !hasText(comment)) {
    throw domainError('RESOLUTION_COMMENT_REQUIRED');
  }
  if (from === 'resolved' && to === 'in_progress' && !hasText(comment)) {
    throw domainError('REOPEN_COMMENT_REQUIRED');
  }
}

module.exports = { ALLOWED, assertTransition };
