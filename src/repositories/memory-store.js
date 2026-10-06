'use strict';

/**
 * "Banco" em memória do MVP. Substituível por PostgreSQL/Supabase mantendo a
 * interface dos repositórios (todos os métodos são assíncronos).
 *
 * Registros são tratados como imutáveis (update cria um novo objeto), o que
 * permite snapshot/rollback baratos na unidade de trabalho.
 */
function createMemoryStore() {
  const store = {
    users: new Map(),
    tickets: new Map(),
    comments: [],
    history: [],
    audit: [],
    failures: new Map(), // chave de login -> timestamps (ms) de falhas
    locks: new Map(), // chave de login -> instante (ms) até o qual está bloqueada
  };

  store.snapshot = () => ({
    tickets: new Map(store.tickets),
    comments: store.comments.slice(),
    history: store.history.slice(),
    audit: store.audit.slice(),
  });

  store.restore = (snapshot) => {
    store.tickets = snapshot.tickets;
    store.comments = snapshot.comments;
    store.history = snapshot.history;
    store.audit = snapshot.audit;
  };

  return store;
}

/** Unidade de trabalho: se qualquer passo falhar, nada do que foi gravado permanece. */
function createUnitOfWork(store) {
  return {
    async run(work) {
      const snapshot = store.snapshot();
      try {
        return await work();
      } catch (error) {
        store.restore(snapshot);
        throw error;
      }
    },
  };
}

module.exports = { createMemoryStore, createUnitOfWork };
