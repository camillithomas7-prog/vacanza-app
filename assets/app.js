// ============ STATE ============
const state = {
  me: null,
  trip: null,
  members: [],
  expenses: [],
  summary: null,
  route: 'home',
};

const CATS = [
  { id: 'volo',       name: 'Volo',       emoji: '✈️', mode: 'items' },
  { id: 'alloggio',   name: 'Alloggio',   emoji: '🏨', mode: 'equal' },
  { id: 'ristorante', name: 'Ristorante', emoji: '🍽️', mode: 'items' },
  { id: 'bar',        name: 'Bar',        emoji: '🍻', mode: 'items' },
  { id: 'spesa',      name: 'Spesa',      emoji: '🛒', mode: 'equal' },
  { id: 'taxi',       name: 'Taxi',       emoji: '🚕', mode: 'equal' },
  { id: 'noleggio',   name: 'Noleggio',   emoji: '🚗', mode: 'equal' },
  { id: 'carburante', name: 'Carburante', emoji: '⛽', mode: 'equal' },
  { id: 'escursione', name: 'Escursione', emoji: '🏔️', mode: 'equal' },
  { id: 'padel',      name: 'Padel',      emoji: '🎾', mode: 'equal' },
  { id: 'massaggi',   name: 'Massaggi',   emoji: '💆', mode: 'items' },
  { id: 'spiaggia',   name: 'Spiaggia',   emoji: '🏖️', mode: 'equal' },
  { id: 'biglietti',  name: 'Biglietti',  emoji: '🎟️', mode: 'equal' },
  { id: 'shopping',   name: 'Shopping',   emoji: '🛍️', mode: 'items' },
  { id: 'altro',      name: 'Altro',      emoji: '📦', mode: 'equal' },
];
const catBy = (id) => CATS.find(c => c.id === id) || CATS[CATS.length - 1];

// ============ API ============
async function api(action, body) {
  const opts = { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin' };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(`api.php?action=${action}`, opts);
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || `Errore ${r.status}`);
  return data;
}

// ============ UTILS ============
const $ = (sel, root = document) => root.querySelector(sel);
const fmt = (n) => '€' + Number(n || 0).toFixed(2).replace('.', ',');
const initials = (name) => (name || '?').split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();
const avatarColor = (id) => {
  const palette = ['#4f8cff', '#ff5c7a', '#2ecc71', '#ffc857', '#b06bff', '#36d6e6', '#ff8a5b', '#f25fae'];
  return palette[(id - 1) % palette.length];
};
function avatarHTML(member, size) {
  const bg = avatarColor(member.id || 1);
  const s = size ? `width:${size}px;height:${size}px;font-size:${Math.round(size * .4)}px;` : '';
  return `<div class="avatar-circle" style="background:${bg}; ${s}">${initials(member.name)}</div>`;
}
function dateLabel(s) {
  if (!s) return '';
  const d = new Date(s.replace(' ', 'T'));
  if (isNaN(d)) return s;
  const today = new Date();
  const isToday = d.toDateString() === today.toDateString();
  const yest = new Date(); yest.setDate(today.getDate() - 1);
  const isYest = d.toDateString() === yest.toDateString();
  if (isToday) return 'Oggi ' + d.toTimeString().slice(0, 5);
  if (isYest) return 'Ieri ' + d.toTimeString().slice(0, 5);
  return d.toLocaleDateString('it-IT', { day: '2-digit', month: 'short' }) + ' ' + d.toTimeString().slice(0, 5);
}
function toast(msg, isError) {
  let t = $('#toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'toast';
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.className = isError ? 'show error' : 'show';
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.className = '', 2400);
}

// ============ ROUTER ============
function go(route) {
  state.route = route;
  render();
}

// ============ BOOT ============
async function boot() {
  try {
    const { member } = await api('me');
    if (member) {
      state.me = member;
      await loadAll();
      renderShell();
    } else {
      renderLogin();
    }
  } catch (e) {
    renderLogin();
  }
}

async function loadAll() {
  const [m, e, s, t] = await Promise.all([
    api('members'),
    api('expenses'),
    api('summary'),
    api('trip'),
  ]);
  state.members = m.members;
  state.expenses = e.expenses;
  state.summary = s;
  state.trip = t.trip;
}

// ============ LOGIN ============
async function renderLogin() {
  const app = $('#app');
  app.innerHTML = $('#tpl-login').innerHTML;
  const { members } = await api('members_public');
  const { trip } = await api('trip').catch(() => ({ trip: null }));
  if (trip) $('#loginTripName').textContent = trip.name;
  const grid = $('#memberGrid');
  grid.innerHTML = members.map(m => `
    <button class="member-tile" data-id="${m.id}">
      ${avatarHTML(m, 48)}
      <b>${m.name}</b>
    </button>
  `).join('');
  grid.querySelectorAll('.member-tile').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = +btn.dataset.id;
      $('#loginError').textContent = '';
      try {
        const { member } = await api('login', { member_id: id });
        state.me = member;
        await loadAll();
        renderShell();
      } catch (e) {
        $('#loginError').textContent = e.message;
      }
    });
  });
}

// ============ SHELL ============
function renderShell() {
  const app = $('#app');
  app.innerHTML = $('#tpl-shell').innerHTML;
  $('#meAvatar').outerHTML = avatarHTML(state.me, 36);
  $('#topTrip').textContent = state.trip?.name || 'Vacanza';
  $('#topMe').textContent = `Ciao ${state.me.name}`;
  $('#logoutBtn').addEventListener('click', async () => {
    await api('logout', {});
    state.me = null;
    location.reload();
  });
  // Hide "Persone" tab for non-admin (solo Thomas vede i conti di tutti)
  if (!state.me.is_admin) {
    const peopleBtn = document.querySelector('.tabbar button[data-route="people"]');
    if (peopleBtn) peopleBtn.style.display = 'none';
  }
  document.querySelectorAll('.tabbar button').forEach(b => {
    b.addEventListener('click', () => {
      const r = b.dataset.route;
      if (r === 'new') openNewExpense();
      else go(r);
    });
  });
  render();
}

function render() {
  document.querySelectorAll('.tabbar button').forEach(b => {
    b.classList.toggle('active', b.dataset.route === state.route);
  });
  const screen = $('#screen');
  screen.innerHTML = '';
  if (state.route === 'home') screen.appendChild(viewHome());
  else if (state.route === 'expenses') screen.appendChild(viewExpenses());
  else if (state.route === 'people' && state.me.is_admin) screen.appendChild(viewPeople());
  else if (state.route === 'settle') screen.appendChild(viewSettle());
  else if (state.route === 'settings' && state.me.is_admin) screen.appendChild(viewSettings());
  else { state.route = 'home'; screen.appendChild(viewHome()); }
}

