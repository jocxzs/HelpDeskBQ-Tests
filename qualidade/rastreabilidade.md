# Matriz de rastreabilidade (requisito → código → teste)

| Requisito | Código | Testes |
|---|---|---|
| RF01 login | services/auth-service.js | unit/auth-service; api/sessions |
| RF02 bloqueio | services/auth-service.js, config.js | unit/auth-service; api/sessions (CT-014) |
| RF03 só autenticado cria | middlewares/auth.js | api/tickets (401) |
| RF04 limites de título/descrição | validation/schemas.js | unit/schemas; api/tickets |
| RF05 prioridade | validation/schemas.js | unit/schemas; api/tickets |
| RF06 visibilidade | services/policy.js | unit/policy; unit/ticket-service; api/tickets; api/security |
| RF07 exclusão por admin | ticket-service.js (remove) | api/tickets; integration/persistence |
| RF08 histórico | ticket-service.js | unit/ticket-service; integration/persistence; e2e |
| RF09 filtros | repositories/index.js | unit/ticket-service; api/tickets |
| RF10 comentário ≤ 1000 | schemas.js, ticket-service.js | unit/schemas; api/tickets |
| RF11 transições | services/transitions.js | unit/transition; api/tickets; e2e |
| RF12 fechar com comentário | transitions.js | unit/transition; api/tickets |
| RF13 relatório | ticket-service.js (summary) | api/reports; unit/ticket-service |
| RF14 estado vazio | summary; public/app.js | api/reports; unit/ticket-service |
| RF15 contrato de erro | middlewares/error-handler.js | api/security; api/sessions |
| RNF01 desempenho | – | api/performance |
| RNF02/03 responsivo, acessível | public/ | unit/html-accessibility (+ manual) |
| RNF04 senha com hash, segredos fora do repo | services/password.js, config.js, .gitignore | unit/password-token; integration/config |
| RNF05 erro seguro | error-handler.js | api/security |
| RNF06 cobertura ≥ 70% | jest.config.js | `npm run test:coverage` |
| RNF07 logs estruturados | logger.js, request-logger.js | unit/logger; api/security |
| RNF08 CI | .github/workflows/quality.yml | execução no GitHub Actions |
