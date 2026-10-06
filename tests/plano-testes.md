# Plano de testes: HelpDesk BQ 1.0.0-rc1

**Objetivo:** apoiar a decisão de release (aprovado, com restrições ou reprovado) com evidência automatizada reproduzível.
**Escopo:** RF01–RF15 e RNF01–RNF08 do MVP. Fora: chat, anexos, notificações, integrações externas.
**Ambiente:** Node 22+, Jest 30, banco em memória recriado a cada caso, relógio falso. Comando único: `npm test`.
**Critérios:** entrada = `npm ci` ok; saída = 100% dos testes críticos passando, cobertura ≥ 70%, lint sem erros.

## Riscos (probabilidade × impacto)

| Risco | P | I | Nível | Testes |
|---|---|---|---|---|
| Quebra de permissão / IDOR | 3 | 5 | 15 crítico | tests/api/tickets, security, unit/policy |
| Histórico incompleto | 3 | 4 | 12 alto | unit/ticket-service, integration/persistence |
| Bloqueio de login incorreto | 3 | 4 | 12 alto | unit/auth-service, api/sessions |
| Filtro incorreto | 3 | 3 | 9 médio | api/tickets (filtros), unit/ticket-service |
| Layout em 360 px | 2 | 3 | 6 médio | unit/html-accessibility (estático); manual no navegador |
| Cor de ícone | 2 | 1 | 2 baixo | exploratório |

## Técnicas

Partição de equivalência e valor-limite (título 9/10/100/101, descrição 29/30, comentário 0/1/1000/1001, tentativas 0–3), tabela de decisão de permissões (R1–R6), transição de estados (todas as permitidas e proibidas), API, integração com verificação de efeito persistido, segurança (IDOR, injeção, enumeração, token adulterado), desempenho (20 usuários virtuais, p95 ≤ 800 ms, erros < 1%) e E2E.

## Limitações conhecidas

Acessibilidade e responsividade visual completas exigem verificação manual (teclado, leitor de tela, 360/768/1366 px, Chrome/Firefox/Edge) e axe/Lighthouse, que não rodam no `npm test`. O teste de desempenho é de processo único com banco em memória, não representa produção. Não há rate limit por IP (somente bloqueio por conta).
