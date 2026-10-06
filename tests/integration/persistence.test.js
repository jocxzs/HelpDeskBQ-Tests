'use strict';

const { buildTestApp, VALID_TICKET } = require('../helpers/build-app');

describe('integração: serviços + repositórios + armazenamento (Passo 48)', () => {
  let ctx;
  let tech;
  let admin;
  let lia;
  beforeEach(async () => {
    ctx = buildTestApp();
    [tech, admin, lia] = await Promise.all(['tecnico', 'admin', 'lia'].map((n) => ctx.login(`${n}@exemplo.local`)));
  });

  test('criar chamado persiste a linha e o histórico inicial', async () => {
    const res = await ctx.as(lia).post('/api/tickets').send(VALID_TICKET);
    const row = ctx.container.store.tickets.get(res.body.data.id);
    expect(row).toMatchObject({ requesterId: 'u_lia', status: 'open', title: VALID_TICKET.title });
    expect(ctx.container.store.history.filter((h) => h.ticketId === row.id)).toHaveLength(1);
  });

  test('mudar status persiste ator, valor anterior e novo valor', async () => {
    await ctx.as(tech).patch('/api/tickets/t_001/status').send({ status: 'analysis' });
    const entry = ctx.container.store.history.find((h) => h.ticketId === 't_001' && h.event === 'ticket.status.changed' && h.after === 'analysis');
    expect(entry).toMatchObject({ actorId: 'u_tech', before: 'open', after: 'analysis' });
    expect(ctx.container.store.tickets.get('t_001').status).toBe('analysis');
  });

  test('sem permissão: 403 e nenhuma mudança persistida', async () => {
    const snapshot = JSON.stringify([...ctx.container.store.tickets.values()]);
    const historySize = ctx.container.store.history.length;
    expect((await ctx.as(lia).patch('/api/tickets/t_001/status').send({ status: 'analysis' })).status).toBe(403);
    expect(JSON.stringify([...ctx.container.store.tickets.values()])).toBe(snapshot);
    expect(ctx.container.store.history).toHaveLength(historySize);
  });

  test('falha transacional: nenhuma atualização parcial', async () => {
    const { repositories, store } = ctx.container;
    const original = store.tickets.get('t_001');
    const historySize = store.history.length;
    jest.spyOn(repositories.history, 'add').mockRejectedValueOnce(new Error('falha ao gravar histórico'));
    const res = await ctx.as(tech).patch('/api/tickets/t_001/status').send({ status: 'analysis' });
    expect(res.status).toBe(500);
    expect(store.tickets.get('t_001')).toEqual(original); // status e responsável intactos
    expect(store.history).toHaveLength(historySize);
  });

  test('exclusão é lógica: a linha continua no armazenamento e a auditoria é gravada', async () => {
    await ctx.as(admin).delete('/api/tickets/t_002').send({ justification: 'Chamado de teste removido.' });
    const { store } = ctx.container;
    expect(store.tickets.get('t_002').deletedAt).toEqual(expect.any(String));
    expect(store.audit.at(-1)).toMatchObject({ action: 'ticket.deleted', actorId: 'u_admin', targetId: 't_002' });
    expect(store.history.at(-1)).toMatchObject({ ticketId: 't_002', event: 'ticket.deleted' });
  });

  test('o histórico é imutável: a API não expõe rota para editá-lo', async () => {
    expect((await ctx.as(admin).patch('/api/tickets/t_001/history').send({})).status).toBe(404);
    expect((await ctx.as(admin).delete('/api/history/h_001')).status).toBe(404);
  });

  test('banco de teste é recriado a cada caso: alteração de um teste não vaza para o outro', async () => {
    await ctx.as(admin).delete('/api/tickets/t_001').send({ justification: 'Remoção só neste teste.' });
    const fresh = buildTestApp();
    const token = await fresh.login('admin@exemplo.local');
    expect((await fresh.as(token).get('/api/tickets/t_001')).status).toBe(200);
  });

  test('seed: 3 papéis, 12 chamados nos estados previstos e senhas armazenadas só como hash', () => {
    const { store } = ctx.container;
    const count = (s) => [...store.tickets.values()].filter((t) => t.status === s).length;
    expect([count('open'), count('analysis'), count('in_progress'), count('resolved'), count('closed')]).toEqual([3, 3, 3, 2, 1]);
    expect([...store.users.values()].every((u) => u.passwordHash.startsWith('scrypt$') && !u.passwordHash.includes('Senha@123'))).toBe(true);
    expect(new Set([...store.users.values()].map((u) => u.role))).toEqual(new Set(['admin', 'technician', 'requester']));
  });

  test('banco vazio (seed desligado) inicia sem usuários nem chamados', () => {
    const empty = buildTestApp({ seed: false });
    expect(empty.container.store.users.size).toBe(0);
    expect(empty.container.store.tickets.size).toBe(0);
  });
});
