'use strict';

const v = require('../validation/schemas');

/** Controllers finos: leem a requisição, validam, chamam o serviço e traduzem para HTTP. */
function createTicketController({ ticketService }) {
  return {
    async create(req, res) {
      const input = v.parse(v.createTicketSchema, req.body);
      const ticket = await ticketService.create(req.user, input);
      res.status(201).json({ data: ticket });
    },
    async list(req, res) {
      const query = v.parse(v.listQuerySchema, v.withoutEmpty(req.query));
      const { items, meta } = await ticketService.list(req.user, query);
      res.json({ data: items, meta });
    },
    async get(req, res) {
      res.json({ data: await ticketService.get(req.user, req.params.id) });
    },
    async changeStatus(req, res) {
      const input = v.parse(v.statusChangeSchema, req.body);
      res.json({ data: await ticketService.changeStatus(req.user, req.params.id, input) });
    },
    async changePriority(req, res) {
      const input = v.parse(v.priorityChangeSchema, req.body);
      res.json({ data: await ticketService.changePriority(req.user, req.params.id, input) });
    },
    async assign(req, res) {
      const input = v.parse(v.assigneeChangeSchema, req.body);
      res.json({ data: await ticketService.assign(req.user, req.params.id, input) });
    },
    async addComment(req, res) {
      const input = v.parse(v.commentSchema, req.body);
      res.status(201).json({ data: await ticketService.addComment(req.user, req.params.id, input) });
    },
    async remove(req, res) {
      const input = v.parse(v.deleteTicketSchema, req.body);
      res.json({ data: await ticketService.remove(req.user, req.params.id, input) });
    },
  };
}

module.exports = { createTicketController };
