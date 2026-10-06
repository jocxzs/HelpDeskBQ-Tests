'use strict';

module.exports = {
  testEnvironment: 'node',
  testMatch: ['<rootDir>/tests/**/*.test.js'],
  collectCoverageFrom: ['src/**/*.js', '!src/server.js'],
  coverageDirectory: 'coverage',
  coverageReporters: ['text-summary', 'text', 'lcov'],
  // RNF06: cobertura de linhas >= 70% no núcleo da aplicação
  coverageThreshold: {
    global: { lines: 70, statements: 70, functions: 70, branches: 60 },
  },
  testTimeout: 20000,
  clearMocks: true,
};
