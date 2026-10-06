'use strict';

/**
 * Dados de demonstração 100% fictícios (Passo 34).
 * 5 usuários, 12 chamados: 3 abertos, 3 em análise, 3 em atendimento, 2 resolvidos e 1 fechado.
 * Há chamados críticos e combinações de filtro sem resultado (ex.: fechado + crítica) para testar o estado vazio.
 */
const DEMO_PASSWORD = 'Senha@123';

const DEMO_USERS = [
  { id: 'u_admin', name: 'Ana Administradora', email: 'admin@exemplo.local', role: 'admin' },
  { id: 'u_tech', name: 'Rafael Técnico', email: 'tecnico@exemplo.local', role: 'technician' },
  { id: 'u_tech2', name: 'Sofia Técnica', email: 'tecnico2@exemplo.local', role: 'technician' },
  { id: 'u_lia', name: 'Lia Solicitante', email: 'lia@exemplo.local', role: 'requester' },
  { id: 'u_marcos', name: 'Marcos Solicitante', email: 'marcos@exemplo.local', role: 'requester' },
];

const FLOW = ['open', 'analysis', 'in_progress', 'resolved', 'closed'];

// [id, status, prioridade, solicitante, responsável, título, descrição]
const DEMO_TICKETS = [
  ['t_001', 'open', 'critical', 'u_lia', null, 'Servidor de arquivos fora do ar', 'Ninguém consegue acessar a pasta compartilhada da secretaria desde as 8h da manhã.'],
  ['t_002', 'open', 'medium', 'u_marcos', null, 'Impressora da biblioteca sem toner', 'A impressora principal da biblioteca mostra aviso de toner vazio e imprime páginas em branco.'],
  ['t_003', 'open', 'low', 'u_lia', null, 'Instalação de editor de código', 'Preciso do editor de código instalado nos computadores do laboratório 3 para a aula.'],
  ['t_004', 'analysis', 'high', 'u_lia', 'u_tech', 'Wi-Fi instável na sala 12', 'A conexão cai a cada poucos minutos durante as aulas na sala 12, afetando a turma inteira.'],
  ['t_005', 'analysis', 'medium', 'u_marcos', 'u_tech', 'Projetor com imagem amarelada', 'O projetor da sala 5 exibe a imagem com tom amarelado e as cores ficam distorcidas.'],
  ['t_006', 'analysis', 'low', 'u_lia', 'u_tech2', 'Mouse do laboratório com defeito', 'O mouse da bancada 7 do laboratório 2 falha ao clicar e precisa ser substituído.'],
  ['t_007', 'in_progress', 'critical', 'u_marcos', 'u_tech', 'Sistema de notas não carrega', 'Ao entrar no sistema de notas a página fica em branco e os professores não conseguem lançar notas.'],
  ['t_008', 'in_progress', 'high', 'u_lia', 'u_tech', 'Recuperar acesso ao e-mail institucional', 'Não consigo acessar meu e-mail institucional e o link de recuperação de senha não chega.'],
  ['t_009', 'in_progress', 'medium', 'u_lia', 'u_tech2', 'Computador lento na secretaria', 'O computador da secretaria demora mais de cinco minutos para iniciar e trava os programas.'],
  ['t_010', 'resolved', 'high', 'u_marcos', 'u_tech', 'Catraca da entrada não libera', 'A catraca da entrada principal não reconhece o crachá de vários alunos desde ontem.'],
  ['t_011', 'resolved', 'low', 'u_lia', 'u_tech2', 'Corrigir nome no cadastro', 'Meu nome aparece com erro de digitação no cadastro e preciso que seja corrigido.'],
  ['t_012', 'closed', 'low', 'u_marcos', 'u_tech', 'Cabo de rede solto no laboratório', 'Um cabo de rede estava solto na bancada 4 e o computador ficava sem acesso à internet.'],
];

/** Grava direto no armazenamento (equivale a um script SQL de seed). Síncrono e determinístico. */
function seedDemo({ store, passwords, clock }) {
  const passwordHash = passwords.hashSync(DEMO_PASSWORD);
  for (const user of DEMO_USERS) store.users.set(user.id, { ...user, passwordHash, active: true });

  const base = clock.now();
  const DAY = 24 * 60 * 60 * 1000;
  let seq = 0;
  const nextId = (prefix) => `${prefix}_${String(++seq).padStart(3, '0')}`;

  DEMO_TICKETS.forEach(([id, status, priority, requesterId, assigneeId, title, description], index) => {
    const createdMs = base - (DEMO_TICKETS.length - index) * DAY;
    const iso = (offsetHours) => new Date(createdMs + offsetHours * 60 * 60 * 1000).toISOString();

    store.tickets.set(id, {
      id, title, description, priority, status, requesterId, assigneeId,
      createdAt: iso(0),
      updatedAt: iso(FLOW.indexOf(status) + 1),
      deletedAt: null,
    });
    store.history.push({ id: nextId('h'), ticketId: id, actorId: requesterId, event: 'ticket.created', before: null, after: 'open', createdAt: iso(0) });

    for (let step = 1; step <= FLOW.indexOf(status); step += 1) {
      store.history.push({
        id: nextId('h'), ticketId: id, actorId: assigneeId, event: 'ticket.status.changed',
        before: FLOW[step - 1], after: FLOW[step], createdAt: iso(step),
      });
    }
    if (status === 'resolved' || status === 'closed') {
      store.comments.push({
        id: nextId('c'), ticketId: id, authorId: assigneeId,
        body: 'Problema corrigido e validado com o solicitante.', createdAt: iso(3),
      });
    }
  });
}

module.exports = { seedDemo, DEMO_USERS, DEMO_TICKETS, DEMO_PASSWORD };
