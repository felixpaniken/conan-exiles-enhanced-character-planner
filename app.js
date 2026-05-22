(function () {
  'use strict';

  const STORAGE_KEY = 'cep-builds-v1';
  const LEGACY_KEY = 'cep-build-v2';

  // Base character stats (level 1, no attributes).
  const BASE = {
    health: 200,
    stamina: 100,
    carryWeight: 70,
    armor: 0,
  };

  // Viewport width (px) at which the layout switches to its desktop form.
  const DESKTOP_MIN_WIDTH = 860;

  // ----- State -----
  // A build: { id, name, state, updatedAt }
  // state: { [attrId]: { points, corruptedPoints, choices: { [tier]: index } } }
  // Edits auto-save into the current build, so `state` and the current build's
  // state are always kept in sync.
  let builds = [];
  let currentId = null;
  let state;

  function defaultState() {
    const s = {};
    for (const a of ATTRIBUTES) s[a.id] = { points: 0, corruptedPoints: 0, choices: {} };
    return s;
  }

  function sanitizeState(parsed) {
    const base = defaultState();
    if (!parsed || typeof parsed !== 'object') return base;
    for (const id of Object.keys(base)) {
      const p = parsed[id];
      if (!p) continue;
      base[id].points = Math.max(0, Math.min(MAX_PER_ATTR, p.points | 0));
      base[id].corruptedPoints = Math.max(0, Math.min(base[id].points, p.corruptedPoints | 0));
      base[id].choices = p.choices && typeof p.choices === 'object' ? { ...p.choices } : {};
    }
    return base;
  }

  function cloneState(s) { return sanitizeState(JSON.parse(JSON.stringify(s))); }
  function newId() { return 'b' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
  function currentBuild() { return builds.find((b) => b.id === currentId) || builds[0]; }
  function stateTotal(s) { return ATTRIBUTES.reduce((n, a) => n + s[a.id].points, 0); }
  function totalSpent() { return stateTotal(state); }

  // ----- Hash encoding -----
  // Per-attribute slug: "<points>.<corrupted>.<t10>.<t20>" ("_" = unset). Joined by "-".

  function encodeState(s) {
    return ATTRIBUTES.map((a) => {
      const x = s[a.id];
      const t10 = x.choices[10];
      const t20 = x.choices[20];
      return [
        x.points,
        a.corruptable ? x.corruptedPoints : 0,
        t10 == null ? '_' : t10,
        t20 == null ? '_' : t20,
      ].join('.');
    }).join('-');
  }

  function decodeState(hash) {
    if (!hash) return null;
    const parts = hash.split('-');
    if (parts.length !== ATTRIBUTES.length) return null;
    const result = {};
    for (let i = 0; i < ATTRIBUTES.length; i++) {
      const a = ATTRIBUTES[i];
      const bits = parts[i].split('.');
      if (bits.length !== 4) return null;
      const points = Math.max(0, Math.min(MAX_PER_ATTR, parseInt(bits[0], 10) || 0));
      const corrupted = a.corruptable ? Math.max(0, Math.min(points, parseInt(bits[1], 10) || 0)) : 0;
      const choices = {};
      if (bits[2] !== '_' && points >= 10) choices[10] = Math.max(0, Math.min(1, parseInt(bits[2], 10) || 0));
      if (bits[3] !== '_' && points >= 20) choices[20] = Math.max(0, Math.min(1, parseInt(bits[3], 10) || 0));
      result[a.id] = { points, corruptedPoints: corrupted, choices };
    }
    return result;
  }

  function loadFromHash() {
    const raw = location.hash.replace(/^#/, '');
    return raw ? decodeState(raw) : null;
  }

  function updateHash() {
    const encoded = encodeState(state);
    if (encoded === location.hash.replace(/^#/, '')) return;
    history.replaceState(null, '', '#' + encoded);
  }

  // ----- Persistence -----
  // Auto-save: every edit writes straight into the current build, so there is no
  // separate "draft" or dirty state to manage.

  function persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ builds, currentId }));
    } catch (e) {}
  }

  // Called after every edit — commit the working state into the current build.
  function saveState() {
    const b = currentBuild();
    if (b) {
      b.state = cloneState(state);
      b.updatedAt = Date.now();
    }
    persist();
    updateHash();
  }

  function loadStore() {
    let store = null;
    try { store = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'); } catch (e) {}
    const fromHash = loadFromHash();

    if (store && Array.isArray(store.builds) && store.builds.length) {
      builds = store.builds.map((b) => ({
        id: b.id || newId(),
        name: (typeof b.name === 'string' && b.name.trim()) ? b.name.trim() : 'Untitled',
        state: sanitizeState(b.state),
        updatedAt: b.updatedAt || Date.now(),
      }));
      currentId = builds.some((b) => b.id === store.currentId) ? store.currentId : builds[0].id;
      // Carry over any unsaved draft left by the previous (manual-save) version.
      if (store.draft) currentBuild().state = sanitizeState(store.draft);
      // A shared link different from the current build is imported as a new build,
      // so opening a link never overwrites an existing build.
      if (fromHash && encodeState(fromHash) !== encodeState(currentBuild().state)) {
        const b = { id: newId(), name: uniqueName('Imported build'), state: fromHash, updatedAt: Date.now() };
        builds.unshift(b);
        currentId = b.id;
      }
    } else {
      // First run — migrate a legacy single build, or seed from a shared link.
      let legacy = null;
      try { legacy = JSON.parse(localStorage.getItem(LEGACY_KEY) || 'null'); } catch (e) {}
      const first = {
        id: newId(),
        name: fromHash ? 'Imported build' : (legacy ? 'My Build' : 'Untitled'),
        state: fromHash || sanitizeState(legacy),
        updatedAt: Date.now(),
      };
      builds = [first];
      currentId = first.id;
    }

    state = cloneState(currentBuild().state);
    persist();
  }

  loadStore();

  // ----- Build operations -----

  function uniqueName(base) {
    const taken = new Set(builds.map((b) => b.name));
    if (!taken.has(base)) return base;
    let n = 2;
    while (taken.has(base + ' ' + n)) n++;
    return base + ' ' + n;
  }

  // Persist build-list / selection changes without bumping the build's edit time.
  function persistNav() {
    persist();
    updateHash();
  }

  function switchBuild(id) {
    if (id !== currentId) {
      currentId = id;
      state = cloneState(currentBuild().state);
      persistNav();
      render();
    }
    closeSheet();
  }

  function newBuild() {
    const b = { id: newId(), name: uniqueName('New build'), state: defaultState(), updatedAt: Date.now() };
    builds.unshift(b);
    currentId = b.id;
    state = cloneState(b.state);
    persistNav();
    closeSheet();
    render();
  }

  function renameBuild(id) {
    const b = builds.find((x) => x.id === id);
    if (!b) return;
    const name = (prompt('Rename build:', b.name) || '').trim();
    if (!name) return;
    b.name = name;
    persist();
    render();
  }

  function duplicateBuild(id) {
    const b = builds.find((x) => x.id === id);
    if (!b) return;
    const copy = { id: newId(), name: uniqueName(b.name + ' copy'), state: cloneState(b.state), updatedAt: Date.now() };
    builds.splice(builds.indexOf(b) + 1, 0, copy);
    persist();
    render();
  }

  function deleteBuild(id) {
    const b = builds.find((x) => x.id === id);
    if (!b) return;
    if (!confirm('Delete "' + b.name + '"? This cannot be undone.')) return;
    builds = builds.filter((x) => x.id !== id);
    if (!builds.length) {
      const fresh = { id: newId(), name: 'Untitled', state: defaultState(), updatedAt: Date.now() };
      builds = [fresh];
      currentId = fresh.id;
      state = cloneState(fresh.state);
    } else if (currentId === id) {
      currentId = builds[0].id;
      state = cloneState(currentBuild().state);
    }
    persistNav();
    render();
  }

  function importFromLink() {
    const input = (prompt('Paste a build link or code:') || '').trim();
    if (!input) return;
    const hashIdx = input.indexOf('#');
    const code = hashIdx >= 0 ? input.slice(hashIdx + 1) : input;
    const imported = decodeState(code);
    if (!imported) { alert("That doesn't look like a valid build link."); return; }
    const b = { id: newId(), name: uniqueName('Imported build'), state: imported, updatedAt: Date.now() };
    builds.unshift(b);
    currentId = b.id;
    state = cloneState(b.state);
    persistNav();
    closeSheet();
    render();
  }

  // ----- Build display helpers -----

  function relativeTime(ts) {
    const s = Math.floor((Date.now() - ts) / 1000);
    if (s < 45) return 'just now';
    const m = Math.round(s / 60);
    if (m < 60) return m + 'm ago';
    const h = Math.round(m / 60);
    if (h < 24) return h + 'h ago';
    const d = Math.round(h / 24);
    if (d < 7) return d + 'd ago';
    const w = Math.round(d / 7);
    if (w < 5) return w + 'w ago';
    const mo = Math.round(d / 30);
    if (mo < 12) return mo + 'mo ago';
    return Math.round(d / 365) + 'y ago';
  }

  function dominantAttr(s) {
    let best = null;
    let bestPts = 0;
    for (const a of ATTRIBUTES) {
      if (s[a.id].points > bestPts) { bestPts = s[a.id].points; best = a; }
    }
    return best;
  }

  // ----- Perk resolution -----

  // Which perk variant applies at a tier: corrupted once enough corrupted points
  // reach it, otherwise normal.
  function tierVariant(attr, tier) {
    const s = state[attr.id];
    return attr.corruptable && s.corruptedPoints >= tier ? 'corrupted' : 'normal';
  }

  // The perk-tier data ({ tier, choices }) shown at a tier, with its variant.
  function perkAtTier(attr, tier) {
    const variant = tierVariant(attr, tier);
    return { variant, tierData: attr.perks[variant].find((t) => t.tier === tier) };
  }

  // The single perk active at a tier — resolving the player's choice on
  // multi-option tiers — or null if the tier is locked or not yet chosen.
  function activePerkAt(attr, tier) {
    const s = state[attr.id];
    if (s.points < tier) return null;
    const { tierData } = perkAtTier(attr, tier);
    if (!tierData) return null;
    if (tierData.choices.length === 1) return tierData.choices[0];
    const idx = s.choices[tier];
    return idx == null ? null : tierData.choices[idx];
  }

  // ----- Stats computation -----

  // Perks that contribute to computed stats. `apply({ stats, add, state })` mutates
  // stats via `add(stat, amount, source)`, which records a per-perk contribution.
  // Perks not listed here are purely situational — their description is shown in
  // the Perks section, with no number to fold into the stat cards.
  const PERK_REGISTRY = {
    'Scourge': {
      apply: ({ add }) => {
        const c = state.strength.corruptedPoints;
        if (!c) return;
        add('strDmg', c, 'Scourge');
        add('agiDmg', c, 'Scourge');
      },
    },
    'Fierce Vitality': { apply: ({ add }) => add('regen', 0.5, 'Fierce Vitality') },
    'Robust':          { apply: ({ add }) => add('health', 100, 'Robust') },
    'Grotesque Excrescence': {
      apply: ({ add }) => {
        const c = state.vitality.corruptedPoints;
        if (c) add('regen', 0.2 * c, 'Grotesque Excrescence');
      },
    },
    'Twisted Flesh': {
      apply: ({ add }) => {
        const c = state.vitality.corruptedPoints;
        if (c) add('deflectChance', 0.5 * c, 'Twisted Flesh');
      },
    },
    'Frenzy': {
      apply: ({ add }) => {
        const c = state.authority.corruptedPoints;
        if (c) add('frenzyFollowerDmg', 3 * c, 'Frenzy');
      },
    },
    'Tenacity':  { apply: ({ add }) => { add('armor', 40, 'Tenacity'); add('stamina', 20, 'Tenacity'); } },
    'Endurance': { apply: ({ add }) => add('staminaRegenPct', 25, 'Endurance') },
    'Stout':     { apply: ({ add, stats }) => add('armor', Math.floor(stats.stamina.value / 5), 'Stout') },
  };

  function makeStat() { return { value: 0, parts: [] }; }

  function computeStats() {
    const stats = {
      health: makeStat(),
      stamina: makeStat(),
      armor: makeStat(),
      carry: makeStat(),
      regen: makeStat(),
      deflectChance: makeStat(),
      staminaRegenPct: makeStat(),
      frenzyFollowerDmg: makeStat(),
      strDmg: makeStat(),
      agiDmg: makeStat(),
      followerDmg: makeStat(),
      concussiveDmg: makeStat(),
    };

    // Contributions added while `inPerkPhase` is true are flagged as perk-sourced,
    // so the overview can list them separately from plain per-attribute scaling.
    let inPerkPhase = false;
    function add(stat, amount, source) {
      if (!stats[stat]) stats[stat] = makeStat();
      stats[stat].value += amount;
      if (amount && source) stats[stat].parts.push({ amount, source, isPerk: inPerkPhase });
    }

    // Base values
    add('health', BASE.health);
    add('stamina', BASE.stamina);
    add('carry', BASE.carryWeight);
    add('armor', BASE.armor);

    const str = state.strength.points;
    const agi = state.agility.points;
    const vit = state.vitality.points;
    const aut = state.authority.points;
    const grt = state.grit.points;
    const exp = state.expertise.points;

    if (vit) add('health', Math.round(BASE.health * 0.10 * vit), vit + ' Vitality');
    if (agi) add('stamina', agi, agi + ' Agility');
    if (grt) add('stamina', 3 * grt, grt + ' Grit');
    if (grt) add('armor', 8 * grt, grt + ' Grit');
    if (str) add('carry', 3 * str, str + ' Strength');
    if (exp) add('carry', 15 * exp, exp + ' Expertise');
    if (str) add('strDmg', 5 * str, str + ' Strength');
    if (agi) add('strDmg', 0.5 * agi, agi + ' Agility');
    if (agi) add('agiDmg', 5 * agi, agi + ' Agility');
    if (str) add('agiDmg', 0.5 * str, str + ' Strength');
    if (aut) add('followerDmg', 4 * aut, aut + ' Authority');
    if (aut) add('concussiveDmg', 6 * aut, aut + ' Authority');

    // Walk every active perk in attribute / tier order: collect it for the Perks
    // section and apply its stat contribution if it has one.
    const activePerks = [];
    inPerkPhase = true;
    for (const a of ATTRIBUTES) {
      for (const T of PERK_TIERS) {
        const perk = activePerkAt(a, T);
        if (!perk) continue;
        activePerks.push({
          attrName: a.name, tier: T, name: perk.name, desc: perk.desc,
          variant: tierVariant(a, T),
        });
        const handler = PERK_REGISTRY[perk.name];
        if (handler && handler.apply) handler.apply({ stats, add, state });
      }
    }

    return { stats, activePerks };
  }

  // ----- Rendering -----

  const grid = document.getElementById('attributes');
  const overviewPanel = document.getElementById('overview-panel');
  const abilitiesPanel = document.getElementById('abilities-panel');
  const tabBar = document.getElementById('tab-bar');
  const apSpentEl = document.getElementById('ap-spent');
  const apCounterEl = document.querySelector('.ap-counter');
  const buildIdentityBtn = document.getElementById('build-identity');
  const biIcon = document.getElementById('bi-icon');
  const biName = document.getElementById('bi-name');
  const buildsSheet = document.getElementById('builds-sheet');
  const sheetScrim = document.getElementById('sheet-scrim');

  const TABS = [
    { id: 'overview', label: 'Overview', icon: 'user' },
    { id: 'abilities', label: 'Abilities', icon: 'swords' },
  ];
  // Start on Overview when a build is already loaded (e.g. shared link); else Abilities.
  let activeTab = totalSpent() > 0 ? 'overview' : 'abilities';

  function renderTabs() {
    tabBar.replaceChildren(...TABS.map((t) => {
      const isActive = activeTab === t.id;
      const btn = el('button', {
        class: 'tab' + (isActive ? ' active' : ''),
        type: 'button',
        role: 'tab',
        'aria-selected': isActive ? 'true' : 'false',
      });
      btn.append(icon(t.icon, 'tab-icon'), el('span', {}, t.label));
      btn.addEventListener('click', () => setTab(t.id));
      return btn;
    }));
  }

  function applyTabVisibility() {
    overviewPanel.hidden = activeTab !== 'overview';
    abilitiesPanel.hidden = activeTab !== 'abilities';
  }

  function setTab(id) {
    if (activeTab === id) return;
    activeTab = id;
    renderTabs();
    applyTabVisibility();
    window.scrollTo({ top: 0 });
  }

  function render() {
    renderTabs();
    applyTabVisibility();
    renderHeaderBuild();
    grid.replaceChildren(...ATTRIBUTES.map(renderAttribute));
    overviewPanel.replaceChildren(...renderOverview());
    apSpentEl.textContent = totalSpent();
    apCounterEl.classList.toggle('over', totalSpent() > MAX_AP);
    if (sheetOpen) renderSheet();
  }

  function renderHeaderBuild() {
    const b = currentBuild();
    const dom = dominantAttr(state);
    biIcon.replaceChildren(icon(dom ? dom.icon : 'user', 'bi-icon-svg'));
    biName.textContent = b ? b.name : 'Untitled';
  }

  // ----- Builds sheet -----

  let sheetOpen = false;

  function openSheet() {
    sheetOpen = true;
    renderSheet();
    buildsSheet.classList.add('open');
    sheetScrim.classList.add('open');
    document.body.classList.add('sheet-locked');
    positionSheet();
  }

  function closeSheet() {
    sheetOpen = false;
    closeCardMenu();
    buildsSheet.classList.remove('open');
    sheetScrim.classList.remove('open');
    document.body.classList.remove('sheet-locked');
  }

  function positionSheet() {
    // Desktop: popover anchored under the build identity. Mobile: CSS bottom sheet.
    if (window.innerWidth >= DESKTOP_MIN_WIDTH) {
      const r = buildIdentityBtn.getBoundingClientRect();
      buildsSheet.style.top = (r.bottom + 8) + 'px';
      buildsSheet.style.left = r.left + 'px';
    } else {
      buildsSheet.style.top = '';
      buildsSheet.style.left = '';
    }
  }

  function distBar(s) {
    const bar = el('div', { class: 'dist-bar' });
    if (!stateTotal(s)) {
      bar.classList.add('empty');
      return bar;
    }
    for (const a of ATTRIBUTES) {
      const pts = s[a.id].points;
      if (!pts) continue;
      const seg = el('div', { class: 'dist-seg' });
      seg.style.flexGrow = String(pts);
      seg.style.background = a.color;
      bar.append(seg);
    }
    return bar;
  }

  function buildCard(b, isCurrent) {
    const cardState = isCurrent ? state : b.state;
    const dom = dominantAttr(cardState);
    const card = el('div', { class: 'build-card' + (isCurrent ? ' current' : '') });

    const hit = el('button', { class: 'build-card-hit', type: 'button', 'aria-label': 'Open ' + b.name });
    hit.addEventListener('click', () => switchBuild(b.id));

    const iconTile = el('div', { class: 'build-card-icon' });
    iconTile.append(icon(dom ? dom.icon : 'user', 'build-card-icon-svg'));

    const total = stateTotal(cardState);
    const meta = total + 'pt · ' + relativeTime(b.updatedAt);

    const body = el('div', { class: 'build-card-body' },
      el('div', { class: 'build-card-row' },
        el('span', { class: 'build-card-name' }, b.name),
        el('span', { class: 'build-card-meta' }, meta),
      ),
      distBar(cardState),
    );

    const menuBtn = el('button', { class: 'build-card-menu', type: 'button', 'aria-label': 'Build options' });
    menuBtn.append(icon('more-horizontal', 'build-card-menu-icon'));
    menuBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      openCardMenu(b.id, menuBtn);
    });

    card.append(hit, iconTile, body, menuBtn);
    return card;
  }

  function renderSheet() {
    const others = builds.filter((b) => b.id !== currentId);

    const head = el('div', { class: 'sheet-header' },
      el('h2', { class: 'sheet-title' }, 'Your builds'),
    );
    const closeBtn = el('button', { class: 'sheet-close', type: 'button', 'aria-label': 'Close' });
    closeBtn.append(icon('x', 'sheet-close-icon'));
    closeBtn.addEventListener('click', closeSheet);
    head.append(closeBtn);

    const body = el('div', { class: 'sheet-body' });
    body.append(el('div', { class: 'sheet-section-label' }, 'Current build'));
    body.append(buildCard(currentBuild(), true));
    body.append(el('div', { class: 'sheet-divider' }));
    body.append(el('div', { class: 'sheet-section-label' }, 'Saved builds (' + others.length + ')'));
    if (others.length) {
      for (const b of others) body.append(buildCard(b, false));
    } else {
      body.append(el('p', { class: 'sheet-empty' }, 'No other builds yet — create one below.'));
    }

    const footer = el('div', { class: 'sheet-footer' });
    const newBtn = el('button', { class: 'sheet-btn primary', type: 'button' });
    newBtn.append(icon('plus', 'sheet-btn-icon'), el('span', {}, 'New build'));
    newBtn.addEventListener('click', newBuild);
    const importBtn = el('button', { class: 'sheet-btn', type: 'button' });
    importBtn.append(icon('share', 'sheet-btn-icon'), el('span', {}, 'Import from link'));
    importBtn.addEventListener('click', importFromLink);
    footer.append(newBtn, importBtn);

    buildsSheet.replaceChildren(
      el('div', { class: 'sheet-handle' }),
      head, body, footer,
    );
  }

  // Per-card options menu (rename / duplicate / delete)
  let cardMenuEl = null;
  let cardMenuFor = null;

  function closeCardMenu() {
    if (cardMenuEl) { cardMenuEl.remove(); cardMenuEl = null; }
    cardMenuFor = null;
  }

  function openCardMenu(buildId, anchor) {
    const sameButton = cardMenuFor === buildId;
    closeCardMenu();
    if (sameButton) return;
    cardMenuFor = buildId;
    const menu = el('div', { class: 'card-menu' });
    const items = [
      { label: 'Rename', fn: () => renameBuild(buildId) },
      { label: 'Duplicate', fn: () => duplicateBuild(buildId) },
      { label: 'Delete', danger: true, fn: () => deleteBuild(buildId) },
    ];
    for (const it of items) {
      const b = el('button', { class: 'card-menu-item' + (it.danger ? ' danger' : ''), type: 'button' }, it.label);
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        closeCardMenu();
        it.fn();
      });
      menu.append(b);
    }
    document.body.append(menu);
    cardMenuEl = menu;
    const r = anchor.getBoundingClientRect();
    const left = Math.max(8, r.right - 160);
    menu.style.left = left + 'px';
    menu.style.top = (r.bottom + 4) + 'px';
  }

  function fmtNum(n) {
    const r = Math.round(n * 10) / 10;
    return Number.isInteger(r) ? String(r) : r.toFixed(1);
  }

  // The perk-sourced contributions to a stat, formatted for the stat-card detail
  // line. Plain per-attribute scaling is omitted — it is obvious from the points.
  function perkPartsDetail(stat) {
    const perkParts = stat.parts.filter((p) => p.isPerk);
    if (!perkParts.length) return null;
    return perkParts.map((p) => (p.amount >= 0 ? '+' : '') + fmtNum(p.amount) + ' ' + p.source).join(' · ');
  }

  function statCard(iconName, label, value, detail) {
    const card = el('div', { class: 'stat-card' });
    const head = el('div', { class: 'stat-label' });
    if (iconName) head.append(icon(iconName, 'stat-icon'));
    head.append(el('span', {}, label));
    card.append(head, el('div', { class: 'stat-value' }, value));
    if (detail) card.append(el('div', { class: 'stat-detail' }, detail));
    return card;
  }

  function section(iconName, title, gridClass, children) {
    const sec = el('section', { class: 'ov-section' });
    const head = el('h2', { class: 'section-head' });
    if (iconName) head.append(icon(iconName, 'section-icon'));
    head.append(el('span', {}, title));
    sec.append(head, el('div', { class: gridClass }, ...children));
    return sec;
  }

  function perkCard(p) {
    return el('div', { class: 'perk-summary' + (p.variant === 'corrupted' ? ' corrupted' : '') },
      el('div', { class: 'perk-summary-head' },
        el('span', { class: 'perk-summary-tier' }, 'T' + p.tier),
        el('span', { class: 'perk-summary-attr' }, p.attrName),
      ),
      el('div', { class: 'perk-summary-name' }, p.name),
      el('div', { class: 'perk-summary-desc' }, p.desc),
    );
  }

  function renderOverview() {
    const { stats, activePerks } = computeStats();
    const v = (s) => stats[s].value;
    const nodes = [];

    if (totalSpent() === 0) {
      nodes.push(el('p', { class: 'overview-hint' },
        'No points allocated yet — open the Abilities tab to build your character.'));
    }

    // Core Stats
    const core = [
      statCard('heart', 'Health', fmtNum(v('health')),
        [perkPartsDetail(stats.health), v('regen') > 0 ? '+' + fmtNum(v('regen')) + ' regen/s' : null].filter(Boolean).join(' · ') || null),
      statCard('zap', 'Stamina', fmtNum(v('stamina')),
        [perkPartsDetail(stats.stamina), v('staminaRegenPct') > 0 ? '+' + fmtNum(v('staminaRegenPct')) + '% regen' : null].filter(Boolean).join(' · ') || null),
      statCard('shield', 'Armor', fmtNum(v('armor')), perkPartsDetail(stats.armor)),
      statCard('weight', 'Carry Weight', fmtNum(v('carry')), perkPartsDetail(stats.carry)),
    ];
    if (v('deflectChance') > 0) {
      core.push(statCard('shield-check', 'Deflect Chance', fmtNum(v('deflectChance')) + '%', perkPartsDetail(stats.deflectChance)));
    }
    nodes.push(section(null, 'Core Stats', 'stats-grid', core));

    // Combat
    nodes.push(section(null, 'Combat', 'stats-grid', [
      statCard('sword', 'Str Weapon Dmg', '+' + fmtNum(v('strDmg')) + '%', perkPartsDetail(stats.strDmg)),
      statCard('swords', 'Agi Weapon Dmg', '+' + fmtNum(v('agiDmg')) + '%', perkPartsDetail(stats.agiDmg)),
      statCard('users', 'Follower Dmg', '+' + fmtNum(v('followerDmg')) + '%',
        v('frenzyFollowerDmg') > 0 ? '+' + fmtNum(v('frenzyFollowerDmg')) + '% Frenzy (in combat)' : null),
      statCard('hammer', 'Concussive Dmg', '+' + fmtNum(v('concussiveDmg')) + '%'),
    ]));

    // Perks — every perk you've picked, with its description
    if (activePerks.length) {
      nodes.push(section('sparkles', 'Perks', 'perks-grid', activePerks.map(perkCard)));
    }

    return nodes;
  }

  function renderAttribute(attr) {
    const s = state[attr.id];
    const isAnyCorrupted = attr.corruptable && s.corruptedPoints > 0;
    const card = el('section', { class: 'attr-card' + (isAnyCorrupted ? ' corrupted' : '') });

    // Header
    const nameRow = el('div', { class: 'attr-name' });
    if (attr.icon) nameRow.append(icon(attr.icon, 'attr-icon'));
    nameRow.append(el('span', {}, attr.name));
    card.append(
      el('div', { class: 'attr-header' },
        el('div', { class: 'attr-title' },
          nameRow,
          el('div', { class: 'attr-blurb' }, attr.blurb),
        ),
      ),
    );

    // Steppers
    card.append(renderStepper(attr));
    if (attr.corruptable) card.append(renderCorruptStepper(attr));

    // Per-point preview
    const ppUl = el('ul');
    for (const pp of attr.perPoint) ppUl.append(el('li', {}, pp));
    card.append(el('div', { class: 'per-point' }, ppUl));

    // Perks
    card.append(renderPerks(attr));

    return card;
  }

  function renderStepper(attr) {
    const s = state[attr.id];
    const wrap = el('div', { class: 'stepper' });

    const minus = el('button', { class: 'step-btn', type: 'button', 'aria-label': 'Decrease ' + attr.name }, '−');
    minus.disabled = s.points <= 0;
    minus.addEventListener('click', () => changePoints(attr, -1));

    const valueWrap = el('div', { class: 'step-value-wrap' });
    valueWrap.append(
      el('span', { class: 'step-value' }, String(s.points)),
      el('span', { class: 'step-max' }, '/ ' + MAX_PER_ATTR),
    );

    const plus = el('button', { class: 'step-btn', type: 'button', 'aria-label': 'Increase ' + attr.name }, '+');
    plus.disabled = s.points >= MAX_PER_ATTR;
    plus.addEventListener('click', () => changePoints(attr, +1));

    wrap.append(minus, valueWrap, plus);
    return wrap;
  }

  function renderCorruptStepper(attr) {
    const s = state[attr.id];
    const wrap = el('div', { class: 'corrupt-stepper' });

    const label = el('div', { class: 'corrupt-stepper-label' },
      el('span', { class: 'corrupt-dot' }),
      'Corrupted',
    );

    const controls = el('div', { class: 'corrupt-stepper-controls' });

    const minus = el('button', { class: 'step-btn step-btn-sm', type: 'button', 'aria-label': 'Decrease corrupted ' + attr.name }, '−');
    minus.disabled = s.corruptedPoints <= 0;
    minus.addEventListener('click', () => changeCorrupted(attr, -1));

    const value = el('span', { class: 'corrupt-value' }, s.corruptedPoints + ' / ' + s.points);

    const plus = el('button', { class: 'step-btn step-btn-sm', type: 'button', 'aria-label': 'Increase corrupted ' + attr.name }, '+');
    plus.disabled = s.corruptedPoints >= s.points;
    plus.addEventListener('click', () => changeCorrupted(attr, +1));

    controls.append(minus, value, plus);
    wrap.append(label, controls);
    return wrap;
  }

  function changePoints(attr, delta) {
    const s = state[attr.id];
    const next = s.points + delta;
    if (next < 0 || next > MAX_PER_ATTR) return;
    s.points = next;

    // Corrupted cannot exceed total.
    if (s.corruptedPoints > s.points) s.corruptedPoints = s.points;

    // Drop choices for tiers no longer unlocked.
    for (const tier of Object.keys(s.choices)) {
      if (Number(tier) > s.points) delete s.choices[tier];
    }
    saveState();
    render();
  }

  function changeCorrupted(attr, delta) {
    const s = state[attr.id];
    const next = s.corruptedPoints + delta;
    if (next < 0 || next > s.points) return;
    s.corruptedPoints = next;
    saveState();
    render();
  }

  function renderPerks(attr) {
    const wrap = el('div', { class: 'perks' });
    const s = state[attr.id];

    for (const T of PERK_TIERS) {
      const { variant, tierData } = perkAtTier(attr, T);
      if (!tierData) continue;
      const unlocked = s.points >= T;
      const isChoice = tierData.choices.length > 1;
      const chosenIdx = s.choices[T];

      const tierEl = el('div', { class: 'perk-tier' + (unlocked ? ' unlocked' : '') + (variant === 'corrupted' ? ' corrupted' : '') });
      tierEl.append(el('div', { class: 'perk-tier-label' },
        'Tier ' + T,
        variant === 'corrupted' ? ' · corrupted' : '',
        (isChoice && unlocked && chosenIdx == null) ? ' — choose one' : '',
      ));

      const opts = el('div', { class: 'perk-options' + (isChoice ? ' has-choice' : '') });

      tierData.choices.forEach((p, idx) => {
        const btn = el('button', { class: 'perk', type: 'button' });
        const classes = ['perk'];
        if (variant === 'corrupted') classes.push('corrupted-perk');
        if (!unlocked) classes.push('locked');
        if (unlocked && isChoice && chosenIdx == null) classes.push('choice-required');
        if (unlocked && (!isChoice || chosenIdx === idx)) classes.push('active');
        btn.className = classes.join(' ');

        btn.append(
          el('div', { class: 'perk-name' }, p.name),
          el('div', { class: 'perk-desc' }, p.desc),
        );

        if (!unlocked || !isChoice) {
          btn.disabled = true;
        } else {
          btn.addEventListener('click', () => {
            s.choices[T] = idx;
            saveState();
            render();
          });
        }

        opts.append(btn);
      });

      tierEl.append(opts);
      wrap.append(tierEl);
    }

    return wrap;
  }

  // ----- Helpers -----

  function el(tag, attrs, ...children) {
    const node = document.createElement(tag);
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        if (v == null || v === false) continue;
        if (k === 'class') node.className = v;
        else if (k in node && typeof v !== 'string') node[k] = v;
        else node.setAttribute(k, v);
      }
    }
    for (const c of children) {
      if (c == null || c === '') continue;
      node.append(typeof c === 'string' ? document.createTextNode(c) : c);
    }
    return node;
  }

  // ----- Header buttons -----

  const shareBtn = document.getElementById('share-btn');
  const resetBtn = document.getElementById('reset-btn');
  const shareLabel = el('span', { class: 'btn-label' }, 'Share');
  shareBtn.replaceChildren(icon('share', 'btn-icon'), shareLabel);
  resetBtn.replaceChildren(icon('rotate-ccw', 'btn-icon'), el('span', { class: 'btn-label' }, 'Reset'));

  buildIdentityBtn.addEventListener('click', () => {
    if (sheetOpen) closeSheet();
    else openSheet();
  });
  sheetScrim.addEventListener('click', closeSheet);

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (cardMenuEl) closeCardMenu();
    else if (sheetOpen) closeSheet();
  });

  // Dismiss the per-card menu on any outside interaction.
  document.addEventListener('click', (e) => {
    if (cardMenuEl && !cardMenuEl.contains(e.target)) closeCardMenu();
  });

  window.addEventListener('resize', () => {
    closeCardMenu();
    if (sheetOpen) positionSheet();
  });

  shareBtn.addEventListener('click', async () => {
    updateHash();
    const url = location.href;
    try {
      await navigator.clipboard.writeText(url);
    } catch (e) {
      const inp = document.createElement('input');
      inp.value = url;
      document.body.appendChild(inp);
      inp.select();
      try { document.execCommand('copy'); } catch (_) {}
      document.body.removeChild(inp);
    }
    shareLabel.textContent = 'Copied!';
    shareBtn.classList.add('copied');
    setTimeout(() => {
      shareLabel.textContent = 'Share';
      shareBtn.classList.remove('copied');
    }, 1500);
  });

  window.addEventListener('hashchange', () => {
    const next = loadFromHash();
    if (!next || encodeState(next) === encodeState(currentBuild().state)) return;
    // An externally-changed hash is imported as a new build, never overwriting one.
    const b = { id: newId(), name: uniqueName('Imported build'), state: next, updatedAt: Date.now() };
    builds.unshift(b);
    currentId = b.id;
    state = cloneState(b.state);
    persistNav();
    render();
  });

  resetBtn.addEventListener('click', () => {
    if (totalSpent() === 0 && !ATTRIBUTES.some((a) => state[a.id].corruptedPoints > 0)) return;
    if (!confirm('Reset all attribute points in this build?')) return;
    state = defaultState();
    saveState();
    render();
  });

  render();
})();
