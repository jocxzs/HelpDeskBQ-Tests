'use strict';

const { parse, loginSchema } = require('../validation/schemas');

function createSessionController({ authService }) {
  return {
    async create(req, res) {
      const credentials = parse(loginSchema, req.body);
      const session = await authService.login(credentials);
      res.status(200).json({ data: session });
    },
    me(req, res) {
      res.json({ data: req.user });
    },
  };
}

module.exports = { createSessionController };
