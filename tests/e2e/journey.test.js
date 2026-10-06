'use strict';

const { start } = require('../../src/server');

/**
 * Jornada completa pela rede real (servidor HTTP em porta efêmera):
 * login -> abertura -> triagem -> atendimento -> encerramento -> relatório.
 */
describe('E2E: jornada do MVP em HTTP real', () => {
  let server;
  let base;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    server = start(0);
    await new Promise((resolve) => server.once('listening', resolve));
    base = `http://127.0.0.1:${server.address().port}`;
  });
  afterAll(() => new Promise((resolve) => server.close(resolve)));

  const call = async (path, { token, method = 'GET', body } = {}) => {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: res.status, body: await res.json().catch(() => null) };
  };
  const login = async (email) => (await call('/api/sessions', { method: 'POST', body: { email, password: 'Senha@123' } })).body.data.token;

  test('a página inicial é servida', async () => {
    const res = await fetch(`${base}/`);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('HelpDesk BQ');
  });

  test('solicitante abre, técnico atende até o fim e gestão confere o relatório', async () => {
    const lia = await login('lia@exemplo.local');
    const tech = await login('tecnico@exemplo.local');
    const admin = await login('admin@exemplo.local');

    const before = (await call('/api/reports/summary', { token: admin })).body.data;

    const created = await call('/api/tickets', {
      token: lia, method: 'POST',
      body: { title: 'Teclado do laboratório sem resposta', description: 'Várias teclas do teclado da bancada 5 não respondem ao toque.', priority: 'critical' },
    });
    expect(created.status).toBe(201);
    const id = created.body.data.id;

    const steps = [['analysis'], ['in_progress'], ['resolved', 'Teclado substituído.'], ['closed', 'Solicitante confirmou a solução.']];
    for (const [status, comment] of steps) {
      const res = await call(`/api/tickets/${id}/status`, { token: tech, method: 'PATCH', body: comment ? { status, comment } : { status } });
      expect(res.status).toBe(200);
    }

    const detail = (await call(`/api/tickets/${id}`, { token: lia })).body.data;
    expect(detail.ticket.status).toBe('closed');
    expect(detail.history.filter((h) => h.event === 'ticket.status.changed')).toHaveLength(4);

    const after = (await call('/api/reports/summary', { token: admin })).body.data;
    expect(after.total).toBe(before.total + 1);
    expect(after.byStatus.closed).toBe(before.byStatus.closed + 1);
    expect(after.byPriority.critical).toBe(before.byPriority.critical + 1);
  });

  test('solicitante tentando acessar chamado alheio recebe feedback seguro', async () => {
    const marcos = await login('marcos@exemplo.local');
    const res = await call('/api/tickets/t_001', { token: marcos });
    expect(res.status).toBe(403);
    expect(res.body.error).toMatchObject({ code: 'FORBIDDEN', message: 'Ação não autorizada.' });
  });
});
