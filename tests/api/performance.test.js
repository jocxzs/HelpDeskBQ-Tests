'use strict';

const request = require('supertest');
const { buildTestApp } = require('../helpers/build-app');

/**
 * RNF01 (versão automatizada e reduzida): 20 usuários virtuais executam
 * login -> listar -> abrir detalhe -> comentar. Meta: p95 <= 800 ms e erros < 1%.
 * Ambiente: processo único, banco em memória, sem rede (documentado em tests/plano-testes.md).
 */
describe('desempenho do cenário principal (RNF01)', () => {
  test('p95 <= 800 ms e menos de 1% de erros com 20 usuários virtuais', async () => {
    const { app } = buildTestApp();
    const emails = ['lia', 'marcos', 'tecnico', 'tecnico2'].map((n) => `${n}@exemplo.local`);
    const durations = [];
    let errors = 0;

    const timed = async (call) => {
      const start = process.hrtime.bigint();
      const res = await call();
      durations.push(Number(process.hrtime.bigint() - start) / 1e6);
      if (res.status >= 400) errors += 1;
      return res;
    };

    const user = async (index) => {
      const login = await timed(() => request(app).post('/api/sessions').send({ email: emails[index % emails.length], password: 'Senha@123' }));
      const auth = { Authorization: `Bearer ${login.body.data.token}` };
      const list = await timed(() => request(app).get('/api/tickets?pageSize=10').set(auth));
      const id = list.body.data.find((t) => t.status !== 'closed').id; // fechado não aceita comentário
      await timed(() => request(app).get(`/api/tickets/${id}`).set(auth));
      await timed(() => request(app).post(`/api/tickets/${id}/comments`).set(auth).send({ body: `Comentário do usuário virtual ${index}` }));
    };

    await Promise.all(Array.from({ length: 20 }, (_, i) => user(i)));

    durations.sort((a, b) => a - b);
    const p95 = durations[Math.ceil(durations.length * 0.95) - 1];
    expect(durations).toHaveLength(80);
    expect(errors / durations.length).toBeLessThan(0.01);
    expect(p95).toBeLessThanOrEqual(800);
  });
});
