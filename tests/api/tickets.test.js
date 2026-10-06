'use strict';

const { buildTestApp, VALID_TICKET } = require('../helpers/build-app');

describe('API de chamados', () => {
  let ctx;
  let lia;
  let marcos;
  let tech;
  let tech2;
  let admin;

  beforeEach(async () => {
    ctx = buildTestApp();
    [lia, marcos, tech, tech2, admin] = await Promise.all(
      ['lia', 'marcos', 'tecnico', 'tecnico2', 'admin'].map((n) => ctx.login(`${n}@exemplo.local`)),
    );
  });

  const create = (token, body = VALID_TICKET) => ctx.as(token).post('/api/tickets').send(body);

  describe('POST /api/tickets (RF03, RF04, RF05)', () => {
    test('201 cria chamado aberto para o dono do token', async () => {
      const res = await create(lia);
      expect(res.status).toBe(201);
      expect(res.body.data).toMatchObject({ status: 'open', requesterId: 'u_lia', assigneeId: null, priority: 'high', title: VALID_TICKET.title });
      expect(res.body.data.id).toEqual(expect.any(String));
    });

    test('401 sem autenticação', async () => {
      const res = await ctx.request().post('/api/tickets').send(VALID_TICKET);
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHENTICATED');
    });

    test.each([
      ['título curto (9)', { title: 'a'.repeat(9) }, 'title'],
      ['título longo (101)', { title: 'a'.repeat(101) }, 'title'],
      ['descrição curta (29)', { description: 'a'.repeat(29) }, 'description'],
      ['prioridade desconhecida', { priority: 'urgente' }, 'priority'],
      ['prioridade nula', { priority: null }, 'priority'],
      ['prioridade vazia', { priority: '' }, 'priority'],
    ])('400 %s, apontando o campo', async (_name, override, field) => {
      const res = await create(lia, { ...VALID_TICKET, ...override });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.details.map((d) => d.field)).toContain(field);
    });

    test('aceita os limites válidos (título 10 e 100; descrição 30)', async () => {
      expect((await create(lia, { ...VALID_TICKET, title: 'a'.repeat(10), description: 'b'.repeat(30) })).status).toBe(201);
      expect((await create(lia, { ...VALID_TICKET, title: 'a'.repeat(100) })).status).toBe(201);
    });

    test('400 ao tentar forjar solicitante, status ou responsável (nenhum campo extra aceito)', async () => {
      for (const extra of [{ requesterId: 'u_admin' }, { status: 'closed' }, { assigneeId: 'u_tech' }, { role: 'admin' }]) {
        const res = await create(lia, { ...VALID_TICKET, ...extra });
        expect(res.status).toBe(400);
      }
      expect((await ctx.as(admin).get('/api/tickets?pageSize=50')).body.meta.total).toBe(12); // nada foi criado
    });

    test('a criação aparece na lista e no histórico', async () => {
      const { body } = await create(lia);
      const detail = await ctx.as(lia).get(`/api/tickets/${body.data.id}`);
      expect(detail.status).toBe(200);
      expect(detail.body.data.history[0]).toMatchObject({ event: 'ticket.created', actorId: 'u_lia' });
    });
  });

  describe('GET /api/tickets (RF06, RF09)', () => {
    test('401 sem autenticação', async () => {
      expect((await ctx.request().get('/api/tickets')).status).toBe(401);
    });

    test('solicitante vê só os seus; técnico vê a fila; admin vê todos', async () => {
      const mine = await ctx.as(lia).get('/api/tickets?pageSize=50');
      expect(mine.body.data.every((t) => t.requesterId === 'u_lia')).toBe(true);
      expect(mine.body.meta.total).toBe(7);

      const queue = await ctx.as(tech).get('/api/tickets?pageSize=50');
      expect(queue.body.data.every((t) => [null, 'u_tech'].includes(t.assigneeId))).toBe(true);

      expect((await ctx.as(admin).get('/api/tickets?pageSize=50')).body.meta.total).toBe(12);
    });

    test('filtra por status, por prioridade e pelos dois combinados', async () => {
      const status = await ctx.as(admin).get('/api/tickets?status=in_progress');
      expect(status.body.data.map((t) => t.status)).toEqual(['in_progress', 'in_progress', 'in_progress']);
      const priority = await ctx.as(admin).get('/api/tickets?priority=critical');
      expect(priority.body.data.every((t) => t.priority === 'critical')).toBe(true);
      const both = await ctx.as(admin).get('/api/tickets?status=open&priority=critical');
      expect(both.body.data.map((t) => t.id)).toEqual(['t_001']);
    });

    test('parâmetros vazios são ignorados e filtro sem resultado devolve lista vazia', async () => {
      expect((await ctx.as(admin).get('/api/tickets?status=&priority=')).body.meta.total).toBe(12);
      const empty = await ctx.as(admin).get('/api/tickets?status=closed&priority=critical');
      expect(empty.status).toBe(200);
      expect(empty.body).toMatchObject({ data: [], meta: { total: 0, totalPages: 1 } });
    });

    test('paginação informa página, tamanho, total e páginas', async () => {
      const res = await ctx.as(admin).get('/api/tickets?page=2&pageSize=5');
      expect(res.body.data).toHaveLength(5);
      expect(res.body.meta).toEqual({ page: 2, pageSize: 5, total: 12, totalPages: 3 });
    });

    test.each(['status=invalido', 'priority=x', 'page=0', 'page=abc', 'pageSize=500'])('400 para consulta inválida (%s)', async (query) => {
      const res = await ctx.as(admin).get(`/api/tickets?${query}`);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    test('injeção em filtro não quebra nem vaza nada', async () => {
      const res = await ctx.as(admin).get("/api/tickets?status=' OR 1=1 --");
      expect(res.status).toBe(400);
      expect(JSON.stringify(res.body)).not.toMatch(/SELECT|stack|sql/i);
    });
  });

  describe('GET /api/tickets/:id', () => {
    test('200 para o dono, com permissões e histórico', async () => {
      const res = await ctx.as(lia).get('/api/tickets/t_004');
      expect(res.status).toBe(200);
      expect(res.body.data.ticket).toMatchObject({ id: 't_004', assigneeName: 'Rafael Técnico' });
      expect(res.body.data.history.length).toBeGreaterThan(0);
    });
    test('403 para outro solicitante (IDOR) e para técnico fora da fila', async () => {
      expect((await ctx.as(marcos).get('/api/tickets/t_004')).status).toBe(403);
      expect((await ctx.as(tech).get('/api/tickets/t_006')).status).toBe(403);
    });
    test('404 para id inexistente', async () => {
      const res = await ctx.as(admin).get('/api/tickets/nao-existe');
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });
  });

  describe('PATCH /api/tickets/:id/status (RF08, RF11, RF12)', () => {
    const patch = (token, id, body) => ctx.as(token).patch(`/api/tickets/${id}/status`).send(body);

    test('200 transição válida do técnico, com histórico de autor, antes e depois', async () => {
      const res = await patch(tech, 't_001', { status: 'analysis' });
      expect(res.status).toBe(200);
      expect(res.body.data.ticket).toMatchObject({ status: 'analysis', assigneeId: 'u_tech' });
      expect(res.body.data.history.at(-2)).toMatchObject({ event: 'ticket.status.changed', before: 'open', after: 'analysis', actorId: 'u_tech', actorName: 'Rafael Técnico' });
    });

    test('409 para salto proibido, e o status permanece', async () => {
      const res = await patch(admin, 't_001', { status: 'closed', comment: 'x' });
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('INVALID_STATE');
      expect((await ctx.as(admin).get('/api/tickets/t_001')).body.data.ticket.status).toBe('open');
    });

    test('400 ao fechar sem comentário de resolução e 200 com comentário', async () => {
      const bad = await patch(tech, 't_010', { status: 'closed' });
      expect(bad.status).toBe(400);
      expect(bad.body.error.code).toBe('RESOLUTION_COMMENT_REQUIRED');
      const ok = await patch(tech, 't_010', { status: 'closed', comment: 'Catraca substituída e testada.' });
      expect(ok.status).toBe(200);
      expect(ok.body.data.comments.at(-1).body).toBe('Catraca substituída e testada.');
    });

    test('403 para solicitante (mesmo sendo dono) e para técnico fora da fila, sem alterar nada', async () => {
      expect((await patch(lia, 't_001', { status: 'analysis' })).status).toBe(403);
      expect((await patch(tech, 't_006', { status: 'in_progress' })).status).toBe(403);
      expect((await patch(tech2, 't_006', { status: 'in_progress' })).status).toBe(200);
      expect((await ctx.as(admin).get('/api/tickets/t_001')).body.data.ticket.status).toBe('open');
    });

    test('400 para status inexistente, comentário > 1000 e campos extras', async () => {
      expect((await patch(tech, 't_001', { status: 'arquivado' })).status).toBe(400);
      expect((await patch(tech, 't_001', { status: 'analysis', comment: 'a'.repeat(1001) })).status).toBe(400);
      expect((await patch(tech, 't_001', { status: 'analysis', actorId: 'u_admin' })).status).toBe(400);
    });

    test('404 e 401', async () => {
      expect((await patch(admin, 'nao-existe', { status: 'analysis' })).status).toBe(404);
      expect((await ctx.request().patch('/api/tickets/t_001/status').send({ status: 'analysis' })).status).toBe(401);
    });
  });

  describe('prioridade, responsável, comentários e exclusão', () => {
    test('técnico altera prioridade e o histórico registra a mudança', async () => {
      const res = await ctx.as(tech).patch('/api/tickets/t_007/priority').send({ priority: 'high' });
      expect(res.status).toBe(200);
      expect(res.body.data.ticket.priority).toBe('high');
      expect(res.body.data.history.at(-1)).toMatchObject({ event: 'ticket.priority.changed', before: 'critical', after: 'high' });
    });

    test('solicitante não altera prioridade (403) e prioridade inválida é 400', async () => {
      expect((await ctx.as(lia).patch('/api/tickets/t_001/priority').send({ priority: 'low' })).status).toBe(403);
      expect((await ctx.as(tech).patch('/api/tickets/t_007/priority').send({ priority: 'enorme' })).status).toBe(400);
    });

    test('técnico assume chamado livre; admin atribui a outro técnico; solicitante não atribui', async () => {
      expect((await ctx.as(tech).patch('/api/tickets/t_002/assignee').send({ assigneeId: 'u_tech' })).body.data.ticket.assigneeName).toBe('Rafael Técnico');
      expect((await ctx.as(admin).patch('/api/tickets/t_003/assignee').send({ assigneeId: 'u_tech2' })).body.data.ticket.assigneeId).toBe('u_tech2');
      expect((await ctx.as(lia).patch('/api/tickets/t_001/assignee').send({ assigneeId: 'u_tech' })).status).toBe(403);
      expect((await ctx.as(admin).patch('/api/tickets/t_001/assignee').send({ assigneeId: 'u_lia' })).status).toBe(400);
    });

    test('POST /comments: 201 para o dono, 400 acima de 1000, 403 para terceiros', async () => {
      const ok = await ctx.as(lia).post('/api/tickets/t_001/comments').send({ body: 'Ainda sem acesso.' });
      expect(ok.status).toBe(201);
      expect(ok.body.data).toMatchObject({ body: 'Ainda sem acesso.', authorName: 'Lia Solicitante' });
      expect((await ctx.as(lia).post('/api/tickets/t_001/comments').send({ body: 'a'.repeat(1000) })).status).toBe(201);
      expect((await ctx.as(lia).post('/api/tickets/t_001/comments').send({ body: 'a'.repeat(1001) })).status).toBe(400);
      expect((await ctx.as(lia).post('/api/tickets/t_001/comments').send({ body: '' })).status).toBe(400);
      expect((await ctx.as(marcos).post('/api/tickets/t_001/comments').send({ body: 'intruso' })).status).toBe(403);
    });

    test('DELETE: só administrador, com justificativa; fica na auditoria e some das listas', async () => {
      const body = { justification: 'Chamado duplicado do t_002.' };
      expect((await ctx.as(lia).delete('/api/tickets/t_001').send(body)).status).toBe(403);
      expect((await ctx.as(tech).delete('/api/tickets/t_001').send(body)).status).toBe(403);
      expect((await ctx.as(admin).delete('/api/tickets/t_001').send({})).status).toBe(400);
      expect((await ctx.as(admin).delete('/api/tickets/t_001').send(body)).status).toBe(200);
      expect((await ctx.as(admin).get('/api/tickets/t_001')).status).toBe(404);
      expect((await ctx.as(admin).get('/api/tickets?pageSize=50')).body.meta.total).toBe(11);
      const audit = await ctx.as(admin).get('/api/audit');
      expect(audit.body.data[0]).toMatchObject({ action: 'ticket.deleted', targetId: 't_001', actorId: 'u_admin', justification: body.justification });
      expect((await ctx.as(tech).get('/api/audit')).status).toBe(403);
    });

    test('GET /technicians: admin e técnico veem; solicitante não', async () => {
      const res = await ctx.as(admin).get('/api/technicians');
      expect(res.body.data).toEqual([{ id: 'u_tech', name: 'Rafael Técnico' }, { id: 'u_tech2', name: 'Sofia Técnica' }]);
      expect((await ctx.as(tech).get('/api/technicians')).status).toBe(200);
      expect((await ctx.as(lia).get('/api/technicians')).status).toBe(403);
    });
  });
});
