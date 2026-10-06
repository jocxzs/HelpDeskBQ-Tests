'use strict';

const { createLogger, createMemoryLogger } = require('../../src/logger');

describe('logger estruturado (RNF07)', () => {
  test('grava JSON com evento, nível e horário', () => {
    const lines = [];
    const logger = createLogger({ write: (l) => lines.push(l), now: () => new Date('2026-09-01T12:00:00Z') });
    logger.info('ticket.created', { ticketId: 't1', correlationId: 'req_1' });
    expect(JSON.parse(lines[0])).toEqual({
      level: 'info', event: 'ticket.created', time: '2026-09-01T12:00:00.000Z', ticketId: 't1', correlationId: 'req_1',
    });
  });

  test('nunca registra senha, token ou segredo', () => {
    const { logger, entries } = createMemoryLogger();
    logger.info('x', { password: 'Senha@123', token: 'abc', Authorization: 'Bearer abc', passwordHash: 'h', secret: 's', ok: 1 });
    expect(entries[0]).toMatchObject({ password: '[REDACTED]', token: '[REDACTED]', Authorization: '[REDACTED]', passwordHash: '[REDACTED]', secret: '[REDACTED]', ok: 1 });
    expect(JSON.stringify(entries)).not.toContain('Senha@123');
  });

  test('respeita o nível mínimo', () => {
    const lines = [];
    const logger = createLogger({ level: 'warn', write: (l) => lines.push(l) });
    logger.debug('a'); logger.info('b'); logger.warn('c'); logger.error('d');
    expect(lines.map((l) => JSON.parse(l).event)).toEqual(['c', 'd']);
  });

  test('nível silent não grava nada', () => {
    const lines = [];
    const logger = createLogger({ level: 'silent', write: (l) => lines.push(l) });
    logger.error('x');
    expect(lines).toHaveLength(0);
  });
});
