// ============ STATE ============
const state = {
  me: null,
  trip: null,
  members: [],
  expenses: [],
  summary: null,
  route: 'home',
  diningSessionId: null, // tavolata aperta nel dettaglio
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
// Valuta ristoranti (es. L.E = lire egiziane, importi interi col separatore migliaia)
function fmtCur(n, cur) {
  cur = cur || 'EUR';
  if (cur === 'EUR' || cur === '€') return fmt(n);
  const v = Math.round(Number(n || 0));
  return v.toLocaleString('it-IT') + ' ' + cur;
}
const initials = (name) => (name || '?').split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();
const avatarColor = (id) => {
  // Sun-baked palette per il tema "Italian Travel Journal"
  const palette = [
    '#C2502E', // terracotta
    '#2C6E78', // lagoon
    '#6B7A3F', // olive
    '#C29550', // gold
    '#A8576E', // dusty rose
    '#4A6B7A', // slate blue
    '#B07458', // clay
    '#7A6BA0', // lavender stone
  ];
  return palette[(id - 1) % palette.length];
};
function avatarHTML(member, size) {
  const dim = size ? `width:${size}px;height:${size}px;` : '';
  if (member && member.avatar) {
    return `<div class="avatar-circle has-photo" style="${dim}"><img src="${member.avatar}" alt="${escapeHtml(member.name || '')}" loading="lazy" /></div>`;
  }
  const bg = avatarColor(member.id || 1);
  const s = size ? `${dim}font-size:${Math.round(size * .4)}px;` : '';
  return `<div class="avatar-circle" style="background:${bg}; ${s}">${initials(member.name)}</div>`;
}

// Ridimensiona/ritaglia un'immagine a un quadrato (cover) e ritorna un data URL JPEG leggero
function fileToAvatarDataURL(file, size = 256) {
  return new Promise((resolve, reject) => {
    if (!file || !/^image\//.test(file.type || '')) return reject(new Error('Seleziona un\'immagine'));
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Errore lettura file'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Formato immagine non supportato (prova JPG o PNG)'));
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = size; canvas.height = size;
        const ctx = canvas.getContext('2d');
        const scale = Math.max(size / img.width, size / img.height);
        const w = img.width * scale, h = img.height * scale;
        ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
        resolve(canvas.toDataURL('image/jpeg', 0.82));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
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
  state.members = members; // serve al gioco Freccette anche prima del login
  const { trip } = await api('trip').catch(() => ({ trip: null }));
  if (trip) $('#loginTripName').textContent = trip.name;
  const grid = $('#memberGrid');
  grid.innerHTML = members.map(m => `
    <button class="member-tile" data-id="${m.id}">
      ${avatarHTML(m, 48)}
      <b>${m.name}</b>
    </button>
  `).join('');

  // Pulsante gioco Freccette (giocabile direttamente dalla schermata iniziale)
  const dg = dartsLoad();
  const dartsBtn = document.createElement('button');
  dartsBtn.className = 'login-darts';
  dartsBtn.innerHTML = `<span class="ld-ico">🎯</span><span class="ld-txt"><b>Freccette</b><small>${dg && dg.active ? 'Partita in corso · tocca per continuare' : 'Sfida il gruppo · scala i punti a zero'}</small></span><span class="ld-arrow">›</span>`;
  dartsBtn.addEventListener('click', () => openDarts());
  grid.insertAdjacentElement('afterend', dartsBtn);

  // Pulsante gioco Poker (giocabile direttamente dalla schermata iniziale)
  const pg = pokerLoad();
  const pokerBtn = document.createElement('button');
  pokerBtn.className = 'login-darts login-poker';
  pokerBtn.innerHTML = `<span class="ld-ico">🃏</span><span class="ld-txt"><b>Poker</b><small>${pg && pg.active ? 'Partita aperta · tocca per continuare' : 'Quota a testa · chi vince incassa il piatto'}</small></span><span class="ld-arrow">›</span>`;
  pokerBtn.addEventListener('click', () => openPoker());
  dartsBtn.insertAdjacentElement('afterend', pokerBtn);

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
      else { if (r === 'dining') state.diningSessionId = null; go(r); }
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
  else if (state.route === 'dining') screen.appendChild(viewDining());
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
  const treasurerLookup = state.members.find(x => x.id === treasurerId);
  const treasurer = sum.members.find(x => x.id === treasurerId) || { name: treasurerLookup?.name || 'Tesoriere' };

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

    // Hero: numero focale in cima
    const hero = document.createElement('div');
    hero.className = 'hero-card';
    hero.innerHTML = `
      <div class="hero-label">Da incassare</div>
      <div class="hero-value">${fmt(totalToCollect)}</div>
      <div class="hero-meta">
        <div>
          <div class="lbl">Anticipato</div>
          <div class="v">${fmt(meSum.paid)}</div>
        </div>
        <div>
          <div class="lbl">Incassato</div>
          <div class="v">${fmt(totalCollected)}</div>
        </div>
        ${totalToReturn > 0.01 ? `
        <div>
          <div class="lbl">Da restituire</div>
          <div class="v">${fmt(totalToReturn)}</div>
        </div>` : ''}
      </div>
    `;
    wrap.appendChild(hero);

    const action = document.createElement('button');
    action.className = 'btn primary full lg';
    action.style.marginBottom = '14px';
    action.innerHTML = '💰 Registra acconto ricevuto';
    action.addEventListener('click', () => openAcconto());
    wrap.appendChild(action);

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

    // Hero: numero focale
    const heroLabel = residuo > 0.01
      ? `Devi a ${treasurer.name}`
      : residuo < -0.01
        ? `${treasurer.name} ti deve`
        : 'Saldo';
    const heroValue = Math.abs(residuo) < 0.01 ? 'in pari ✓' : fmt(Math.abs(residuo));

    const hero = document.createElement('div');
    hero.className = 'hero-card';
    hero.innerHTML = `
      <div class="hero-label">${heroLabel}</div>
      <div class="hero-value">${heroValue}</div>
      <div class="hero-meta">
        <div>
          <div class="lbl">Tue quote</div>
          <div class="v">${fmt(dovuto)}</div>
        </div>
        <div>
          <div class="lbl">Hai versato</div>
          <div class="v">${fmt(versato)}</div>
        </div>
      </div>
    `;
    wrap.appendChild(hero);

    if (meSum.budget > 0) {
      const budgetCard = document.createElement('div');
      budgetCard.className = 'card';
      budgetCard.innerHTML = `
        <h2>Budget personale</h2>
        <div class="row between" style="align-items:baseline">
          <div style="font-size:24px;font-weight:600;letter-spacing:-0.025em">${fmt(meSum.budget_remaining)}</div>
          <div class="muted" style="font-size:12px">di ${fmt(meSum.budget)} · ${pct.toFixed(0)}% usato</div>
        </div>
        <div class="budget-bar ${overBudget ? 'over' : ''}" style="margin-top:12px"><div style="width:${pct}%"></div></div>
      `;
      wrap.appendChild(budgetCard);
    } else {
      const btn = document.createElement('button');
      btn.className = 'btn ghost full';
      btn.textContent = 'Imposta il tuo budget';
      btn.style.marginBottom = '14px';
      btn.addEventListener('click', () => openMyBudget());
      wrap.appendChild(btn);
    }
  }

  // ===== Gioco Freccette =====
  const dartsCard = document.createElement('button');
  dartsCard.className = 'card darts-launch';
  const dg = dartsLoad();
  dartsCard.innerHTML = `
    <div class="dl-ico">🎯</div>
    <div class="dl-text">
      <div class="dl-title">Freccette</div>
      <div class="dl-sub">${dg && dg.active ? 'Partita in corso · tocca per continuare' : 'Sfida il gruppo · scala i punti fino a zero'}</div>
    </div>
    <div class="dl-arrow">›</div>`;
  dartsCard.addEventListener('click', () => openDarts());
  wrap.appendChild(dartsCard);

  // ===== Gioco Poker =====
  const pokerCard = document.createElement('button');
  pokerCard.className = 'card darts-launch poker-launch';
  const pg = pokerLoad();
  pokerCard.innerHTML = `
    <div class="dl-ico">🃏</div>
    <div class="dl-text">
      <div class="dl-title">Poker</div>
      <div class="dl-sub">${pg && pg.active ? 'Partita aperta · tocca per continuare' : 'Quota a testa · chi vince incassa il piatto'}</div>
    </div>
    <div class="dl-arrow">›</div>`;
  pokerCard.addEventListener('click', () => openPoker());
  wrap.appendChild(pokerCard);

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

    const heroLabel = residuo > 0.01
      ? `Devi a ${treasurerName}`
      : residuo < -0.01
        ? `${treasurerName} ti deve`
        : 'Saldo';
    const heroValue = Math.abs(residuo) < 0.01 ? 'in pari ✓' : fmt(Math.abs(residuo));

    const hero = document.createElement('div');
    hero.className = 'hero-card';
    hero.innerHTML = `
      <div class="hero-label">${heroLabel}</div>
      <div class="hero-value">${heroValue}</div>
      <div class="hero-meta">
        <div>
          <div class="lbl">Tue quote</div>
          <div class="v">${fmt(dovuto)}</div>
        </div>
        <div>
          <div class="lbl">Versato</div>
          <div class="v">${fmt(versato)}</div>
        </div>
      </div>
    `;
    wrap.appendChild(hero);

    const action = document.createElement('button');
    action.className = 'btn accent full lg';
    action.style.marginBottom = '14px';
    action.textContent = '+ Registra un acconto';
    action.addEventListener('click', () => openAcconto());
    wrap.appendChild(action);

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
function openNewExpense(existing) {
  if (!state.me.is_admin) return openMyExpense(existing);
  const isEdit = !!existing;
  let cat = existing ? (catBy(existing.category) || CATS[0]) : CATS[0];
  let payerId = existing ? +existing.paid_by_member_id : (state.trip?.payer_member_id || state.me.id);
  let participantIds = (existing && existing.split_mode === 'equal')
    ? (existing.shares || []).map(s => +s.member_id)
    : state.members.map(m => m.id);
  let shares = {}; // { member_id: amount }
  if (existing && existing.split_mode !== 'equal') {
    (existing.shares || []).forEach(s => { shares[+s.member_id] = +s.amount; });
  }
  let splitMode = existing ? existing.split_mode : cat.mode;
  let total = existing ? existing.total : '';
  let titleVal = existing ? (existing.title || '') : '';
  let notesVal = existing ? (existing.notes || '') : '';

  function html() {
    return `
      <h2>${isEdit ? '✏️ Modifica spesa' : 'Nuova spesa'}</h2>
      <div class="cat-grid">
        ${CATS.map(c => `<button class="cat-tile ${c.id === cat.id ? 'active' : ''}" data-cat="${c.id}"><span>${c.emoji}</span>${c.name}</button>`).join('')}
      </div>
      <div class="form-group" style="margin-top:14px"><label>Titolo</label>
        <input id="exTitle" placeholder="${cat.name}..." value="${escapeHtml(titleVal)}" />
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
        <textarea id="exNotes" rows="2" placeholder="Aggiungi una nota...">${escapeHtml(notesVal)}</textarea>
      </div>
      <div class="row gap" style="margin-top:14px">
        <button class="btn ghost" id="exCancel" style="flex:1">Annulla</button>
        <button class="btn primary" id="exSave" style="flex:2">${isEdit ? 'Salva modifiche' : 'Salva spesa'}</button>
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
        if (isEdit) {
          await api('expense_update', { id: existing.id, ...body });
          toast('Spesa aggiornata ✏️');
        } else {
          await api('expense_create', body);
          toast('Spesa registrata 🎉');
        }
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
    ${state.me.is_admin ? '<button class="btn full" id="editExp" style="margin-top:14px">✏️ Modifica spesa</button>' : ''}
    ${canDelete ? '<button class="btn danger full" id="delExp" style="margin-top:10px">🗑️ Elimina spesa</button>' : ''}
  `;
  openModal(html, (modal, close) => {
    modal.querySelector('#editExp')?.addEventListener('click', () => {
      close();
      openNewExpense(e);
    });
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
  let photoData = member?.avatar || '';
  const previewHTML = (pd) => avatarHTML({ id: member?.id || 0, name: member?.name || '?', avatar: pd }, 84);
  const html = `
    <h2>${isNew ? 'Nuova persona' : 'Modifica ' + escapeHtml(member.name)}</h2>
    <div style="display:flex;flex-direction:column;align-items:center;gap:10px;margin:4px 0 16px">
      <div id="mAvatarPreview">${previewHTML(photoData)}</div>
      <div class="row gap">
        <button type="button" class="btn sm ghost" id="mPhotoBtn">📷 ${photoData ? 'Cambia foto' : 'Carica foto'}</button>
        <button type="button" class="btn sm ghost" id="mPhotoDel" style="${photoData ? '' : 'display:none'}">Rimuovi</button>
      </div>
      <input type="file" accept="image/*" id="mPhotoInput" style="display:none" />
    </div>
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
    const preview = modal.querySelector('#mAvatarPreview');
    const delBtn = modal.querySelector('#mPhotoDel');
    const photoBtn = modal.querySelector('#mPhotoBtn');
    const fileInput = modal.querySelector('#mPhotoInput');
    function refreshPhoto() {
      preview.innerHTML = previewHTML(photoData);
      delBtn.style.display = photoData ? '' : 'none';
      photoBtn.textContent = '📷 ' + (photoData ? 'Cambia foto' : 'Carica foto');
    }
    photoBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', async () => {
      const f = fileInput.files[0];
      if (!f) return;
      try { photoData = await fileToAvatarDataURL(f); refreshPhoto(); }
      catch (e) { toast(e.message, true); }
      fileInput.value = '';
    });
    delBtn.addEventListener('click', () => { photoData = ''; refreshPhoto(); });

    modal.querySelector('#mCancel').addEventListener('click', close);
    modal.querySelector('#mSave').addEventListener('click', async () => {
      const data = {
        name: modal.querySelector('#mName').value.trim(),
        budget: parseFloat((modal.querySelector('#mBudget').value || '0').replace(',', '.')) || 0,
        budget_paid: modal.querySelector('#mPaid').checked,
      };
      if (!data.name) return toast('Nome obbligatorio', true);
      try {
        if (isNew) {
          const r = await api('member_add', data);
          if (photoData && r && r.id) await api('member_update', { id: r.id, avatar: photoData });
        } else {
          await api('member_update', { id: member.id, ...data, avatar: photoData });
        }
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

// ============================================================
//  RISTORANTI / TAVOLATE  (valuta L.E, separata dai saldi €)
// ============================================================
function viewDining() {
  const wrap = document.createElement('div');
  if (state.diningSessionId) renderDiningSession(wrap, state.diningSessionId);
  else renderDiningList(wrap);
  return wrap;
}

function diningSessionRowHTML(s) {
  const date = s.dined_on
    ? new Date(s.dined_on).toLocaleDateString('it-IT', { weekday: 'short', day: '2-digit', month: 'short' })
    : dateLabel(s.created_at);
  const title = s.title || s.restaurant_name;
  const badge = s.status === 'open'
    ? '<span class="chip active" style="font-size:10px">aperta</span>'
    : '<span class="chip" style="font-size:10px">chiusa</span>';
  return `
    <div class="expense-row" data-sess="${s.id}" style="cursor:pointer">
      <div class="expense-icon">${s.emoji || '🍝'}</div>
      <div class="expense-meta">
        <div class="title">${escapeHtml(title)} ${badge}</div>
        <div class="sub">${escapeHtml(s.restaurant_name)} · ${date} · ${s.people} ${s.people === 1 ? 'persona' : 'persone'}</div>
      </div>
      <div class="expense-amount">${fmtCur(s.grand_total, s.currency)}</div>
    </div>`;
}

async function renderDiningList(wrap) {
  wrap.innerHTML = '<div class="muted" style="padding:30px;text-align:center">Caricamento…</div>';
  let restaurants = [], sessions = [];
  try {
    [restaurants, sessions] = await Promise.all([
      api('restaurants').then(r => r.restaurants),
      api('dining_sessions').then(r => r.sessions),
    ]);
  } catch (e) { wrap.innerHTML = `<div class="empty">${escapeHtml(e.message)}</div>`; return; }
  wrap.innerHTML = '';

  const intro = document.createElement('div');
  intro.className = 'card';
  intro.innerHTML = `
    <h2>🍝 Cene al ristorante</h2>
    <div style="font-size:13px;color:var(--muted);line-height:1.6">
      Apri una <b style="color:var(--text)">tavolata</b>, ognuno aggiunge i piatti che ha preso dal menù.
      A fine cena ognuno vede quanto deve <b style="color:var(--text)">(in L.E)</b> e paga Thomas, che salda il ristorante.
    </div>`;
  wrap.appendChild(intro);

  const newBtn = document.createElement('button');
  newBtn.className = 'btn primary full lg';
  newBtn.style.margin = '2px 0 14px';
  newBtn.innerHTML = '➕ Nuova tavolata';
  newBtn.addEventListener('click', () => openNewDiningSession(restaurants));
  wrap.appendChild(newBtn);

  const bindRows = (container) => container.querySelectorAll('[data-sess]').forEach(r =>
    r.addEventListener('click', () => { state.diningSessionId = +r.dataset.sess; render(); }));

  if (!sessions.length) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.innerHTML = '🍽️ Nessuna tavolata ancora.<br>Tocca "Nuova tavolata" per iniziare!';
    wrap.appendChild(empty);
  } else {
    const open = sessions.filter(s => s.status === 'open');
    const closed = sessions.filter(s => s.status !== 'open');
    if (open.length) {
      const c = document.createElement('div'); c.className = 'card';
      c.innerHTML = `<h2>In corso</h2>` + open.map(diningSessionRowHTML).join('');
      bindRows(c); wrap.appendChild(c);
    }
    if (closed.length) {
      const c = document.createElement('div'); c.className = 'card';
      c.innerHTML = `<h2>Chiuse</h2>` + closed.map(diningSessionRowHTML).join('');
      bindRows(c); wrap.appendChild(c);
    }
  }

  if (state.me.is_admin) {
    const manage = document.createElement('button');
    manage.className = 'btn ghost full';
    manage.textContent = '🍽️  Gestisci ristoranti e menù';
    manage.addEventListener('click', () => openRestaurantManager());
    wrap.appendChild(manage);
  }
}

function openNewDiningSession(restaurants) {
  if (!restaurants || !restaurants.length) return toast('Aggiungi prima un ristorante', true);
  let rid = restaurants[0].id;
  const today = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD locale
  function html() {
    return `
      <h2>➕ Nuova tavolata</h2>
      <div class="form-group"><label>Ristorante</label>
        <div class="cat-grid">
          ${restaurants.map(r => `<button type="button" class="cat-tile ${r.id === rid ? 'active' : ''}" data-rid="${r.id}"><span>${r.emoji || '🍝'}</span>${escapeHtml(r.name)}</button>`).join('')}
        </div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>Data</label><input type="date" id="dsDate" value="${today}" /></div>
        <div class="form-group"><label>Nome (facoltativo)</label><input id="dsTitle" placeholder="es. Cena sabato" /></div>
      </div>
      <div class="row gap" style="margin-top:14px">
        <button class="btn ghost" id="dsCancel" style="flex:1">Annulla</button>
        <button class="btn primary" id="dsSave" style="flex:2">Apri tavolata</button>
      </div>`;
  }
  openModal(html(), (modal, close) => {
    const bind = () => {
      modal.querySelectorAll('[data-rid]').forEach(b => b.addEventListener('click', () => {
        rid = +b.dataset.rid;
        modal.querySelectorAll('[data-rid]').forEach(x => x.classList.toggle('active', +x.dataset.rid === rid));
      }));
      modal.querySelector('#dsCancel').addEventListener('click', close);
      modal.querySelector('#dsSave').addEventListener('click', async () => {
        try {
          const { id } = await api('dining_session_create', {
            restaurant_id: rid,
            dined_on: modal.querySelector('#dsDate').value || null,
            title: modal.querySelector('#dsTitle').value.trim() || null,
          });
          toast('Tavolata aperta 🍝');
          close();
          state.diningSessionId = id;
          render();
        } catch (e) { toast(e.message, true); }
      });
    };
    bind();
  });
}

async function renderDiningSession(wrap, id) {
  wrap.innerHTML = '<div class="muted" style="padding:30px;text-align:center">Caricamento…</div>';
  let data;
  try { data = await api(`dining_session_get&id=${id}`); }
  catch (e) { wrap.innerHTML = `<div class="empty">${escapeHtml(e.message)}</div>`; return; }
  wrap.innerHTML = '';

  const s = data.session;
  const cur = s.currency || 'L.E';
  const isOpen = s.status === 'open';
  const treasurerId = data.treasurer_id;
  const isTreas = state.me.id === treasurerId || state.me.is_admin;
  const meId = data.me_id;
  const treasurerName = (state.members.find(m => m.id === treasurerId) || {}).name || 'Thomas';

  const back = document.createElement('button');
  back.className = 'btn ghost sm';
  back.style.marginBottom = '12px';
  back.innerHTML = '←  Tutte le tavolate';
  back.addEventListener('click', () => { state.diningSessionId = null; render(); });
  wrap.appendChild(back);

  const head = document.createElement('div');
  head.className = 'hero-card';
  head.innerHTML = `
    <div class="hero-label">${s.emoji || '🍝'} ${escapeHtml(s.title || s.restaurant_name)}${isOpen ? '' : ' · chiusa'}</div>
    <div class="hero-value">${fmtCur(data.grand_total, cur)}</div>
    <div class="hero-meta">
      <div><div class="lbl">Ristorante</div><div class="v" style="font-size:14px">${escapeHtml(s.restaurant_name)}</div></div>
      <div><div class="lbl">Incassato</div><div class="v">${fmtCur(data.collected, cur)}</div></div>
      <div><div class="lbl">Mancano</div><div class="v">${fmtCur(data.grand_total - data.collected, cur)}</div></div>
    </div>`;
  wrap.appendChild(head);

  if (isOpen) {
    const addBtn = document.createElement('button');
    addBtn.className = 'btn primary full lg';
    addBtn.style.margin = '2px 0 14px';
    addBtn.innerHTML = '🍽️  Aggiungi i miei piatti';
    addBtn.addEventListener('click', () => openMenuPicker(s, meId));
    wrap.appendChild(addBtn);
  }

  const list = document.createElement('div');
  list.className = 'card';
  let inner = `<h2>Il conto · ognuno paga ${escapeHtml(treasurerName)}</h2>`;
  if (!data.members.length) {
    inner += '<div class="muted" style="font-size:13px;padding:6px 0">Ancora nessun piatto. Tocca "Aggiungi i miei piatti".</div>';
  }
  data.members.forEach(m => {
    const mem = state.members.find(x => x.id === m.member_id) || { id: m.member_id, name: m.name };
    const mine = m.member_id === meId;
    const canEdit = isOpen && (mine || isTreas);
    const canPaid = mine || isTreas;
    inner += `
      <div class="dining-member">
        <div class="member-row" style="padding:6px 0;cursor:default">
          ${avatarHTML(mem, 36)}
          <div class="name">${escapeHtml(m.name)}${mine ? ' <span class="chip active" style="font-size:10px">tu</span>' : ''}
            <div>${m.items.reduce((a, b) => a + b.qty, 0)} piatti</div>
          </div>
          <div style="text-align:right">
            <div style="font-weight:700;font-feature-settings:'tnum' 1">${fmtCur(m.total, cur)}</div>
            ${m.paid
              ? '<span class="chip active" style="font-size:10px;margin-top:2px">pagato ✓</span>'
              : '<span class="chip" style="font-size:10px;margin-top:2px">da pagare</span>'}
          </div>
        </div>
        <div class="dining-items">
          ${m.items.map(it => `
            <div class="dining-item-row">
              <span>${it.qty > 1 ? `<b>${it.qty}×</b> ` : ''}${escapeHtml(it.name)}</span>
              <span class="row gap" style="align-items:center;gap:8px">
                ${fmtCur(it.line_total, cur)}
                ${canEdit ? `<button class="mini-x" data-rm="${it.id}" title="Togli uno">✕</button>` : ''}
              </span>
            </div>`).join('')}
        </div>
        <div class="row gap" style="margin-top:8px">
          ${canEdit ? `<button class="btn ghost sm" data-add="${m.member_id}" style="flex:1">+ piatto</button>` : ''}
          ${canPaid ? `<button class="btn ${m.paid ? 'ghost' : 'primary'} sm" data-paid="${m.member_id}" style="flex:1">${m.paid ? 'Annulla' : '✓ Ha pagato'}</button>` : ''}
        </div>
      </div>`;
  });
  list.innerHTML = inner;
  wrap.appendChild(list);

  list.querySelectorAll('[data-rm]').forEach(b => b.addEventListener('click', async () => {
    try { await api('dining_order_remove', { id: +b.dataset.rm }); render(); }
    catch (e) { toast(e.message, true); }
  }));
  list.querySelectorAll('[data-add]').forEach(b => b.addEventListener('click', () => openMenuPicker(s, +b.dataset.add)));
  list.querySelectorAll('[data-paid]').forEach(b => b.addEventListener('click', async () => {
    try { await api('dining_paid_toggle', { session_id: s.id, member_id: +b.dataset.paid }); render(); }
    catch (e) { toast(e.message, true); }
  }));

  const canManage = isTreas || (+s.created_by_member_id === meId);
  if (canManage) {
    const actions = document.createElement('div');
    actions.className = 'row gap';
    actions.style.marginTop = '4px';
    actions.innerHTML = `
      <button class="btn ghost" id="dClose" style="flex:2">${isOpen ? '🔒 Chiudi tavolata' : '🔓 Riapri'}</button>
      <button class="btn danger" id="dDel" style="flex:1">🗑️ Elimina</button>`;
    actions.querySelector('#dClose').addEventListener('click', async () => {
      try { await api('dining_session_close', { id: s.id, reopen: !isOpen }); toast(isOpen ? 'Tavolata chiusa' : 'Riaperta'); render(); }
      catch (e) { toast(e.message, true); }
    });
    actions.querySelector('#dDel').addEventListener('click', async () => {
      if (!confirm('Eliminare la tavolata e tutti gli ordini?')) return;
      try { await api('dining_session_delete', { id: s.id }); toast('Tavolata eliminata'); state.diningSessionId = null; render(); }
      catch (e) { toast(e.message, true); }
    });
    wrap.appendChild(actions);
  }
}

// ---- Menu picker (carrello) ----
async function openMenuPicker(session, memberId) {
  const cur = session.currency || 'L.E';
  let menu;
  try { menu = await api(`restaurant_menu&restaurant_id=${session.restaurant_id}`); }
  catch (e) { return toast(e.message, true); }
  const items = menu.items;
  if (!items.length) return toast('Menù vuoto: aggiungi piatti dalle impostazioni', true);

  const cart = {};   // menu_item_id -> qty
  const itemById = {};
  const sections = [];
  const grouped = {};
  items.forEach(it => {
    itemById[it.id] = it;
    if (!grouped[it.section]) { grouped[it.section] = []; sections.push(it.section); }
    grouped[it.section].push(it);
  });

  const canPickOther = (state.me.is_admin || state.me.id === (state.trip?.payer_member_id || 1));
  const targetName = (state.members.find(m => m.id === memberId) || {}).name || '';

  function subtotal() {
    return Object.entries(cart).reduce((s, [id, q]) => s + (itemById[id] ? itemById[id].price * q : 0), 0);
  }

  openModal('<div id="mpRoot"></div>', (modal, close) => {
    function draw(filter) {
      filter = (filter || '').toLowerCase().trim();
      const root = modal.querySelector('#mpRoot');
      const totalQty = Object.values(cart).reduce((a, b) => a + b, 0);
      let body = `
        <h2>🍽️ Cosa ha preso ${escapeHtml(targetName)}?</h2>
        <div class="menu-search">
          <input id="mpSearch" placeholder="Cerca un piatto…" value="${escapeHtml(filter)}" autocomplete="off" />
        </div>`;
      sections.forEach(sec => {
        const rows = grouped[sec].filter(it => !filter || it.name.toLowerCase().includes(filter) || (it.description || '').toLowerCase().includes(filter));
        if (!rows.length) return;
        body += `<div class="menu-section">${escapeHtml(sec)}</div>`;
        rows.forEach(it => {
          const q = cart[it.id] || 0;
          body += `
            <div class="menu-row">
              <div class="mi">
                <div class="nm">${escapeHtml(it.name)}</div>
                ${it.description ? `<div class="ds">${escapeHtml(it.description)}</div>` : ''}
                <div class="pr">${fmtCur(it.price, cur)}</div>
              </div>
              <div class="qty-stepper">
                ${q > 0 ? `<button class="minus" data-minus="${it.id}">−</button><span class="q">${q}</span>` : ''}
                <button class="plus" data-plus="${it.id}">+</button>
              </div>
            </div>`;
        });
      });
      body += `
        <button class="btn ghost full sm" id="mpFree" style="margin-top:14px">➕ Voce fuori menù</button>
        <div class="menu-footer">
          <div class="row between" style="margin-bottom:10px">
            <span class="muted" style="font-size:13px">${totalQty} piatti</span>
            <b style="font-size:18px;font-feature-settings:'tnum' 1">${fmtCur(subtotal(), cur)}</b>
          </div>
          <div class="row gap">
            <button class="btn ghost" id="mpCancel" style="flex:1">Annulla</button>
            <button class="btn primary" id="mpSave" style="flex:2">Aggiungi al conto</button>
          </div>
        </div>`;
      root.innerHTML = body;

      root.querySelectorAll('[data-plus]').forEach(b => b.addEventListener('click', () => {
        const id = b.dataset.plus; cart[id] = (cart[id] || 0) + 1; draw(modal.querySelector('#mpSearch').value);
      }));
      root.querySelectorAll('[data-minus]').forEach(b => b.addEventListener('click', () => {
        const id = b.dataset.minus; cart[id] = Math.max(0, (cart[id] || 0) - 1); if (!cart[id]) delete cart[id]; draw(modal.querySelector('#mpSearch').value);
      }));
      const search = root.querySelector('#mpSearch');
      search.addEventListener('input', () => { const v = search.value; draw(v); const ns = modal.querySelector('#mpSearch'); ns.focus(); ns.setSelectionRange(v.length, v.length); });
      root.querySelector('#mpCancel').addEventListener('click', close);
      root.querySelector('#mpFree').addEventListener('click', () => openFreeItem(session, memberId, close));
      root.querySelector('#mpSave').addEventListener('click', async () => {
        const list = Object.entries(cart).filter(([, q]) => q > 0).map(([id, q]) => ({ menu_item_id: +id, qty: q }));
        if (!list.length) return toast('Seleziona almeno un piatto', true);
        try {
          await api('dining_order_add', { session_id: session.id, member_id: memberId, items: list });
          toast('Piatti aggiunti 🍽️');
          close();
          render();
        } catch (e) { toast(e.message, true); }
      });
    }
    draw('');
  });
}

// voce libera (fuori menù)
function openFreeItem(session, memberId, parentClose) {
  const cur = session.currency || 'L.E';
  const html = `
    <h2>➕ Voce fuori menù</h2>
    <div class="form-group"><label>Cosa</label><input id="fiName" placeholder="es. Acqua, Coca Cola, Caffè…" /></div>
    <div class="form-group"><label>Prezzo (${escapeHtml(cur)})</label><input type="number" inputmode="decimal" step="1" id="fiPrice" placeholder="0" /></div>
    <div class="form-group"><label>Quantità</label><input type="number" inputmode="numeric" step="1" id="fiQty" value="1" /></div>
    <div class="row gap" style="margin-top:14px">
      <button class="btn ghost" id="fiCancel" style="flex:1">Annulla</button>
      <button class="btn primary" id="fiSave" style="flex:2">Aggiungi</button>
    </div>`;
  openModal(html, (modal, close) => {
    modal.querySelector('#fiCancel').addEventListener('click', close);
    modal.querySelector('#fiSave').addEventListener('click', async () => {
      const name = modal.querySelector('#fiName').value.trim();
      const price = parseFloat((modal.querySelector('#fiPrice').value || '').replace(',', '.'));
      const qty = Math.max(1, parseInt(modal.querySelector('#fiQty').value || '1', 10));
      if (!name) return toast('Inserisci il nome', true);
      if (!(price >= 0)) return toast('Prezzo non valido', true);
      try {
        await api('dining_order_add', { session_id: session.id, member_id: memberId, items: [{ name, price, qty }] });
        toast('Aggiunto 🍽️');
        close();
        if (parentClose) parentClose();
        render();
      } catch (e) { toast(e.message, true); }
    });
    setTimeout(() => modal.querySelector('#fiName')?.focus(), 60);
  });
}

// ---- Gestione ristoranti & menù (admin) ----
async function openRestaurantManager() {
  let restaurants;
  try { restaurants = (await api('restaurants')).restaurants; }
  catch (e) { return toast(e.message, true); }
  let html = `<h2>🍽️ Ristoranti</h2>`;
  html += restaurants.map(r => `
    <div class="member-row" data-redit="${r.id}">
      <div class="expense-icon">${r.emoji || '🍝'}</div>
      <div class="name">${escapeHtml(r.name)}<div>valuta ${escapeHtml(r.currency)}</div></div>
      <span class="chip" style="font-size:11px">menù ›</span>
    </div>`).join('') || '<div class="muted" style="font-size:13px">Nessun ristorante.</div>';
  html += `<button class="btn ghost full" id="raNew" style="margin-top:12px">+ Nuovo ristorante</button>
    <button class="btn ghost full" id="raClose" style="margin-top:8px">Chiudi</button>`;
  openModal(html, (modal, close) => {
    modal.querySelector('#raClose').addEventListener('click', close);
    modal.querySelector('#raNew').addEventListener('click', () => { close(); openRestaurantEditor(null); });
    modal.querySelectorAll('[data-redit]').forEach(r => r.addEventListener('click', () => {
      close();
      openMenuManager(restaurants.find(x => x.id === +r.dataset.redit));
    }));
  });
}

function openRestaurantEditor(rest) {
  const isNew = !rest;
  const html = `
    <h2>${isNew ? 'Nuovo ristorante' : 'Modifica ' + escapeHtml(rest.name)}</h2>
    <div class="form-row">
      <div class="form-group"><label>Emoji</label><input id="reEmoji" value="${escapeHtml(rest?.emoji || '🍝')}" /></div>
      <div class="form-group"><label>Valuta</label><input id="reCur" value="${escapeHtml(rest?.currency || 'L.E')}" /></div>
    </div>
    <div class="form-group"><label>Nome</label><input id="reName" value="${escapeHtml(rest?.name || '')}" placeholder="es. Tre Fratelli" /></div>
    <div class="form-group"><label>Nota (facoltativa)</label><textarea id="reNote" rows="2">${escapeHtml(rest?.note || '')}</textarea></div>
    <div class="row gap" style="margin-top:14px">
      ${!isNew ? '<button class="btn danger" id="reDel">Elimina</button>' : ''}
      <button class="btn ghost" id="reCancel" style="flex:1">Annulla</button>
      <button class="btn primary" id="reSave" style="flex:2">Salva</button>
    </div>`;
  openModal(html, (modal, close) => {
    modal.querySelector('#reCancel').addEventListener('click', close);
    modal.querySelector('#reSave').addEventListener('click', async () => {
      const name = modal.querySelector('#reName').value.trim();
      if (!name) return toast('Nome obbligatorio', true);
      try {
        const r = await api('restaurant_save', {
          id: rest?.id || 0,
          name,
          currency: modal.querySelector('#reCur').value.trim() || 'L.E',
          emoji: modal.querySelector('#reEmoji').value.trim() || '🍝',
          note: modal.querySelector('#reNote').value.trim() || null,
        });
        toast('Salvato');
        close();
        if (isNew) openMenuManager({ id: r.id, name, currency: modal.querySelector('#reCur')?.value || 'L.E', emoji: '🍝' });
      } catch (e) { toast(e.message, true); }
    });
    modal.querySelector('#reDel')?.addEventListener('click', async () => {
      if (!confirm('Eliminare ' + rest.name + '? (le tavolate restano)')) return;
      try { await api('restaurant_delete', { id: rest.id }); toast('Eliminato'); close(); }
      catch (e) { toast(e.message, true); }
    });
  });
}

async function openMenuManager(rest) {
  let data;
  try { data = await api(`restaurant_menu&restaurant_id=${rest.id}`); }
  catch (e) { return toast(e.message, true); }
  const cur = data.restaurant.currency || 'L.E';
  const items = data.items;
  const sections = [];
  const grouped = {};
  items.forEach(it => { if (!grouped[it.section]) { grouped[it.section] = []; sections.push(it.section); } grouped[it.section].push(it); });

  let html = `<h2>${rest.emoji || '🍝'} ${escapeHtml(data.restaurant.name)} · menù</h2>
    <p style="margin:0 0 10px;font-size:12px;color:var(--muted)">Prezzi in ${escapeHtml(cur)}. Tocca un piatto per modificarlo.</p>`;
  if (!items.length) html += '<div class="muted" style="font-size:13px">Menù vuoto.</div>';
  sections.forEach(sec => {
    html += `<div class="menu-section">${escapeHtml(sec)}</div>`;
    grouped[sec].forEach(it => {
      html += `
        <div class="menu-row" data-medit="${it.id}" style="cursor:pointer">
          <div class="mi"><div class="nm">${escapeHtml(it.name)}</div>${it.description ? `<div class="ds">${escapeHtml(it.description)}</div>` : ''}</div>
          <div class="pr">${fmtCur(it.price, cur)}</div>
        </div>`;
    });
  });
  html += `<button class="btn ghost full" id="miNew" style="margin-top:14px">+ Aggiungi piatto</button>
    <button class="btn ghost full" id="reEdit" style="margin-top:8px">⚙️ Modifica ristorante</button>
    <button class="btn ghost full" id="mmClose" style="margin-top:8px">Chiudi</button>`;
  openModal(html, (modal, close) => {
    modal.querySelector('#mmClose').addEventListener('click', close);
    modal.querySelector('#reEdit').addEventListener('click', () => { close(); openRestaurantEditor(data.restaurant); });
    modal.querySelector('#miNew').addEventListener('click', () => { close(); openMenuItemEditor(rest, null, sections); });
    modal.querySelectorAll('[data-medit]').forEach(r => r.addEventListener('click', () => {
      close(); openMenuItemEditor(rest, items.find(x => x.id === +r.dataset.medit), sections);
    }));
  });
}

function openMenuItemEditor(rest, item, sections) {
  const isNew = !item;
  const cur = rest.currency || 'L.E';
  const html = `
    <h2>${isNew ? 'Nuovo piatto' : 'Modifica piatto'}</h2>
    <div class="form-group"><label>Sezione</label>
      <input id="miSection" list="miSections" value="${escapeHtml(item?.section || (sections[0] || 'Menù'))}" />
      <datalist id="miSections">${(sections || []).map(s => `<option value="${escapeHtml(s)}">`).join('')}</datalist>
    </div>
    <div class="form-group"><label>Nome</label><input id="miName" value="${escapeHtml(item?.name || '')}" /></div>
    <div class="form-group"><label>Descrizione (facoltativa)</label><input id="miDesc" value="${escapeHtml(item?.description || '')}" /></div>
    <div class="form-group"><label>Prezzo (${escapeHtml(cur)})</label><input type="number" inputmode="decimal" step="1" id="miPrice" value="${item?.price != null ? Math.round(item.price) : ''}" /></div>
    <div class="row gap" style="margin-top:14px">
      ${!isNew ? '<button class="btn danger" id="miDel">Elimina</button>' : ''}
      <button class="btn ghost" id="miCancel" style="flex:1">Annulla</button>
      <button class="btn primary" id="miSave" style="flex:2">Salva</button>
    </div>`;
  openModal(html, (modal, close) => {
    const reopen = () => openMenuManager(rest);
    modal.querySelector('#miCancel').addEventListener('click', () => { close(); reopen(); });
    modal.querySelector('#miSave').addEventListener('click', async () => {
      const name = modal.querySelector('#miName').value.trim();
      const price = parseFloat((modal.querySelector('#miPrice').value || '').replace(',', '.'));
      if (!name) return toast('Nome obbligatorio', true);
      if (!(price >= 0)) return toast('Prezzo non valido', true);
      try {
        await api('menu_item_save', {
          id: item?.id || 0,
          restaurant_id: rest.id,
          section: modal.querySelector('#miSection').value.trim() || 'Menù',
          name,
          description: modal.querySelector('#miDesc').value.trim() || null,
          price,
        });
        toast('Salvato');
        close(); reopen();
      } catch (e) { toast(e.message, true); }
    });
    modal.querySelector('#miDel')?.addEventListener('click', async () => {
      if (!confirm('Eliminare ' + item.name + '?')) return;
      try { await api('menu_item_delete', { id: item.id }); toast('Eliminato'); close(); reopen(); }
      catch (e) { toast(e.message, true); }
    });
  });
}

// ============================================================
//  SFONDO LASER-GRID (canvas, retro-futurista, "breathing pulse")
// ============================================================
function initBgFx() {
  const c = document.getElementById('bgfx');
  if (!c || !c.getContext) return;
  const ctx = c.getContext('2d');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let W = 0, H = 0, dpr = 1, raf = 0;
  const ptr = { x: 0.5, y: 0.5, tx: 0.5, ty: 0.5 };

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = c.width = Math.floor(innerWidth * dpr);
    H = c.height = Math.floor(innerHeight * dpr);
    c.style.width = innerWidth + 'px';
    c.style.height = innerHeight + 'px';
  }
  resize();
  addEventListener('resize', resize, { passive: true });
  addEventListener('pointermove', e => { ptr.tx = e.clientX / innerWidth; ptr.ty = e.clientY / innerHeight; }, { passive: true });

  // anchor "stelle" sparse che pulsano
  const anchors = Array.from({ length: 26 }, (_, i) => ({
    x: (Math.sin(i * 12.9898) * 43758.5453 % 1 + 1) % 1,
    y: (Math.sin(i * 78.233) * 12543.123 % 1 + 1) % 1,
    p: (i * 0.37) % 1,
  }));

  let t = 0;
  function draw() {
    t += reduce ? 0 : 0.0125;
    ptr.x += (ptr.tx - ptr.x) * 0.045;
    ptr.y += (ptr.ty - ptr.y) * 0.045;
    const breathe = 0.5 + 0.5 * Math.sin(t * 0.55);   // pulsazione lenta

    ctx.clearRect(0, 0, W, H);

    const horizon = H * (0.40 + (ptr.y - 0.5) * 0.05);
    const vanish = W * (0.5 + (ptr.x - 0.5) * 0.10);

    // bagliore orizzonte
    const g = ctx.createRadialGradient(vanish, horizon, 0, vanish, horizon, W * 0.6);
    g.addColorStop(0, `rgba(74,222,128,${0.10 + 0.05 * breathe})`);
    g.addColorStop(1, 'rgba(74,222,128,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    ctx.lineWidth = 1 * dpr;

    // linee orizzontali che scorrono verso lo spettatore (pavimento prospettico)
    const rows = 22;
    for (let i = 0; i < rows; i++) {
      let p = (i + (t * 0.18) % 1) / rows;       // 0..1
      const y = horizon + (H - horizon) * (p * p);
      if (y < horizon) continue;
      const a = Math.min(0.22, p * 0.30) * (0.55 + 0.45 * breathe);
      ctx.strokeStyle = `rgba(74,222,128,${a})`;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }

    // linee verticali che convergono al punto di fuga
    const cols = 26;
    for (let i = -cols; i <= cols; i++) {
      const botX = vanish + (i / cols) * (W * 1.5);
      const d = Math.abs(i) / cols;
      const a = (0.16 - d * 0.12) * (0.55 + 0.45 * breathe);
      if (a <= 0.01) continue;
      ctx.strokeStyle = `rgba(74,222,128,${a})`;
      ctx.beginPath(); ctx.moveTo(vanish, horizon); ctx.lineTo(botX, H); ctx.stroke();
    }

    // anchor sparse luminose nella parte alta
    for (const an of anchors) {
      const pulse = 0.5 + 0.5 * Math.sin(t * 1.1 + an.p * 6.28);
      const x = an.x * W;
      const y = an.y * horizon * 0.95;
      const r = (1.1 + pulse * 1.6) * dpr;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, 6.2832);
      ctx.fillStyle = `rgba(110,231,160,${0.10 + pulse * 0.35})`;
      ctx.fill();
    }

    raf = requestAnimationFrame(draw);
  }

  function start() { cancelAnimationFrame(raf); raf = requestAnimationFrame(draw); }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) cancelAnimationFrame(raf); else start();
  });
  if (reduce) { draw(); }   // disegno statico
  else start();
}

// ============ GIOCO FRECCETTE (DARTS) ============
const DARTS_KEY = 'vacanza_darts_v1';

function dartsLoad() {
  try { return JSON.parse(localStorage.getItem(DARTS_KEY)) || null; } catch (e) { return null; }
}
function dartsSave(g) {
  if (g) localStorage.setItem(DARTS_KEY, JSON.stringify(g));
  else localStorage.removeItem(DARTS_KEY);
}
// Backup di sicurezza: salva una partita prima di azzerarla/sovrascriverla
const DARTS_BACKUP_KEY = 'vacanza_darts_backup_v1';
function dartsBackupSave(g) {
  if (g && g.players && g.players.length) localStorage.setItem(DARTS_BACKUP_KEY, JSON.stringify(g));
}
function dartsBackupLoad() {
  try { return JSON.parse(localStorage.getItem(DARTS_BACKUP_KEY)) || null; } catch (e) { return null; }
}

function openDarts() {
  const overlay = document.createElement('div');
  overlay.className = 'darts-overlay';
  document.body.appendChild(overlay);
  const close = () => { try { window.Darts3D && window.Darts3D.unmount(); } catch (e) {} overlay.remove(); if (state.route === 'home') render(); };

  // canvas 3D persistente: montato una volta, riattaccato a ogni render (no flash, no perdita contesto WebGL)
  const boardCanvas = document.createElement('canvas');
  boardCanvas.id = 'darts3dCanvas'; boardCanvas.className = 'darts3d';

  let game = dartsLoad();

  // ---- stato setup ----
  let setupStart = (game && game.start) || 301;
  let setupPlayers = (game && !game.active && game.players)
    ? game.players.map(p => ({ name: p.name, avatar: p.avatar || null, id: p.id || null }))
    : [];

  const paint = () => { (game && game.active) ? renderGame() : renderSetup(); };

  // ============ SETUP ============
  function renderSetup() {
    const preset = [301, 501, 701];
    const bk = dartsBackupLoad();
    const bkInfo = bk ? `${bk.players.map(p => p.name).join(', ')} · ${bk.start}` : '';
    overlay.innerHTML = `
      <div class="darts-sheet">
        <div class="darts-top">
          <div class="darts-title">🎯 Freccette</div>
          <button class="icon-btn" data-x aria-label="Chiudi">✕</button>
        </div>
        <div class="darts-scroll">
          ${bk ? `<button class="darts-restore" id="dRestore">
            <span class="dr-ic">↩︎</span>
            <span class="dr-tx"><b>Ripristina partita precedente</b><small>${escapeHtml(bkInfo)}</small></span>
          </button>` : ''}
          <div class="darts-section-lbl">Punti a partita</div>
          <div class="darts-chips">
            ${preset.map(v => `<button class="darts-chip ${setupStart === v ? 'active' : ''}" data-start="${v}">${v}</button>`).join('')}
            <input class="darts-chip-input" id="dStartCustom" inputmode="numeric" placeholder="Altro" value="${preset.includes(setupStart) ? '' : setupStart}" />
          </div>

          <div class="darts-section-lbl">Giocatori <span class="muted">· ${setupPlayers.length}</span></div>
          <div class="darts-members">
            ${state.members.map(m => {
              const on = setupPlayers.some(p => p.name === m.name);
              return `<button class="darts-member ${on ? 'on' : ''}" data-mname="${escapeHtml(m.name)}">${avatarHTML(m, 36)}<span>${escapeHtml(m.name)}</span></button>`;
            }).join('')}
          </div>

          <div class="darts-add">
            <input id="dCustomName" placeholder="Aggiungi un altro giocatore..." autocomplete="off" />
            <button class="btn ghost" id="dAddBtn">＋</button>
          </div>
          ${setupPlayers.filter(p => !state.members.some(m => m.name === p.name)).map(p =>
            `<div class="darts-guest"><span>👤 ${escapeHtml(p.name)}</span><button data-rm="${escapeHtml(p.name)}" aria-label="Rimuovi">✕</button></div>`
          ).join('')}
        </div>
        <div class="darts-foot">
          <button class="btn primary full lg" id="dStart" ${setupPlayers.length < 2 ? 'disabled' : ''}>
            ${setupPlayers.length < 2 ? 'Scegli almeno 2 giocatori' : `Inizia partita · ${setupStart}`}
          </button>
        </div>
      </div>`;

    overlay.querySelector('[data-x]').onclick = close;
    const restoreBtn = overlay.querySelector('#dRestore');
    if (restoreBtn) restoreBtn.onclick = () => {
      const b = dartsBackupLoad();
      if (!b) { toast('Nessuna partita da ripristinare', true); return; }
      game = Object.assign({}, b, { active: true });
      dartsSave(game);
      renderGame();
    };
    overlay.querySelectorAll('[data-start]').forEach(b => b.onclick = () => { setupStart = +b.dataset.start; renderSetup(); });
    const ci = overlay.querySelector('#dStartCustom');
    ci.oninput = () => { const v = parseInt(ci.value, 10); if (v > 0) setupStart = v; };
    ci.onblur = () => renderSetup();
    overlay.querySelectorAll('[data-mname]').forEach(b => b.onclick = () => {
      const name = b.dataset.mname;
      const i = setupPlayers.findIndex(p => p.name === name);
      if (i >= 0) setupPlayers.splice(i, 1);
      else { const m = state.members.find(x => x.name === name); setupPlayers.push({ name, avatar: m?.avatar || null, id: m?.id || null }); }
      renderSetup();
    });
    const addCustom = () => {
      const inp = overlay.querySelector('#dCustomName');
      const n = (inp.value || '').trim();
      if (!n) return;
      if (setupPlayers.some(p => p.name === n)) { toast('Giocatore già aggiunto', true); return; }
      setupPlayers.push({ name: n, avatar: null, id: null });
      renderSetup();
    };
    overlay.querySelector('#dAddBtn').onclick = addCustom;
    overlay.querySelector('#dCustomName').onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); addCustom(); } };
    overlay.querySelectorAll('[data-rm]').forEach(b => b.onclick = () => {
      const i = setupPlayers.findIndex(p => p.name === b.dataset.rm);
      if (i >= 0) setupPlayers.splice(i, 1);
      renderSetup();
    });
    overlay.querySelector('#dStart').onclick = () => {
      if (setupPlayers.length < 2) return;
      // Se c'è una partita con tiri già fatti, salvala come backup prima di sovrascriverla
      const prev = dartsLoad();
      if (prev && prev.players && prev.players.some(p => p.throws && p.throws.length)) dartsBackupSave(prev);
      game = {
        active: true, start: setupStart, turn: 0, winner: null, log: [],
        players: setupPlayers.map(p => ({ name: p.name, avatar: p.avatar, id: p.id, score: setupStart, throws: [] })),
      };
      dartsSave(game);
      renderGame();
    };
  }

  // ============ PARTITA ============
  function renderGame() {
    const cur = game.players[game.turn];
    // Classifica live: punteggio più basso = più vicino a vincere
    const order = game.players.map((p, i) => ({ i, score: p.score })).sort((a, b) => a.score - b.score);
    const rankOf = {};
    let r = 0, prev = null;
    order.forEach((o, idx) => { if (prev === null || o.score !== prev) { r = idx + 1; prev = o.score; } rankOf[o.i] = r; });
    const started = game.players.some(p => p.throws.length);
    const leaderIdx = (started && order.length > 1 && order[0].score < order[1].score) ? order[0].i : -1;

    overlay.innerHTML = `
      <div class="darts-sheet">
        <div class="darts-top">
          <div class="darts-title">🎯 ${game.start}</div>
          <div class="row gap">
            <button class="icon-btn" id="dChart" title="Grafico partita">📈</button>
            <button class="icon-btn" id="dUndo" title="Annulla ultimo tiro">↺</button>
            <button class="icon-btn" id="dNew" title="Nuova partita">⟲</button>
            <button class="icon-btn dcancel" id="dCancel" title="Annulla partita">🗑️</button>
            <button class="icon-btn" data-x aria-label="Chiudi">✕</button>
          </div>
        </div>
        <div class="darts3d-wrap" id="d3dSlot"></div>
        ${game.winner != null ? `
          <div class="darts-winner">
            <div class="dw-trophy">🏆</div>
            <div><b>${escapeHtml(game.players[game.winner].name)}</b> ha vinto!</div>
            <button class="btn ghost" id="dWinChart">📈 Vedi grafico</button>
            <button class="btn primary" id="dWinNew">Nuova partita</button>
          </div>` : ''}
        <div class="darts-scroll">
          <div class="darts-players">
            ${game.players.map((p, i) => {
              const active = i === game.turn && game.winner == null;
              const last = p.throws.length ? p.throws[p.throws.length - 1] : null;
              const badge = i === leaderIdx ? '👑' : `${rankOf[i]}°`;
              return `<div class="darts-player ${active ? 'active' : ''} ${p.score === 0 ? 'won' : ''}">
                <span class="dp-rank ${i === leaderIdx ? 'leader' : ''}">${badge}</span>
                ${avatarHTML(p, 34)}
                <div class="dp-name">${escapeHtml(p.name)}${last != null ? `<span class="dp-last">ultimo −${last}</span>` : ''}</div>
                <div class="dp-score"${active ? ' id="dActiveScore"' : ''}>${p.score}</div>
              </div>`;
            }).join('')}
          </div>
        </div>
        ${game.winner == null ? `
        <div class="darts-foot">
          <div class="darts-current">Turno di <b>${escapeHtml(cur.name)}</b> — gli restano <b id="dResto">${cur.score}</b> · 3 tiri</div>
          <div class="dthrow">
            <span class="dslot" data-i="0">–</span>
            <span class="dslot" data-i="1">–</span>
            <span class="dslot" data-i="2">–</span>
            <span class="dtot">tot <b id="dSum">0</b></span>
          </div>
          <div class="dmult">
            <button class="dm active" data-m="1">Singolo</button>
            <button class="dm" data-m="2">Doppio ×2</button>
            <button class="dm" data-m="3">Triplo ×3</button>
          </div>
          <div class="dboard">
            ${Array.from({ length: 20 }, (_, i) => i + 1).map(n => `<button class="dnum" data-v="${n}">${n}</button>`).join('')}
            <button class="dnum dbull" data-v="25" data-fixed>25</button>
            <button class="dnum dbull" data-v="50" data-fixed>Bull 50</button>
            <button class="dnum dmiss" data-v="0" data-fixed>Miss</button>
          </div>
          <div class="drow">
            <button class="btn ghost" id="dBack">⌫ Annulla tiro</button>
            <button class="btn primary" id="dOk">Conferma</button>
          </div>
        </div>` : ''}
      </div>`;

    overlay.querySelector('[data-x]').onclick = close;
    overlay.querySelector('#dUndo').onclick = undo;
    overlay.querySelector('#dChart').onclick = () => openDartsChart(game);
    overlay.querySelector('#dNew').onclick = () => {
      if (confirm('Iniziare una nuova partita? Quella attuale verrà persa.')) { try { window.Darts3D && window.Darts3D.unmount(); } catch (e) {} dartsBackupSave(game); game.active = false; renderSetup(); }
    };
    overlay.querySelector('#dCancel').onclick = () => {
      if (confirm('Annullare la partita in corso? I punteggi andranno persi (potrai ripristinarla dal menu iniziale).')) {
        dartsBackupSave(game); dartsSave(null); game = null; close();
      }
    };
    const winNew = overlay.querySelector('#dWinNew');
    if (winNew) winNew.onclick = () => { try { window.Darts3D && window.Darts3D.unmount(); } catch (e) {} dartsBackupSave(game); game.active = false; renderSetup(); };
    const winChart = overlay.querySelector('#dWinChart');
    if (winChart) winChart.onclick = () => openDartsChart(game);

    // ── monta il tabellone 3D nel suo slot persistente ──
    const _slot = overlay.querySelector('#d3dSlot');
    if (_slot) { _slot.appendChild(boardCanvas); if (window.Darts3D) { try { window.Darts3D.mount(boardCanvas); } catch (e) { console.warn('darts3d', e); } } }

    if (game.winner == null) {
      let darts = [];   // i 3 tiri di questo turno
      let mult = 1;     // moltiplicatore selezionato (Singolo/Doppio/Triplo)
      const slots = overlay.querySelectorAll('.dslot');
      const sumEl = overlay.querySelector('#dSum');
      const multBtns = overlay.querySelectorAll('.dm');

      const restoEl = overlay.querySelector('#dResto');
      const actScoreEl = overlay.querySelector('#dActiveScore');
      const okBtn = overlay.querySelector('#dOk');
      function refresh() {
        slots.forEach((s, i) => {
          const has = darts[i] != null;
          s.textContent = has ? (darts[i] === 0 ? '✗' : darts[i]) : '–';
          s.classList.toggle('filled', has);
        });
        const sum = darts.reduce((a, b) => a + b, 0);
        sumEl.textContent = sum;
        multBtns.forEach(b => b.classList.toggle('active', +b.dataset.m === mult));
        // ── il punteggio scala a ogni tiro; se sfora → SBALLO e torna a quello di prima ──
        const live = cur.score - sum;
        const bust = live < 0;
        if (restoEl) {
          restoEl.textContent = bust ? 'SBALLO' : live;
          restoEl.classList.toggle('bust', bust);
        }
        if (actScoreEl) {
          actScoreEl.textContent = bust ? cur.score : live;   // se sballa mostra di nuovo quello di partenza
          actScoreEl.classList.toggle('bust', bust);
        }
        if (okBtn) okBtn.textContent = bust ? 'Sballato' : 'Conferma';
      }

      multBtns.forEach(b => b.onclick = () => { mult = +b.dataset.m; refresh(); });

      overlay.querySelectorAll('.dnum').forEach(b => b.onclick = () => {
        if (darts.length >= 3) { toast('Hai già fatto 3 tiri — premi Conferma', true); return; }
        const base = +b.dataset.v;
        const val = b.hasAttribute('data-fixed') ? base : base * mult; // 25/50/Miss senza moltiplicatore
        // ── effetto 3D: freccia che vola sul numero + esplosione ──
        if (window.Darts3D) {
          const mc = base === 50 ? 'B' : base === 25 ? '25' : base === 0 ? 'M' : (mult === 3 ? 'T' : mult === 2 ? 'D' : 'S');
          try { window.Darts3D.hit(base, mc); } catch (e) {}
        }
        darts.push(val);
        mult = 1; // si riparte da Singolo dopo ogni freccia
        refresh();
      });

      overlay.querySelector('#dBack').onclick = () => { darts.pop(); mult = 1; refresh(); };
      overlay.querySelector('#dOk').onclick = () => submit(darts.reduce((a, b) => a + b, 0));
      refresh();
    }
  }

  function submit(points) {
    if (points < 0 || points > 180) { toast('Max 180 punti per turno', true); return; }
    const pi = game.turn;
    const p = game.players[pi];
    const remaining = p.score - points;
    let busted = false;
    if (remaining < 0) {
      busted = true;
      toast(`Sballato! ${p.name} resta a ${p.score}`, true);
    } else {
      p.score = remaining;
      p.throws.push(points);
      if (remaining === 0) game.winner = pi;
    }
    game.log.push({ pi, points, busted });
    if (game.winner == null) game.turn = (game.turn + 1) % game.players.length;
    dartsSave(game);
    renderGame();
  }

  function undo() {
    if (!game.log.length) { toast('Niente da annullare'); return; }
    const mv = game.log.pop();
    const p = game.players[mv.pi];
    if (!mv.busted) { p.score += mv.points; p.throws.pop(); }
    game.winner = null;
    game.turn = mv.pi;
    dartsSave(game);
    renderGame();
  }

  paint();
}

// ---- Grafico andamento partita (SVG, nessuna libreria) ----
function dartsChartSVG(game) {
  const W = 320, H = 170, padL = 6, padR = 6, padT = 10, padB = 8;
  const start = game.start || 1;
  const maxThrows = Math.max(1, ...game.players.map(p => p.throws.length));
  const x = (i) => padL + (i / maxThrows) * (W - padL - padR);
  const y = (sc) => padT + (1 - sc / start) * (H - padT - padB);

  const baseY = y(0).toFixed(1);
  let svg = `<svg viewBox="0 0 ${W} ${H}" class="dchart-svg" preserveAspectRatio="none">`;
  // griglia: linee orizzontali a 25/50/75/100%
  [0.25, 0.5, 0.75].forEach(f => {
    const gy = (padT + f * (H - padT - padB)).toFixed(1);
    svg += `<line x1="${padL}" y1="${gy}" x2="${W - padR}" y2="${gy}" class="dchart-grid"/>`;
  });
  // linea zero (traguardo)
  svg += `<line x1="${padL}" y1="${baseY}" x2="${W - padR}" y2="${baseY}" class="dchart-zero"/>`;

  game.players.forEach((p, idx) => {
    const col = avatarColor(p.id || idx + 1);
    let s = start;
    const series = [start];
    p.throws.forEach(t => { s -= t; series.push(s); });
    const d = series.map((sc, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)} ${y(sc).toFixed(1)}`).join(' ');
    svg += `<path d="${d}" fill="none" stroke="${col}" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round" opacity="${p.score === 0 ? 1 : .92}"/>`;
    const lx = x(series.length - 1).toFixed(1), ly = y(series[series.length - 1]).toFixed(1);
    svg += `<circle cx="${lx}" cy="${ly}" r="${p.score === 0 ? 4.5 : 3.2}" fill="${col}"/>`;
  });
  svg += `</svg>`;
  return svg;
}

function openDartsChart(game) {
  const ranked = game.players.map((p, i) => ({ p, i })).sort((a, b) => a.p.score - b.p.score);
  const html = `
    <h2>📈 Andamento partita</h2>
    <div class="dchart">${dartsChartSVG(game)}</div>
    <div class="dchart-axis"><span>${game.start}</span><span>traguardo 0</span></div>
    <div class="darts-rank">
      ${ranked.map(({ p, i }, idx) => {
        const col = avatarColor(p.id || i + 1);
        const won = p.score === 0;
        return `<div class="dr-row ${won ? 'won' : ''}">
          <span class="dr-pos">${won ? '🏆' : (idx + 1) + '°'}</span>
          <span class="dr-dot" style="background:${col}"></span>
          <span class="dr-name">${escapeHtml(p.name)}</span>
          <span class="dr-thrown">${p.throws.length} turni</span>
          <span class="dr-score">${p.score}</span>
        </div>`;
      }).join('')}
    </div>
    <button class="btn primary full" id="dChartClose" style="margin-top:14px">Chiudi</button>`;
  const bg = openModal(html, (modal, close) => {
    modal.querySelector('#dChartClose').onclick = close;
  });
  bg.style.zIndex = 140; // sopra l'overlay del gioco (z-index 120)
}

// ===== Gioco Poker =====
const POKER_KEY = 'vacanza_poker_v1';
const POKER_BACKUP_KEY = 'vacanza_poker_backup_v1';

function pokerLoad() {
  try { return JSON.parse(localStorage.getItem(POKER_KEY)) || null; } catch (e) { return null; }
}
function pokerSave(g) {
  if (g) localStorage.setItem(POKER_KEY, JSON.stringify(g));
  else localStorage.removeItem(POKER_KEY);
}
function pokerBackupSave(g) {
  if (g && g.players && g.players.length) localStorage.setItem(POKER_BACKUP_KEY, JSON.stringify(g));
}
function pokerBackupLoad() {
  try { return JSON.parse(localStorage.getItem(POKER_BACKUP_KEY)) || null; } catch (e) { return null; }
}

// Chi paga chi (saldo minimo): debitori -> creditori
function pokerSettle(game) {
  const cred = game.players.map((p, i) => ({ i, net: p.net })).filter(b => b.net > 0.001).sort((a, b) => b.net - a.net);
  const debt = game.players.map((p, i) => ({ i, net: -p.net })).filter(b => b.net > 0.001).sort((a, b) => b.net - a.net);
  const tx = [];
  let ci = 0, di = 0;
  while (ci < cred.length && di < debt.length) {
    const amt = Math.min(cred[ci].net, debt[di].net);
    tx.push({ from: debt[di].i, to: cred[ci].i, amt: +amt.toFixed(2) });
    cred[ci].net -= amt; debt[di].net -= amt;
    if (cred[ci].net < 0.001) ci++;
    if (debt[di].net < 0.001) di++;
  }
  return tx;
}

function openPoker() {
  const overlay = document.createElement('div');
  overlay.className = 'darts-overlay';
  document.body.appendChild(overlay);
  const close = () => { overlay.remove(); if (state.route === 'home') render(); };

  let game = pokerLoad();

  // ---- stato setup ----
  let setupQuota = (game && game.quota) || 5;
  let setupPlayers = (game && !game.active && game.players)
    ? game.players.map(p => ({ name: p.name, avatar: p.avatar || null, id: p.id || null }))
    : [];

  const paint = () => { (game && game.active) ? renderGame() : renderSetup(); };

  // ============ SETUP ============
  function renderSetup() {
    const preset = [1, 2, 5, 10];
    const bk = pokerBackupLoad();
    const bkInfo = bk ? `${bk.players.map(p => p.name).join(', ')} · ${fmt(bk.quota)}/mano` : '';
    overlay.innerHTML = `
      <div class="darts-sheet">
        <div class="darts-top">
          <div class="darts-title">🃏 Poker</div>
          <button class="icon-btn" data-x aria-label="Chiudi">✕</button>
        </div>
        <div class="darts-scroll">
          ${state.me ? `<button class="darts-restore pk-ledger-btn" id="pLedger">
            <span class="dr-ic">👥</span>
            <span class="dr-tx"><b>Saldi del gruppo</b><small>Chi ha saldato · segna i pagamenti</small></span>
          </button>` : ''}
          ${bk ? `<button class="darts-restore" id="pRestore">
            <span class="dr-ic">↩︎</span>
            <span class="dr-tx"><b>Riapri partita precedente</b><small>${escapeHtml(bkInfo)}</small></span>
          </button>` : ''}
          <div class="darts-section-lbl">Quota a testa per mano (€)</div>
          <div class="darts-chips">
            ${preset.map(v => `<button class="darts-chip ${setupQuota === v ? 'active' : ''}" data-q="${v}">${v}</button>`).join('')}
            <input class="darts-chip-input" id="pQuotaCustom" inputmode="decimal" placeholder="Altro" value="${preset.includes(setupQuota) ? '' : setupQuota}" />
          </div>

          <div class="darts-section-lbl">Giocatori <span class="muted">· ${setupPlayers.length}</span></div>
          <div class="darts-members">
            ${state.members.map(m => {
              const on = setupPlayers.some(p => p.name === m.name);
              return `<button class="darts-member ${on ? 'on' : ''}" data-mname="${escapeHtml(m.name)}">${avatarHTML(m, 36)}<span>${escapeHtml(m.name)}</span></button>`;
            }).join('')}
          </div>

          <div class="darts-add">
            <input id="pCustomName" placeholder="Aggiungi un altro giocatore..." autocomplete="off" />
            <button class="btn ghost" id="pAddBtn">＋</button>
          </div>
          ${setupPlayers.filter(p => !state.members.some(m => m.name === p.name)).map(p =>
            `<div class="darts-guest"><span>👤 ${escapeHtml(p.name)}</span><button data-rm="${escapeHtml(p.name)}" aria-label="Rimuovi">✕</button></div>`
          ).join('')}
        </div>
        <div class="darts-foot">
          <button class="btn primary full lg" id="pStart" ${setupPlayers.length < 2 ? 'disabled' : ''}>
            ${setupPlayers.length < 2 ? 'Scegli almeno 2 giocatori' : `Apri partita · ${fmt(setupQuota)}/mano`}
          </button>
        </div>
      </div>`;

    overlay.querySelector('[data-x]').onclick = close;
    const ledgerBtn = overlay.querySelector('#pLedger');
    if (ledgerBtn) ledgerBtn.onclick = () => openPokerLedger();
    const restoreBtn = overlay.querySelector('#pRestore');
    if (restoreBtn) restoreBtn.onclick = () => {
      const b = pokerBackupLoad();
      if (!b) { toast('Nessuna partita da riaprire', true); return; }
      game = Object.assign({}, b, { active: true, closed: false });
      pokerSave(game);
      renderGame();
    };
    overlay.querySelectorAll('[data-q]').forEach(b => b.onclick = () => { setupQuota = +b.dataset.q; renderSetup(); });
    const ci = overlay.querySelector('#pQuotaCustom');
    ci.oninput = () => { const v = parseFloat((ci.value || '').replace(',', '.')); if (v > 0) setupQuota = v; };
    ci.onblur = () => renderSetup();
    overlay.querySelectorAll('[data-mname]').forEach(b => b.onclick = () => {
      const name = b.dataset.mname;
      const i = setupPlayers.findIndex(p => p.name === name);
      if (i >= 0) setupPlayers.splice(i, 1);
      else { const m = state.members.find(x => x.name === name); setupPlayers.push({ name, avatar: m?.avatar || null, id: m?.id || null }); }
      renderSetup();
    });
    const addCustom = () => {
      const inp = overlay.querySelector('#pCustomName');
      const n = (inp.value || '').trim();
      if (!n) return;
      if (setupPlayers.some(p => p.name === n)) { toast('Giocatore già aggiunto', true); return; }
      setupPlayers.push({ name: n, avatar: null, id: null });
      renderSetup();
    };
    overlay.querySelector('#pAddBtn').onclick = addCustom;
    overlay.querySelector('#pCustomName').onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); addCustom(); } };
    overlay.querySelectorAll('[data-rm]').forEach(b => b.onclick = () => {
      const i = setupPlayers.findIndex(p => p.name === b.dataset.rm);
      if (i >= 0) setupPlayers.splice(i, 1);
      renderSetup();
    });
    overlay.querySelector('#pStart').onclick = () => {
      if (setupPlayers.length < 2) return;
      const prev = pokerLoad();
      if (prev && prev.players && prev.log && prev.log.length) pokerBackupSave(prev);
      game = {
        active: true, closed: false, quota: setupQuota, log: [],
        players: setupPlayers.map(p => ({ name: p.name, avatar: p.avatar, id: p.id, won: 0, net: 0 })),
      };
      pokerSave(game);
      renderGame();
    };
  }

  // ============ PARTITA ============
  // mano corrente: set degli indici giocatori "in gioco" (default tutti)
  let inHand = null;

  function renderGame() {
    if (inHand === null) inHand = game.players.map((_, i) => i);
    const pot = game.log.reduce((a, h) => a + h.pot, 0);
    // classifica per saldo (chi ha vinto di più in alto)
    const order = game.players.map((p, i) => ({ i, net: p.net })).sort((a, b) => b.net - a.net);

    overlay.innerHTML = `
      <div class="darts-sheet">
        <div class="darts-top">
          <div class="darts-title">🃏 ${fmt(game.quota)}<span class="pk-perhand">/mano</span></div>
          <div class="row gap">
            ${state.me ? '<button class="icon-btn" id="pLedger2" title="Saldi del gruppo">👥</button>' : ''}
            <button class="icon-btn" id="pSettle" title="Chi paga chi">💰</button>
            <button class="icon-btn" id="pUndo" title="Annulla ultima mano">↺</button>
            <button class="icon-btn" id="pNew" title="Nuova partita">⟲</button>
            <button class="icon-btn" data-x aria-label="Chiudi">✕</button>
          </div>
        </div>
        <div class="pk-banner ${game.closed ? 'closed' : 'open'}">
          <span class="pk-dot"></span>
          ${game.closed ? 'Partita chiusa' : 'Partita aperta'}
          <span class="pk-stat">${game.log.length} man${game.log.length === 1 ? 'o' : 'i'} · piatto totale ${fmt(pot)}</span>
        </div>
        <div class="darts-scroll">
          <div class="darts-players">
            ${order.map(({ i }) => {
              const p = game.players[i];
              const pos = p.net > 0.001, neg = p.net < -0.001;
              const lbl = pos ? 'deve ricevere' : neg ? 'deve pagare' : 'in pari';
              return `<div class="darts-player ${pos ? 'pk-pos' : ''} ${neg ? 'pk-neg' : ''}">
                ${avatarHTML(p, 34)}
                <div class="dp-name">${escapeHtml(p.name)}<span class="dp-last">🏆 ${p.won} · ${lbl}</span></div>
                <div class="dp-score pk-score">${p.net > 0 ? '+' : ''}${fmt(p.net).replace('€', '')}<small>€</small></div>
              </div>`;
            }).join('')}
          </div>
        </div>
        ${!game.closed ? `
        <div class="darts-foot">
          <div class="darts-current">Chi era in gioco in questa mano? <b>(${inHand.length})</b> · piatto ${fmt(game.quota * inHand.length)}</div>
          <div class="pk-inhand">
            ${game.players.map((p, i) => `<button class="pk-chip ${inHand.includes(i) ? 'on' : ''}" data-in="${i}">${avatarHTML(p, 26)}<span>${escapeHtml(p.name)}</span></button>`).join('')}
          </div>
          <div class="darts-section-lbl" style="margin-top:14px">Tocca chi ha vinto la mano</div>
          <div class="pk-winners">
            ${game.players.map((p, i) => `<button class="pk-win ${inHand.includes(i) ? '' : 'off'}" data-win="${i}" ${inHand.includes(i) ? '' : 'disabled'}>${avatarHTML(p, 30)}<span>${escapeHtml(p.name)}</span></button>`).join('')}
          </div>
          <button class="btn ghost full pk-newgame" id="pNew2" style="margin-top:14px">➕ Nuova partita</button>
        </div>` : `
        <div class="darts-foot">
          <button class="btn ghost full" id="pReopen">↩︎ Riapri la partita</button>
          <button class="btn primary full lg" id="pSettle2" style="margin-top:8px">💰 Vedi chi paga chi</button>
        </div>`}
      </div>`;

    overlay.querySelector('[data-x]').onclick = close;
    const lb2 = overlay.querySelector('#pLedger2');
    if (lb2) lb2.onclick = () => openPokerLedger();
    overlay.querySelector('#pUndo').onclick = undo;
    overlay.querySelector('#pSettle').onclick = () => openPokerSettle(game);
    const newGame = () => {
      if (confirm('Iniziare una nuova partita? Quella attuale verrà salvata come backup.')) { pokerBackupSave(game); game.active = false; renderSetup(); }
    };
    overlay.querySelector('#pNew').onclick = newGame;
    const newBtn2 = overlay.querySelector('#pNew2');
    if (newBtn2) newBtn2.onclick = newGame;
    const reopen = overlay.querySelector('#pReopen');
    if (reopen) reopen.onclick = () => { game.closed = false; pokerSave(game); renderGame(); };
    const settle2 = overlay.querySelector('#pSettle2');
    if (settle2) settle2.onclick = () => openPokerSettle(game);

    if (!game.closed) {
      overlay.querySelectorAll('[data-in]').forEach(b => b.onclick = () => {
        const i = +b.dataset.in;
        const k = inHand.indexOf(i);
        if (k >= 0) { if (inHand.length <= 2) { toast('Servono almeno 2 in gioco', true); return; } inHand.splice(k, 1); }
        else inHand.push(i);
        renderGame();
      });
      overlay.querySelectorAll('[data-win]').forEach(b => b.onclick = () => {
        const wi = +b.dataset.win;
        if (!inHand.includes(wi)) return;
        recordHand(wi, inHand.slice());
      });
    }
  }

  function recordHand(winnerIdx, participants) {
    const pot = +(game.quota * participants.length).toFixed(2);
    participants.forEach(i => {
      if (i === winnerIdx) game.players[i].net = +(game.players[i].net + game.quota * (participants.length - 1)).toFixed(2);
      else game.players[i].net = +(game.players[i].net - game.quota).toFixed(2);
    });
    game.players[winnerIdx].won++;
    game.log.push({ winner: winnerIdx, participants, pot });
    pokerSave(game);
    toast(`🏆 ${game.players[winnerIdx].name} vince ${fmt(game.quota * (participants.length - 1))}`);
    renderGame();
  }

  function undo() {
    if (!game.log.length) { toast('Niente da annullare'); return; }
    const h = game.log.pop();
    h.participants.forEach(i => {
      if (i === h.winner) game.players[i].net = +(game.players[i].net - game.quota * (h.participants.length - 1)).toFixed(2);
      else game.players[i].net = +(game.players[i].net + game.quota).toFixed(2);
    });
    game.players[h.winner].won--;
    pokerSave(game);
    renderGame();
  }

  paint();
}

