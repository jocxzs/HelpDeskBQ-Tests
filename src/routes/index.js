'use strict';

const express = require('express');
const wrap = require('../middlewares/async-handler');
const { createAuthMiddleware } = require('../middlewares/auth');
const { createSessionController } = require('../controllers/session-controller');
const { createTicketController } = require('../controllers/ticket-controller');
const { createReportController } = require('../controllers/report-controller');

/** Contrato HTTP da API (ver docs/api.md). */
function createRoutes({ services }) {
  const router = express.Router();
  const { requireAuth, requireRole } = createAuthMiddleware({ authService: services.auth });
  const sessions = createSessionController({ authService: services.auth });
  const tickets = createTicketController({ ticketService: services.tickets });
  const reports = createReportController({ ticketService: services.tickets, directoryService: services.directory });

  router.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });

  router.post('/sessions', wrap(sessions.create));
  router.get('/me', requireAuth, sessions.me);

  router.post('/tickets', requireAuth, wrap(tickets.create));
  router.get('/tickets', requireAuth, wrap(tickets.list));
  router.get('/tickets/:id', requireAuth, wrap(tickets.get));
  router.patch('/tickets/:id/status', requireAuth, wrap(tickets.changeStatus));
  router.patch('/tickets/:id/priority', requireAuth, wrap(tickets.changePriority));
  router.patch('/tickets/:id/assignee', requireAuth, wrap(tickets.assign));
  router.post('/tickets/:id/comments', requireAuth, wrap(tickets.addComment));
  router.delete('/tickets/:id', requireAuth, requireRole('admin'), wrap(tickets.remove));

  router.get('/reports/summary', requireAuth, wrap(reports.summary));
  router.get('/technicians', requireAuth, requireRole('admin', 'technician'), wrap(reports.technicians));
  router.get('/audit', requireAuth, requireRole('admin'), wrap(reports.audit));

  return router;
}

module.exports = { createRoutes };
