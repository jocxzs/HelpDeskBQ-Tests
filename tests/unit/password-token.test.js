'use strict';

const { createPasswordHasher } = require('../../src/services/password');
const { createTokenService } = require('../../src/services/token');
const { createFakeClock, SECOND } = require('../helpers/fake-clock');

describe('hash de senha (RNF04)', () => {
  const hasher = createPasswordHasher({ cost: 1024 });

  test('o hash não contém a senha em texto puro', async () => {
    const stored = await hasher.hash('Senha@123');
    expect(stored).not.toContain('Senha@123');
    expect(stored.startsWith('scrypt$1024$')).toBe(true);
  });

  test('a mesma senha gera hashes diferentes (salt aleatório)', async () => {
    expect(await hasher.hash('Senha@123')).not.toBe(await hasher.hash('Senha@123'));
  });

  test('verifica senha correta e rejeita a incorreta', async () => {
    const stored = await hasher.hash('Senha@123');
    expect(await hasher.verify('Senha@123', stored)).toBe(true);
    expect(await hasher.verify('senha@123', stored)).toBe(false);
    expect(await hasher.verify('', stored)).toBe(false);
  });

  test('versão síncrona (usada no seed) é compatível com a verificação', async () => {
    expect(await hasher.verify('abc12345', hasher.hashSync('abc12345'))).toBe(true);
  });

  test.each(['', 'texto-puro', 'md5$1$2$3', undefined])('hash armazenado malformado (%p) nunca valida', async (stored) => {
    expect(await hasher.verify('qualquer', stored)).toBe(false);
  });
});

describe('token de sessão assinado', () => {
  const secret = 'segredo-de-teste';
  const make = (clock, ttlSeconds = 60, key = secret) => createTokenService({ secret: key, ttlSeconds, clock });

  test('emite e valida um token', () => {
    const tokens = make(createFakeClock());
    const payload = tokens.verify(tokens.issue({ sub: 'u1', role: 'admin' }));
    expect(payload).toMatchObject({ sub: 'u1', role: 'admin' });
  });

  test('expira após o prazo, usando o relógio injetado', () => {
    const clock = createFakeClock();
    const tokens = make(clock, 60);
    const token = tokens.issue({ sub: 'u1' });
    clock.advance(59 * SECOND);
    expect(() => tokens.verify(token)).not.toThrow();
    clock.advance(2 * SECOND);
    expect(() => tokens.verify(token)).toThrow('UNAUTHENTICATED');
  });

  test('token adulterado falha (payload alterado)', () => {
    const tokens = make(createFakeClock());
    const [, signature] = tokens.issue({ sub: 'u1', role: 'requester' }).split('.');
    const forged = Buffer.from(JSON.stringify({ sub: 'u1', role: 'admin', exp: 9999999999 })).toString('base64url');
    expect(() => tokens.verify(`${forged}.${signature}`)).toThrow('UNAUTHENTICATED');
  });

  test('token assinado com outro segredo falha', () => {
    const clock = createFakeClock();
    const foreign = make(clock, 60, 'outro-segredo').issue({ sub: 'u1' });
    expect(() => make(clock).verify(foreign)).toThrow('UNAUTHENTICATED');
  });

  test.each([undefined, null, '', 'abc', 'a.b.c', 'a.b', 42])('lixo (%p) é recusado', (garbage) => {
    expect(() => make(createFakeClock()).verify(garbage)).toThrow('UNAUTHENTICATED');
  });
});
