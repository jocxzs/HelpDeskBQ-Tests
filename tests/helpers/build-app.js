'use strict';

const request = require('supertest');
const { createApp } = require('../../src/app');
const { loadConfig } = require('../../src/config');
const { createMemoryLogger } = require('../../src/logger');
const { createFakeClock } = require('./fake-clock');
const { DEMO_PASSWORD } = require('../../src/seed');

/**
 * Cria uma aplicação NOVA e isolada (banco em memória recriado, relógio falso, logs capturados).
 * Cada teste chama isto no beforeEach: não há estado compartilhado entre casos.
 */
function buildTestApp({ seed = true, clock = createFakeClock() } = {}) {
  const { logger, entries } = createMemoryLogger();
  const config = loadConfig({ NODE_ENV: 'test', SESSION_SECRET: 'segredo-somente-para-testes' });
  const app = createApp({ config, clock, logger, seed });

  async function login(email, password = DEMO_PASSWORD) {
    const response = await request(app).post('/api/sessions').send({ email, password });
    if (response.status !== 200) throw new Error(`login falhou para ${email}: ${response.status}`);
    return response.body.data.token;
  }

  const as = (token) => ({
    get: (url) => request(app).get(url).set('Authorization', `Bearer ${token}`),
    post: (url) => request(app).post(url).set('Authorization', `Bearer ${token}`),
    patch: (url) => request(app).patch(url).set('Authorization', `Bearer ${token}`),
    delete: (url) => request(app).delete(url).set('Authorization', `Bearer ${token}`),
  });

  return { app, container: app.container, clock, logs: entries, login, as, request: () => request(app) };
}

const VALID_TICKET = {
  title: 'Computador não inicializa',
  description: 'Ao pressionar o botão, nenhum sinal é exibido no monitor.',
  priority: 'high',
};

module.exports = { buildTestApp, VALID_TICKET };
