'use strict';

const byNewest = (a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : b.id.localeCompare(a.id));

function matchesCriteria(ticket, criteria) {
  if (criteria.requesterId !== undefined && ticket.requesterId !== criteria.requesterId) return false;
  if (criteria.assigneeIn !== undefined && !criteria.assigneeIn.includes(ticket.assigneeId)) return false;
  return true;
}

function createRepositories(store) {
  const users = {
    async add(user) {
      store.users.set(user.id, { ...user });
      return { ...user };
    },
    async findById(id) {
      const user = store.users.get(id);
      return user ? { ...user } : null;
    },
    async findByEmail(email) {
      const wanted = String(email).trim().toLowerCase();
      for (const user of store.users.values()) if (user.email === wanted) return { ...user };
      return null;
    },
    async listByRole(role) {
      return [...store.users.values()].filter((u) => u.role === role).map((u) => ({ ...u }));
    },
  };

  const tickets = {
    async add(ticket) {
      store.tickets.set(ticket.id, { ...ticket });
      return { ...ticket };
    },
    async findById(id) {
      const ticket = store.tickets.get(id);
      return ticket ? { ...ticket } : null;
    },
    async update(id, patch) {
      const current = store.tickets.get(id);
      if (!current) return null;
      const next = { ...current, ...patch };
      store.tickets.set(id, next);
      return { ...next };
    },
    /**
     * Consulta chamados não excluídos.
     * criteria: { status?, priority?, scope? } — scope é uma lista de critérios
     * ({ requesterId } ou { assigneeIn }) em que o chamado precisa casar com ao menos um.
     */
    async search({ status, priority, scope } = {}) {
      return [...store.tickets.values()]
        .filter((t) => !t.deletedAt)
        .filter((t) => (status ? t.status === status : true))
        .filter((t) => (priority ? t.priority === priority : true))
        .filter((t) => (scope ? scope.some((c) => matchesCriteria(t, c)) : true))
        .sort(byNewest)
        .map((t) => ({ ...t }));
    },
  };

  const comments = {
    async add(comment) {
      store.comments.push({ ...comment });
      return { ...comment };
    },
    async listByTicket(ticketId) {
      return store.comments.filter((c) => c.ticketId === ticketId).map((c) => ({ ...c }));
    },
  };

  const history = {
    async add(entry) {
      store.history.push({ ...entry });
      return { ...entry };
    },
    async listByTicket(ticketId) {
      return store.history.filter((h) => h.ticketId === ticketId).map((h) => ({ ...h }));
    },
  };

  const audit = {
    async add(entry) {
      store.audit.push({ ...entry });
      return { ...entry };
    },
    async list() {
      return store.audit.map((a) => ({ ...a })).reverse();
    },
  };

  const loginAttempts = {
    async addFailure(key, at) {
      const list = store.failures.get(key) || [];
      list.push(at);
      store.failures.set(key, list);
    },
    async countFailuresSince(key, since) {
      return (store.failures.get(key) || []).filter((at) => at > since).length;
    },
    async clearFailures(key) {
      store.failures.delete(key);
    },
    async setLock(key, until) {
      store.locks.set(key, until);
    },
    async getLock(key) {
      return store.locks.get(key) ?? null;
    },
  };

  return { users, tickets, comments, history, audit, loginAttempts };
}

module.exports = { createRepositories };
