'use strict';

const { loadConfig } = require('../../src/config');
const { createContainer } = require('../../src/container');
const { createFakeClock } = require('../helpers/fake-clock');

describe('configuração por ambiente (RNF04)', () => {
  test('produção exige SESSION_SECRET', () => {
    expect(() => loadConfig({ NODE_ENV: 'production' })).toThrow('SESSION_SECRET');
    expect(loadConfig({ NODE_ENV: 'production', SESSION_SECRET: 'x'.repeat(32) }).nodeEnv).toBe('production');
  });

  test('desenvolvimento gera um segredo aleatório por processo', () => {
    const a = loadConfig({}).sessionSecret;
    const b = loadConfig({}).sessionSecret;
    expect(a).toHaveLength(64);
    expect(a).not.toBe(b);
  });

  test('valores padrão e sobrescritas', () => {
    const base = loadConfig({});
    expect(base).toMatchObject({ port: 3000, tokenTtlSeconds: 3600, seedDemo: true, login: { maxFailures: 3, windowMs: 300000, lockMs: 600000 } });
    expect(loadConfig({ PORT: '8080', TOKEN_TTL_SECONDS: '60', SEED_DEMO: 'false', LOG_LEVEL: 'warn' })).toMatchObject({ port: 8080, tokenTtlSeconds: 60, seedDemo: false, logLevel: 'warn' });
    expect(loadConfig({ NODE_ENV: 'test' }).logLevel).toBe('silent');
  });

  test('container usa relógio e gerador de IDs injetados', async () => {
    let n = 0;
    const c = createContainer({ config: loadConfig({ NODE_ENV: 'test' }), clock: createFakeClock(), idGen: () => `id_${++n}`, seed: true });
    const actor = { id: 'u_lia', name: 'Lia', role: 'requester' };
    const t = await c.services.tickets.create(actor, { title: 'Chamado com ID previsível', description: 'a'.repeat(30), priority: 'low' });
    expect(t.id).toBe('id_1');
    expect(t.createdAt).toBe('2026-09-01T12:00:00.000Z');
  });
});
