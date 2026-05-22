(function () {
  'use strict';

  const STORAGE_KEY = 'cep-build-v2';

  // Base character stats (level 1, no attributes).
  const BASE = {
    health: 200,
    stamina: 100,
    carryWeight: 70,
    armor: 0,
    healthRegen: 0,
  };

  // ----- State -----
  // { [attrId]: { points, corruptedPoints, choices: { [tier]: choiceIndex } } }
  const state = loadFromHash() || loadState();

  function defaultState() {
    const s = {};
    for (const a of ATTRIBUTES) {
      s[a.id] = { points: 0, corruptedPoints: 0, choices: {} };
    }
    return s;
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultState();
      const parsed = JSON.parse(raw);
      const base = defaultState();
      for (const id of Object.keys(base)) {
        if (parsed[id]) {
          base[id].points = Math.max(0, Math.min(MAX_PER_ATTR, parsed[id].points | 0));
          base[id].corruptedPoints = Math.max(0, Math.min(base[id].points, parsed[id].corruptedPoints | 0));
          base[id].choices = parsed[id].choices && typeof parsed[id].choices === 'object' ? parsed[id].choices : {};
        }
      }
      return base;
    } catch (e) {
      return defaultState();
    }
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {}
    updateHash();
  }

  // ----- Hash encoding -----
  // Per-attribute slug: "<points>.<corrupted>.<t10>.<t20>" with "_" = unset.
  // Joined by "-" in ATTRIBUTES order.

  function encodeHash() {
    return ATTRIBUTES.map((a) => {
      const s = state[a.id];
      const t10 = s.choices[10];
      const t20 = s.choices[20];
      return [
        s.points,
        a.corruptable ? s.corruptedPoints : 0,
        t10 == null ? '_' : t10,
        t20 == null ? '_' : t20,
      ].join('.');
    }).join('-');
  }

  function decodeHash(hash) {
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
      const t10 = bits[2], t20 = bits[3];
      if (t10 !== '_' && points >= 10) choices[10] = Math.max(0, Math.min(1, parseInt(t10, 10) || 0));
      if (t20 !== '_' && points >= 20) choices[20] = Math.max(0, Math.min(1, parseInt(t20, 10) || 0));
      result[a.id] = { points, corruptedPoints: corrupted, choices };
    }
    return result;
  }

  function loadFromHash() {
    const raw = location.hash.replace(/^#/, '');
    if (!raw) return null;
    return decodeHash(raw);
  }

  let suppressHashUpdate = false;
  function updateHash() {
    if (suppressHashUpdate) return;
    const encoded = encodeHash();
    if (encoded === location.hash.replace(/^#/, '')) return;
    history.replaceState(null, '', '#' + encoded);
  }

  function totalSpent() {
    return ATTRIBUTES.reduce((sum, a) => sum + state[a.id].points, 0);
  }

  // ----- Stats computation -----

  function activePerkAt(attrId, tier) {
    const s = state[attrId];
    if (s.points < tier) return null;
    const attr = ATTRIBUTES.find((a) => a.id === attrId);
    const variant = attr.corruptable && s.corruptedPoints >= tier ? 'corrupted' : 'normal';
    const tierData = attr.perks[variant].find((t) => t.tier === tier);
    if (!tierData) return null;
    if (tierData.choices.length === 1) return tierData.choices[0];
    const idx = s.choices[tier];
    return idx == null ? null : tierData.choices[idx];
  }

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

    function add(stat, amount, source) {
      if (!stats[stat]) stats[stat] = makeStat();
      stats[stat].value += amount;
      if (amount && source) stats[stat].parts.push({ amount, source });
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
    for (const a of ATTRIBUTES) {
      for (const T of PERK_TIERS) {
        const perk = activePerkAt(a.id, T);
        if (!perk) continue;
        const variant = a.corruptable && state[a.id].corruptedPoints >= T ? 'corrupted' : 'normal';
        activePerks.push({
          attrName: a.name, tier: T, name: perk.name, desc: perk.desc, variant,
        });
        const handler = PERK_REGISTRY[perk.name];
        if (handler && handler.apply) handler.apply({ stats, add, state });
      }
    }

    return { stats, activePerks };
  }

  function tierVariant(attr, tier) {
    const s = state[attr.id];
    if (attr.corruptable && s.corruptedPoints >= tier) return 'corrupted';
    return 'normal';
  }

  function perkAtTier(attr, tier) {
    const variant = tierVariant(attr, tier);
    const list = attr.perks[variant];
    return { variant, tier: list.find((t) => t.tier === tier) };
  }

  // ----- Rendering -----

  const grid = document.getElementById('attributes');
  const overviewPanel = document.getElementById('overview-panel');
  const abilitiesPanel = document.getElementById('abilities-panel');
  const tabBar = document.getElementById('tab-bar');
  const apSpentEl = document.getElementById('ap-spent');
  const apCounterEl = document.querySelector('.ap-counter');

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
    grid.replaceChildren(...ATTRIBUTES.map(renderAttribute));
    overviewPanel.replaceChildren(...renderOverview());
    apSpentEl.textContent = totalSpent();
    apCounterEl.classList.toggle('over', totalSpent() > MAX_AP);
  }

  const fmtNum = (n) => {
    const r = Math.round(n * 10) / 10;
    return Number.isInteger(r) ? String(r) : r.toFixed(1);
  };

  // Highlight only perk-sourced parts (skip per-attribute scaling, which is obvious).
  function perkPartsDetail(stat) {
    const perkParts = stat.parts.filter((p) => !/\d+\s+(Strength|Agility|Vitality|Authority|Grit|Expertise)/.test(p.source));
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
      const { variant, tier } = perkAtTier(attr, T);
      if (!tier) continue;
      const unlocked = s.points >= T;
      const isChoice = tier.choices.length > 1;
      const chosenIdx = s.choices[T];

      const tierEl = el('div', { class: 'perk-tier' + (unlocked ? ' unlocked' : '') + (variant === 'corrupted' ? ' corrupted' : '') });
      tierEl.append(el('div', { class: 'perk-tier-label' },
        'Tier ' + T,
        variant === 'corrupted' ? ' · corrupted' : '',
        (isChoice && unlocked && chosenIdx == null) ? ' — choose one' : '',
      ));

      const opts = el('div', { class: 'perk-options' + (isChoice ? ' has-choice' : '') });

      tier.choices.forEach((p, idx) => {
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

  // Give the header buttons an icon + a label span (so feedback text swaps cleanly).
  const shareBtn = document.getElementById('share-btn');
  const resetBtn = document.getElementById('reset-btn');
  const shareLabel = el('span', {}, 'Share');
  shareBtn.replaceChildren(icon('share', 'btn-icon'), shareLabel);
  resetBtn.replaceChildren(icon('rotate-ccw', 'btn-icon'), el('span', {}, 'Reset'));

  shareBtn.addEventListener('click', async () => {
    updateHash();
    const url = location.href;
    try {
      await navigator.clipboard.writeText(url);
    } catch (e) {
      // fallback: select+copy via temporary input
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
    if (!next) return;
    suppressHashUpdate = true;
    for (const id of Object.keys(state)) {
      Object.assign(state[id], next[id]);
    }
    suppressHashUpdate = false;
    saveState();
    render();
  });

  document.getElementById('reset-btn').addEventListener('click', () => {
    if (totalSpent() === 0 && !ATTRIBUTES.some((a) => state[a.id].corruptedPoints > 0)) return;
    if (!confirm('Reset all attribute points?')) return;
    for (const id of Object.keys(state)) {
      state[id].points = 0;
      state[id].corruptedPoints = 0;
      state[id].choices = {};
    }
    saveState();
    render();
  });

  render();
})();
