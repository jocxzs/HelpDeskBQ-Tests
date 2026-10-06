'use strict';

const { buildTestApp } = require('../helpers/build-app');

describe('GET /api/reports/summary (RF13, RF14)', () => {
  let ctx;
  beforeEach(() => { ctx = buildTestApp(); });

  test('401 sem autenticação', async () => {
    expect((await ctx.request().get('/api/reports/summary')).status).toBe(401);
  });

  test('totais por status e prioridade do seed (administrador)', async () => {
    const token = await ctx.login('admin@exemplo.local');
    const res = await ctx.as(token).get('/api/reports/summary');
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      total: 12,
      empty: false,
      byStatus: { open: 3, analysis: 3, in_progress: 3, resolved: 2, closed: 1 },
      byPriority: { low: 4, medium: 3, high: 3, critical: 2 },
    });
  });

  test('os filtros atualizam os dados', async () => {
    const token = await ctx.login('admin@exemplo.local');
    const res = await ctx.as(token).get('/api/reports/summary?status=in_progress');
    expect(res.body.data.total).toBe(3);
    expect(res.body.data.byPriority).toEqual({ low: 0, medium: 1, high: 1, critical: 1 });
    const combined = await ctx.as(token).get('/api/reports/summary?status=in_progress&priority=critical');
    expect(combined.body.data.total).toBe(1);
  });

  test('estado vazio é 200 com explicação, não erro', async () => {
    const token = await ctx.login('admin@exemplo.local');
    const res = await ctx.as(token).get('/api/reports/summary?status=closed&priority=critical');
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ total: 0, empty: true });
    expect(res.body.data.message).toMatch(/Nenhum chamado encontrado/);
  });

  test('sem nenhum dado no sistema também mostra o estado vazio', async () => {
    const empty = buildTestApp({ seed: false });
    await empty.container.repositories.users.add({
      id: 'u1', name: 'Admin', email: 'a@exemplo.local', role: 'admin', active: true,
      passwordHash: await empty.container.passwords.hash('Senha@123'),
    });
    const token = await empty.login('a@exemplo.local');
    const res = await empty.as(token).get('/api/reports/summary');
    expect(res.body.data).toMatchObject({ total: 0, empty: true });
  });

  test('cada papel só enxerga números dos chamados que pode ver', async () => {
    const lia = await ctx.login('lia@exemplo.local');
    expect((await ctx.as(lia).get('/api/reports/summary')).body.data.total).toBe(7);
    const tech2 = await ctx.login('tecnico2@exemplo.local');
    expect((await ctx.as(tech2).get('/api/reports/summary')).body.data.total).toBe(6); // 3 livres + 3 dela
  });

  test('400 para filtro inválido', async () => {
    const token = await ctx.login('admin@exemplo.local');
    expect((await ctx.as(token).get('/api/reports/summary?status=x')).status).toBe(400);
  });

  test('o relatório reflete mudanças feitas na API', async () => {
    const tech = await ctx.login('tecnico@exemplo.local');
    await ctx.as(tech).patch('/api/tickets/t_001/status').send({ status: 'analysis' });
    const admin = await ctx.login('admin@exemplo.local');
    const res = await ctx.as(admin).get('/api/reports/summary');
    expect(res.body.data.byStatus).toMatchObject({ open: 2, analysis: 4 });
  });
});
