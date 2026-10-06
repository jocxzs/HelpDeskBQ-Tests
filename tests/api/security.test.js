'use strict';

const { buildTestApp, VALID_TICKET } = require('../helpers/build-app');

describe('segurança aplicada (OWASP, RNF04, RNF05)', () => {
  let ctx;
  beforeEach(() => { ctx = buildTestApp(); });

  test('cabeçalhos de segurança do Helmet e ausência de x-powered-by', async () => {
    const res = await ctx.request().get('/api/me');
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['content-security-policy']).toContain("default-src 'self'");
    expect(res.headers['content-security-policy']).not.toContain('upgrade-insecure-requests');
    expect(res.headers['x-frame-options']).toBeDefined();
    expect(res.headers['cache-control']).toBe('no-store');
  });

  test('erro de JSON malformado é 400 seguro, sem stack nem detalhes do parser', async () => {
    const res = await ctx.request().post('/api/sessions').set('Content-Type', 'application/json').send('{"email": ');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_JSON');
    expect(JSON.stringify(res.body)).not.toMatch(/SyntaxError|at |node_modules|Unexpected/);
    expect(res.body.error.correlationId).toBe(res.headers['x-correlation-id']);
  });

  test('corpo maior que 100 KB é recusado com 413', async () => {
    const res = await ctx.request().post('/api/sessions').send({ email: 'a', password: 'x'.repeat(150 * 1024) });
    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe('PAYLOAD_TOO_LARGE');
  });

  test('rota inexistente devolve o contrato de erro em JSON', async () => {
    const res = await ctx.request().get('/api/nao-existe');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: { code: 'NOT_FOUND', message: 'Recurso não encontrado.', correlationId: res.headers['x-correlation-id'] } });
  });

  test('falha inesperada vira 500 genérico com código de suporte, e a stack fica só no log', async () => {
    const lia = await ctx.login('lia@exemplo.local');
    jest.spyOn(ctx.container.repositories.tickets, 'search').mockRejectedValueOnce(new Error('connection refused: SELECT * FROM tickets'));
    const res = await ctx.as(lia).get('/api/tickets');
    expect(res.status).toBe(500);
    expect(res.body.error).toMatchObject({ code: 'INTERNAL_ERROR', message: 'Não foi possível concluir. Use o código de suporte.' });
    expect(res.body.error.correlationId).toMatch(/^req_/);
    expect(JSON.stringify(res.body)).not.toMatch(/SELECT|connection refused|stack/i);
    const logged = ctx.logs.find((l) => l.event === 'error.unhandled');
    expect(logged.stack).toContain('connection refused');
    expect(logged.correlationId).toBe(res.body.error.correlationId);
  });

  test('controle de acesso: solicitante não usa rotas administrativas', async () => {
    const lia = await ctx.login('lia@exemplo.local');
    expect((await ctx.as(lia).delete('/api/tickets/t_001').send({ justification: 'tentativa indevida' })).status).toBe(403);
    expect((await ctx.as(lia).get('/api/audit')).status).toBe(403);
    expect((await ctx.as(lia).get('/api/technicians')).status).toBe(403);
  });

  test('IDOR: trocar o ID na URL não expõe nem altera chamado alheio', async () => {
    const marcos = await ctx.login('marcos@exemplo.local');
    const before = (await ctx.as(await ctx.login('admin@exemplo.local')).get('/api/tickets/t_001')).body.data;
    expect((await ctx.as(marcos).get('/api/tickets/t_001')).status).toBe(403);
    expect((await ctx.as(marcos).patch('/api/tickets/t_001/priority').send({ priority: 'low' })).status).toBe(403);
    expect((await ctx.as(marcos).post('/api/tickets/t_001/comments').send({ body: 'oi' })).status).toBe(403);
    const after = (await ctx.as(await ctx.login('admin@exemplo.local')).get('/api/tickets/t_001')).body.data;
    expect(after.ticket).toEqual(before.ticket);
    expect(after.comments).toEqual(before.comments);
  });

  test('conteúdo malicioso é armazenado como texto puro (a UI nunca usa innerHTML) e SQL não é interpretado', async () => {
    const lia = await ctx.login('lia@exemplo.local');
    const payload = { ...VALID_TICKET, title: "<script>alert(1)</script>'; DROP TABLE tickets;--" };
    const created = await ctx.as(lia).post('/api/tickets').send(payload);
    expect(created.status).toBe(201);
    expect(created.body.data.title).toBe(payload.title);
    expect((await ctx.as(lia).get('/api/tickets?pageSize=50')).body.meta.total).toBe(8);
  });

  test('o corpo da requisição não consegue definir o ator do histórico', async () => {
    const tech = await ctx.login('tecnico@exemplo.local');
    const res = await ctx.as(tech).patch('/api/tickets/t_001/status').send({ status: 'analysis', actorId: 'u_admin' });
    expect(res.status).toBe(400);
  });

  test('segredos e hashes nunca aparecem nas respostas nem nos logs', async () => {
    const lia = await ctx.login('lia@exemplo.local');
    const bodies = [
      (await ctx.as(lia).get('/api/me')).text,
      (await ctx.as(lia).get('/api/tickets/t_001')).text,
      (await ctx.as(lia).get('/api/tickets')).text,
    ].join('');
    expect(bodies).not.toMatch(/scrypt|passwordHash|segredo-somente-para-testes/);
    expect(JSON.stringify(ctx.logs)).not.toMatch(/Senha@123|scrypt|segredo-somente-para-testes|Bearer /);
  });

  test('os logs de requisição trazem rota, status e correlationId, sem query string', async () => {
    const admin = await ctx.login('admin@exemplo.local');
    const res = await ctx.as(admin).get('/api/tickets?status=open');
    const entry = ctx.logs.find((l) => l.event === 'http.request' && l.correlationId === res.headers['x-correlation-id']);
    expect(entry).toMatchObject({ method: 'GET', route: '/api/tickets', status: 200, actorId: 'u_admin' });
    expect(entry.durationMs).toEqual(expect.any(Number));
    expect(entry.time).toBeDefined();
  });
});

describe('arquivos estáticos', () => {
  test('a interface é servida em / com a CSP ativa', async () => {
    const ctx = buildTestApp();
    const res = await ctx.request().get('/');
    expect(res.status).toBe(200);
    expect(res.text).toContain('<html lang="pt-BR">');
    expect((await ctx.request().get('/app.js')).status).toBe(200);
    expect((await ctx.request().get('/styles.css')).status).toBe(200);
  });
});
