'use strict';

/** Relógio injetável: permite testar bloqueio de login e expiração sem esperar. */
const systemClock = { now: () => Date.now() };

module.exports = { systemClock };
