'use strict';

/**
 * Política de acesso centralizada (tabela de decisão do Passo 44).
 * - solicitante: vê e comenta somente os chamados que abriu
 * - técnico: atua na "fila" (chamados sem responsável ou atribuídos a ele) e vê os próprios
 * - administrador: acesso total, com auditoria nas ações privilegiadas
 */
const isOwner = (actor, ticket) => ticket.requesterId === actor.id;
const inQueue = (actor, ticket) => ticket.assigneeId == null || ticket.assigneeId === actor.id;

function canView(actor, ticket) {
  if (actor.role === 'admin') return true;
  if (isOwner(actor, ticket)) return true;
  return actor.role === 'technician' && inQueue(actor, ticket);
}

function canManage(actor, ticket) {
  if (actor.role === 'admin') return true;
  return actor.role === 'technician' && inQueue(actor, ticket);
}

/** Escopo usado pelo repositório: o chamado precisa satisfazer ao menos um critério (undefined = sem restrição). */
function visibilityScope(actor) {
  if (actor.role === 'admin') return undefined;
  if (actor.role === 'technician') return [{ requesterId: actor.id }, { assigneeIn: [null, actor.id] }];
  return [{ requesterId: actor.id }];
}

module.exports = { canView, canManage, visibilityScope };
