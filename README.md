# HelpDesk BQ

MVP da **Operação Software Confiável** (ETEC Bento Quirino, Qualidade e Teste de Software).
Plataforma de chamados com login e bloqueio temporário, abertura, filtros, comentários, mudança de status/prioridade, permissões por papel, histórico auditável e relatório.

Stack: Node.js 22+ · Express · Zod · Jest + Supertest · ESLint. Banco em memória (camada de repositório substituível por PostgreSQL/Supabase).

## Executar

```bash
npm ci
cp .env.example .env     # opcional em desenvolvimento
npm start                # http://localhost:3000
```

Modo desenvolvimento com recarga: `npm run dev`.

### Contas de demonstração (senha de todas: `Senha@123`)

| E-mail | Papel |
|---|---|
| lia@exemplo.local, marcos@exemplo.local | Solicitante |
| tecnico@exemplo.local, tecnico2@exemplo.local | Técnico |
| admin@exemplo.local | Administrador |

O seed cria 12 chamados fictícios: 3 abertos, 3 em análise, 3 em atendimento, 2 resolvidos e 1 fechado.
Os dados ficam em memória: reiniciar o servidor (`Ctrl+C` e `npm start`) restaura o seed (reset).

## Testes

```bash
npm test                 # toda a suíte (222 testes)
npm run test:coverage    # com cobertura (limite: 70% de linhas, RNF06)
npm run test:watch       # feedback contínuo
npm run lint
```

Não precisa de banco, rede nem `.env`: cada teste cria uma aplicação nova, com banco em memória e relógio falso.

| Pasta | Conteúdo |
|---|---|
| `tests/unit` | Transições, validação (equivalência e valor-limite), permissões, hash, token, login/bloqueio, serviço de chamados, logger, HTML acessível |
| `tests/api` | Contrato HTTP com Supertest: 401/403/400/404/409/423, segurança, relatório, desempenho (p95 ≤ 800 ms, 20 usuários virtuais) |
| `tests/integration` | Persistência, histórico, rollback transacional, seed, configuração |
| `tests/e2e` | Jornada completa em HTTP real |

## Estrutura

```
src/app.js          Express sem listen (testável)      src/server.js   Inicia a porta
src/routes          Contrato HTTP                      src/controllers HTTP fino
src/services        Regras, permissões, transições     src/repositories Persistência
src/middlewares     auth, correlationId, erros, logs   src/validation  Esquemas Zod
public/             Interface (HTML, CSS, JS)          docs/           Documentação
```

## Regras principais

- **RF02** 3 falhas em 5 min bloqueiam a conta por 10 min (resposta 423; não revela se o e-mail existe).
- **RF04/05** Título 10–100, descrição ≥ 30, prioridade baixa/média/alta/crítica.
- **RF11/12** `open → analysis → in_progress → resolved → closed`; reabrir `resolved → in_progress` exige justificativa; resolver e fechar exigem comentário.
- **RF07** Exclusão lógica só por administrador, com justificativa e auditoria.
- **RF15** Erros: `{ "error": { "code", "message", "correlationId" } }`.

Documentação: [`docs/api.md`](docs/api.md) · [`docs/decisoes.md`](docs/decisoes.md) · [`tests/plano-testes.md`](tests/plano-testes.md) · [`qualidade/rastreabilidade.md`](qualidade/rastreabilidade.md)

Versão: `1.0.0-rc1`
