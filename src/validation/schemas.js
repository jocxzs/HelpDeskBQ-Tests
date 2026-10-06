'use strict';

const { z } = require('zod');
const { domainError } = require('../errors');
const { STATUSES, PRIORITIES } = require('../domain/constants');

const text = (label) =>
  z.string({ required_error: `${label} é obrigatório.`, invalid_type_error: `${label} deve ser um texto.` });

const priority = z.enum(PRIORITIES, {
  errorMap: () => ({ message: 'Prioridade deve ser baixa, média, alta ou crítica.' }),
});

const status = z.enum(STATUSES, {
  errorMap: () => ({ message: 'Status inválido.' }),
});

const COMMENT_MESSAGE = 'O comentário deve ter no máximo 1000 caracteres.';

const loginSchema = z
  .object({
    email: text('E-mail').trim().min(1, 'Informe o e-mail.').max(254, 'E-mail muito longo.'),
    password: text('Senha').min(1, 'Informe a senha.').max(200, 'Senha muito longa.'),
  })
  .strict();

// RF04 / RF05
const createTicketSchema = z
  .object({
    title: text('Título')
      .trim()
      .min(10, 'O título deve ter de 10 a 100 caracteres.')
      .max(100, 'O título deve ter de 10 a 100 caracteres.'),
    description: text('Descrição')
      .trim()
      .min(30, 'A descrição deve ter pelo menos 30 caracteres.')
      .max(5000, 'A descrição deve ter no máximo 5000 caracteres.'),
    priority,
  })
  .strict();

const statusChangeSchema = z
  .object({
    status,
    comment: text('Comentário').trim().max(1000, COMMENT_MESSAGE).optional(),
  })
  .strict();

const priorityChangeSchema = z.object({ priority }).strict();

const assigneeChangeSchema = z
  .object({ assigneeId: text('Responsável').trim().min(1, 'Informe o responsável.').max(100, 'Responsável inválido.') })
  .strict();

// RF10
const commentSchema = z
  .object({ body: text('Comentário').trim().min(1, 'Escreva o comentário.').max(1000, COMMENT_MESSAGE) })
  .strict();

// RF07
const deleteTicketSchema = z
  .object({
    justification: text('Justificativa')
      .trim()
      .min(10, 'A justificativa deve ter de 10 a 500 caracteres.')
      .max(500, 'A justificativa deve ter de 10 a 500 caracteres.'),
  })
  .strict();

const invalidPage = 'Página inválida.';
// RF09
const listQuerySchema = z.object({
  status: status.optional(),
  priority: priority.optional(),
  page: z.coerce.number({ invalid_type_error: invalidPage }).int(invalidPage).min(1, invalidPage).default(1),
  pageSize: z.coerce
    .number({ invalid_type_error: 'Tamanho de página inválido.' })
    .int('Tamanho de página inválido.')
    .min(1, 'Tamanho de página inválido.')
    .max(50, 'Tamanho de página inválido.')
    .default(10),
});

// RF13
const summaryQuerySchema = z.object({ status: status.optional(), priority: priority.optional() });

/** Remove parâmetros vazios (ex.: ?status=) para tratá-los como "sem filtro". */
function withoutEmpty(query) {
  return Object.fromEntries(Object.entries(query || {}).filter(([, value]) => value !== ''));
}

/** Valida e devolve os dados normalizados; em caso de erro lança VALIDATION_ERROR com detalhes por campo. */
function parse(schema, data) {
  const result = schema.safeParse(data);
  if (result.success) return result.data;
  const details = result.error.issues.map((issue) =>
    issue.code === 'unrecognized_keys'
      ? { field: issue.keys.join(', '), message: 'Campo não permitido.' }
      : { field: issue.path.join('.') || 'corpo', message: issue.message },
  );
  throw domainError('VALIDATION_ERROR', details);
}

module.exports = {
  parse,
  withoutEmpty,
  loginSchema,
  createTicketSchema,
  statusChangeSchema,
  priorityChangeSchema,
  assigneeChangeSchema,
  commentSchema,
  deleteTicketSchema,
  listQuerySchema,
  summaryQuerySchema,
};
