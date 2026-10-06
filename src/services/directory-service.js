'use strict';

const { domainError } = require('../errors');

/** Consultas de apoio à interface: lista de técnicos e trilha de auditoria. */
function createDirectoryService({ repositories }) {
  return {
    async listTechnicians(actor) {
      if (actor.role === 'requester') throw domainError('FORBIDDEN');
      const technicians = await repositories.users.listByRole('technician');
      return technicians.filter((u) => u.active).map((u) => ({ id: u.id, name: u.name }));
    },
    async listAudit(actor) {
      if (actor.role !== 'admin') throw domainError('FORBIDDEN');
      return repositories.audit.list();
    },
  };
}

module.exports = { createDirectoryService };
