'use strict';

const { assertTransition, ALLOWED } = require('../../src/services/transitions');

describe('regra de transição de chamado (RF11, RF12)', () => {
  test('permite resolved -> closed com comentário', () => {
    expect(() => assertTransition('resolved', 'closed', 'Resolvido')).not.toThrow();
  });

  test('impede fechamento sem comentário', () => {
    expect(() => assertTransition('resolved', 'closed', '')).toThrow('RESOLUTION_COMMENT_REQUIRED');
  });

  test('impede fechamento com comentário só de espaços', () => {
    expect(() => assertTransition('resolved', 'closed', '    ')).toThrow('RESOLUTION_COMMENT_REQUIRED');
  });

  test('impede salto open -> closed', () => {
    expect(() => assertTransition('open', 'closed', 'x')).toThrow('INVALID_STATE');
  });

  test.each([
    ['open', 'analysis'],
    ['analysis', 'in_progress'],
  ])('permite %s -> %s sem comentário', (from, to) => {
    expect(() => assertTransition(from, to)).not.toThrow();
  });

  test('resolver exige comentário de resolução', () => {
    expect(() => assertTransition('in_progress', 'resolved')).toThrow('RESOLUTION_COMMENT_REQUIRED');
    expect(() => assertTransition('in_progress', 'resolved', 'Trocada a peça')).not.toThrow();
  });

  test('reabrir (resolved -> in_progress) exige justificativa', () => {
    expect(() => assertTransition('resolved', 'in_progress')).toThrow('REOPEN_COMMENT_REQUIRED');
    expect(() => assertTransition('resolved', 'in_progress', 'Voltou a falhar')).not.toThrow();
  });

  test.each(['open', 'analysis', 'in_progress', 'resolved', 'closed'])('fechado não aceita transição para %s', (to) => {
    expect(() => assertTransition('closed', to, 'x')).toThrow('INVALID_STATE');
  });

  test.each([
    ['open', 'in_progress'],
    ['open', 'resolved'],
    ['analysis', 'resolved'],
    ['analysis', 'open'],
    ['in_progress', 'open'],
    ['in_progress', 'closed'],
  ])('rejeita o salto proibido %s -> %s', (from, to) => {
    expect(() => assertTransition(from, to, 'comentário')).toThrow('INVALID_STATE');
  });

  test('origem desconhecida é rejeitada', () => {
    expect(() => assertTransition('arquivado', 'open', 'x')).toThrow('INVALID_STATE');
  });

  test('o mapa de transições não possui destinos fora dos estados conhecidos', () => {
    const known = Object.keys(ALLOWED);
    for (const targets of Object.values(ALLOWED)) targets.forEach((t) => expect(known).toContain(t));
  });
});
