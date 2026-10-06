'use strict';

const { buildTestApp, VALID_TICKET } = require('../helpers/build-app');

// Atores como o middleware de autenticação os entrega ao serviço.
const actors = {
  admin: { id: 'u_admin', name: 'Ana Administradora', role: 'admin' },
  tech: { id: 'u_tech', name: 'Rafael Técnico', role: 'technician' },
  tech2: { id: 'u_tech2', name: 'Sofia Técnica', role: 'technician' },
  lia: { id: 'u_lia', name: 'Lia Solicitante', role: 'requester' },
  marcos: { id: 'u_marcos', name: 'Marcos Solicitante', role: 'requester' },
};

describe('serviço de chamados, sem HTTP', () => {
  let svc;
  beforeEach(() => { svc = buildTestApp().container.services.tickets; });

  const newTicket = (actor = actors.lia, override = {}) => svc.create(actor, { ...VALID_TICKET, ...override });

  describe('criação (RF03, RF08)', () => {
    test('cria com status aberto, solicitante do token e histórico inicial', async () => {
      const t = await newTicket();
      expect(t).toMatchObject({ status: 'open', requesterId: 'u_lia', assigneeId: null, requesterName: 'Lia Solicitante' });
      const detail = await svc.get(actors.lia, t.id);
      expect(detail.history).toHaveLength(1);
      expect(detail.history[0]).toMatchObject({ event: 'ticket.created', actorId: 'u_lia', before: null, after: 'open' });
    });
  });

  describe('listagem, filtros e paginação (RF06, RF09)', () => {
    test('solicitante vê somente os próprios chamados', async () => {
      const { items, meta } = await svc.list(actors.lia, { pageSize: 50 });
      expect(items.length).toBe(meta.total);
      expect(items.every((t) => t.requesterId === 'u_lia')).toBe(true);
      expect(meta.total).toBe(7);
    });

    test('técnico vê a fila: sem responsável ou atribuídos a ele', async () => {
      const { items } = await svc.list(actors.tech, { pageSize: 50 });
      expect(items.every((t) => t.assigneeId === null || t.assigneeId === 'u_tech')).toBe(true);
      expect(items.map((t) => t.id)).not.toContain('t_006'); // atribuído à Sofia
    });

    test('administrador vê todos os 12 chamados do seed', async () => {
      const { meta } = await svc.list(actors.admin, { pageSize: 50 });
      expect(meta.total).toBe(12);
    });

    test('filtros isolados e combinados', async () => {
      const byStatus = await svc.list(actors.admin, { status: 'open', pageSize: 50 });
      expect(byStatus.items.map((t) => t.status)).toEqual(['open', 'open', 'open']);
      const byPriority = await svc.list(actors.admin, { priority: 'critical', pageSize: 50 });
      expect(byPriority.meta.total).toBe(2);
      const both = await svc.list(actors.admin, { status: 'open', priority: 'critical', pageSize: 50 });
      expect(both.items.map((t) => t.id)).toEqual(['t_001']);
    });

    test('combinação sem resultado devolve lista vazia, não erro', async () => {
      const { items, meta } = await svc.list(actors.admin, { status: 'closed', priority: 'critical' });
      expect(items).toEqual([]);
      expect(meta).toMatchObject({ total: 0, totalPages: 1 });
    });

    test('paginação divide e ordena do mais novo para o mais antigo', async () => {
      const first = await svc.list(actors.admin, { page: 1, pageSize: 5 });
      const third = await svc.list(actors.admin, { page: 3, pageSize: 5 });
      expect(first.items).toHaveLength(5);
      expect(first.meta).toMatchObject({ total: 12, totalPages: 3 });
      expect(third.items).toHaveLength(2);
      const dates = first.items.map((t) => t.createdAt);
      expect([...dates].sort().reverse()).toEqual(dates);
    });

    test('página além do fim devolve lista vazia', async () => {
      expect((await svc.list(actors.admin, { page: 9, pageSize: 5 })).items).toEqual([]);
    });
  });

  describe('detalhe e permissões de leitura', () => {
    test('retorna chamado, comentários, histórico e ações permitidas', async () => {
      const detail = await svc.get(actors.tech, 't_007');
      expect(detail.ticket.assigneeName).toBe('Rafael Técnico');
      expect(detail.allowedTransitions).toEqual(['resolved']);
      expect(detail.permissions).toMatchObject({ canChangeStatus: true, canChangePriority: true, canDelete: false, canAssignSelf: false });
      expect(detail.history.length).toBeGreaterThan(1);
    });

    test('solicitante dono vê, mas não recebe ações de gestão', async () => {
      const detail = await svc.get(actors.marcos, 't_007');
      expect(detail.allowedTransitions).toEqual([]);
      expect(detail.permissions).toMatchObject({ canChangeStatus: false, canChangePriority: false, canComment: true });
    });

    test('chamado alheio -> FORBIDDEN; inexistente -> NOT_FOUND', async () => {
      await expect(svc.get(actors.marcos, 't_001')).rejects.toThrow('FORBIDDEN');
      await expect(svc.get(actors.tech, 't_006')).rejects.toThrow('FORBIDDEN');
      await expect(svc.get(actors.admin, 'nao-existe')).rejects.toThrow('NOT_FOUND');
    });
  });

  describe('mudança de status (RF08, RF11, RF12)', () => {
    test('técnico assume ao mover de aberto para análise e o histórico guarda ator, antes e depois', async () => {
      const t = await newTicket();
      const after = await svc.changeStatus(actors.tech, t.id, { status: 'analysis' });
      expect(after.ticket).toMatchObject({ status: 'analysis', assigneeId: 'u_tech' });
      const events = after.history.map((h) => [h.event, h.before, h.after, h.actorId]);
      expect(events).toEqual([
        ['ticket.created', null, 'open', 'u_lia'],
        ['ticket.status.changed', 'open', 'analysis', 'u_tech'],
        ['ticket.assignee.changed', null, 'u_tech', 'u_tech'],
      ]);
    });

    test('percorre o fluxo completo até fechar, gravando os comentários', async () => {
      const t = await newTicket();
      await svc.changeStatus(actors.tech, t.id, { status: 'analysis' });
      await svc.changeStatus(actors.tech, t.id, { status: 'in_progress' });
      await svc.changeStatus(actors.tech, t.id, { status: 'resolved', comment: 'Trocada a fonte.' });
      const closed = await svc.changeStatus(actors.tech, t.id, { status: 'closed', comment: 'Confirmado pelo usuário.' });
      expect(closed.ticket.status).toBe('closed');
      expect(closed.comments.map((c) => c.body)).toEqual(['Trocada a fonte.', 'Confirmado pelo usuário.']);
      expect(closed.allowedTransitions).toEqual([]);
    });

    test('salto proibido -> INVALID_STATE e nada é alterado', async () => {
      const t = await newTicket();
      await expect(svc.changeStatus(actors.admin, t.id, { status: 'closed', comment: 'x' })).rejects.toThrow('INVALID_STATE');
      expect((await svc.get(actors.admin, t.id)).ticket.status).toBe('open');
    });

    test('fechar sem comentário -> RESOLUTION_COMMENT_REQUIRED (chamado crítico incluído)', async () => {
      await expect(svc.changeStatus(actors.tech, 't_010', { status: 'closed' })).rejects.toThrow('RESOLUTION_COMMENT_REQUIRED');
      await expect(svc.changeStatus(actors.tech, 't_007', { status: 'resolved' })).rejects.toThrow('RESOLUTION_COMMENT_REQUIRED');
    });

    test('reabertura exige justificativa e volta para em atendimento', async () => {
      await expect(svc.changeStatus(actors.tech, 't_010', { status: 'in_progress' })).rejects.toThrow('REOPEN_COMMENT_REQUIRED');
      const reopened = await svc.changeStatus(actors.tech, 't_010', { status: 'in_progress', comment: 'Voltou a falhar hoje.' });
      expect(reopened.ticket.status).toBe('in_progress');
    });

    test('análise -> atendimento sem responsável -> ASSIGNEE_REQUIRED', async () => {
      const t = await newTicket();
      await svc.changeStatus(actors.admin, t.id, { status: 'analysis' }); // administrador não assume
      await expect(svc.changeStatus(actors.admin, t.id, { status: 'in_progress' })).rejects.toThrow('ASSIGNEE_REQUIRED');
      await svc.assign(actors.admin, t.id, { assigneeId: 'u_tech2' });
      await expect(svc.changeStatus(actors.admin, t.id, { status: 'in_progress' })).resolves.toBeDefined();
    });

    test('solicitante e técnico fora da fila não alteram (nada muda)', async () => {
      await expect(svc.changeStatus(actors.lia, 't_001', { status: 'analysis' })).rejects.toThrow('FORBIDDEN');
      await expect(svc.changeStatus(actors.tech, 't_006', { status: 'in_progress' })).rejects.toThrow('FORBIDDEN');
      expect((await svc.get(actors.admin, 't_006')).ticket.status).toBe('analysis');
    });

    test('chamado fechado não aceita nenhuma transição', async () => {
      await expect(svc.changeStatus(actors.admin, 't_012', { status: 'in_progress', comment: 'reabrir' })).rejects.toThrow('INVALID_STATE');
    });
  });

  describe('prioridade, responsável e comentários', () => {
    test('altera prioridade registrando antes/depois; repetir o mesmo valor não gera histórico', async () => {
      const before = (await svc.get(actors.tech, 't_007')).history.length;
      const changed = await svc.changePriority(actors.tech, 't_007', { priority: 'low' });
      expect(changed.history.at(-1)).toMatchObject({ event: 'ticket.priority.changed', before: 'critical', after: 'low' });
      const same = await svc.changePriority(actors.tech, 't_007', { priority: 'low' });
      expect(same.history).toHaveLength(before + 1);
    });

    test('chamado fechado não aceita prioridade, responsável nem comentário', async () => {
      await expect(svc.changePriority(actors.admin, 't_012', { priority: 'high' })).rejects.toThrow('TICKET_CLOSED');
      await expect(svc.assign(actors.admin, 't_012', { assigneeId: 'u_tech' })).rejects.toThrow('TICKET_CLOSED');
      await expect(svc.addComment(actors.admin, 't_012', { body: 'tarde demais' })).rejects.toThrow('TICKET_CLOSED');
    });

    test('técnico assume chamado livre, mas só para si mesmo', async () => {
      const t = await newTicket();
      await expect(svc.assign(actors.tech, t.id, { assigneeId: 'u_tech2' })).rejects.toThrow('FORBIDDEN');
      const mine = await svc.assign(actors.tech, t.id, { assigneeId: 'u_tech' });
      expect(mine.ticket.assigneeId).toBe('u_tech');
      expect(mine.history.at(-1)).toMatchObject({ event: 'ticket.assignee.changed', before: null, after: 'u_tech', afterName: 'Rafael Técnico' });
    });

    test('responsável precisa ser técnico ativo existente -> INVALID_ASSIGNEE', async () => {
      await expect(svc.assign(actors.admin, 't_001', { assigneeId: 'u_lia' })).rejects.toThrow('INVALID_ASSIGNEE');
      await expect(svc.assign(actors.admin, 't_001', { assigneeId: 'fantasma' })).rejects.toThrow('INVALID_ASSIGNEE');
    });

    test('comentário: dono e equipe comentam; terceiros não', async () => {
      const c = await svc.addComment(actors.lia, 't_001', { body: 'Continua sem acesso.' });
      expect(c).toMatchObject({ authorId: 'u_lia', authorName: 'Lia Solicitante', body: 'Continua sem acesso.' });
      await expect(svc.addComment(actors.marcos, 't_001', { body: 'intruso' })).rejects.toThrow('FORBIDDEN');
    });
  });

  describe('exclusão com auditoria (RF07)', () => {
    test('somente administrador exclui; o chamado some das listas e do detalhe', async () => {
      await expect(svc.remove(actors.tech, 't_001', { justification: 'duplicado do t_002' })).rejects.toThrow('FORBIDDEN');
      await expect(svc.remove(actors.admin, 't_001', { justification: 'duplicado do t_002' })).resolves.toEqual({ id: 't_001', deleted: true });
      await expect(svc.get(actors.admin, 't_001')).rejects.toThrow('NOT_FOUND');
      expect((await svc.list(actors.admin, { pageSize: 50 })).meta.total).toBe(11);
      await expect(svc.remove(actors.admin, 't_001', { justification: 'duplicado do t_002' })).rejects.toThrow('NOT_FOUND');
    });
  });

  describe('relatório (RF13, RF14)', () => {
    test('conta por status e prioridade conforme o seed', async () => {
      const r = await svc.summary(actors.admin);
      expect(r).toMatchObject({ total: 12, empty: false, message: null });
      expect(r.byStatus).toEqual({ open: 3, analysis: 3, in_progress: 3, resolved: 2, closed: 1 });
      expect(r.byPriority).toEqual({ low: 4, medium: 3, high: 3, critical: 2 });
    });

    test('filtros alteram os totais', async () => {
      const r = await svc.summary(actors.admin, { status: 'open' });
      expect(r.total).toBe(3);
      expect(r.byStatus.analysis).toBe(0);
      expect(r.filters).toEqual({ status: 'open', priority: null });
    });

    test('estado vazio explica a ausência de dados e mantém as chaves zeradas', async () => {
      const r = await svc.summary(actors.admin, { status: 'closed', priority: 'critical' });
      expect(r.empty).toBe(true);
      expect(r.message).toMatch(/Nenhum chamado encontrado/);
      expect(Object.values(r.byStatus).every((n) => n === 0)).toBe(true);
    });

    test('respeita o escopo de visibilidade de cada papel', async () => {
      expect((await svc.summary(actors.marcos)).total).toBe(5);
    });
  });
});