function openPokerSettle(game) {
  const tx = pokerSettle(game);
  const ranked = game.players.map((p, i) => ({ p, i })).sort((a, b) => b.p.net - a.p.net);
  const html = `
    <h2>💰 Chi paga chi</h2>
    ${tx.length ? `<div class="pk-settle">
      ${tx.map(t => `<div class="pk-tx">
        <span class="pk-tx-from">${escapeHtml(game.players[t.from].name)}</span>
        <span class="pk-tx-arrow">→</span>
        <span class="pk-tx-to">${escapeHtml(game.players[t.to].name)}</span>
        <span class="pk-tx-amt">${fmt(t.amt)}</span>
      </div>`).join('')}
    </div>` : `<div class="pk-even">Tutti in pari 🤝</div>`}
    <div class="darts-section-lbl" style="margin-top:16px">Saldo dei giocatori</div>
    <div class="darts-rank">
      ${ranked.map(({ p, i }) => {
        const col = avatarColor(p.id || i + 1);
        const pos = p.net > 0.001, neg = p.net < -0.001;
        return `<div class="dr-row ${pos ? 'won' : ''}">
          <span class="dr-dot" style="background:${col}"></span>
          <span class="dr-name">${escapeHtml(p.name)}</span>
          <span class="dr-thrown">🏆 ${p.won}</span>
          <span class="dr-score" style="color:${pos ? 'var(--accent)' : neg ? 'var(--danger)' : 'var(--text-muted)'}">${p.net > 0 ? '+' : ''}${fmt(p.net)}</span>
        </div>`;
      }).join('')}
    </div>
    ${state.me ? `<button class="btn primary full lg" id="pPublish" style="margin-top:14px">📤 Pubblica saldi nel gruppo</button>
    <button class="btn ghost full" id="pOpenLedger" style="margin-top:8px">👥 Vedi saldi del gruppo</button>` : ''}
    <button class="btn ghost full" id="pSettleClose" style="margin-top:8px">Chiudi</button>`;
  const bg = openModal(html, (modal, close) => {
    modal.querySelector('#pSettleClose').onclick = close;
    const pub = modal.querySelector('#pPublish');
    if (pub) pub.onclick = async () => {
      pub.disabled = true; pub.textContent = 'Pubblico…';
      try {
        await api('poker_publish', {
          quota: game.quota,
          hands: game.log.length,
          players: game.players.map(p => ({ member_id: p.id || null, name: p.name, net: p.net, won: p.won })),
        });
        toast('Saldi pubblicati nel gruppo ✓');
        close();
        openPokerLedger();
      } catch (e) { toast(e.message, true); pub.disabled = false; pub.textContent = '📤 Pubblica saldi nel gruppo'; }
    };
    const ol = modal.querySelector('#pOpenLedger');
    if (ol) ol.onclick = () => { close(); openPokerLedger(); };
  });
  bg.style.zIndex = 140;
}

