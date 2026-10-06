'use strict';

const v = require('../../src/validation/schemas');

const valid = {
  title: 'Computador não inicializa',
  description: 'Ao pressionar o botão, nenhum sinal é exibido no monitor.',
  priority: 'high',
};
const run = (override) => () => v.parse(v.createTicketSchema, { ...valid, ...override });
const text = (n) => 'a'.repeat(n);

describe('validação de criação de chamado (RF04, RF05)', () => {
  test('aceita um chamado válido', () => {
    expect(run({})()).toEqual(valid);
  });

  describe('valor-limite do título (10 a 100)', () => {
    test.each([
      [9, false],
      [10, true],
      [100, true],
      [101, false],
    ])('título com %i caracteres -> válido=%s', (size, ok) => {
      if (ok) expect(run({ title: text(size) })).not.toThrow();
      else expect(run({ title: text(size) })).toThrow('VALIDATION_ERROR');
    });

    test('espaços nas pontas são removidos antes de medir', () => {
      expect(run({ title: `   ${text(9)}   ` })).toThrow('VALIDATION_ERROR');
      expect(run({ title: `   ${text(10)}   ` }).call()).toHaveProperty('title', text(10));
    });

    test('acentos contam como caracteres comuns', () => {
      expect(run({ title: 'ação à ç é ü ô' })).not.toThrow();
    });

    test('null é diferente de vazio e ambos são inválidos', () => {
      expect(run({ title: null })).toThrow('VALIDATION_ERROR');
      expect(run({ title: '' })).toThrow('VALIDATION_ERROR');
    });
  });

  describe('valor-limite da descrição (mínimo 30)', () => {
    test.each([
      [29, false],
      [30, true],
      [5000, true],
      [5001, false],
    ])('descrição com %i caracteres -> válido=%s', (size, ok) => {
      if (ok) expect(run({ description: text(size) })).not.toThrow();
      else expect(run({ description: text(size) })).toThrow('VALIDATION_ERROR');
    });
  });

  describe('partição de equivalência da prioridade', () => {
    test.each(['low', 'medium', 'high', 'critical'])('aceita %s', (priority) => {
      expect(run({ priority })).not.toThrow();
    });
    test.each([[''], [null], ['urgente'], ['HIGH'], [3]])('rejeita %p', (priority) => {
      expect(run({ priority })).toThrow('VALIDATION_ERROR');
    });
  });

  test('rejeita campos extras (ex.: requesterId, role)', () => {
    expect(run({ requesterId: 'u_admin' })).toThrow('VALIDATION_ERROR');
    try {
      run({ requesterId: 'u_admin' })();
    } catch (error) {
      expect(error.details).toEqual([{ field: 'requesterId', message: 'Campo não permitido.' }]);
    }
  });

  test('devolve detalhes por campo', () => {
    try {
      v.parse(v.createTicketSchema, { title: 'curto', description: 'curta', priority: 'x' });
      throw new Error('deveria falhar');
    } catch (error) {
      expect(error.code).toBe('VALIDATION_ERROR');
      expect(error.details.map((d) => d.field).sort()).toEqual(['description', 'priority', 'title']);
    }
  });
});

describe('comentário (RF10): 0, 1, 1000 e 1001 caracteres', () => {
  const comment = (body) => () => v.parse(v.commentSchema, { body });
  test.each([
    [0, false],
    [1, true],
    [1000, true],
    [1001, false],
  ])('comentário com %i caracteres -> válido=%s', (size, ok) => {
    if (ok) expect(comment(text(size))).not.toThrow();
    else expect(comment(text(size))).toThrow('VALIDATION_ERROR');
  });
  test('comentário só com espaços é vazio', () => {
    expect(comment('     ')).toThrow('VALIDATION_ERROR');
  });
});

describe('demais esquemas', () => {
  test('login exige e-mail e senha, e rejeita campos extras', () => {
    expect(() => v.parse(v.loginSchema, { email: 'a@b.c', password: 'x' })).not.toThrow();
    expect(() => v.parse(v.loginSchema, { email: '', password: 'x' })).toThrow('VALIDATION_ERROR');
    expect(() => v.parse(v.loginSchema, { email: 'a@b.c' })).toThrow('VALIDATION_ERROR');
    expect(() => v.parse(v.loginSchema, { email: 'a@b.c', password: 'x', role: 'admin' })).toThrow('VALIDATION_ERROR');
  });

  test('mudança de status aceita comentário opcional de até 1000 caracteres', () => {
    expect(v.parse(v.statusChangeSchema, { status: 'analysis' })).toEqual({ status: 'analysis' });
    expect(() => v.parse(v.statusChangeSchema, { status: 'analysis', comment: text(1001) })).toThrow('VALIDATION_ERROR');
    expect(() => v.parse(v.statusChangeSchema, { status: 'arquivado' })).toThrow('VALIDATION_ERROR');
  });

  test('justificativa de exclusão tem de 10 a 500 caracteres', () => {
    expect(() => v.parse(v.deleteTicketSchema, { justification: text(9) })).toThrow('VALIDATION_ERROR');
    expect(() => v.parse(v.deleteTicketSchema, { justification: text(10) })).not.toThrow();
    expect(() => v.parse(v.deleteTicketSchema, { justification: text(501) })).toThrow('VALIDATION_ERROR');
  });

  test('consulta de lista aplica padrões e valida filtros e paginação', () => {
    expect(v.parse(v.listQuerySchema, {})).toEqual({ page: 1, pageSize: 10 });
    expect(v.parse(v.listQuerySchema, { status: 'open', priority: 'low', page: '2', pageSize: '5' })).toEqual({
      status: 'open', priority: 'low', page: 2, pageSize: 5,
    });
    expect(() => v.parse(v.listQuerySchema, { status: 'x' })).toThrow('VALIDATION_ERROR');
    expect(() => v.parse(v.listQuerySchema, { page: '0' })).toThrow('VALIDATION_ERROR');
    expect(() => v.parse(v.listQuerySchema, { page: 'abc' })).toThrow('VALIDATION_ERROR');
    expect(() => v.parse(v.listQuerySchema, { pageSize: '51' })).toThrow('VALIDATION_ERROR');
  });

  test('withoutEmpty descarta parâmetros vazios', () => {
    expect(v.withoutEmpty({ status: '', priority: 'low' })).toEqual({ priority: 'low' });
    expect(v.withoutEmpty(undefined)).toEqual({});
  });
});
