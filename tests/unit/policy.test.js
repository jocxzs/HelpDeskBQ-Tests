'use strict';

const policy = require('../../src/services/policy');

const lia = { id: 'u_lia', role: 'requester' };
const marcos = { id: 'u_marcos', role: 'requester' };
const tech = { id: 'u_tech', role: 'technician' };
const tech2 = { id: 'u_tech2', role: 'technician' };
const admin = { id: 'u_admin', role: 'admin' };

const ticket = (override) => ({ id: 't1', requesterId: 'u_lia', assigneeId: null, status: 'open', ...override });

describe('tabela de decisão de permissões (Passo 44)', () => {
  test('R2: solicitante dono vê o próprio chamado', () => {
    expect(policy.canView(lia, ticket())).toBe(true);
  });

  test('R3: solicitante que não é dono não vê nem altera', () => {
    expect(policy.canView(marcos, ticket())).toBe(false);
    expect(policy.canManage(marcos, ticket())).toBe(false);
  });

  test('solicitante dono vê, mas não gerencia (não muda status)', () => {
    expect(policy.canManage(lia, ticket())).toBe(false);
  });

  test('R4: técnico atua em chamado sem responsável ou atribuído a ele', () => {
    expect(policy.canManage(tech, ticket({ assigneeId: null }))).toBe(true);
    expect(policy.canManage(tech, ticket({ assigneeId: 'u_tech' }))).toBe(true);
  });

  test('R5: técnico fora da fila não vê nem altera', () => {
    const other = ticket({ assigneeId: 'u_tech2' });
    expect(policy.canView(tech, other)).toBe(false);
    expect(policy.canManage(tech, other)).toBe(false);
    expect(policy.canManage(tech2, other)).toBe(true);
  });

  test('técnico sempre enxerga o chamado que ele mesmo abriu', () => {
    const own = ticket({ requesterId: 'u_tech', assigneeId: 'u_tech2' });
    expect(policy.canView(tech, own)).toBe(true);
    expect(policy.canManage(tech, own)).toBe(false);
  });

  test('R6: administrador vê e gerencia qualquer chamado', () => {
    const t = ticket({ assigneeId: 'u_tech2', status: 'closed' });
    expect(policy.canView(admin, t)).toBe(true);
    expect(policy.canManage(admin, t)).toBe(true);
  });

  test('papel desconhecido não tem acesso', () => {
    const ghost = { id: 'u_x', role: 'visitante' };
    expect(policy.canView(ghost, ticket())).toBe(false);
    expect(policy.canManage(ghost, ticket())).toBe(false);
  });

  test('escopo de visibilidade para o repositório', () => {
    expect(policy.visibilityScope(admin)).toBeUndefined();
    expect(policy.visibilityScope(lia)).toEqual([{ requesterId: 'u_lia' }]);
    expect(policy.visibilityScope(tech)).toEqual([{ requesterId: 'u_tech' }, { assigneeIn: [null, 'u_tech'] }]);
  });
});