// ===== Saldi Poker del gruppo (server, visibile da ogni profilo) =====
async function openPokerLedger() {
  if (!state.me) { toast('Accedi col tuo profilo per i saldi del gruppo', true); return; }
  const overlay = document.createElement('div');
  overlay.className = 'darts-overlay';
  document.body.appendChild(overlay);
  const close = () => { overlay.remove(); if (state.route === 'home') render(); };

  async function load() {
    overlay.innerHTML = `<div class="darts-sheet"><div class="darts-top"><div class="darts-title">👥 Saldi Poker</div><button class="icon-btn" data-x>✕</button></div><div class="darts-scroll"><div class="pk-loading">Carico…</div></div></div>`;
    overlay.querySelector('[data-x]').onclick = close;
    let data;
    try { data = await api('poker_get'); } catch (e) { toast(e.message, true); return; }
    paint(data);
  }

  function paint(data) {
    const ledger = data.ledger || [];
    const meta = data.meta || null;
    const debtors = ledger.filter(r => r.net < -0.001);
    const creditors = ledger.filter(r => r.net > 0.001);
    const pendenti = debtors.filter(r => !r.paid).length;

    overlay.innerHTML = `
      <div class="darts-sheet">
        <div class="darts-top">
          <div class="darts-title">👥 Saldi Poker</div>
          <button class="icon-btn" data-x aria-label="Chiudi">✕</button>
        </div>
        ${meta ? `<div class="pk-banner ${pendenti ? 'open' : 'closed'}">
          <span class="pk-dot"></span>
          ${pendenti ? `${pendenti} da saldare` : 'Tutti hanno saldato 🤝'}
          <span class="pk-stat">${fmt(meta.quota)}/mano · ${meta.hands} man${+meta.hands === 1 ? 'o' : 'i'}</span>
        </div>` : ''}
        <div class="darts-scroll">
          ${!ledger.length ? `<div class="pk-empty">Nessun saldo pubblicato.<br><small>Apri una partita, premi 💰 e poi <b>Pubblica saldi nel gruppo</b>.</small></div>` : `
          ${creditors.length ? `<div class="darts-section-lbl">Vincitori · incassano</div>
          <div class="darts-players" style="margin-bottom:18px">
            ${creditors.map(r => `<div class="darts-player pk-pos">
              ${avatarHTML(memOf(r), 34)}
              <div class="dp-name">${escapeHtml(r.name)}${r.member_id == state.me.id ? ' <span class="pk-you">tu</span>' : ''}<span class="dp-last">🏆 ${r.won}</span></div>
              <div class="dp-score pk-score">+${fmt(r.net).replace('€', '')}<small>€</small></div>
            </div>`).join('')}
          </div>` : ''}
          ${debtors.length ? `<div class="darts-section-lbl">Devono pagare · tocca per segnare saldato</div>
          <div class="darts-players">
            ${debtors.map(r => `<button class="darts-player pk-debt ${r.paid ? 'pk-settled' : ''}" data-toggle="${r.id}">
              ${avatarHTML(memOf(r), 34)}
              <div class="dp-name">${escapeHtml(r.name)}${r.member_id == state.me.id ? ' <span class="pk-you">tu</span>' : ''}<span class="dp-last">${r.paid ? '✓ saldato' : 'da saldare'}</span></div>
              <div class="pk-paidbox">${r.paid ? '<span class="pk-check">✓</span>' : `<span class="dp-score pk-score" style="color:var(--danger)">${fmt(r.net).replace('€', '')}<small>€</small></span>`}</div>
            </button>`).join('')}
          </div>` : ''}`}
        </div>
        ${ledger.length ? `<div class="darts-foot">
          <button class="btn ghost full" id="pLedgerReset">🗑 Azzera saldi pubblicati</button>
        </div>` : ''}
      </div>`;

    overlay.querySelector('[data-x]').onclick = close;
    overlay.querySelectorAll('[data-toggle]').forEach(b => b.onclick = async () => {
      const id = +b.dataset.toggle;
      b.style.opacity = '.5';
      try { await api('poker_toggle_paid', { id }); const d = await api('poker_get'); paint(d); }
      catch (e) { toast(e.message, true); b.style.opacity = '1'; }
    });
    const rst = overlay.querySelector('#pLedgerReset');
    if (rst) rst.onclick = async () => {
      if (!confirm('Azzerare i saldi poker pubblicati nel gruppo?')) return;
      try { await api('poker_reset'); paint({ ledger: [], meta: null }); toast('Saldi azzerati'); }
      catch (e) { toast(e.message, true); }
    };
  }

  // ritrova il membro (per avatar foto) dall'id, altrimenti usa nome/colore
  function memOf(r) {
    if (r.member_id) { const m = (state.members || []).find(x => x.id == r.member_id); if (m) return m; }
    return { id: r.member_id || null, name: r.name, avatar: null };
  }

  load();
}

// ============ START ============
initBgFx();
boot();
