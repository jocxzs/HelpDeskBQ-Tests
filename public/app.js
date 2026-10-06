'use strict';

(function () {
  const STATUS = { open: 'Aberto', analysis: 'Em análise', in_progress: 'Em atendimento', resolved: 'Resolvido', closed: 'Fechado' };
  const PRIORITY = { low: 'Baixa', medium: 'Média', high: 'Alta', critical: 'Crítica' };
  const ROLE = { requester: 'Solicitante', technician: 'Técnico', admin: 'Administrador' };
  const EVENT = {
    'ticket.created': 'Chamado criado',
    'ticket.status.changed': 'Status alterado',
    'ticket.priority.changed': 'Prioridade alterada',
    'ticket.assignee.changed': 'Responsável alterado',
    'ticket.deleted': 'Chamado excluído',
  };

  const appEl = document.getElementById('app');
  const navEl = document.getElementById('nav');
  const liveEl = document.getElementById('live');

  const session = { token: null, user: null };
  let pendingNotice = null;
  let renderId = 0;
  let uid = 0;

  try {
    const saved = JSON.parse(sessionStorage.getItem('hdbq.session') || 'null');
    if (saved && saved.token && saved.user) Object.assign(session, saved);
  } catch {
    /* armazenamento indisponível: a sessão vale só nesta página */
  }

  function saveSession() {
    try {
      if (session.token) sessionStorage.setItem('hdbq.session', JSON.stringify(session));
      else sessionStorage.removeItem('hdbq.session');
    } catch {
      /* ignorado */
    }
  }

  /* ---------- utilidades de DOM ---------- */

  function h(tag, attrs, ...children) {
    const el = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs || {})) {
      if (value === false || value == null) continue;
      if (key === 'class') el.className = value;
      else if (key.startsWith('on')) el.addEventListener(key.slice(2), value);
      else el.setAttribute(key, value === true ? '' : value);
    }
    for (const child of children.flat()) {
      if (child == null || child === false) continue;
      el.append(child.nodeType ? child : document.createTextNode(String(child)));
    }
    return el;
  }

  const formatDate = (iso) => (iso ? new Date(iso).toLocaleString('pt-BR') : '');
  const statusBadge = (s) => h('span', { class: `badge s-${s}` }, STATUS[s] || s);
  const priorityBadge = (p) => h('span', { class: `badge p-${p}` }, PRIORITY[p] || p);

  function announce(message) {
    liveEl.textContent = '';
    setTimeout(() => { liveEl.textContent = message; }, 20);
  }

  function option(value, label, selected) {
    return h('option', { value, selected: selected ? true : false }, label);
  }

  function select(items, { blank, current } = {}) {
    const el = h('select', {});
    if (blank) el.append(option('', blank, !current));
    for (const [value, label] of items) el.append(option(value, label, value === current));
    return el;
  }

  function makeField(name, labelText, control, hint) {
    const id = `f-${name}-${++uid}`;
    control.id = id;
    control.name = name;
    const errorEl = h('p', { class: 'error', id: `${id}-err`, hidden: true });
    control.setAttribute('aria-describedby', [hint ? `${id}-hint` : null, `${id}-err`].filter(Boolean).join(' '));
    const wrap = h('div', { class: 'field' },
      h('label', { for: id }, labelText),
      hint ? h('p', { class: 'hint', id: `${id}-hint` }, hint) : null,
      control,
      errorEl);
    wrap.control = control;
    wrap.setError = (message) => {
      errorEl.textContent = message || '';
      errorEl.hidden = !message;
      if (message) control.setAttribute('aria-invalid', 'true');
      else control.removeAttribute('aria-invalid');
    };
    return wrap;
  }

  function makeForm(onSubmit) {
    const summary = h('div', { class: 'alert', role: 'alert', tabindex: '-1', hidden: true });
    const form = h('form', { novalidate: true });
    form.fields = {};
    form.summary = summary;
    form.addField = (name, labelText, control, hint) => {
      const field = makeField(name, labelText, control, hint);
      form.fields[name] = field;
      form.append(field);
      return field;
    };
    form.showError = (message, focus = true) => {
      summary.textContent = message;
      summary.hidden = false;
      if (focus) summary.focus();
    };
    form.clearErrors = () => {
      summary.hidden = true;
      summary.textContent = '';
      Object.values(form.fields).forEach((f) => f.setError(''));
    };
    form.showApiError = (error) => {
      let first = null;
      for (const detail of error.details || []) {
        const field = form.fields[detail.field];
        if (field) {
          field.setError(detail.message);
          first = first || field;
        }
      }
      form.showError(describeError(error), !first);
      if (first) first.control.focus();
    };
    form.submitButton = (label) => {
      const button = h('button', { class: 'btn', type: 'submit' }, label);
      form.button = button;
      form.append(button);
      return button;
    };
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      form.clearErrors();
      form.button.disabled = true;
      form.setAttribute('aria-busy', 'true');
      try {
        await onSubmit(form);
      } catch (error) {
        handleError(error, form);
      } finally {
        form.button.disabled = false;
        form.removeAttribute('aria-busy');
      }
    });
    form.prepend(summary);
    return form;
  }

  /* ---------- API ---------- */

  async function api(path, { method = 'GET', body } = {}) {
    let response;
    try {
      response = await fetch(`/api${path}`, {
        method,
        headers: { 'Content-Type': 'application/json', ...(session.token ? { Authorization: `Bearer ${session.token}` } : {}) },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch {
      throw Object.assign(new Error('Verifique sua conexão e tente novamente.'), { network: true });
    }
    let payload = null;
    try { payload = await response.json(); } catch { payload = null; }
    if (!response.ok) {
      const info = (payload && payload.error) || {};
      throw Object.assign(new Error(info.message || 'Não foi possível concluir a ação.'), {
        status: response.status, code: info.code, details: info.details, correlationId: info.correlationId,
      });
    }
    return payload;
  }

  function describeError(error) {
    const support = error.correlationId ? ` Código de suporte: ${error.correlationId}` : '';
    return `${error.message}${support}`;
  }

  function handleError(error, form) {
    if (error.status === 401 && session.token && error.code === 'UNAUTHENTICATED') {
      endSession('Sua sessão expirou. Entre novamente.');
      return;
    }
    if (form) form.showApiError(error);
    else appEl.replaceChildren(h('div', { class: 'alert', role: 'alert' }, describeError(error)));
  }

  function endSession(notice) {
    session.token = null;
    session.user = null;
    saveSession();
    pendingNotice = notice || null;
    if (location.hash === '#/login') route();
    else location.hash = '#/login';
  }

  /* ---------- roteamento ---------- */

  function parseHash() {
    const raw = (location.hash || '#/tickets').slice(1);
    const [path, query = ''] = raw.split('?');
    return { path, params: new URLSearchParams(query) };
  }

  function buildHash(path, params) {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params || {})) if (value) query.set(key, value);
    const text = query.toString();
    return `#${path}${text ? `?${text}` : ''}`;
  }

  function renderNav(path) {
    navEl.replaceChildren();
    if (!session.user) return;
    const link = (href, label, active) => h('a', { href, 'aria-current': active ? 'page' : false }, label);
    navEl.append(
      link('#/tickets', 'Chamados', path === '/tickets' || /^\/tickets\/(?!new)/.test(path)),
      link('#/tickets/new', 'Novo chamado', path === '/tickets/new'),
      link('#/report', 'Relatório', path === '/report'),
      h('span', { class: 'who' }, `${session.user.name} · ${ROLE[session.user.role]}`),
      h('button', { type: 'button', onclick: () => endSession('Você saiu do sistema.') }, 'Sair'),
    );
  }

  function startView(title, id) {
    document.title = `${title} · HelpDesk BQ`;
    const heading = h('h1', { tabindex: '-1' }, title);
    appEl.replaceChildren(heading);
    if (pendingNotice) {
      appEl.append(h('div', { class: 'notice', role: 'status' }, pendingNotice));
      announce(pendingNotice);
      pendingNotice = null;
    }
    heading.focus();
    return { alive: () => id === renderId, add: (...nodes) => appEl.append(...nodes) };
  }

  async function route() {
    const id = ++renderId;
    const { path, params } = parseHash();
    renderNav(path);

    if (!session.user && path !== '/login') { location.hash = '#/login'; return; }
    if (session.user && path === '/login') { location.hash = '#/tickets'; return; }

    try {
      if (path === '/login') viewLogin(id);
      else if (path === '/tickets') await viewList(id, params);
      else if (path === '/tickets/new') viewNew(id);
      else if (path === '/report') await viewReport(id, params);
      else if (/^\/tickets\/[^/]+$/.test(path)) await viewDetail(id, decodeURIComponent(path.split('/')[2]));
      else { const v = startView('Página não encontrada', id); v.add(h('p', {}, 'O endereço não existe.'), h('a', { href: '#/tickets' }, 'Ir para os chamados')); }
    } catch (error) {
      if (id === renderId) handleError(error);
    }
  }

  /* ---------- telas ---------- */

  function viewLogin(id) {
    const view = startView('Entrar', id);
    const form = makeForm(async (f) => {
      const email = f.fields.email.control.value.trim();
      const password = f.fields.password.control.value;
      let invalid = false;
      if (!email) { f.fields.email.setError('Informe o e-mail.'); invalid = true; }
      if (!password) { f.fields.password.setError('Informe a senha.'); invalid = true; }
      if (invalid) { f.querySelector('[aria-invalid="true"]').focus(); return; }
      const { data } = await api('/sessions', { method: 'POST', body: { email, password } });
      session.token = data.token;
      session.user = data.user;
      saveSession();
      pendingNotice = `Bem-vindo, ${data.user.name}.`;
      location.hash = '#/tickets';
    });
    form.addField('email', 'E-mail', h('input', { type: 'email', autocomplete: 'username', required: false }));
    form.addField('password', 'Senha', h('input', { type: 'password', autocomplete: 'current-password' }));
    form.submitButton('Entrar');
    view.add(h('div', { class: 'card stack' }, h('p', {}, 'Acesse com a conta fornecida pela equipe de suporte.'), form));
    view.add(h('details', {},
      h('summary', {}, 'Contas de demonstração'),
      h('p', {}, 'Senha de todas: Senha@123'),
      h('ul', { class: 'plain' },
        ['lia@exemplo.local (solicitante)', 'marcos@exemplo.local (solicitante)', 'tecnico@exemplo.local (técnico)',
          'tecnico2@exemplo.local (técnico)', 'admin@exemplo.local (administrador)'].map((t) => h('li', {}, t)))));
  }

  function filterForm(params, path, extra) {
    const form = h('form', { class: 'row', novalidate: true });
    const statusSel = select(Object.entries(STATUS), { blank: 'Todos', current: params.get('status') || '' });
    const prioritySel = select(Object.entries(PRIORITY), { blank: 'Todas', current: params.get('priority') || '' });
    form.append(
      makeField('status', 'Status', statusSel),
      makeField('priority', 'Prioridade', prioritySel),
      h('div', { class: 'field' }, h('button', { class: 'btn', type: 'submit' }, 'Aplicar filtros')),
      h('div', { class: 'field' }, h('a', { class: 'btn secondary', href: `#${path}` }, 'Limpar filtros')),
    );
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      location.hash = buildHash(path, { status: statusSel.value, priority: prioritySel.value, ...(extra || {}) });
    });
    return form;
  }

  async function viewList(id, params) {
    const view = startView('Chamados', id);
    view.add(filterForm(params, '/tickets'));
    const holder = h('div', { 'aria-live': 'polite' }, h('p', {}, 'Carregando chamados…'));
    view.add(holder);

    const page = Number(params.get('page')) || 1;
    const query = new URLSearchParams({ page: String(page) });
    ['status', 'priority'].forEach((k) => params.get(k) && query.set(k, params.get(k)));
    const { data, meta } = await api(`/tickets?${query}`);
    if (!view.alive()) return;

    if (data.length === 0) {
      const filtered = params.get('status') || params.get('priority');
      holder.replaceChildren(h('div', { class: 'empty' },
        h('p', {}, filtered ? 'Nenhum chamado corresponde aos filtros escolhidos.' : 'Você ainda não tem chamados na sua lista.'),
        h('div', { class: 'row' },
          h('a', { class: 'btn', href: '#/tickets/new' }, 'Abrir novo chamado'),
          filtered ? h('a', { class: 'btn secondary', href: '#/tickets' }, 'Limpar filtros') : null)));
      return;
    }

    const showRequester = session.user.role !== 'requester';
    const table = h('table', { class: 'responsive' },
      h('caption', {}, `${meta.total} chamado(s) · página ${meta.page} de ${meta.totalPages}`),
      h('thead', {}, h('tr', {},
        h('th', { scope: 'col' }, 'Título'), h('th', { scope: 'col' }, 'Status'), h('th', { scope: 'col' }, 'Prioridade'),
        showRequester ? h('th', { scope: 'col' }, 'Solicitante') : null,
        h('th', { scope: 'col' }, 'Responsável'), h('th', { scope: 'col' }, 'Aberto em'))),
      h('tbody', {}, data.map((t) => h('tr', {},
        h('td', { class: 'primary', 'data-label': 'Título' }, h('a', { href: `#/tickets/${encodeURIComponent(t.id)}` }, t.title)),
        h('td', { 'data-label': 'Status' }, statusBadge(t.status)),
        h('td', { 'data-label': 'Prioridade' }, priorityBadge(t.priority)),
        showRequester ? h('td', { 'data-label': 'Solicitante' }, t.requesterName || '—') : null,
        h('td', { 'data-label': 'Responsável' }, t.assigneeName || 'Sem responsável'),
        h('td', { 'data-label': 'Aberto em' }, formatDate(t.createdAt))))));

    const pageLink = (target, label) => h('a', { class: 'btn secondary', href: buildHash('/tickets', { status: params.get('status'), priority: params.get('priority'), page: String(target) }) }, label);
    holder.replaceChildren(table, h('nav', { class: 'pager', 'aria-label': 'Paginação' },
      meta.page > 1 ? pageLink(meta.page - 1, 'Página anterior') : null,
      h('span', {}, `Página ${meta.page} de ${meta.totalPages}`),
      meta.page < meta.totalPages ? pageLink(meta.page + 1, 'Próxima página') : null));
  }

  function viewNew(id) {
    const view = startView('Novo chamado', id);
    const form = makeForm(async (f) => {
      const body = {
        title: f.fields.title.control.value.trim(),
        description: f.fields.description.control.value.trim(),
        priority: f.fields.priority.control.value,
      };
      let first = null;
      const fail = (name, message) => { f.fields[name].setError(message); first = first || f.fields[name]; };
      if (body.title.length < 10 || body.title.length > 100) fail('title', 'O título deve ter de 10 a 100 caracteres.');
      if (body.description.length < 30) fail('description', 'A descrição deve ter pelo menos 30 caracteres.');
      if (!body.priority) fail('priority', 'Escolha a prioridade.');
      if (first) { first.control.focus(); return; }
      const { data } = await api('/tickets', { method: 'POST', body });
      pendingNotice = 'Chamado criado com sucesso.';
      location.hash = `#/tickets/${encodeURIComponent(data.id)}`;
    });
    form.addField('title', 'Título', h('input', { type: 'text', maxlength: '100', autocomplete: 'off' }), 'De 10 a 100 caracteres. Resuma o problema.');
    form.addField('description', 'Descrição', h('textarea', { maxlength: '5000' }), 'Pelo menos 30 caracteres. Conte o que aconteceu e o que você esperava.');
    form.addField('priority', 'Prioridade', select(Object.entries(PRIORITY), { blank: 'Escolha…' }));
    form.submitButton('Criar chamado');
    view.add(h('div', { class: 'card' }, form));
  }

  function historyText(entry) {
    const label = EVENT[entry.event] || entry.event;
    const show = (value, map) => (value == null ? '—' : map ? map[value] || value : value);
    if (entry.event === 'ticket.status.changed') return `${label}: ${show(entry.before, STATUS)} → ${show(entry.after, STATUS)}`;
    if (entry.event === 'ticket.priority.changed') return `${label}: ${show(entry.before, PRIORITY)} → ${show(entry.after, PRIORITY)}`;
    if (entry.event === 'ticket.assignee.changed') return `${label}: ${entry.beforeName || 'Sem responsável'} → ${entry.afterName || '—'}`;
    return label;
  }

  async function viewDetail(id, ticketId) {
    const view = startView('Detalhe do chamado', id);
    const holder = h('div', { class: 'stack' }, h('p', {}, 'Carregando chamado…'));
    view.add(holder);

    const { data } = await api(`/tickets/${encodeURIComponent(ticketId)}`);
    if (!view.alive()) return;
    const { ticket, permissions } = data;
    const reload = (message) => { pendingNotice = message; renderId += 1; viewDetail(renderId, ticketId).catch((e) => handleError(e)); };
    const send = (path, method, body, message) => async () => { await api(path, { method, body }); reload(message); };
    const base = `/tickets/${encodeURIComponent(ticketId)}`;

    const facts = h('dl', { class: 'facts' },
      h('dt', {}, 'Título'), h('dd', {}, ticket.title),
      h('dt', {}, 'Status'), h('dd', {}, statusBadge(ticket.status)),
      h('dt', {}, 'Prioridade'), h('dd', {}, priorityBadge(ticket.priority)),
      h('dt', {}, 'Solicitante'), h('dd', {}, ticket.requesterName || '—'),
      h('dt', {}, 'Responsável'), h('dd', {}, ticket.assigneeName || 'Sem responsável'),
      h('dt', {}, 'Aberto em'), h('dd', {}, formatDate(ticket.createdAt)),
      h('dt', {}, 'Atualizado em'), h('dd', {}, formatDate(ticket.updatedAt)),
      h('dt', {}, 'Descrição'), h('dd', {}, ticket.description));

    const sections = [h('p', {}, h('a', { href: '#/tickets' }, 'Voltar para a lista')), h('div', { class: 'card' }, facts)];

    const actions = [];
    if (permissions.canChangeStatus) {
      const next = select(data.allowedTransitions.map((s) => [s, STATUS[s]]));
      const form = makeForm(async (f) => {
        const comment = f.fields.comment.control.value.trim();
        await send(`${base}/status`, 'PATCH', { status: f.fields.status.control.value, ...(comment ? { comment } : {}) }, 'Status atualizado.')();
      });
      form.addField('status', 'Novo status', next);
      form.addField('comment', 'Comentário', h('textarea', { maxlength: '1000' }), 'Obrigatório ao resolver, fechar ou reabrir o chamado. Até 1000 caracteres.');
      form.submitButton('Atualizar status');
      actions.push(h('section', { class: 'card', 'aria-labelledby': 'h-status' }, h('h2', { id: 'h-status' }, 'Atualizar status'), form));
    }
    if (permissions.canChangePriority) {
      const form = makeForm(async (f) => {
        await send(`${base}/priority`, 'PATCH', { priority: f.fields.priority.control.value }, 'Prioridade atualizada.')();
      });
      form.addField('priority', 'Prioridade', select(Object.entries(PRIORITY), { current: ticket.priority }));
      form.submitButton('Alterar prioridade');
      actions.push(h('section', { class: 'card', 'aria-labelledby': 'h-priority' }, h('h2', { id: 'h-priority' }, 'Prioridade'), form));
    }
    if (permissions.canAssignSelf) {
      const form = makeForm(async () => { await send(`${base}/assignee`, 'PATCH', { assigneeId: session.user.id }, 'Você assumiu o chamado.')(); });
      form.submitButton('Assumir chamado');
      actions.push(h('section', { class: 'card', 'aria-labelledby': 'h-self' }, h('h2', { id: 'h-self' }, 'Responsável'), form));
    }
    if (permissions.canAssignOthers) {
      const holderAssign = h('section', { class: 'card', 'aria-labelledby': 'h-assign' }, h('h2', { id: 'h-assign' }, 'Responsável'));
      actions.push(holderAssign);
      api('/technicians').then(({ data: techs }) => {
        const form = makeForm(async (f) => {
          await send(`${base}/assignee`, 'PATCH', { assigneeId: f.fields.assigneeId.control.value }, 'Responsável atualizado.')();
        });
        form.addField('assigneeId', 'Técnico responsável', select(techs.map((t) => [t.id, t.name]), { current: ticket.assigneeId }));
        form.submitButton('Atribuir');
        holderAssign.append(form);
      }).catch((e) => handleError(e));
    }
    if (permissions.canDelete) {
      const form = makeForm(async (f) => {
        await api(base, { method: 'DELETE', body: { justification: f.fields.justification.control.value.trim() } });
        pendingNotice = 'Chamado excluído.';
        location.hash = '#/tickets';
      });
      form.addField('justification', 'Justificativa da exclusão', h('textarea', { maxlength: '500' }), 'De 10 a 500 caracteres. A ação fica registrada na auditoria.');
      form.submitButton('Excluir chamado');
      form.button.classList.add('danger');
      actions.push(h('section', { class: 'card', 'aria-labelledby': 'h-delete' }, h('h2', { id: 'h-delete' }, 'Exclusão (administrador)'), form));
    }
    if (actions.length) sections.push(h('div', { class: 'stack' }, h('h2', {}, 'Ações'), ...actions));

    sections.push(h('section', { 'aria-labelledby': 'h-history' }, h('h2', { id: 'h-history' }, 'Histórico'),
      h('ol', { class: 'timeline' }, data.history.map((entry) => h('li', {},
        h('div', {}, historyText(entry)),
        h('div', { class: 'meta' }, `${entry.actorName || 'Sistema'} · ${formatDate(entry.createdAt)}`))))));

    const commentList = data.comments.length === 0
      ? h('p', {}, 'Nenhum comentário ainda.')
      : h('ul', { class: 'plain' }, data.comments.map((c) => h('li', {},
        h('div', {}, c.body), h('div', { class: 'meta' }, `${c.authorName || 'Usuário'} · ${formatDate(c.createdAt)}`))));
    const commentSection = h('section', { 'aria-labelledby': 'h-comments' }, h('h2', { id: 'h-comments' }, 'Comentários'), commentList);
    if (permissions.canComment) {
      const form = makeForm(async (f) => {
        const body = f.fields.body.control.value.trim();
        if (!body) { f.fields.body.setError('Escreva o comentário.'); f.fields.body.control.focus(); return; }
        await send(`${base}/comments`, 'POST', { body }, 'Comentário adicionado.')();
      });
      form.addField('body', 'Novo comentário', h('textarea', { maxlength: '1000' }), 'Até 1000 caracteres.');
      form.submitButton('Comentar');
      commentSection.append(h('div', { class: 'card' }, form));
    }
    sections.push(commentSection);

    holder.replaceChildren(...sections);
  }

  async function viewReport(id, params) {
    const view = startView('Relatório', id);
    view.add(filterForm(params, '/report'));
    const query = new URLSearchParams();
    ['status', 'priority'].forEach((k) => params.get(k) && query.set(k, params.get(k)));
    const { data } = await api(`/reports/summary?${query}`);
    if (!view.alive()) return;

    if (data.empty) {
      view.add(h('div', { class: 'empty' }, h('p', {}, data.message),
        h('div', { class: 'row' },
          h('a', { class: 'btn', href: '#/tickets/new' }, 'Abrir novo chamado'),
          h('a', { class: 'btn secondary', href: '#/report' }, 'Limpar filtros'))));
      return;
    }
    const table = (caption, labels, values) => h('table', {},
      h('caption', {}, caption),
      h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, 'Categoria'), h('th', { scope: 'col' }, 'Quantidade'))),
      h('tbody', {}, Object.entries(labels).map(([key, label]) => h('tr', {}, h('th', { scope: 'row' }, label), h('td', {}, String(values[key]))))));
    view.add(h('p', {}, h('strong', {}, `Total: ${data.total} chamado(s)`)),
      h('div', { class: 'counts' }, table('Por status', STATUS, data.byStatus), table('Por prioridade', PRIORITY, data.byPriority)));
  }

  window.addEventListener('hashchange', route);
  route();
})();
