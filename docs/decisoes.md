# Decisões de requisito e arquitetura (Passo 12)

| Dúvida da apostila | Decisão adotada |
|---|---|
| Quanto dura o bloqueio? | 10 min a partir da terceira falha; o prazo não é reiniciado por tentativas durante o bloqueio. |
| Quem vê cada chamado? | Solicitante: os seus. Técnico: os seus + fila (sem responsável ou atribuídos a ele). Admin: todos. |
| Pode reabrir um fechado? | Não no MVP (fechado é estado final). Reabrir `resolved → in_progress` é permitido com justificativa. |
| O que é exclusão? | Lógica (`deletedAt`), só admin, com justificativa e registro em auditoria. |
| Quem vira responsável? | Técnico que move `open → analysis` assume o chamado; admin atribui a qualquer técnico ativo. |
| Resolver/fechar exige comentário? | Sim, ambos (cobre RF12 para chamados críticos e para os demais). |
| Persistência | Memória no MVP, atrás de repositórios; unidade de trabalho com rollback simula transação. |
| Hash de senha / token | `scrypt` e HMAC-SHA256 do módulo `crypto` do Node (nada de criptografia própria). |
| Mensagens de erro de login | Genéricas; e-mail inexistente também conta tentativas, evitando enumeração. |

Ambientes: `development`, `test` (isolado e recriável, relógio falso) e `demo` (seed estável). `production` é simulado e exige `SESSION_SECRET`.
