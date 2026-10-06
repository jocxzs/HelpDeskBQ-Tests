'use strict';

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40, silent: 100 };
const SENSITIVE = /^(password|passwordhash|token|authorization|secret|sessionsecret)$/i;

function sanitize(fields) {
  const out = {};
  for (const [key, value] of Object.entries(fields || {})) {
    out[key] = SENSITIVE.test(key) ? '[REDACTED]' : value;
  }
  return out;
}

/** Logger estruturado (JSON por linha). Nunca grava senha, token ou segredo. */
function createLogger({
  level = 'info',
  write = (line) => process.stdout.write(`${line}\n`),
  now = () => new Date(),
} = {}) {
  const threshold = LEVELS[level] ?? LEVELS.info;
  const log = (name, event, fields) => {
    if (LEVELS[name] < threshold) return;
    write(JSON.stringify({ level: name, event, time: now().toISOString(), ...sanitize(fields) }));
  };
  return {
    debug: (event, fields) => log('debug', event, fields),
    info: (event, fields) => log('info', event, fields),
    warn: (event, fields) => log('warn', event, fields),
    error: (event, fields) => log('error', event, fields),
  };
}

/** Logger em memória, usado nos testes para inspecionar eventos. */
function createMemoryLogger() {
  const entries = [];
  const logger = createLogger({ level: 'debug', write: (line) => entries.push(JSON.parse(line)) });
  return { logger, entries };
}

module.exports = { createLogger, createMemoryLogger };
