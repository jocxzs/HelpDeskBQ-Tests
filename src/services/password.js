'use strict';

const crypto = require('node:crypto');
const { promisify } = require('node:util');

const scrypt = promisify(crypto.scrypt);
const KEY_LENGTH = 64;
const BLOCK_SIZE = 8;

function options(cost) {
  return { N: cost, r: BLOCK_SIZE, p: 1, maxmem: 256 * cost * BLOCK_SIZE };
}

/** Hash de senha com scrypt (nativo do Node, sem criptografia inventada). */
function createPasswordHasher({ cost = 16384 } = {}) {
  const format = (salt, hash) => `scrypt$${cost}$${salt.toString('hex')}$${hash.toString('hex')}`;

  return {
    async hash(password) {
      const salt = crypto.randomBytes(16);
      return format(salt, await scrypt(password, salt, KEY_LENGTH, options(cost)));
    },
    hashSync(password) {
      const salt = crypto.randomBytes(16);
      return format(salt, crypto.scryptSync(password, salt, KEY_LENGTH, options(cost)));
    },
    async verify(password, stored) {
      const [scheme, n, saltHex, hashHex] = String(stored).split('$');
      if (scheme !== 'scrypt' || !n || !saltHex || !hashHex) return false;
      const expected = Buffer.from(hashHex, 'hex');
      const actual = await scrypt(password, Buffer.from(saltHex, 'hex'), expected.length, options(Number(n)));
      return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
    },
  };
}

module.exports = { createPasswordHasher };
