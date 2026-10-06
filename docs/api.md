# Contrato da API

Autenticação: `Authorization: Bearer <token>` (obtido em `POST /api/sessions`, validade 1 h).
Respostas de sucesso: `{ "data": ... }` (listas incluem `meta`). Todo erro: `{ "error": { "code", "message", "correlationId", "details"? } }`.
Toda resposta traz o cabeçalho `x-correlation-id`, que também aparece nos logs.

| Método e rota | Papéis | Entrada | Sucesso | Erros |
|---|---|---|---|---|
| POST /api/sessions | público | email, password | 200 token + usuário | 400, 401, 423 |
| GET /api/me | autenticado | – | 200 usuário | 401 |
| POST /api/tickets | autenticado | title, description, priority | 201 chamado | 400, 401 |
| GET /api/tickets | autenticado | status?, priority?, page?, pageSize? | 200 lista paginada | 400, 401 |
| GET /api/tickets/:id | dono, técnico da fila, admin | – | 200 detalhe, histórico, comentários, permissões | 401, 403, 404 |
| PATCH /api/tickets/:id/status | técnico da fila, admin | status, comment? | 200 detalhe | 400, 401, 403, 404, 409 |
| PATCH /api/tickets/:id/priority | técnico da fila, admin | priority | 200 detalhe | 400, 403, 404, 409 |
| PATCH /api/tickets/:id/assignee | técnico (só a si), admin | assigneeId | 200 detalhe | 400, 403, 404, 409 |
| POST /api/tickets/:id/comments | quem vê o chamado | body (1–1000) | 201 comentário | 400, 403, 404, 409 |
| DELETE /api/tickets/:id | admin | justification (10–500) | 200 | 400, 403, 404 |
| GET /api/reports/summary | autenticado | status?, priority? | 200 totais ou `empty: true` | 400, 401 |
| GET /api/technicians | técnico, admin | – | 200 lista | 403 |
| GET /api/audit | admin | – | 200 auditoria | 403 |

Códigos de erro estáveis: `VALIDATION_ERROR`, `INVALID_JSON`, `UNAUTHENTICATED`, `INVALID_CREDENTIALS`, `FORBIDDEN`, `NOT_FOUND`, `INVALID_STATE`, `RESOLUTION_COMMENT_REQUIRED`, `REOPEN_COMMENT_REQUIRED`, `ASSIGNEE_REQUIRED`, `INVALID_ASSIGNEE`, `TICKET_CLOSED`, `PAYLOAD_TOO_LARGE`, `ACCOUNT_LOCKED`, `INTERNAL_ERROR`.
