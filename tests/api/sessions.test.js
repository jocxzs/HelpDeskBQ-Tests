'use strict';

const { buildTestApp } = require('../helpers/build-app');
const { MINUTE } = require('../helpers/fake-clock');
const { DEMO_PASSWORD } = require('../../src/seed');

describe('POST /api/sessions (RF01, RF02)', () => {
  let ctx;
  beforeEach(() => { ctx = buildTestApp(); });
  const post = (email, password) => ctx.request().post('/api/sessions').send({ email, password });

  test('200 com token, tipo, expiração e usuário público', async () => {
    const res = await post('lia@exemplo.local', DEMO_PASSWORD);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ tokenType: 'Bearer', expiresIn: 3600, user: { id: 'u_lia', role: 'requester' } });
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|scrypt/);
  });

  test('401 com mensagem genérica: não revela se o campo errado foi e-mail ou senha', async () => {
    const wrongPassword = await post('lia@exemplo.local', 'errada');
    const wrongEmail = await post('ninguem@exemplo.local', 'errada');
    expect(wrongPassword.status).toBe(401);
    expect(wrongEmail.status).toBe(401);
    expect(wrongPassword.body.error.code).toBe('INVALID_CREDENTIALS');
    expect(wrongEmail.body.error.message).toBe(wrongPassword.body.error.message);
    expect(wrongPassword.body.error.message).not.toMatch(/e-mail não|senha incorreta|não existe/i);
  });

  test('CT-014: 423 na terceira tentativa inválida, com mensagem segura e evento registrado', async () => {
    expect((await post('lia@exemplo.local', 'x')).status).toBe(401);
    expect((await post('lia@exemplo.local', 'x')).status).toBe(401);
    const third = await post('lia@exemplo.local', 'x');
    expect(third.status).toBe(423);
    expect(third.body.error).toMatchObject({ code: 'ACCOUNT_LOCKED', message: 'Acesso temporariamente indisponível.' });
    expect(ctx.logs.some((l) => l.event === 'auth.account.locked')).toBe(true);
  });

  test('conta bloqueada nega a senha correta e libera após 10 minutos', async () => {
    for (let i = 0; i < 3; i += 1) await post('lia@exemplo.local', 'x');
    expect((await post('lia@exemplo.local', DEMO_PASSWORD)).status).toBe(423);
    ctx.clock.advance(10 * MINUTE + 1);
    expect((await post('lia@exemplo.local', DEMO_PASSWORD)).status).toBe(200);
  });

  test('400 para corpo inválido (campo ausente ou extra)', async () => {
    expect((await ctx.request().post('/api/sessions').send({ email: 'lia@exemplo.local' })).status).toBe(400);
    expect((await ctx.request().post('/api/sessions').send({})).status).toBe(400);
    expect((await ctx.request().post('/api/sessions').send({ email: 'a', password: 'b', role: 'admin' })).status).toBe(400);
  });

  test('toda resposta traz o identificador de correlação e ele aparece no log da requisição', async () => {
    const res = await post('lia@exemplo.local', 'x');
    const id = res.headers['x-correlation-id'];
    expect(id).toMatch(/^req_/);
    expect(res.body.error.correlationId).toBe(id);
    expect(ctx.logs.find((l) => l.event === 'http.request' && l.correlationId === id)).toMatchObject({ method: 'POST', route: '/api/sessions', status: 401 });
  });
});

describe('GET /api/me e autenticação por token', () => {
  let ctx;
  beforeEach(() => { ctx = buildTestApp(); });

  test('200 com o usuário do token', async () => {
    const token = await ctx.login('tecnico@exemplo.local');
    const res = await ctx.as(token).get('/api/me');
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ id: 'u_tech', role: 'technician' });
  });

  test.each([
    ['sem cabeçalho', undefined],
    ['esquema errado', 'Basic abc'],
    ['token vazio', 'Bearer '],
    ['token inválido', 'Bearer abc.def'],
  ])('401 %s', async (_name, header) => {
    const req = ctx.request().get('/api/me');
    if (header) req.set('Authorization', header);
    const res = await req;
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  test('token alterado falha', async () => {
    const token = await ctx.login('lia@exemplo.local');
    const [payload, signature] = token.split('.');
    const forged = Buffer.from(JSON.stringify({ sub: 'u_admin', role: 'admin', exp: 9999999999 })).toString('base64url');
    expect((await ctx.as(`${forged}.${signature}`).get('/api/me')).status).toBe(401);
    expect((await ctx.as(`${payload}.assinatura-falsa`).get('/api/me')).status).toBe(401);
  });

  test('token expira após 1 hora', async () => {
    const token = await ctx.login('lia@exemplo.local');
    expect((await ctx.as(token).get('/api/me')).status).toBe(200);
    ctx.clock.advance(61 * MINUTE);
    expect((await ctx.as(token).get('/api/me')).status).toBe(401);
  });

  test('usuário desativado perde o acesso imediatamente', async () => {
    const token = await ctx.login('lia@exemplo.local');
    ctx.container.store.users.get('u_lia').active = false;
    expect((await ctx.as(token).get('/api/me')).status).toBe(401);
  });
});
