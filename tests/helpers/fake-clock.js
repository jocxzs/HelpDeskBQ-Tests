'use strict';

/** Relógio controlável: permite simular 5 e 10 minutos sem esperar. */
function createFakeClock(start = Date.parse('2026-09-01T12:00:00.000Z')) {
  let current = start;
  return {
    now: () => current,
    advance(ms) { current += ms; },
    set(ms) { current = ms; },
  };
}

const SECOND = 1000;
const MINUTE = 60 * SECOND;

module.exports = { createFakeClock, SECOND, MINUTE };
