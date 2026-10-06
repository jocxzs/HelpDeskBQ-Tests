'use strict';

/**
 * Catálogo único de erros de negócio e de infraestrutura.
 * O `code` é estável (contrato da API); a mensagem externa é sempre segura.
 */
const CATALOG = {
  VALIDATION_ERROR: [400, 'Revise os campos destacados.'],
  INVALID_JSON: [400, 'O corpo da requisição não é um JSON válido.'],
  INVALID_ASSIGNEE: [400, 'Responsável inválido.'],
  RESOLUTION_COMMENT_REQUIRED: [400, 'Informe o comentário de resolução para concluir esta ação.'],
  REOPEN_COMMENT_REQUIRED: [400, 'Informe a justificativa para reabrir o chamado.'],
  UNAUTHENTICATED: [401, 'Autenticação necessária.'],
  INVALID_CREDENTIALS: [401, 'E-mail ou senha inválidos.'],
  FORBIDDEN: [403, 'Ação não autorizada.'],
  NOT_FOUND: [404, 'Recurso não encontrado.'],
  INVALID_STATE: [409, 'Transição não permitida.'],
  ASSIGNEE_REQUIRED: [409, 'Defina um responsável antes de continuar o atendimento.'],
  TICKET_CLOSED: [409, 'Chamado fechado não pode ser alterado.'],
  PAYLOAD_TOO_LARGE: [413, 'O conteúdo enviado é grande demais.'],
  ACCOUNT_LOCKED: [423, 'Acesso temporariamente indisponível.'],
  INTERNAL_ERROR: [500, 'Não foi possível concluir. Use o código de suporte.'],
};

class DomainError extends Error {
  constructor(code, details) {
    super(code); // message = code, para permitir expect(...).toThrow('CODIGO')
    this.name = 'DomainError';
    this.code = code;
    this.status = CATALOG[code][0];
    this.publicMessage = CATALOG[code][1];
    this.details = details;
  }
}

function domainError(code, details) {
  if (!CATALOG[code]) throw new TypeError(`Código de erro desconhecido: ${code}`);
  return new DomainError(code, details);
}

module.exports = { DomainError, domainError, CATALOG };