// ============ VIEW: HOME ============
function viewHome() {
  const wrap = document.createElement('div');
  const sum = state.summary;
  const meSum = sum.members.find(x => x.id === state.me.id);
  const treasurerId = state.trip?.payer_member_id || 1;
  const isTreasurer = state.me.id === treasurerId;
  const treasurer = sum.members.find(x => x.id === treasurerId) || { name: 'Tesoriere' };

  if (isTreasurer) {
    // ===== TESORIERE: vede il dare/avere di tutti =====
    const totalToCollect = sum.members
      .filter(m => m.id !== state.me.id)
      .reduce((s, m) => s + Math.max(0, m.spent - m.settled_paid), 0);
    const totalCollected = sum.members
      .filter(m => m.id !== state.me.id)
      .reduce((s, m) => s + m.settled_paid, 0);
    const totalToReturn = sum.members
      .filter(m => m.id !== state.me.id)
      .reduce((s, m) => s + Math.max(0, m.settled_paid - m.spent), 0);

    const main = document.createElement('div');
    main.className = 'card';
    main.innerHTML = `
      <h2>Cassa del gruppo</h2>
      <div class="stat-grid">
        <div class="stat"><div class="label">Hai anticipato</div><div class="value">${fmt(meSum.paid)}</div></div>
        <div class="stat good"><div class="label">Acconti incassati</div><div class="value">${fmt(totalCollected)}</div></div>
      </div>
      <div class="stat-grid" style="margin-top:8px">
        <div class="stat ${totalToCollect > 0 ? 'bad' : ''}"><div class="label">Da incassare</div><div class="value">${fmt(totalToCollect)}</div></div>
        ${totalToReturn > 0.01 ? `<div class="stat good"><div class="label">Da restituire</div><div class="value">${fmt(totalToReturn)}</div></div>` : `<div class="stat"><div class="label">Tua quota</div><div class="value">${fmt(meSum.spent)}</div></div>`}
      </div>
      <button class="btn primary full" id="addAccontoBtn" style="margin-top:14px">💰 Registra acconto ricevuto</button>
    `;
    wrap.appendChild(main);
    main.querySelector('#addAccontoBtn').addEventListener('click', () => openAcconto());

    // Estratto conto per persona
    const others = sum.members.filter(m => m.id !== state.me.id);
    const list = document.createElement('div');
    list.className = 'card';
    list.innerHTML = `<h2>Estratto conto</h2>` + others.map(m => {
      const member = state.members.find(x => x.id === m.id) || m;
      const dovuto = m.spent;
      const versato = m.settled_paid;
      const residuo = +(dovuto - versato).toFixed(2);
      const cls = residuo > 0.01 ? 'neg' : residuo < -0.01 ? 'pos' : '';
      const label = residuo > 0.01 ? 'deve darti' : residuo < -0.01 ? 'gli devi' : 'in pari';
      return `
        <div class="member-row" data-mid="${m.id}">
          ${avatarHTML(member, 36)}
          <div class="name">${m.name}<div style="font-size:12px;color:var(--muted);font-weight:400">
            quote ${fmt(dovuto)} · acconti ${fmt(versato)}
          </div></div>
          <div class="balance ${cls}" style="text-align:right">
            <div style="font-size:11px;color:var(--muted);font-weight:500">${label}</div>
            ${fmt(Math.abs(residuo))}
          </div>
        </div>`;
    }).join('');
    list.querySelectorAll('[data-mid]').forEach(r => {
      r.addEventListener('click', () => openMemberStatement(+r.dataset.mid));
    });
    wrap.appendChild(list);
  } else {
    // ===== ALTRI: vedono il proprio conto verso il tesoriere =====
    const dovuto = meSum.spent;
    const versato = meSum.settled_paid;
    const residuo = +(dovuto - versato).toFixed(2);
    const overBudget = meSum.budget > 0 && dovuto > meSum.budget;
    const pct = meSum.budget > 0 ? Math.min(100, (dovuto / meSum.budget) * 100) : 0;

    const main = document.createElement('div');
    main.className = 'card';
    const stateLine = residuo > 0.01
      ? `<div class="stat bad"><div class="label">Devi ancora a ${treasurer.name}</div><div class="value">${fmt(residuo)}</div></div>`
      : residuo < -0.01
        ? `<div class="stat good"><div class="label">${treasurer.name} ti deve</div><div class="value">${fmt(-residuo)}</div></div>`
        : `<div class="stat good"><div class="label">Saldo</div><div class="value">in pari ✓</div></div>`;
    main.innerHTML = `
      <h2>Il tuo conto con ${treasurer.name}</h2>
      <div class="stat-grid">
        <div class="stat"><div class="label">Tue quote</div><div class="value">${fmt(dovuto)}</div></div>
        <div class="stat"><div class="label">Hai versato</div><div class="value">${fmt(versato)}</div></div>
      </div>
      <div style="margin-top:10px">${stateLine}</div>
      ${meSum.budget > 0 ? `
        <div class="budget-bar ${overBudget ? 'over' : ''}" style="margin-top:14px"><div style="width:${pct}%"></div></div>
        <div class="row between"><span class="muted" style="font-size:12px">Budget ${fmt(meSum.budget)}</span><span class="muted" style="font-size:12px">${pct.toFixed(0)}%</span></div>
      ` : `<button class="btn ghost full" id="setBudgetBtn" style="margin-top:14px">Imposta il tuo budget</button>`}
    `;
    wrap.appendChild(main);
    if (!meSum.budget) {
      main.querySelector('#setBudgetBtn').addEventListener('click', () => openMyBudget());
    }
  }

  // Trip header info
  const trip = state.trip;
  if (trip.destination || trip.date_start) {
    const tripInfo = document.createElement('div');
    tripInfo.className = 'card';
    tripInfo.style.padding = '12px 16px';
    tripInfo.innerHTML = `
      <div style="font-size:13px;color:var(--muted)">
        ${trip.destination ? '📍 ' + escapeHtml(trip.destination) : ''}
        ${trip.date_start ? ' · ' + trip.date_start + (trip.date_end ? ' → ' + trip.date_end : '') : ''}
      </div>
      <div style="margin-top:6px;font-size:13px;color:var(--muted)">
        ${state.me.is_admin ? 'Totale gruppo' : 'Tue spese totali'}: <b style="color:var(--text)">${fmt(sum.total_spent)}</b>
      </div>
    `;
    wrap.appendChild(tripInfo);
  }

  // By category
  if (sum.by_category.length) {
    const cat = document.createElement('div');
    cat.className = 'card';
    cat.innerHTML = `<h2>${state.me.is_admin ? 'Per categoria' : 'Le tue spese per categoria'}</h2>` + sum.by_category.map(c => {
      const info = catBy(c.category);
      const pct = sum.total_spent > 0 ? (c.total / sum.total_spent) * 100 : 0;
      return `
        <div class="cat-bar-wrap">
          <div class="cat-bar">
            <div class="ico">${info.emoji}</div>
            <div class="lbl">${info.name}<div class="track"><div class="fill" style="width:${pct}%"></div></div></div>
            <div class="amt">${fmt(c.total)}</div>
          </div>
        </div>`;
    }).join('');
    wrap.appendChild(cat);
  }

  // Recent expenses
  const recent = state.expenses.slice(0, 5);
  if (recent.length) {
    const el = document.createElement('div');
    el.className = 'card';
    el.innerHTML = `<h2>Ultime spese</h2>` + recent.map(e => expenseRowHTML(e)).join('');
    wrap.appendChild(el);
    el.querySelectorAll('[data-exp]').forEach(r => r.addEventListener('click', () => openExpenseDetail(+r.dataset.exp)));
  } else {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.innerHTML = '✨ Nessuna spesa ancora.<br>Tocca il + per aggiungerne una!';
    wrap.appendChild(empty);
  }

  if (state.me.is_admin) {
    const adminBtn = document.createElement('button');
    adminBtn.className = 'btn ghost full';
    adminBtn.textContent = '⚙️  Impostazioni viaggio';
    adminBtn.addEventListener('click', () => go('settings'));
    wrap.appendChild(adminBtn);
  }

  return wrap;
}

