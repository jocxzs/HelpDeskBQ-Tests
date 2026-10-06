'use strict';

const { domainError } = require('../errors');
const { STATUSES, PRIORITIES } = require('../domain/constants');
const { ALLOWED, assertTransition } = require('./transitions');
const policy = require('./policy');

const publicTicket = (t) => ({
  id: t.id,
  title: t.title,
  description: t.description,
  priority: t.priority,
  status: t.status,
  requesterId: t.requesterId,
  assigneeId: t.assigneeId,
  createdAt: t.createdAt,
  updatedAt: t.updatedAt,
});

/**
 * Regras de negócio dos chamados. Não conhece HTTP e recebe todas as
 * dependências por parâmetro (relógio, gerador de IDs, repositórios).
 */
function createTicketService({ repositories, uow, clock, idGen, logger }) {
  const { tickets, comments, history, audit, users } = repositories;
  const nowIso = () => new Date(clock.now()).toISOString();

  const historyEntry = (ticketId, actorId, event, before, after, createdAt) => ({
    id: idGen(),
    ticketId,
    actorId,
    event,
    before,
    after,
    createdAt: createdAt || nowIso(),
  });

  async function nameMap(ids) {
    const unique = [...new Set(ids.filter(Boolean))];
    const found = await Promise.all(unique.map((id) => users.findById(id)));
    return new Map(found.filter(Boolean).map((u) => [u.id, u.name]));
  }

  async function withNames(list) {
    const names = await nameMap(list.flatMap((t) => [t.requesterId, t.assigneeId]));
    return list.map((t) => ({
      ...publicTicket(t),
      requesterName: names.get(t.requesterId) || null,
      assigneeName: t.assigneeId ? names.get(t.assigneeId) || null : null,
    }));
  }

  async function loadTicket(id) {
    const ticket = await tickets.findById(id);
    if (!ticket || ticket.deletedAt) throw domainError('NOT_FOUND');
    return ticket;
  }

  async function loadVisible(actor, id) {
    const ticket = await loadTicket(id);
    if (!policy.canView(actor, ticket)) throw domainError('FORBIDDEN');
    return ticket;
  }

  async function loadManageable(actor, id) {
    const ticket = await loadVisible(actor, id);
    if (!policy.canManage(actor, ticket)) throw domainError('FORBIDDEN');
    return ticket;
  }

  // RF03, RF04, RF05: o solicitante vem sempre do token, nunca do corpo da requisição.
  async function create(actor, input) {
    const createdAt = nowIso();
    const ticket = {
      id: idGen(),
      title: input.title,
      description: input.description,
      priority: input.priority,
      status: 'open',
      requesterId: actor.id,
      assigneeId: null,
      createdAt,
      updatedAt: createdAt,
      deletedAt: null,
    };
    await uow.run(async () => {
      await tickets.add(ticket);
      await history.add(historyEntry(ticket.id, actor.id, 'ticket.created', null, 'open', createdAt));
    });
    logger.info('ticket.created', { ticketId: ticket.id, actorId: actor.id, priority: ticket.priority });
    const [result] = await withNames([ticket]);
    return result;
  }

  // RF06, RF09
  async function list(actor, { status, priority, page = 1, pageSize = 10 } = {}) {
    const all = await tickets.search({ status, priority, scope: policy.visibilityScope(actor) });
    const total = all.length;
    const items = await withNames(all.slice((page - 1) * pageSize, page * pageSize));
    return { items, meta: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) } };
  }

  async function get(actor, id) {
    const ticket = await loadVisible(actor, id);
    const [commentList, historyList] = await Promise.all([comments.listByTicket(id), history.listByTicket(id)]);
    const names = await nameMap([
      ticket.requesterId,
      ticket.assigneeId,
      ...commentList.map((c) => c.authorId),
      ...historyList.flatMap((h) => [h.actorId, ...(h.event === 'ticket.assignee.changed' ? [h.before, h.after] : [])]),
    ]);
    const manageable = policy.canManage(actor, ticket);
    const open = ticket.status !== 'closed';
    const [detail] = await withNames([ticket]);

    return {
      ticket: detail,
      comments: commentList.map((c) => ({ ...c, authorName: names.get(c.authorId) || null })),
      history: historyList.map((h) => ({
        ...h,
        actorName: names.get(h.actorId) || null,
        ...(h.event === 'ticket.assignee.changed'
          ? { beforeName: names.get(h.before) || null, afterName: names.get(h.after) || null }
          : {}),
      })),
      allowedTransitions: manageable ? ALLOWED[ticket.status] : [],
      permissions: {
        canChangeStatus: manageable && ALLOWED[ticket.status].length > 0,
        canChangePriority: manageable && open,
        canAssignSelf: actor.role === 'technician' && manageable && open && ticket.assigneeId !== actor.id,
        canAssignOthers: actor.role === 'admin' && open,
        canComment: open,
        canDelete: actor.role === 'admin',
      },
    };
  }

  // RF08, RF11, RF12
  async function changeStatus(actor, id, { status, comment }) {
    const ticket = await loadManageable(actor, id);
    const from = ticket.status;
    assertTransition(from, status, comment);
    if (from === 'analysis' && status === 'in_progress' && !ticket.assigneeId) {
      throw domainError('ASSIGNEE_REQUIRED');
    }

    const at = nowIso();
    const patch = { status, updatedAt: at };
    const events = [historyEntry(id, actor.id, 'ticket.status.changed', from, status, at)];
    if (from === 'open' && status === 'analysis' && !ticket.assigneeId && actor.role === 'technician') {
      patch.assigneeId = actor.id; // quem assume a análise passa a ser o responsável
      events.push(historyEntry(id, actor.id, 'ticket.assignee.changed', null, actor.id, at));
    }

    await uow.run(async () => {
      await tickets.update(id, patch);
      for (const event of events) await history.add(event);
      if (typeof comment === 'string' && comment.trim()) {
        await comments.add({ id: idGen(), ticketId: id, authorId: actor.id, body: comment.trim(), createdAt: at });
      }
    });
    logger.info('ticket.status.changed', { ticketId: id, actorId: actor.id, from, to: status });
    return get(actor, id);
  }

  async function changePriority(actor, id, { priority }) {
    const ticket = await loadManageable(actor, id);
    if (ticket.status === 'closed') throw domainError('TICKET_CLOSED');
    if (ticket.priority !== priority) {
      const at = nowIso();
      await uow.run(async () => {
        await tickets.update(id, { priority, updatedAt: at });
        await history.add(historyEntry(id, actor.id, 'ticket.priority.changed', ticket.priority, priority, at));
      });
      logger.info('ticket.priority.changed', { ticketId: id, actorId: actor.id, from: ticket.priority, to: priority });
    }
    return get(actor, id);
  }

  async function assign(actor, id, { assigneeId }) {
    const ticket = await loadManageable(actor, id);
    if (ticket.status === 'closed') throw domainError('TICKET_CLOSED');
    if (actor.role === 'technician' && assigneeId !== actor.id) throw domainError('FORBIDDEN');

    const target = await users.findById(assigneeId);
    if (!target || !target.active || target.role !== 'technician') throw domainError('INVALID_ASSIGNEE');

    if (ticket.assigneeId !== assigneeId) {
      const at = nowIso();
      await uow.run(async () => {
        await tickets.update(id, { assigneeId, updatedAt: at });
        await history.add(historyEntry(id, actor.id, 'ticket.assignee.changed', ticket.assigneeId, assigneeId, at));
      });
      logger.info('ticket.assignee.changed', { ticketId: id, actorId: actor.id, to: assigneeId });
    }
    return get(actor, id);
  }

  // RF10
  async function addComment(actor, id, { body }) {
    const ticket = await loadVisible(actor, id);
    if (ticket.status === 'closed') throw domainError('TICKET_CLOSED');
    const comment = { id: idGen(), ticketId: id, authorId: actor.id, body, createdAt: nowIso() };
    await comments.add(comment);
    logger.info('ticket.comment.added', { ticketId: id, actorId: actor.id });
    return { ...comment, authorName: actor.name };
  }

  // RF07: exclusão lógica, somente administrador, com justificativa e auditoria.
  async function remove(actor, id, { justification }) {
    if (actor.role !== 'admin') throw domainError('FORBIDDEN');
    const ticket = await loadTicket(id);
    const at = nowIso();
    await uow.run(async () => {
      await tickets.update(id, { deletedAt: at, updatedAt: at });
      await history.add(historyEntry(id, actor.id, 'ticket.deleted', 'active', 'deleted', at));
      await audit.add({ id: idGen(), actorId: actor.id, action: 'ticket.deleted', targetId: ticket.id, justification, createdAt: at });
    });
    logger.info('ticket.deleted', { ticketId: id, actorId: actor.id });
    return { id, deleted: true };
  }

  // RF13, RF14
  async function summary(actor, { status, priority } = {}) {
    const found = await tickets.search({ status, priority, scope: policy.visibilityScope(actor) });
    const byStatus = Object.fromEntries(STATUSES.map((s) => [s, 0]));
    const byPriority = Object.fromEntries(PRIORITIES.map((p) => [p, 0]));
    for (const t of found) {
      byStatus[t.status] += 1;
      byPriority[t.priority] += 1;
    }
    const empty = found.length === 0;
    return {
      total: found.length,
      byStatus,
      byPriority,
      filters: { status: status || null, priority: priority || null },
      empty,
      message: empty ? 'Nenhum chamado encontrado para os filtros selecionados. Limpe os filtros ou abra um novo chamado.' : null,
    };
  }

  return { create, list, get, changeStatus, changePriority, assign, addComment, remove, summary };
}

module.exports = { createTicketService };
