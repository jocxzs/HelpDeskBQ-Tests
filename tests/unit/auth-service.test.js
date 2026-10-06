'use strict';

const { buildTestApp } = require('../helpers/build-app');
const { MINUTE } = require('../helpers/fake-clock');
const { DEMO_PASSWORD } = require('../../src/seed');

const EMAIL = 'lia@exemplo.local';
const login = (ctx, email, password) => ctx.container.services.auth.login({ email, password });
const wrong = (ctx, email = EMAIL) => login(ctx, email, 'errada');

describe('serviço de autenticação e bloqueio (RF01, RF02)', () => {
  let ctx;
  beforeEach(() => { ctx = buildTestApp(); });

  test('credenciais válidas devolvem token e usuário público (sem hash)', async () => {
    const session = await login(ctx, EMAIL, DEMO_PASSWORD);
    expect(session.token).toEqual(expect.any(String));
    expect(session.user).toEqual({ id: 'u_lia', name: 'Lia Solicitante', email: EMAIL, role: 'requester' });
    expect(JSON.stringify(session)).not.toMatch(/scrypt|passwordHash/);
  });

  test('o e-mail é comparado sem diferenciar maiúsculas e sem espaços nas pontas', async () => {
    await expect(login(ctx, '  LIA@Exemplo.Local ', DEMO_PASSWORD)).resolves.toHaveProperty('token');
  });

  test('0, 1 e 2 falhas mantêm a conta liberada', async () => {
    await expect(wrong(ctx)).rejects.toThrow('INVALID_CREDENTIALS');
    await expect(wrong(ctx)).rejects.toThrow('INVALID_CREDENTIALS');
    await expect(login(ctx, EMAIL, DEMO_PASSWORD)).resolves.toHaveProperty('token');
  });

  test('a terceira falha em 5 min bloqueia a conta (423)', async () => {
    await expect(wrong(ctx)).rejects.toThrow('INVALID_CREDENTIALS');
    await expect(wrong(ctx)).rejects.toThrow('INVALID_CREDENTIALS');
    await expect(wrong(ctx)).rejects.toThrow('ACCOUNT_LOCKED');
  });

  test('conta bloqueada recusa até a senha correta, sem reiniciar o prazo', async () => {
    for (let i = 0; i < 3; i += 1) await wrong(ctx).catch(() => {});
    ctx.clock.advance(9 * MINUTE);
    await expect(login(ctx, EMAIL, DEMO_PASSWORD)).rejects.toThrow('ACCOUNT_LOCKED');
    ctx.clock.advance(1 * MINUTE + 1);
    await expect(login(ctx, EMAIL, DEMO_PASSWORD)).resolves.toHaveProperty('token'); // 10 min após a 3ª falha
  });

  test('após o bloqueio terminar, o contador recomeça do zero', async () => {
    for (let i = 0; i < 3; i += 1) await wrong(ctx).catch(() => {});
    ctx.clock.advance(10 * MINUTE + 1);
    await expect(wrong(ctx)).rejects.toThrow('INVALID_CREDENTIALS');
  });

  test('falhas fora da janela de 5 min não se acumulam', async () => {
    await wrong(ctx).catch(() => {});
    await wrong(ctx).catch(() => {});
    ctx.clock.advance(5 * MINUTE + 1);
    await expect(wrong(ctx)).rejects.toThrow('INVALID_CREDENTIALS');
  });

  test('login com sucesso zera as falhas anteriores', async () => {
    await wrong(ctx).catch(() => {});
    await wrong(ctx).catch(() => {});
    await login(ctx, EMAIL, DEMO_PASSWORD);
    await expect(wrong(ctx)).rejects.toThrow('INVALID_CREDENTIALS');
  });

  test('e-mail inexistente é indistinguível: mesma mensagem e também bloqueia', async () => {
    const real = await wrong(ctx).catch((e) => e);
    const ghost = await wrong(ctx, 'ninguem@exemplo.local').catch((e) => e);
    expect(ghost.code).toBe(real.code);
    expect(ghost.publicMessage).toBe(real.publicMessage);
    await wrong(ctx, 'ninguem@exemplo.local').catch(() => {});
    await expect(wrong(ctx, 'ninguem@exemplo.local')).rejects.toThrow('ACCOUNT_LOCKED');
  });

  test('usuário inativo não autentica, mesmo com a senha certa', async () => {
    ctx.container.store.users.get('u_lia').active = false;
    await expect(login(ctx, EMAIL, DEMO_PASSWORD)).rejects.toThrow('INVALID_CREDENTIALS');
  });

  test('o bloqueio de uma conta não afeta outra', async () => {
    for (let i = 0; i < 3; i += 1) await wrong(ctx).catch(() => {});
    await expect(login(ctx, 'marcos@exemplo.local', DEMO_PASSWORD)).resolves.toHaveProperty('token');
  });

  test('eventos de login são registrados sem senha nem e-mail em claro', async () => {
    for (let i = 0; i < 3; i += 1) await wrong(ctx).catch(() => {});
    await login(ctx, 'marcos@exemplo.local', DEMO_PASSWORD);
    const events = ctx.logs.map((l) => l.event);
    expect(events).toEqual(expect.arrayContaining(['auth.login.failed', 'auth.account.locked', 'auth.login.success']));
    const text = JSON.stringify(ctx.logs);
    expect(text).not.toContain(DEMO_PASSWORD);
    expect(text).not.toContain('errada');
    expect(text).not.toContain(EMAIL);
  });

  test('authenticate rejeita token de usuário desativado', async () => {
    const { token } = await login(ctx, EMAIL, DEMO_PASSWORD);
    await expect(ctx.container.services.auth.authenticate(token)).resolves.toMatchObject({ id: 'u_lia' });
    ctx.container.store.users.get('u_lia').active = false;
    await expect(ctx.container.services.auth.authenticate(token)).rejects.toThrow('UNAUTHENTICATED');
  });
});