function expenseRowHTML(e) {
  const info = catBy(e.category);
  const myShare = (e.shares || []).find(s => s.member_id === state.me.id);
  const yourPart = myShare ? `<span class="your-share">tua quota ${fmt(myShare.amount)}</span>` : '';
  return `
    <div class="expense-row" data-exp="${e.id}">
      <div class="expense-icon">${info.emoji}</div>
      <div class="expense-meta">
        <div class="title">${escapeHtml(e.title)}</div>
        <div class="sub">${dateLabel(e.occurred_at)} · pagato ${e.paid_by_name}</div>
      </div>
      <div class="expense-amount">${fmt(e.total)}${yourPart}</div>
    </div>`;
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ============ VIEW: EXPENSES ============
function viewExpenses() {
  const wrap = document.createElement('div');
  if (!state.expenses.length) {
    wrap.innerHTML = '<div class="empty">Nessuna spesa. Tocca + per aggiungere.</div>';
    return wrap;
  }
  // Group by date label
  const byDay = {};
  state.expenses.forEach(e => {
    const d = (e.occurred_at || '').slice(0, 10);
    (byDay[d] ||= []).push(e);
  });
  for (const day of Object.keys(byDay).sort().reverse()) {
    const card = document.createElement('div');
    card.className = 'card';
    const dayLabel = day ? new Date(day).toLocaleDateString('it-IT', { weekday: 'long', day: '2-digit', month: 'long' }) : 'Data sconosciuta';
    card.innerHTML = `<h2>${dayLabel}</h2>` + byDay[day].map(e => expenseRowHTML(e)).join('');
    card.querySelectorAll('[data-exp]').forEach(r => r.addEventListener('click', () => openExpenseDetail(+r.dataset.exp)));
    wrap.appendChild(card);
  }
  return wrap;
}

// ============ VIEW: PEOPLE ============
function viewPeople() {
  const wrap = document.createElement('div');
  const treasurerId = state.trip?.payer_member_id || 1;
  const card = document.createElement('div');
  card.className = 'card';
  card.innerHTML = `<h2>Estratto conto verso il tesoriere</h2>` + state.summary.members.map(m => {
    const member = state.members.find(x => x.id === m.id) || { id: m.id, name: m.name };
    const isTreas = m.id === treasurerId;
    const dovuto = m.spent;
    const versato = m.settled_paid;
    const residuo = +(dovuto - versato).toFixed(2);
    const cls = isTreas ? '' : (residuo > 0.01 ? 'neg' : residuo < -0.01 ? 'pos' : '');
    const subtitle = isTreas
      ? `ha anticipato ${fmt(m.paid)}`
      : `quote ${fmt(dovuto)} − acconti ${fmt(versato)}`;
    const valueLabel = isTreas
      ? `<div class="balance">tesoriere</div>`
      : residuo > 0.01
        ? `<div class="balance neg"><div style="font-size:11px;font-weight:500">deve</div>${fmt(residuo)}</div>`
        : residuo < -0.01
          ? `<div class="balance pos"><div style="font-size:11px;font-weight:500">avere</div>${fmt(-residuo)}</div>`
          : `<div class="balance" style="color:var(--good)">✓ pari</div>`;
    return `
      <div class="member-row" data-mid="${m.id}">
        ${avatarHTML(member, 36)}
        <div class="name">${m.name}${m.id === state.me.id ? ' <span class="chip" style="font-size:10px">tu</span>' : ''}<div style="font-size:12px;color:var(--muted);font-weight:400">${subtitle}</div></div>
        ${valueLabel}
      </div>`;
  }).join('');
  card.querySelectorAll('[data-mid]').forEach(r => {
    r.addEventListener('click', () => openMemberStatement(+r.dataset.mid));
  });
  wrap.appendChild(card);

  const explain = document.createElement('div');
  explain.className = 'card';
  explain.innerHTML = `
    <h2>Come funziona</h2>
    <div style="font-size:13px;line-height:1.6;color:var(--muted)">
      Il <b style="color:var(--text)">tesoriere</b> paga tutto: voli, alloggio, ristoranti, taxi.<br>
      Ogni persona ha una <b style="color:var(--text)">quota</b> (cosa ha consumato/diviso) e un totale di <b style="color:var(--text)">acconti</b> già versati.<br>
      <b style="color:var(--bad)">Deve</b> = quote − acconti<br>
      Tocca una persona per vedere il dettaglio.
    </div>`;
  wrap.appendChild(explain);
  return wrap;
}

// ============ VIEW: SETTLE (acconti & saldi) ============
function viewSettle() {
  const wrap = document.createElement('div');
  const treasurerId = state.trip?.payer_member_id || 1;
  const treasurerMember = state.members.find(x => x.id === treasurerId);
  const treasurerName = treasurerMember?.name || 'Tesoriere';
  const isAdmin = state.me.is_admin;

  // ============= NON-ADMIN: vista semplificata =============
  if (!isAdmin) {
    const meSum = state.summary.members.find(m => m.id === state.me.id) || { spent: 0, settled_paid: 0 };
    const dovuto = meSum.spent;
    const versato = meSum.settled_paid;
    const residuo = +(dovuto - versato).toFixed(2);

    const head = document.createElement('div');
    head.className = 'card';
    head.innerHTML = `
      <h2>Il tuo saldo verso ${escapeHtml(treasurerName)}</h2>
      <div class="stat-grid">
        <div class="stat"><div class="label">Tue quote</div><div class="value">${fmt(dovuto)}</div></div>
        <div class="stat"><div class="label">Hai versato</div><div class="value">${fmt(versato)}</div></div>
      </div>
      <div style="margin-top:12px">
        ${residuo > 0.01
          ? `<div class="stat bad"><div class="label">Devi ancora</div><div class="value">${fmt(residuo)}</div></div>`
          : residuo < -0.01
            ? `<div class="stat good"><div class="label">${escapeHtml(treasurerName)} ti deve</div><div class="value">${fmt(-residuo)}</div></div>`
            : `<div class="stat good"><div class="label">Saldo</div><div class="value">in pari ✓</div></div>`}
      </div>
      <button class="btn primary full" id="addAcconto" style="margin-top:14px">💰 + Registra un mio acconto</button>
    `;
    head.querySelector('#addAcconto').addEventListener('click', () => openAcconto());
    wrap.appendChild(head);

    const histCard = document.createElement('div');
    histCard.className = 'card';
    histCard.innerHTML = `<h2>I tuoi acconti</h2><div id="settHist"></div>`;
    wrap.appendChild(histCard);
    api('settlements').then(({ settlements }) => {
      const box = histCard.querySelector('#settHist');
      if (!settlements.length) {
        box.innerHTML = '<div class="muted" style="font-size:13px;padding:8px 0">Nessun acconto registrato.</div>';
        return;
      }
      box.innerHTML = settlements.map(s => {
        const p = accontoBy(s.category);
        return `
          <div class="expense-row" data-sid="${s.id}" style="cursor:pointer">
            <div class="expense-icon">${p.emoji}</div>
            <div class="expense-meta">
              <div class="title">→ ${escapeHtml(s.to_name)}<span class="chip" style="margin-left:6px;font-size:10px">${p.name}</span></div>
              <div class="sub">${dateLabel(s.created_at)}${s.note ? ' · ' + escapeHtml(s.note) : ''}</div>
            </div>
            <div class="expense-amount">${fmt(s.amount)}</div>
          </div>`;
      }).join('');
      box.querySelectorAll('[data-sid]').forEach(r => {
        r.addEventListener('click', () => {
          const s = settlements.find(x => x.id === +r.dataset.sid);
          if (s) openSettlementEdit(s);
        });
      });
    });
    return wrap;
  }

  // ============= ADMIN: vista completa =============
  const treasurer = state.summary.members.find(m => m.id === treasurerId) || { name: treasurerName };
  const isTreasurer = state.me.id === treasurerId;

  const addCard = document.createElement('div');
  addCard.className = 'card';
  addCard.innerHTML = `
    <h2>Acconti</h2>
    <p style="margin:0 0 12px;font-size:13px;color:var(--muted)">
      Registra qui i bonifici che ricevi dagli altri o le tue restituzioni.
    </p>
    <button class="btn primary full" id="addAcconto">💰 + Registra acconto</button>
  `;
  addCard.querySelector('#addAcconto').addEventListener('click', () => openAcconto());
  wrap.appendChild(addCard);

  const others = state.summary.members.filter(m => m.id !== treasurerId);
  const debtors = others.filter(m => (m.spent - m.settled_paid) > 0.01);
  const creditors = others.filter(m => (m.settled_paid - m.spent) > 0.01);

  if (debtors.length) {
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `<h2>Da incassare (${debtors.length})</h2>` + debtors.map(m => {
      const member = state.members.find(x => x.id === m.id) || m;
      const residuo = +(m.spent - m.settled_paid).toFixed(2);
      return `
        <div class="settle-card">
          <div class="row gap" style="align-items:center;justify-content:space-between">
            <div class="row gap" style="align-items:center;flex:1">
              ${avatarHTML(member, 36)}
              <div>
                <div style="font-weight:600">${m.name}</div>
                <div style="font-size:12px;color:var(--muted)">deve a ${treasurer.name}</div>
              </div>
            </div>
            <div class="settle-amt" style="margin:0">${fmt(residuo)}</div>
          </div>
          ${isTreasurer ? `
            <div class="row gap" style="margin-top:10px">
              <button class="btn primary sm" data-quick="${m.id}" data-amt="${residuo}" style="flex:2">✓ Pagato tutto</button>
              <button class="btn ghost sm" data-partial="${m.id}" style="flex:1">parziale</button>
            </div>` : ''}
        </div>
      `;
    }).join('');
    card.querySelectorAll('[data-quick]').forEach(b => b.addEventListener('click', async () => {
      try {
        await api('settlement_create', { from_member_id: +b.dataset.quick, to_member_id: treasurerId, amount: +b.dataset.amt });
        toast('Acconto registrato');
        await loadAll(); render();
      } catch (e) { toast(e.message, true); }
    }));
    card.querySelectorAll('[data-partial]').forEach(b => b.addEventListener('click', () => openAcconto(+b.dataset.partial)));
    wrap.appendChild(card);
  }

  if (creditors.length) {
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `<h2>Da restituire (${creditors.length})</h2>` + creditors.map(m => {
      const member = state.members.find(x => x.id === m.id) || m;
      const residuo = +(m.settled_paid - m.spent).toFixed(2);
      return `
        <div class="settle-card">
          <div class="row gap" style="align-items:center;justify-content:space-between">
            <div class="row gap" style="align-items:center;flex:1">
              ${avatarHTML(member, 36)}
              <div>
                <div style="font-weight:600">${m.name}</div>
                <div style="font-size:12px;color:var(--muted)">${treasurer.name} deve restituire</div>
              </div>
            </div>
            <div class="settle-amt" style="margin:0;color:var(--good)">${fmt(residuo)}</div>
          </div>
        </div>`;
    }).join('');
    wrap.appendChild(card);
  }

  // Storico acconti
  const card3 = document.createElement('div');
  card3.className = 'card';
  card3.innerHTML = `<h2>Storico acconti</h2><div id="settHist"></div>`;
  wrap.appendChild(card3);
  api('settlements').then(({ settlements }) => {
    const box = card3.querySelector('#settHist');
    if (!settlements.length) {
      box.innerHTML = '<div class="muted" style="font-size:13px;padding:8px 0">Nessun acconto registrato.</div>';
      return;
    }
    box.innerHTML = settlements.map(s => {
      const p = accontoBy(s.category);
      return `
      <div class="expense-row" data-sid="${s.id}" style="cursor:pointer">
        <div class="expense-icon">${p.emoji}</div>
        <div class="expense-meta">
          <div class="title">${s.from_name} → ${s.to_name}<span class="chip" style="margin-left:6px;font-size:10px">${p.name}</span></div>
          <div class="sub">${dateLabel(s.created_at)}${s.note ? ' · ' + escapeHtml(s.note) : ''}</div>
        </div>
        <div class="expense-amount">${fmt(s.amount)}</div>
      </div>
    `;}).join('');
    box.querySelectorAll('[data-sid]').forEach(r => {
      r.addEventListener('click', () => {
        const s = settlements.find(x => x.id === +r.dataset.sid);
        if (s) openSettlementEdit(s);
      });
    });
  });

  return wrap;
}

// ============ VIEW: SETTINGS ============
function viewSettings() {
  const wrap = document.createElement('div');
  const t = state.trip;

  const tripCard = document.createElement('div');
  tripCard.className = 'card';
  tripCard.innerHTML = `
    <h2>Viaggio</h2>
    <div class="form-group"><label>Nome</label><input id="tName" value="${escapeHtml(t.name)}" /></div>
    <div class="form-group"><label>Destinazione</label><input id="tDest" value="${escapeHtml(t.destination || '')}" /></div>
    <div class="form-row">
      <div class="form-group"><label>Inizio</label><input type="date" id="tStart" value="${t.date_start || ''}" /></div>
      <div class="form-group"><label>Fine</label><input type="date" id="tEnd" value="${t.date_end || ''}" /></div>
    </div>
    <button class="btn primary full" id="tSave">Salva viaggio</button>
  `;
  wrap.appendChild(tripCard);

  // Members management
  const memCard = document.createElement('div');
  memCard.className = 'card';
  memCard.innerHTML = `<h2>Persone (${state.members.length})</h2>`;
  state.members.forEach(m => {
    const row = document.createElement('div');
    row.className = 'member-row';
    row.innerHTML = `
      ${avatarHTML(m, 36)}
      <div class="name">${escapeHtml(m.name)}<div style="font-size:12px;color:var(--muted);font-weight:400">budget ${fmt(m.budget)} ${m.budget_paid ? '✅' : '⏳ non versato'}</div></div>
      <button class="btn sm ghost" data-edit="${m.id}">Modifica</button>
    `;
    memCard.appendChild(row);
  });
  const addBtn = document.createElement('button');
  addBtn.className = 'btn ghost full';
  addBtn.style.marginTop = '10px';
  addBtn.textContent = '+ Aggiungi persona';
  addBtn.addEventListener('click', () => openMemberEditor(null));
  memCard.appendChild(addBtn);
  wrap.appendChild(memCard);

  tripCard.querySelector('#tSave').addEventListener('click', async () => {
    try {
      await api('trip_update', {
        name: tripCard.querySelector('#tName').value,
        destination: tripCard.querySelector('#tDest').value,
        date_start: tripCard.querySelector('#tStart').value,
        date_end: tripCard.querySelector('#tEnd').value,
        currency: 'EUR',
        payer_member_id: t.payer_member_id || state.me.id,
      });
      toast('Salvato');
      await loadAll();
      render();
    } catch (e) { toast(e.message, true); }
  });
  memCard.querySelectorAll('[data-edit]').forEach(b => {
    b.addEventListener('click', () => openMemberEditor(state.members.find(m => m.id === +b.dataset.edit)));
  });

  return wrap;
}

// ============ MODAL HELPERS ============
function openModal(html, onMount) {
  const bg = document.createElement('div');
  bg.className = 'modal-bg';
  bg.innerHTML = `<div class="modal"><div class="modal-handle"></div>${html}</div>`;
  bg.addEventListener('click', e => { if (e.target === bg) bg.remove(); });
  document.body.appendChild(bg);
  if (onMount) onMount(bg.querySelector('.modal'), () => bg.remove());
  return bg;
}

// ============ NEW EXPENSE FLOW ============
function openNewExpense() {
  if (!state.me.is_admin) return openMyExpense();
  let cat = CATS[0];
  let payerId = state.trip?.payer_member_id || state.me.id;
  let participantIds = state.members.map(m => m.id);
  let shares = {}; // { member_id: amount }
  let splitMode = cat.mode;
  let total = '';

  function html() {
    return `
      <h2>Nuova spesa</h2>
      <div class="cat-grid">
        ${CATS.map(c => `<button class="cat-tile ${c.id === cat.id ? 'active' : ''}" data-cat="${c.id}"><span>${c.emoji}</span>${c.name}</button>`).join('')}
      </div>
      <div class="form-group" style="margin-top:14px"><label>Titolo</label>
        <input id="exTitle" placeholder="${cat.name}..." />
      </div>
      <div class="form-row">
        <div class="form-group"><label>Totale (€)</label>
          <input type="number" inputmode="decimal" step="0.01" id="exTotal" placeholder="0,00" value="${total || ''}" />
        </div>
        <div class="form-group"><label>Pagato da</label>
          <select id="exPayer">
            ${state.members.map(m => `<option value="${m.id}" ${m.id === payerId ? 'selected' : ''}>${m.name}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="form-group">
        <label>Modalità divisione</label>
        <div class="row gap" style="flex-wrap:wrap">
          <button class="chip ${splitMode === 'equal' ? 'active' : ''}" data-mode="equal">⚖️ Equa</button>
          <button class="chip ${splitMode === 'items' ? 'active' : ''}" data-mode="items">🍽️ Ognuno il suo</button>
          <button class="chip ${splitMode === 'custom' ? 'active' : ''}" data-mode="custom">✏️ Personalizzata</button>
        </div>
      </div>
      <div id="participantsBox"></div>
      <div class="form-group"><label>Note (facoltative)</label>
        <textarea id="exNotes" rows="2" placeholder="Aggiungi una nota..."></textarea>
      </div>
      <div class="row gap" style="margin-top:14px">
        <button class="btn ghost" id="exCancel" style="flex:1">Annulla</button>
        <button class="btn primary" id="exSave" style="flex:2">Salva spesa</button>
      </div>
    `;
  }

  openModal(html(), function mount(modal, close) {
    bind(modal, close);
    function bind(modal, close) {
      modal.querySelectorAll('[data-cat]').forEach(b => b.addEventListener('click', () => {
        cat = catBy(b.dataset.cat);
        if (splitMode !== 'custom') splitMode = cat.mode;
        rerender(modal, close);
      }));
      modal.querySelectorAll('[data-mode]').forEach(b => b.addEventListener('click', () => {
        splitMode = b.dataset.mode;
        rerender(modal, close);
      }));
      modal.querySelector('#exTotal').addEventListener('input', e => { total = e.target.value; renderParticipants(modal); });
      modal.querySelector('#exPayer').addEventListener('change', e => { payerId = +e.target.value; });
      modal.querySelector('#exCancel').addEventListener('click', close);
      modal.querySelector('#exSave').addEventListener('click', () => save(close));
      renderParticipants(modal);
    }
    function rerender(modal, close) {
      // remember inputs
      total = modal.querySelector('#exTotal').value;
      const titleEl = modal.querySelector('#exTitle');
      const notesEl = modal.querySelector('#exNotes');
      const ttl = titleEl?.value || '';
      const nts = notesEl?.value || '';
      modal.innerHTML = '<div class="modal-handle"></div>' + html();
      modal.querySelector('#exTitle').value = ttl;
      modal.querySelector('#exNotes').value = nts;
      bind(modal, close);
    }
    function renderParticipants(modal) {
      const box = modal.querySelector('#participantsBox');
      const totalNum = parseFloat((total || '').toString().replace(',', '.')) || 0;
      if (splitMode === 'equal') {
        box.innerHTML = `<label class="form-group" style="display:block;margin-bottom:6px">Partecipanti</label>
          <div class="participant-list">
            ${state.members.map(m => `
              <label class="participant-row ${participantIds.includes(m.id) ? 'active' : ''}">
                <input type="checkbox" data-pid="${m.id}" ${participantIds.includes(m.id) ? 'checked' : ''} />
                ${avatarHTML(m, 28)}
                <b>${m.name}</b>
                <span class="muted" style="font-size:13px">${totalNum && participantIds.includes(m.id) ? fmt(totalNum / participantIds.length) : ''}</span>
              </label>
            `).join('')}
          </div>`;
        box.querySelectorAll('input[type=checkbox]').forEach(c => c.addEventListener('change', () => {
          const id = +c.dataset.pid;
          if (c.checked && !participantIds.includes(id)) participantIds.push(id);
          if (!c.checked) participantIds = participantIds.filter(x => x !== id);
          renderParticipants(modal);
        }));
      } else {
        // items / custom: each member enters amount (label too for items)
        box.innerHTML = `
          <label class="form-group" style="display:block;margin-bottom:6px">Quote individuali ${splitMode === 'items' ? '(ognuno paga ciò che ha consumato)' : ''}</label>
          ${state.members.map(m => `
            <div class="share-row">
              <div class="who">${avatarHTML(m, 28)}<b>${m.name}</b></div>
              <input type="number" inputmode="decimal" step="0.01" placeholder="0,00" data-share="${m.id}" value="${shares[m.id] != null ? shares[m.id] : ''}" />
            </div>
          `).join('')}
          <div id="shareSum" class="share-summary"></div>
        `;
        box.querySelectorAll('[data-share]').forEach(inp => inp.addEventListener('input', () => {
          const id = +inp.dataset.share;
          const v = parseFloat((inp.value || '').toString().replace(',', '.'));
          if (isNaN(v)) delete shares[id]; else shares[id] = v;
          updateSum(modal);
        }));
        updateSum(modal);
      }
    }
    function updateSum(modal) {
      const totalNum = parseFloat(((modal.querySelector('#exTotal').value) || '').replace(',', '.')) || 0;
      const sum = Object.values(shares).reduce((a, b) => a + (parseFloat(b) || 0), 0);
      const diff = +(totalNum - sum).toFixed(2);
      const el = modal.querySelector('#shareSum');
      if (!el) return;
      el.classList.remove('good', 'bad');
      if (Math.abs(diff) < 0.01) {
        el.classList.add('good');
        el.innerHTML = `<span>Totale quote</span><span>✓ ${fmt(sum)}</span>`;
      } else if (diff > 0) {
        el.classList.add('bad');
        el.innerHTML = `<span>Mancano</span><span>${fmt(diff)}</span>`;
      } else {
        el.classList.add('bad');
        el.innerHTML = `<span>In eccesso</span><span>${fmt(-diff)}</span>`;
      }
    }
    async function save(close) {
      const title = modal.querySelector('#exTitle').value.trim() || cat.name;
      const totalNum = parseFloat((modal.querySelector('#exTotal').value || '').replace(',', '.'));
      const notes = modal.querySelector('#exNotes').value;
      if (!totalNum || totalNum <= 0) return toast('Inserisci un totale valido', true);

      const body = {
        title,
        category: cat.id,
        total: totalNum,
        paid_by_member_id: payerId,
        split_mode: splitMode,
        notes,
      };
      if (splitMode === 'equal') {
        if (!participantIds.length) return toast('Seleziona almeno un partecipante', true);
        body.member_ids = participantIds;
      } else {
        body.shares = Object.entries(shares).filter(([_, v]) => +v > 0).map(([mid, amt]) => ({ member_id: +mid, amount: +amt }));
        if (!body.shares.length) return toast('Inserisci le quote', true);
      }
      try {
        await api('expense_create', body);
        toast('Spesa registrata 🎉');
        close();
        await loadAll();
        render();
      } catch (e) { toast(e.message, true); }
    }
  });
}

// ============ MY PERSONAL EXPENSE (non-admin) ============
function openMyExpense(existing) {
  const isEdit = !!existing;
  const treasurerId = state.trip?.payer_member_id || 1;
  const treasurer = state.members.find(x => x.id === treasurerId);
  const treasurerName = treasurer?.name || 'Tesoriere';
  let cat = isEdit ? catBy(existing.category) : CATS[0];

  function html() {
    return `
      <h2>${isEdit ? '✏️ Modifica la tua spesa' : 'La tua spesa'}</h2>
      <p style="margin:0 0 14px;font-size:13px;color:var(--muted)">
        Aggiungi qui solo la <b>tua quota</b> personale (es. la tua cena, la tua escursione).
        Verrà aggiunta al tuo saldo verso ${escapeHtml(treasurerName)}.
      </p>
      <div class="cat-grid">
        ${CATS.map(c => `<button type="button" class="cat-tile ${c.id === cat.id ? 'active' : ''}" data-cat="${c.id}"><span>${c.emoji}</span>${c.name}</button>`).join('')}
      </div>
      <div class="form-group" style="margin-top:14px"><label>Descrizione</label>
        <input id="myxTitle" placeholder="es. Cena al Faro, Escursione Capri..." />
      </div>
      <div class="form-group"><label>Importo (€)</label>
        <input type="number" inputmode="decimal" step="0.01" id="myxTotal" placeholder="0,00" />
      </div>
      <div class="form-group"><label>Note (facoltativa)</label>
        <textarea id="myxNotes" rows="2"></textarea>
      </div>
      <div class="row gap" style="margin-top:14px">
        ${isEdit ? '<button class="btn danger" id="myxDelete">🗑️ Elimina</button>' : ''}
        <button class="btn ghost" id="myxCancel" style="flex:1">Annulla</button>
        <button class="btn primary" id="myxSave" style="flex:2">${isEdit ? 'Salva' : 'Aggiungi'}</button>
      </div>
    `;
  }

  openModal(html(), (modal, close) => {
    bind(modal, close);
    // Pre-fill on edit
    if (isEdit) {
      modal.querySelector('#myxTitle').value = existing.title || '';
      modal.querySelector('#myxTotal').value = existing.total || '';
      modal.querySelector('#myxNotes').value = existing.notes || '';
    } else {
      setTimeout(() => modal.querySelector('#myxTitle')?.focus(), 60);
    }

    function bind(modal, close) {
      modal.querySelectorAll('[data-cat]').forEach(b => b.addEventListener('click', () => {
        cat = catBy(b.dataset.cat);
        rerender(modal, close);
      }));
      modal.querySelector('#myxCancel').addEventListener('click', close);
      modal.querySelector('#myxSave').addEventListener('click', () => save(modal, close));
      modal.querySelector('#myxDelete')?.addEventListener('click', () => del(close));
    }
    function rerender(modal, close) {
      const t = modal.querySelector('#myxTitle')?.value || '';
      const a = modal.querySelector('#myxTotal')?.value || '';
      const n = modal.querySelector('#myxNotes')?.value || '';
      modal.innerHTML = '<div class="modal-handle"></div>' + html();
      modal.querySelector('#myxTitle').value = t;
      modal.querySelector('#myxTotal').value = a;
      modal.querySelector('#myxNotes').value = n;
      bind(modal, close);
    }
    async function save(modal, close) {
      const title = modal.querySelector('#myxTitle').value.trim();
      const total = parseFloat((modal.querySelector('#myxTotal').value || '').replace(',', '.'));
      const notes = modal.querySelector('#myxNotes').value;
      if (!title) return toast('Inserisci una descrizione', true);
      if (!total || total <= 0) return toast('Importo non valido', true);
      try {
        if (isEdit) {
          await api('expense_update', { id: existing.id, title, category: cat.id, total, notes });
          toast('Spesa aggiornata');
        } else {
          await api('expense_create', { title, category: cat.id, total, notes });
          toast('Spesa aggiunta 🎉');
        }
        close();
        await loadAll();
        render();
      } catch (e) { toast(e.message, true); }
    }
    async function del(close) {
      if (!confirm('Eliminare questa spesa?')) return;
      try {
        await api('expense_delete', { id: existing.id });
        toast('Spesa eliminata');
        close();
        await loadAll();
        render();
      } catch (e) { toast(e.message, true); }
    }
  });
}

// ============ EXPENSE DETAIL ============
function openExpenseDetail(id) {
  const e = state.expenses.find(x => x.id === id);
  if (!e) return;
  const info = catBy(e.category);
  const canDelete = state.me.is_admin || e.created_by_member_id === state.me.id;
  const isMyPersonal = e.created_by_member_id === state.me.id && (e.shares || []).length === 1;
  // Per non-admin con propria spesa personale, apri direttamente la modale di edit
  if (!state.me.is_admin && isMyPersonal) {
    return openMyExpense(e);
  }
  const html = `
    <h2>${info.emoji} ${escapeHtml(e.title)}</h2>
    <div class="muted" style="font-size:13px">${dateLabel(e.occurred_at)}</div>
    <div class="stat-grid" style="margin-top:14px">
      <div class="stat"><div class="label">Totale</div><div class="value">${fmt(e.total)}</div></div>
      <div class="stat"><div class="label">Pagato da</div><div class="value" style="font-size:16px">${escapeHtml(e.paid_by_name || '')}</div></div>
    </div>
    <h3 style="margin-top:18px">${state.me.is_admin ? 'Quote' : 'La tua quota'}</h3>
    ${(e.shares || []).map(s => `
      <div class="share-row">
        <div class="who">${avatarHTML({ id: s.member_id, name: s.member_name }, 28)}<b>${escapeHtml(s.member_name)}</b>${s.label ? `<span class="muted" style="font-size:12px"> · ${escapeHtml(s.label)}</span>` : ''}</div>
        <div style="text-align:right;font-weight:600">${fmt(s.amount)}</div>
      </div>
    `).join('')}
    ${e.notes ? `<div class="card" style="margin-top:14px"><h2>Note</h2><div style="font-size:14px">${escapeHtml(e.notes)}</div></div>` : ''}
    ${canDelete ? '<button class="btn danger full" id="delExp" style="margin-top:14px">🗑️ Elimina spesa</button>' : ''}
  `;
  openModal(html, (modal, close) => {
    modal.querySelector('#delExp')?.addEventListener('click', async () => {
      if (!confirm('Eliminare questa spesa?')) return;
      try {
        await api('expense_delete', { id: e.id });
        toast('Spesa eliminata');
        close();
        await loadAll();
        render();
      } catch (err) { toast(err.message, true); }
    });
  });
}

// ============ MY BUDGET ============
function openMyBudget() {
  const html = `
    <h2>Il tuo budget</h2>
    <p class="muted" style="font-size:14px">Inserisci la cifra che hai bonificato (o che bonifichi) per la vacanza.</p>
    <div class="form-group"><label>Importo (€)</label><input type="number" inputmode="decimal" step="0.01" id="myBudget" placeholder="0,00" /></div>
    <div class="row gap"><button class="btn ghost" id="bCancel" style="flex:1">Annulla</button><button class="btn primary" id="bSave" style="flex:2">Salva</button></div>
  `;
  openModal(html, (modal, close) => {
    modal.querySelector('#bCancel').addEventListener('click', close);
    modal.querySelector('#bSave').addEventListener('click', async () => {
      const v = parseFloat((modal.querySelector('#myBudget').value || '').replace(',', '.'));
      if (!v || v < 0) return toast('Importo non valido', true);
      try {
        await api('member_update', { id: state.me.id, budget: v });
        toast('Budget aggiornato');
        close();
        await loadAll();
        render();
      } catch (e) { toast(e.message, true); }
    });
  });
}

// ============ MEMBER EDITOR (admin) ============
function openMemberEditor(member) {
  const isNew = !member;
  const html = `
    <h2>${isNew ? 'Nuova persona' : 'Modifica ' + escapeHtml(member.name)}</h2>
    <div class="form-group"><label>Nome</label><input id="mName" value="${escapeHtml(member?.name || '')}" /></div>
    <div class="form-group"><label>Budget (€)</label><input type="number" inputmode="decimal" step="0.01" id="mBudget" value="${member?.budget || ''}" /></div>
    <div class="form-group">
      <label class="row gap"><input type="checkbox" id="mPaid" ${member?.budget_paid ? 'checked' : ''} /> Bonifico già ricevuto</label>
    </div>
    <div class="row gap" style="margin-top:14px">
      ${!isNew && member.id !== state.me.id ? '<button class="btn danger" id="mDel">Elimina</button>' : ''}
      <button class="btn ghost" id="mCancel" style="flex:1">Annulla</button>
      <button class="btn primary" id="mSave" style="flex:2">Salva</button>
    </div>
  `;
  openModal(html, (modal, close) => {
    modal.querySelector('#mCancel').addEventListener('click', close);
    modal.querySelector('#mSave').addEventListener('click', async () => {
      const data = {
        name: modal.querySelector('#mName').value.trim(),
        budget: parseFloat((modal.querySelector('#mBudget').value || '0').replace(',', '.')) || 0,
        budget_paid: modal.querySelector('#mPaid').checked,
      };
      if (!data.name) return toast('Nome obbligatorio', true);
      try {
        if (isNew) await api('member_add', data);
        else await api('member_update', { id: member.id, ...data });
        toast('Salvato');
        close();
        await loadAll();
        render();
      } catch (e) { toast(e.message, true); }
    });
    modal.querySelector('#mDel')?.addEventListener('click', async () => {
      if (!confirm('Eliminare ' + member.name + '?')) return;
      try {
        await api('member_delete', { id: member.id });
        toast('Eliminato');
        close();
        await loadAll();
        render();
      } catch (e) { toast(e.message, true); }
    });
  });
}

// ============ ACCONTO MODAL ============
const ACCONTO_PURPOSES = [
  { id: 'cassa',      name: 'Cassa generale', emoji: '💼' },
  { id: 'volo',       name: 'Voli',           emoji: '✈️' },
  { id: 'alloggio',   name: 'Alloggio',       emoji: '🏨' },
  { id: 'ristorante', name: 'Cene/uscite',    emoji: '🍽️' },
  { id: 'taxi',       name: 'Taxi/trasporti', emoji: '🚕' },
  { id: 'noleggio',   name: 'Noleggio auto',  emoji: '🚗' },
  { id: 'escursione', name: 'Escursioni',     emoji: '🏔️' },
  { id: 'saldo',      name: 'Saldo finale',   emoji: '✅' },
  { id: 'altro',      name: 'Altro',          emoji: '📦' },
];
const accontoBy = (id) => ACCONTO_PURPOSES.find(p => p.id === id) || ACCONTO_PURPOSES[0];

function openAcconto(prefilledFromId) {
  const treasurerId = state.trip?.payer_member_id || 1;
  const isTreasurer = state.me.id === treasurerId;
  const others = state.members.filter(m => m.id !== treasurerId);
  const defaultFrom = prefilledFromId || (isTreasurer ? others[0]?.id : state.me.id);
  let purpose = 'cassa';

  function html() {
    return `
      <h2>💰 Registra acconto</h2>
      <p style="margin:0 0 14px;font-size:13px;color:var(--muted)">
        Bonifico/contanti dati al tesoriere. Indica a cosa si riferisce.
      </p>
      ${isTreasurer ? `
        <div class="form-group"><label>Da chi hai ricevuto</label>
          <select id="acFrom">
            ${others.map(m => `<option value="${m.id}" ${m.id === defaultFrom ? 'selected' : ''}>${escapeHtml(m.name)}</option>`).join('')}
          </select>
        </div>` : `
        <input type="hidden" id="acFrom" value="${state.me.id}" />
        <div class="muted" style="font-size:14px;margin-bottom:12px">Stai registrando un tuo bonifico verso ${escapeHtml(state.summary.members.find(m => m.id === treasurerId).name)}.</div>
      `}
      <div class="form-group">
        <label>A cosa si riferisce</label>
        <div class="cat-grid">
          ${ACCONTO_PURPOSES.map(p => `<button type="button" class="cat-tile ${p.id === purpose ? 'active' : ''}" data-purpose="${p.id}"><span>${p.emoji}</span>${p.name}</button>`).join('')}
        </div>
      </div>
      <div class="form-group"><label>Importo (€)</label>
        <input type="number" inputmode="decimal" step="0.01" id="acAmt" placeholder="0,00" />
      </div>
      <div class="form-group"><label>Nota (facoltativa)</label>
        <input id="acNote" placeholder="es. bonifico Revolut, contanti check-in..." />
      </div>
      <div class="row gap" style="margin-top:14px">
        <button class="btn ghost" id="acCancel" style="flex:1">Annulla</button>
        <button class="btn primary" id="acSave" style="flex:2">Salva acconto</button>
      </div>
    `;
  }

  openModal(html(), (modal, close) => {
    bind(modal, close);

    function bind(modal, close) {
      modal.querySelectorAll('[data-purpose]').forEach(b => b.addEventListener('click', () => {
        purpose = b.dataset.purpose;
        rerender(modal, close);
      }));
      modal.querySelector('#acCancel').addEventListener('click', close);
      modal.querySelector('#acSave').addEventListener('click', save.bind(null, modal, close));
    }
    function rerender(modal, close) {
      const amt = modal.querySelector('#acAmt')?.value || '';
      const note = modal.querySelector('#acNote')?.value || '';
      const fromVal = modal.querySelector('#acFrom')?.value;
      modal.innerHTML = '<div class="modal-handle"></div>' + html();
      if (modal.querySelector('#acAmt')) modal.querySelector('#acAmt').value = amt;
      if (modal.querySelector('#acNote')) modal.querySelector('#acNote').value = note;
      if (fromVal && modal.querySelector('#acFrom')) modal.querySelector('#acFrom').value = fromVal;
      bind(modal, close);
    }
    async function save(modal, close) {
      const fromId = +(modal.querySelector('#acFrom').value);
      const amt = parseFloat((modal.querySelector('#acAmt').value || '').replace(',', '.'));
      const note = modal.querySelector('#acNote').value;
      if (!amt || amt <= 0) return toast('Importo non valido', true);
      try {
        await api('settlement_create', {
          from_member_id: fromId,
          to_member_id: treasurerId,
          amount: amt,
          category: purpose,
          note,
        });
        toast('Acconto registrato 🎉');
        close();
        await loadAll();
        render();
      } catch (e) { toast(e.message, true); }
    }

    setTimeout(() => modal.querySelector('#acAmt')?.focus(), 60);
  });
}

// ============ SETTLEMENT EDIT/DELETE ============
function openSettlementEdit(settlement) {
  const isMine = state.me.id === settlement.from_member_id;
  const canEdit = state.me.is_admin || isMine;
  let purpose = settlement.category || 'cassa';

  function html() {
    return `
      <h2>💰 Acconto</h2>
      <p style="margin:0 0 14px;font-size:13px;color:var(--muted)">
        ${escapeHtml(settlement.from_name)} → ${escapeHtml(settlement.to_name)} · ${dateLabel(settlement.created_at)}
      </p>
      ${canEdit ? `
        <div class="form-group">
          <label>A cosa si riferisce</label>
          <div class="cat-grid">
            ${ACCONTO_PURPOSES.map(p => `<button type="button" class="cat-tile ${p.id === purpose ? 'active' : ''}" data-purpose="${p.id}"><span>${p.emoji}</span>${p.name}</button>`).join('')}
          </div>
        </div>
        <div class="form-group"><label>Importo (€)</label>
          <input type="number" inputmode="decimal" step="0.01" id="seAmt" />
        </div>
        <div class="form-group"><label>Nota</label>
          <input id="seNote" placeholder="es. bonifico Revolut..." />
        </div>
        <div class="row gap" style="margin-top:14px">
          <button class="btn danger" id="seDelete" style="flex:1">🗑️ Elimina</button>
          <button class="btn ghost" id="seCancel" style="flex:1">Annulla</button>
          <button class="btn primary" id="seSave" style="flex:2">Salva</button>
        </div>
      ` : `
        <div class="stat-grid">
          <div class="stat"><div class="label">Importo</div><div class="value">${fmt(settlement.amount)}</div></div>
          <div class="stat"><div class="label">Categoria</div><div class="value" style="font-size:18px">${accontoBy(settlement.category).emoji} ${accontoBy(settlement.category).name}</div></div>
        </div>
        ${settlement.note ? `<div class="card" style="margin-top:14px"><h2>Nota</h2><div style="font-size:14px">${escapeHtml(settlement.note)}</div></div>` : ''}
        <div class="muted" style="font-size:13px;margin-top:14px;text-align:center">Solo chi l'ha registrato (o l'admin) può modificarlo.</div>
      `}
    `;
  }

  openModal(html(), (modal, close) => {
    bind(modal, close);

    function bind(modal, close) {
      modal.querySelectorAll('[data-purpose]').forEach(b => b.addEventListener('click', () => {
        purpose = b.dataset.purpose;
        rerender(modal, close);
      }));
      modal.querySelector('#seCancel')?.addEventListener('click', close);
      modal.querySelector('#seSave')?.addEventListener('click', () => save(modal, close));
      modal.querySelector('#seDelete')?.addEventListener('click', () => del(close));
      // Pre-fill values
      const amtEl = modal.querySelector('#seAmt');
      const noteEl = modal.querySelector('#seNote');
      if (amtEl && !amtEl.value) amtEl.value = settlement.amount;
      if (noteEl && !noteEl.value) noteEl.value = settlement.note || '';
    }
    function rerender(modal, close) {
      const amt = modal.querySelector('#seAmt')?.value;
      const note = modal.querySelector('#seNote')?.value;
      modal.innerHTML = '<div class="modal-handle"></div>' + html();
      bind(modal, close);
      if (amt && modal.querySelector('#seAmt')) modal.querySelector('#seAmt').value = amt;
      if (note != null && modal.querySelector('#seNote')) modal.querySelector('#seNote').value = note;
    }
    async function save(modal, close) {
      const amt = parseFloat((modal.querySelector('#seAmt').value || '').replace(',', '.'));
      const note = modal.querySelector('#seNote').value;
      if (!amt || amt <= 0) return toast('Importo non valido', true);
      try {
        await api('settlement_update', {
          id: settlement.id,
          amount: amt,
          category: purpose,
          note,
        });
        toast('Acconto aggiornato');
        close();
        await loadAll();
        render();
      } catch (e) { toast(e.message, true); }
    }
    async function del(close) {
      if (!confirm('Eliminare questo acconto di ' + fmt(settlement.amount) + '?')) return;
      try {
        await api('settlement_delete', { id: settlement.id });
        toast('Acconto eliminato');
        close();
        await loadAll();
        render();
      } catch (e) { toast(e.message, true); }
    }
  });
}

// ============ MEMBER STATEMENT (estratto conto persona) ============
function openMemberStatement(memberId) {
  const treasurerId = state.trip?.payer_member_id || 1;
  const m = state.summary.members.find(x => x.id === memberId);
  const member = state.members.find(x => x.id === memberId);
  if (!m) return;
  const isTreas = m.id === treasurerId;
  const treasurer = state.summary.members.find(x => x.id === treasurerId);

  // Quote spese di questa persona
  const myShares = [];
  state.expenses.forEach(e => {
    (e.shares || []).forEach(s => {
      if (s.member_id === memberId) myShares.push({ exp: e, share: s });
    });
  });
  myShares.sort((a, b) => (b.exp.occurred_at || '').localeCompare(a.exp.occurred_at || ''));

  const dovuto = m.spent;
  const versato = m.settled_paid;
  const residuo = +(dovuto - versato).toFixed(2);

  const summaryHtml = isTreas
    ? `<div class="stat"><div class="label">Anticipato</div><div class="value">${fmt(m.paid)}</div></div>
       <div class="stat"><div class="label">Quota propria</div><div class="value">${fmt(m.spent)}</div></div>`
    : `<div class="stat"><div class="label">Quote a carico</div><div class="value">${fmt(dovuto)}</div></div>
       <div class="stat ${residuo > 0.01 ? 'bad' : 'good'}"><div class="label">${residuo > 0.01 ? 'Deve ancora' : residuo < -0.01 ? 'Avanzo' : 'Saldo'}</div><div class="value">${fmt(Math.abs(residuo))}</div></div>`;

  const html = `
    <h2>${escapeHtml(m.name)}${isTreas ? ' (tesoriere)' : ''}</h2>
    <div class="stat-grid">${summaryHtml}</div>
    ${!isTreas ? `<div style="font-size:13px;color:var(--muted);margin-top:8px">Acconti versati: <b style="color:var(--text)">${fmt(versato)}</b></div>` : ''}
    <h3 style="margin:18px 0 8px">Quote (${myShares.length})</h3>
    ${myShares.length ? myShares.map(({ exp, share }) => {
      const info = catBy(exp.category);
      return `
        <div class="expense-row">
          <div class="expense-icon">${info.emoji}</div>
          <div class="expense-meta">
            <div class="title">${escapeHtml(exp.title)}${share.label ? ' · ' + escapeHtml(share.label) : ''}</div>
            <div class="sub">${dateLabel(exp.occurred_at)}</div>
          </div>
          <div class="expense-amount">${fmt(share.amount)}</div>
        </div>`;
    }).join('') : '<div class="muted" style="font-size:13px">Nessuna quota.</div>'}
    ${!isTreas ? `
      <h3 style="margin:18px 0 8px">Acconti versati</h3>
      <div id="accList"></div>
      ${state.me.id === treasurerId || state.me.id === memberId ? `<button class="btn primary full" id="addAccBtn" style="margin-top:14px">+ Registra acconto</button>` : ''}
    ` : ''}
  `;
  openModal(html, (modal, close) => {
    if (!isTreas) {
      api('settlements').then(({ settlements }) => {
        const accList = modal.querySelector('#accList');
        const mine = settlements.filter(s => s.from_member_id === memberId);
        accList.innerHTML = mine.length
          ? mine.map(s => {
              const p = accontoBy(s.category);
              return `
            <div class="expense-row" data-sid="${s.id}" style="cursor:pointer">
              <div class="expense-icon">${p.emoji}</div>
              <div class="expense-meta">
                <div class="title">→ ${s.to_name}<span class="chip" style="margin-left:6px;font-size:10px">${p.name}</span></div>
                <div class="sub">${dateLabel(s.created_at)}${s.note ? ' · ' + escapeHtml(s.note) : ''}</div>
              </div>
              <div class="expense-amount">${fmt(s.amount)}</div>
            </div>
          `;}).join('')
          : '<div class="muted" style="font-size:13px">Nessun acconto.</div>';
        accList.querySelectorAll('[data-sid]').forEach(r => {
          r.addEventListener('click', () => {
            const s = mine.find(x => x.id === +r.dataset.sid);
            if (s) { close(); openSettlementEdit(s); }
          });
        });
      });
      modal.querySelector('#addAccBtn')?.addEventListener('click', () => {
        close();
        openAcconto(memberId);
      });
    }
  });
}

// ============ START ============
boot();
