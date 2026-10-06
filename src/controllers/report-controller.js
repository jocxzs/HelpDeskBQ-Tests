'use strict';

const v = require('../validation/schemas');

function createReportController({ ticketService, directoryService }) {
  return {
    async summary(req, res) {
      const filters = v.parse(v.summaryQuerySchema, v.withoutEmpty(req.query));
      res.json({ data: await ticketService.summary(req.user, filters) });
    },
    async technicians(req, res) {
      res.json({ data: await directoryService.listTechnicians(req.user) });
    },
    async audit(req, res) {
      res.json({ data: await directoryService.listAudit(req.user) });
    },
  };
}

module.exports = { createReportController };
