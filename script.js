/**
 * script.js
 * Compendium: Codex do Engenheiro de Dados — Motor Principal
 *
 * Consome window.__EMBEDDED_SKILLS__ (data-embedded.js).
 * Segue as regras de PROMPT_BASE.md — em especial as seções 6 e 7
 * (curva de XP por nó e cálculo de nível global).
 *
 * Este arquivo não deve conter cor ou fonte — isso vive em theme.css.
 * Ele só aplica classes de estado (locked/active/mastered/is-boss).
 */

(function () {
  'use strict';

  // =====================================================================
  // 1. CONSTANTES
  // =====================================================================
  const STORAGE_KEY = 'codex_state_v2';
  const MAX_NODE_LEVEL = 10;

  const RANKS = [
    { min: 1,  max: 9,        name: 'Aprendiz' },
    { min: 10, max: 24,       name: 'Estudante' },
    { min: 25, max: 39,       name: 'Praticante' },
    { min: 40, max: 49,       name: 'Avançado' },
    { min: 50, max: 54,       name: 'Sênior' },
    { min: 55, max: Infinity, name: 'Mestre do Codex' }
  ];

  // Layout da árvore (deve bater com o tamanho de nó definido em style.css)
  const NODE_SIZE = 72;          // px — style.css deve definir .skill-node { width/height: 72px }
  const TIER_SPACING = 190;      // px entre tiers (eixo X)
  const ROW_SPACING = 110;       // px entre rows dentro de uma categoria (eixo Y)
  const CATEGORY_GAP = 90;       // px extra entre bandas de categoria
  const LABEL_HEIGHT = 56;       // espaço reservado pro rótulo da categoria
  const MARGIN_LEFT = 80;
  const MARGIN_TOP = 40;

  const DEFAULT_SCALE = 0.78;
  const MIN_SCALE = 0.4;
  const MAX_SCALE = 1.5;
  const ZOOM_STEP = 0.1;

  const POMODORO_SECONDS = 25 * 60;

  // Teto puramente VISUAL pra barra de KP (KP em si continua sem limite real,
  // isso só estima um "cheio" razoável assumindo cliques de +10 KP na média).
  const KP_VISUAL_CEILING = 1000;

  // =====================================================================
  // 2. DADOS EMBUTIDOS
  // =====================================================================
  const DATA = window.__EMBEDDED_SKILLS__;
  if (!DATA) {
    console.error('data-embedded.js precisa ser carregado antes de script.js');
    return;
  }

  const skillsById = {};
  DATA.skills.forEach(function (s) { skillsById[s.id] = s; });

  const categoriesSorted = DATA.categories.slice().sort(function (a, b) {
    return a.order - b.order;
  });

  // =====================================================================
  // 3. MATEMÁTICA DE NÍVEL (PROMPT_BASE.md seção 6-7)
  // =====================================================================
  function getWeight(skill) {
    return typeof skill.weight === 'number' ? skill.weight : 1;
  }

  function xpParaNivel(level, weight) {
    weight = weight || 1;
    return 5 * level * (level + 1) * weight;
  }

  function nodeLevelFromXp(xp, weight) {
    weight = weight || 1;
    let level = 0;
    for (let L = 1; L <= MAX_NODE_LEVEL; L++) {
      if (xp >= xpParaNivel(L, weight)) level = L; else break;
    }
    return level;
  }

  function nodeMaxXp(weight) {
    return xpParaNivel(MAX_NODE_LEVEL, weight || 1);
  }

  function nodeProgressPercent(xp, weight) {
    weight = weight || 1;
    const currentLevel = nodeLevelFromXp(xp, weight);
    if (currentLevel >= MAX_NODE_LEVEL) return 100;
    const floorXp = xpParaNivel(currentLevel, weight);
    const ceilXp = xpParaNivel(currentLevel + 1, weight);
    const pct = ((xp - floorXp) / (ceilXp - floorXp)) * 100;
    return Math.max(0, Math.min(100, pct));
  }

  // KP não tem teto real (PROMPT_BASE.md seção 6.4) — isso é só uma barra
  // visual estimada, nunca usada em nenhum cálculo de nível/rank.
  function kpProgressPercent(kp) {
    return Math.max(0, Math.min(100, (kp / KP_VISUAL_CEILING) * 100));
  }

  function rankForLevel(level) {
    const found = RANKS.find(function (r) { return level >= r.min && level <= r.max; });
    return (found || RANKS[RANKS.length - 1]).name;
  }

  function nextRankLabel(level) {
    const idx = RANKS.findIndex(function (r) { return level >= r.min && level <= r.max; });
    const next = RANKS[idx + 1];
    return next ? ('Próximo: ' + next.name) : 'Nível máximo alcançado';
  }

  function specializationsUnlocked() {
    return globalLevel() >= 50;
  }

  // =====================================================================
  // 4. ESTADO (localStorage)
  // =====================================================================
  let state = null;

  function defaultState() {
    return {
      nodes: {},           // { skillId: { xp, kp } }
      bonusXp: 0,           // XP solto — só de conquistas (Bronze/Prata/Ouro)
      missions: [],
      achievements: {},     // { achievementId: { unlocked, unlockedAt } }
      streak: { lastDate: null, current: 0 },
      history: [],           // { ts, type, label, detail }
      notifiedPrereq: {},    // { skillId: true } — já mostrou popup de sugestão
      weeklyGoal: 200,        // meta de XP por semana (editável pelo usuário)
      categoriesCelebrated: {}, // { categoryId: true } — já mostrou o modal de celebração
      weeklyGoalCelebratedAt: 0  // timestamp da última celebração de meta semanal
    };
  }

  function seedFromEmbedded() {
    const s = defaultState();
    s.missions = (DATA.missions || []).map(function (m) {
      return Object.assign({}, m, { linkedNodes: (m.linkedNodes || []).map(function (n) { return Object.assign({}, n); }) });
    });
    (DATA.achievements || []).forEach(function (a) {
      s.achievements[a.id] = { unlocked: false, unlockedAt: null };
    });
    return s;
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return seedFromEmbedded();
      const parsed = JSON.parse(raw);
      const merged = Object.assign(defaultState(), parsed);
      merged.nodes = parsed.nodes || {};
      return merged;
    } catch (e) {
      console.error('Estado salvo corrompido, iniciando do zero.', e);
      return seedFromEmbedded();
    }
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      console.error('Falha ao salvar estado (localStorage cheio ou indisponível).', e);
      showToast('Não foi possível salvar — armazenamento local indisponível.', 'warning');
    }
  }

  function getNodeState(skillId) {
    if (!state.nodes[skillId]) state.nodes[skillId] = { xp: 0, kp: 0 };
    return state.nodes[skillId];
  }

  function logHistory(type, label, detail) {
    state.history.unshift({ ts: Date.now(), type: type, label: label, detail: detail || '' });
    if (state.history.length > 500) state.history.length = 500; // teto defensivo
  }

  // =====================================================================
  // 5. ROLL-UP (nó → categoria → global) — PROMPT_BASE.md seção 7
  // =====================================================================
  function coreSkills() {
    return DATA.skills.filter(function (s) { return !s.isSpecialization; });
  }

  function skillsByCategory(categoryId) {
    return DATA.skills.filter(function (s) { return s.category === categoryId; });
  }

  function categoryLevel(categoryId) {
    return skillsByCategory(categoryId)
      .filter(function (s) { return !s.isSpecialization; })
      .reduce(function (sum, s) { return sum + nodeLevelFromXp(getNodeState(s.id).xp, getWeight(s)); }, 0);
  }

  function categoryProgressPercent(categoryId) {
    const nodes = skillsByCategory(categoryId).filter(function (s) { return !s.isSpecialization; });
    if (nodes.length === 0) return 0;
    return (categoryLevel(categoryId) / (10 * nodes.length)) * 100;
  }

  function coreLevelSum() {
    return coreSkills().reduce(function (sum, s) {
      return sum + nodeLevelFromXp(getNodeState(s.id).xp, getWeight(s));
    }, 0);
  }

  // Nível Global = soma de Node Levels do núcleo (÷10) + bônus de conquistas
  // convertido à mesma escala (55 XP ≈ custo médio de 1 nível na curva, ver
  // PROMPT_BASE.md seção 6.2: 550 XP / 10 níveis = 55 XP/nível em média).
  function globalLevel() {
    const bonusLevels = (state.bonusXp || 0) / 55;
    return Math.floor((coreLevelSum() + bonusLevels) / 10) + 1;
  }

  function totalXpForAchievements() {
    const nodesXp = coreSkills().reduce(function (sum, s) { return sum + getNodeState(s.id).xp; }, 0);
    return nodesXp + (state.bonusXp || 0);
  }

  function daysActiveCount() {
    const days = new Set(state.history.map(function (h) { return new Date(h.ts).toDateString(); }));
    return days.size;
  }

  function specializationComplete(categoryId) {
    const specs = DATA.skills.filter(function (s) { return s.category === categoryId && s.isSpecialization; });
    if (specs.length === 0) return false;
    return specs.every(function (s) { return nodeLevelFromXp(getNodeState(s.id).xp, getWeight(s)) >= MAX_NODE_LEVEL; });
  }

  // =====================================================================
  // 6. ESTADO VISUAL DOS NÓS (locked/active/mastered/is-boss)
  // =====================================================================
  function isPrereqMastered(skill) {
    if (!skill.prereq) return true;
    const prereqSkill = skillsById[skill.prereq];
    if (!prereqSkill) return true;
    const ns = getNodeState(prereqSkill.id);
    return nodeLevelFromXp(ns.xp, getWeight(prereqSkill)) >= MAX_NODE_LEVEL;
  }

  function computeNodeVisual(skill) {
    const ns = getNodeState(skill.id);
    const weight = getWeight(skill);
    const level = nodeLevelFromXp(ns.xp, weight);
    const mastered = level >= MAX_NODE_LEVEL;

    let stateClass;
    if (skill.isSpecialization && !specializationsUnlocked()) {
      stateClass = 'locked';
    } else if (mastered) {
      stateClass = 'mastered';
    } else if (isPrereqMastered(skill)) {
      stateClass = 'active';
    } else {
      stateClass = 'locked';
    }

    return { level: level, mastered: mastered, stateClass: stateClass, weight: weight, xp: ns.xp, kp: ns.kp };
  }

  // =====================================================================
  // 7. LAYOUT (posição de cada nó no canvas)
  // =====================================================================
  let layoutCache = null;

  // Layout de UMA categoria por vez — isso é o que garante que arrastar o
  // mouse não "vaze" pra dentro de outro galho: as outras categorias
  // simplesmente não existem no DOM enquanto não são a categoria ativa.
  function computeLayout(categoryId) {
    const skills = skillsByCategory(categoryId).filter(function (s) {
      return !s.isSpecialization || specializationsUnlocked();
    });

    const rootX = MARGIN_LEFT;
    const rootY = MARGIN_TOP + LABEL_HEIGHT;

    const nodePositions = {};
    skills.forEach(function (skill) {
      nodePositions[skill.id] = {
        x: MARGIN_LEFT + (skill.tier || 0) * TIER_SPACING,
        y: rootY + (skill.row || 0) * ROW_SPACING
      };
    });

    return { categoryId: categoryId, rootX: rootX, rootY: rootY, nodePositions: nodePositions };
  }

  // =====================================================================
  // 8. RENDERIZAÇÃO DA ÁRVORE
  // =====================================================================
  const nodesLayer = document.getElementById('nodes-layer');
  const connectionsLayer = document.getElementById('connections-layer');
  const treeCanvas = document.getElementById('tree-canvas');
  const treeViewport = document.getElementById('tree-viewport');

  // Rebuild o conteúdo da categoria ativa. NÃO mexe em zoom/pan (focal/scale)
  // — isso é papel exclusivo de focusCategory(), pra não resetar a visão do
  // usuário toda vez que o estado muda (ex: ao clicar +10 XP no drawer).
  function renderTree() {
    layoutCache = computeLayout(currentCategoryId);
    nodesLayer.innerHTML = '';
    connectionsLayer.innerHTML = '';

    const cat = DATA.categories.find(function (c) { return c.id === currentCategoryId; });
    const label = document.createElement('div');
    label.className = 'category-band-label';
    label.style.left = '0px';
    label.style.top = MARGIN_TOP + 'px';
    label.style.setProperty('--node-accent', cat.color);
    label.textContent = cat.name;
    nodesLayer.appendChild(label);

    const visibleSkills = DATA.skills.filter(function (s) {
      return s.category === currentCategoryId && layoutCache.nodePositions[s.id];
    });

    // Conexões primeiro (ficam atrás dos nós)
    visibleSkills.forEach(function (skill) {
      if (!skill.prereq) return;
      const from = layoutCache.nodePositions[skill.prereq];
      const to = layoutCache.nodePositions[skill.id];
      if (!from || !to) return;
      drawConnection(from, to, isPrereqMastered(skill));
    });

    // Nós
    visibleSkills.forEach(function (skill) {
      const pos = layoutCache.nodePositions[skill.id];
      const visual = computeNodeVisual(skill);

      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'skill-node ' + visual.stateClass + ' cat-' + skill.category + (skill.isBoss ? ' is-boss' : '');
      el.style.left = (pos.x - NODE_SIZE / 2) + 'px';
      el.style.top = (pos.y - NODE_SIZE / 2) + 'px';
      el.style.width = NODE_SIZE + 'px';
      el.style.height = NODE_SIZE + 'px';
      el.dataset.skillId = skill.id;
      el.setAttribute('aria-label', skill.name + ' — ' + stateLabel(visual.stateClass) + ', ' + visual.kp + ' KP');
      el.innerHTML =
        '<span class="node-icon" aria-hidden="true"></span>' +
        '<span class="node-code">' + initials(skill.name) + '</span>';

      const nameTag = document.createElement('div');
      nameTag.className = 'node-label';
      nameTag.style.left = (pos.x - NODE_SIZE) + 'px';
      nameTag.style.top = (pos.y + NODE_SIZE / 2 + 6) + 'px';
      nameTag.textContent = skill.name;

      el.addEventListener('click', function () { openDrawer(skill.id); });

      nodesLayer.appendChild(el);
      nodesLayer.appendChild(nameTag);
    });

    applyTransform();
  }

  function stateLabel(stateClass) {
    return { locked: 'Bloqueada', active: 'Aprendendo', mastered: 'Concluída' }[stateClass] || stateClass;
  }

  function initials(name) {
    return name.split(/\s+/).map(function (w) { return w[0]; }).join('').slice(0, 2).toUpperCase();
  }

  function drawConnection(from, to, energized) {
    const midX = from.x + (to.x - from.x) / 2;
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    const d = 'M ' + from.x + ' ' + from.y + ' L ' + midX + ' ' + from.y + ' L ' + midX + ' ' + to.y + ' L ' + to.x + ' ' + to.y;
    path.setAttribute('d', d);
    path.setAttribute('class', 'connection-line' + (energized ? ' energized' : ''));
    connectionsLayer.appendChild(path);
  }

  // =====================================================================
  // 9. ZOOM / PAN (fixo, ancorado no nó raiz da categoria ativa)
  // =====================================================================
  let scale = DEFAULT_SCALE;
  let focal = { x: MARGIN_LEFT, y: MARGIN_TOP };
  let currentCategoryId = categoriesSorted[0].id;
  let isPanning = false;
  let panStart = null;

  function applyTransform() {
    // Mede o canvas de verdade (não o treeViewport, que inclui a barra de
    // ferramentas e as abas no topo — isso empurrava o nó raiz pra baixo
    // do centro real do canvas).
    const rect = treeCanvas.getBoundingClientRect();
    // Ancorado mais pra cima/esquerda (não no centro exato): a árvore só
    // cresce pra direita e pra baixo a partir da raiz, então centralizar
    // de verdade desperdiçaria metade da tela vazia à esquerda/acima.
    const tx = rect.width * 0.14 - focal.x * scale;
    const ty = rect.height * 0.2 - focal.y * scale;
    const transform = 'translate(' + tx + 'px, ' + ty + 'px) scale(' + scale + ')';
    nodesLayer.style.transform = transform;
    connectionsLayer.style.transform = transform;
    const zoomLabel = document.getElementById('zoom-level');
    if (zoomLabel) zoomLabel.textContent = Math.round(scale * 100) + '%';
  }

  // Troca de categoria = reconstrói a árvore com só os nós daquela categoria
  // (não é mais um "pan" dentro de um canvas gigante compartilhado).
  function focusCategory(categoryId) {
    currentCategoryId = categoryId;
    scale = DEFAULT_SCALE;
    renderTree(); // recalcula layoutCache pra essa categoria e já reaplica o transform
    focal = { x: layoutCache.rootX, y: layoutCache.rootY };
    applyTransform();
    updateCategoryTabs();
  }

  function setupZoomPanControls() {
    document.getElementById('btn-zoom-in').addEventListener('click', function () {
      scale = Math.min(MAX_SCALE, +(scale + ZOOM_STEP).toFixed(2));
      applyTransform();
    });
    document.getElementById('btn-zoom-out').addEventListener('click', function () {
      scale = Math.max(MIN_SCALE, +(scale - ZOOM_STEP).toFixed(2));
      applyTransform();
    });
    document.getElementById('btn-center').addEventListener('click', function () {
      focusCategory(currentCategoryId);
    });

    treeCanvas.addEventListener('pointerdown', function (e) {
      if (e.target.closest('.skill-node')) return; // não inicia pan clicando num nó
      isPanning = true;
      panStart = { x: e.clientX, y: e.clientY, focalX: focal.x, focalY: focal.y };
      treeCanvas.classList.add('is-panning');
    });
    window.addEventListener('pointermove', function (e) {
      if (!isPanning) return;
      const dx = (e.clientX - panStart.x) / scale;
      const dy = (e.clientY - panStart.y) / scale;
      focal = { x: panStart.focalX - dx, y: panStart.focalY - dy };
      applyTransform();
    });
    window.addEventListener('pointerup', function () {
      isPanning = false;
      treeCanvas.classList.remove('is-panning');
    });

    treeCanvas.addEventListener('wheel', function (e) {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP;
      scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, +(scale + delta).toFixed(2)));
      applyTransform();
    }, { passive: false });
  }

  // =====================================================================
  // 10. ABAS DE CATEGORIA
  // =====================================================================
  function renderCategoryTabs() {
    const container = document.getElementById('category-tabs');
    container.innerHTML = '';
    categoriesSorted.forEach(function (cat, idx) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'category-tab';
      btn.dataset.categoryId = cat.id;
      btn.style.setProperty('--node-accent', cat.color);

      const pct = Math.round(categoryProgressPercent(cat.id));
      btn.innerHTML =
        '<span class="category-tab-name">' + (idx + 1) + '. ' + cat.name + '</span>' +
        '<span class="category-tab-level font-mono">Nv ' + categoryLevel(cat.id) + '</span>' +
        '<span class="category-tab-progress"><span class="category-tab-progress-fill" style="width:' + pct + '%"></span></span>';

      btn.addEventListener('click', function () { focusCategory(cat.id); });
      container.appendChild(btn);
    });
    updateCategoryTabs();
  }

  function updateCategoryTabs() {
    document.querySelectorAll('.category-tab').forEach(function (btn) {
      btn.classList.toggle('is-active', btn.dataset.categoryId === currentCategoryId);
    });
  }

  // =====================================================================
  // 11. DRAWER DO NÓ
  // =====================================================================
  let activeDrawerSkillId = null;

  function openDrawer(skillId) {
    const skill = skillsById[skillId];
    if (!skill) return;
    activeDrawerSkillId = skillId;

    if (!isPrereqMastered(skill) && !skill.isSpecialization && !state.notifiedPrereq[skillId]) {
      const prereqSkill = skillsById[skill.prereq];
      showToast(
        'Sugestão: "' + (prereqSkill ? prereqSkill.name : skill.prereq) + '" costuma vir antes de "' + skill.name + '" — mas fique à vontade pra continuar se já sentir a evolução aqui.',
        'suggestion'
      );
      state.notifiedPrereq[skillId] = true;
      saveState();
    }

    renderDrawer();
    document.getElementById('drawer-overlay').hidden = false;
  }

  function closeDrawer() {
    document.getElementById('drawer-overlay').hidden = true;
    activeDrawerSkillId = null;
  }

  function renderDrawer() {
    const skill = skillsById[activeDrawerSkillId];
    if (!skill) return;
    const ns = getNodeState(skill.id);
    const weight = getWeight(skill);
    const level = nodeLevelFromXp(ns.xp, weight);

    document.getElementById('drawer-node-name').textContent = skill.name;
    document.getElementById('drawer-node-description').textContent = skill.description || '';
    document.getElementById('drawer-node-level').textContent = level + '/10';
    document.getElementById('drawer-xp-bar').style.width = nodeProgressPercent(ns.xp, weight) + '%';
    document.getElementById('drawer-xp-bar').classList.toggle('mastered', level >= MAX_NODE_LEVEL);
    document.getElementById('drawer-kp-value').textContent = ns.kp;
    document.getElementById('drawer-kp-bar').style.width = kpProgressPercent(ns.kp) + '%';
  }

  function applyXpChange(skillId, delta) {
    const skill = skillsById[skillId];
    if (!skill) return;
    const ns = getNodeState(skillId);
    const cap = nodeMaxXp(getWeight(skill));
    ns.xp = Math.max(0, Math.min(cap, ns.xp + delta));
    logHistory('xp', skill.name, (delta > 0 ? '+' : '') + delta + ' XP');
    registerActivityToday();
    afterStateChange();
  }

  function applyKpChange(skillId, delta) {
    const skill = skillsById[skillId];
    if (!skill) return;
    const ns = getNodeState(skillId);
    ns.kp = Math.max(0, ns.kp + delta); // KP sem teto (PROMPT_BASE.md seção 6.4)
    logHistory('kp', skill.name, (delta > 0 ? '+' : '') + delta + ' KP');
    registerActivityToday();
    afterStateChange();
  }

  // Reinicia SÓ este nó (não o app inteiro) — resolve o caso de errar um
  // valor e não querer ficar clicando em "-" até zerar.
  function resetNode(skillId) {
    const skill = skillsById[skillId];
    if (!skill) return;
    if (!window.confirm('Reiniciar "' + skill.name + '"? Isso zera o XP e o KP só desta habilidade.')) return;
    state.nodes[skillId] = { xp: 0, kp: 0 };
    logHistory('node-reset', skill.name, 'Habilidade reiniciada');
    afterStateChange();
    renderDrawer();
  }

  function setupDrawerControls() {
    document.getElementById('btn-close-drawer').addEventListener('click', closeDrawer);
    document.getElementById('drawer-overlay').addEventListener('click', function (e) {
      if (e.target.id === 'drawer-overlay') closeDrawer();
    });
    document.querySelectorAll('#node-drawer [data-xp]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        applyXpChange(activeDrawerSkillId, parseInt(btn.dataset.xp, 10));
        renderDrawer();
      });
    });
    document.querySelectorAll('#node-drawer [data-kp]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        applyKpChange(activeDrawerSkillId, parseInt(btn.dataset.kp, 10));
        renderDrawer();
      });
    });
    document.getElementById('btn-reset-node').addEventListener('click', function () {
      resetNode(activeDrawerSkillId);
    });
  }

  // =====================================================================
  // 12. STREAK
  // =====================================================================
  function registerActivityToday() {
    const today = new Date().toDateString();
    if (state.streak.lastDate === today) return;

    if (state.streak.lastDate) {
      const diffDays = Math.round((new Date(today) - new Date(state.streak.lastDate)) / 86400000);
      state.streak.current = diffDays === 1 ? state.streak.current + 1 : 1;
    } else {
      state.streak.current = 1;
    }
    state.streak.lastDate = today;
  }

  // =====================================================================
  // 13. CONQUISTAS
  // =====================================================================
  function evaluateCondition(conditionStr) {
    try {
      // Conditions vêm de data-embedded.js (arquivo confiável do próprio projeto,
      // não de entrada do usuário) — Function() é aceitável aqui, escopo controlado.
      const fn = new Function(
        'streak', 'rank', 'totalXp', 'daysActive', 'categoryProgress', 'specializationComplete',
        'return (' + conditionStr + ');'
      );
      return !!fn(
        state.streak.current,
        rankForLevel(globalLevel()),
        totalXpForAchievements(),
        daysActiveCount(),
        categoryProgressPercent,
        specializationComplete
      );
    } catch (e) {
      console.error('Condição de conquista inválida:', conditionStr, e);
      return false;
    }
  }

  function checkAchievements() {
    (DATA.achievements || []).forEach(function (a) {
      const entry = state.achievements[a.id] || { unlocked: false };
      if (entry.unlocked) return;
      if (evaluateCondition(a.condition)) {
        entry.unlocked = true;
        entry.unlockedAt = Date.now();
        state.achievements[a.id] = entry;
        state.bonusXp = (state.bonusXp || 0) + (a.bonusXp || 0);
        logHistory('achievement', a.name, 'Conquista desbloqueada (+' + (a.bonusXp || 0) + ' XP)');
        showToast('🏅 Conquista desbloqueada: ' + a.name, 'achievement');
      }
    });
  }

  function renderAchievements() {
    const grid = document.getElementById('achievement-grid');
    grid.innerHTML = '';
    (DATA.achievements || []).forEach(function (a) {
      const entry = state.achievements[a.id] || { unlocked: false };
      const card = document.createElement('div');
      card.className = 'achievement-card tier-' + a.tier + (entry.unlocked ? ' is-unlocked' : ' is-locked');
      const showHidden = a.hidden && !entry.unlocked;
      card.innerHTML =
        '<div class="achievement-tier">' + a.tier + '</div>' +
        '<div class="achievement-name">' + (showHidden ? '???' : a.name) + '</div>' +
        '<div class="achievement-status">' + (entry.unlocked ? 'Desbloqueada' : (showHidden ? 'Surpresa' : 'Bloqueada')) + '</div>';
      grid.appendChild(card);
    });
  }

  // =====================================================================
  // 14. MISSÕES
  // =====================================================================
  let missionFilter = 'all';

  function renderMissions() {
    const list = document.getElementById('mission-list');
    list.innerHTML = '';
    const filtered = state.missions.filter(function (m) {
      return missionFilter === 'all' || m.status === missionFilter;
    });

    if (filtered.length === 0) {
      list.innerHTML = '<p class="empty-state">Nenhuma missão aqui ainda.</p>';
      return;
    }

    filtered.forEach(function (m) {
      const card = document.createElement('div');
      card.className = 'mission-card';

      const nodeChips = (m.linkedNodes || []).map(function (n) {
        const s = skillsById[n.skillId];
        const kpPart = n.kp ? (' / +' + n.kp + ' KP') : '';
        return '<span class="node-chip">' + (s ? s.name : n.skillId) + ' +' + n.xp + ' XP' + kpPart + '</span>';
      }).join('');

      let actions = '';
      if (m.status === 'pendente') {
        actions = '<button data-action="iniciar" data-id="' + m.id + '" class="btn-secondary">Iniciar</button>';
      } else if (m.status === 'em_andamento') {
        actions = '<button data-action="concluir" data-id="' + m.id + '" class="btn-primary">Concluir</button>';
      }
      // "Remover" agora apaga de verdade e fica disponível em qualquer
      // status — inclusive Concluída — pra dar um jeito de limpar a lista.
      actions += '<button data-action="remover" data-id="' + m.id + '" class="btn-danger">Remover</button>';

      card.innerHTML =
        '<h3>' + m.name + '</h3>' +
        '<p class="mission-difficulty">' + m.difficulty + '</p>' +
        '<p class="mission-description">' + m.description + '</p>' +
        '<p class="mission-status-line">' + statusLabel(m.status) + ' · ' + categoryName(m.tag) + '</p>' +
        '<div class="node-chip-row">' + nodeChips + '</div>' +
        '<div class="mission-actions">' + actions + '</div>';

      list.appendChild(card);
    });

    list.querySelectorAll('[data-action]').forEach(function (btn) {
      btn.addEventListener('click', function () { handleMissionAction(btn.dataset.action, btn.dataset.id); });
    });
  }

  function statusLabel(status) {
    return { pendente: 'Pendente', em_andamento: 'Em Andamento', concluida: 'Concluída', removida: 'Removida' }[status] || status;
  }
  function categoryName(categoryId) {
    const c = DATA.categories.find(function (cat) { return cat.id === categoryId; });
    return c ? c.name : categoryId;
  }

  function handleMissionAction(action, missionId) {
    const mission = state.missions.find(function (m) { return m.id === missionId; });
    if (!mission) return;

    if (action === 'iniciar') {
      mission.status = 'em_andamento';
      logHistory('mission', mission.name, 'Missão iniciada');
    } else if (action === 'concluir') {
      mission.status = 'concluida';
      (mission.linkedNodes || []).forEach(function (n) {
        applyXpChange(n.skillId, n.xp || 0);
        if (n.kp) applyKpChange(n.skillId, n.kp);
      });
      logHistory('mission', mission.name, 'Missão concluída');
      showToast('✅ Missão concluída: ' + mission.name, 'success');
    } else if (action === 'remover') {
      // Exclusão de verdade — antes só marcava "removida" e o card ficava
      // pra sempre na lista sem nenhuma ação disponível.
      if (!window.confirm('Remover "' + mission.name + '" de vez? Essa ação não desfaz.')) return;
      state.missions = state.missions.filter(function (m) { return m.id !== missionId; });
      logHistory('mission', mission.name, 'Missão removida');
    }

    afterStateChange();
  }

  function setupMissionFilters() {
    document.querySelectorAll('.filter-chip').forEach(function (chip) {
      chip.addEventListener('click', function () {
        document.querySelectorAll('.filter-chip').forEach(function (c) { c.classList.remove('is-active'); });
        chip.classList.add('is-active');
        missionFilter = chip.dataset.filter;
        renderMissions();
      });
    });
  }

  // --- Formulário de nova missão ---
  function setupMissionForm() {
    const overlay = document.getElementById('mission-form-overlay');
    const form = document.getElementById('mission-form');
    const tagSelect = document.getElementById('mission-tag');

    categoriesSorted.forEach(function (cat) {
      const opt = document.createElement('option');
      opt.value = cat.id;
      opt.textContent = cat.name;
      tagSelect.appendChild(opt);
    });

    document.getElementById('btn-new-mission').addEventListener('click', function () {
      form.reset();
      document.getElementById('mission-linked-nodes').innerHTML = '';
      document.getElementById('mission-form-error').hidden = true;
      addLinkedNodeRow(); // já abre com 1 linha pronta, já que é obrigatório
      overlay.hidden = false;
    });
    document.getElementById('btn-close-mission-form').addEventListener('click', function () { overlay.hidden = true; });
    overlay.addEventListener('click', function (e) { if (e.target === overlay) overlay.hidden = true; });

    document.getElementById('btn-add-linked-node').addEventListener('click', function () {
      addLinkedNodeRow();
    });

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      const linkedNodes = Array.prototype.slice.call(document.querySelectorAll('.linked-node-row')).map(function (row) {
        return {
          skillId: row.querySelector('.linked-node-skill').value,
          xp: parseInt(row.querySelector('.linked-node-xp').value, 10) || 0,
          kp: parseInt(row.querySelector('.linked-node-kp').value, 10) || 0
        };
      }).filter(function (n) { return n.skillId; });

      // Obrigatório: pelo menos 1 nó vinculado com XP > 0 — sem isso a
      // missão não teria nenhuma recompensa possível, então nem deixa criar.
      const errorEl = document.getElementById('mission-form-error');
      if (linkedNodes.length === 0 || !linkedNodes.some(function (n) { return n.xp > 0; })) {
        errorEl.hidden = false;
        return;
      }
      errorEl.hidden = true;

      const mission = {
        id: 'mission_' + Date.now(),
        name: document.getElementById('mission-name').value.trim(),
        description: document.getElementById('mission-description').value.trim(),
        difficulty: document.getElementById('mission-difficulty').value,
        tag: tagSelect.value,
        recurring: document.getElementById('mission-recurring').checked,
        deadline: document.getElementById('mission-deadline').value || null,
        status: 'pendente',
        linkedNodes: linkedNodes
      };

      state.missions.unshift(mission);
      logHistory('mission', mission.name, 'Missão criada');
      overlay.hidden = true;
      afterStateChange();
    });
  }

  function addLinkedNodeRow() {
    const container = document.getElementById('mission-linked-nodes');
    const row = document.createElement('div');
    row.className = 'linked-node-row';

    const select = document.createElement('select');
    select.className = 'linked-node-skill';
    const emptyOpt = document.createElement('option');
    emptyOpt.value = '';
    emptyOpt.textContent = 'Selecione uma habilidade';
    select.appendChild(emptyOpt);
    DATA.skills.forEach(function (s) {
      const opt = document.createElement('option');
      opt.value = s.id;
      opt.textContent = s.name;
      select.appendChild(opt);
    });

    row.appendChild(select);
    row.insertAdjacentHTML('beforeend',
      '<input type="number" class="linked-node-xp" placeholder="XP" min="0" value="10">' +
      '<input type="number" class="linked-node-kp" placeholder="KP" min="0" value="0">' +
      '<button type="button" class="btn-close btn-remove-row" aria-label="Remover">✕</button>'
    );
    row.querySelector('.btn-remove-row').addEventListener('click', function () { row.remove(); });
    container.appendChild(row);
  }

  // =====================================================================
  // 15. ESTATÍSTICAS
  // =====================================================================
  // Compartilhada entre Estatísticas e Meta Semanal — soma XP/KP registrados
  // no histórico desde um timestamp.
  function sumXpKp(since) {
    return state.history.filter(function (h) { return h.ts >= since && (h.type === 'xp' || h.type === 'kp'); })
      .reduce(function (acc, h) {
        const val = parseInt(h.detail, 10) || 0;
        if (h.type === 'xp') acc.xp += val; else acc.kp += val;
        return acc;
      }, { xp: 0, kp: 0 });
  }

  function heatmapIntensityClass(count) {
    if (count === 0) return 'heat-0';
    if (count <= 2) return 'heat-1';
    if (count <= 5) return 'heat-2';
    if (count <= 10) return 'heat-3';
    return 'heat-4';
  }

  function renderHeatmapHtml() {
    const DAYS = 91; // ~13 semanas
    const counts = {};
    state.history.forEach(function (h) {
      if (h.type !== 'xp' && h.type !== 'kp') return;
      const d = new Date(h.ts);
      d.setHours(0, 0, 0, 0);
      counts[d.getTime()] = (counts[d.getTime()] || 0) + 1;
    });

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const cells = [];
    for (let i = DAYS - 1; i >= 0; i--) {
      const d = new Date(today.getTime() - i * 86400000);
      cells.push({ date: d, count: counts[d.getTime()] || 0 });
    }

    const weeks = [];
    for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

    const weeksHtml = weeks.map(function (week) {
      const dayCells = week.map(function (c) {
        const label = c.date.toLocaleDateString('pt-BR') + ': ' + c.count + ' registro(s)';
        return '<div class="heatmap-cell ' + heatmapIntensityClass(c.count) + '" title="' + label + '"></div>';
      }).join('');
      return '<div class="heatmap-week">' + dayCells + '</div>';
    }).join('');

    return '<div class="heatmap-grid">' + weeksHtml + '</div>';
  }

  function renderStats() {
    const el = document.getElementById('stats-content');
    const now = Date.now();
    const weekAgo = now - 7 * 86400000;
    const monthAgo = now - 30 * 86400000;

    const week = sumXpKp(weekAgo);
    const month = sumXpKp(monthAgo);

    const categoriesHtml = categoriesSorted.map(function (cat) {
      const pct = Math.round(categoryProgressPercent(cat.id));
      return '<div class="stat-category-row">' +
        '<span style="color:' + cat.color + '">' + cat.name + '</span>' +
        '<div class="progress-track"><div class="progress-fill" style="width:' + pct + '%; background:' + cat.color + '"></div></div>' +
        '<span class="font-mono">' + pct + '%</span>' +
        '</div>';
    }).join('');

    el.innerHTML =
      '<div class="stat-summary">' +
      '<div><span class="font-mono">' + globalLevel() + '</span><br>Nível Global</div>' +
      '<div><span class="font-mono">' + rankForLevel(globalLevel()) + '</span><br>Rank</div>' +
      '<div><span class="font-mono">' + state.streak.current + '</span><br>Streak (dias)</div>' +
      '</div>' +
      '<h3>Últimos 7 dias</h3><p class="font-mono">' + week.xp + ' XP · ' + week.kp + ' KP</p>' +
      '<h3>Últimos 30 dias</h3><p class="font-mono">' + month.xp + ' XP · ' + month.kp + ' KP</p>' +
      '<h3>XP de conquistas acumulado</h3><p class="font-mono">' + (state.bonusXp || 0) + ' XP <span class="stat-hint">(bônus Bronze/Prata/Ouro)</span></p>' +
      '<h3>Heatmap de Estudo <span class="stat-hint">(~13 semanas)</span></h3>' + renderHeatmapHtml() +
      '<h3>Progresso por categoria</h3>' + categoriesHtml;
  }

  // =====================================================================
  // 16. HISTÓRICO
  // =====================================================================
  function renderHistory() {
    const list = document.getElementById('history-list');
    list.innerHTML = '';
    if (state.history.length === 0) {
      list.innerHTML = '<p class="empty-state">Nenhuma atividade registrada ainda.</p>';
      return;
    }
    state.history.slice(0, 100).forEach(function (h) {
      const li = document.createElement('li');
      li.className = 'history-item';
      const date = new Date(h.ts);
      li.innerHTML = '<span class="font-mono history-time">' + date.toLocaleDateString('pt-BR') + ' ' + date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) + '</span>' +
        '<span class="history-label">' + h.label + '</span>' +
        '<span class="history-detail">' + h.detail + '</span>';
      list.appendChild(li);
    });
  }

  // =====================================================================
  // 17. PAINEL LATERAL — abas
  // =====================================================================
  function setupSidePanelTabs() {
    document.querySelectorAll('.tab-btn').forEach(function (btn) {
      btn.addEventListener('click', function () { switchSidePanel(btn.dataset.panel); });
    });
  }

  function switchSidePanel(panelName) {
    document.querySelectorAll('.tab-btn').forEach(function (btn) {
      const active = btn.dataset.panel === panelName;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-selected', String(active));
    });
    ['missions', 'achievements', 'stats', 'history'].forEach(function (name) {
      document.getElementById('panel-' + name).hidden = name !== panelName;
    });
  }

  // =====================================================================
  // 18. FICHA DO PERSONAGEM (HUD)
  // =====================================================================
  function renderCharacterSheet() {
    const level = globalLevel();
    const rank = rankForLevel(level);
    const sum = coreLevelSum();
    const pctWithinLevel = (sum % 10) * 10; // 0-100, aproximação visual do progresso do nível atual

    document.getElementById('global-level').textContent = level;
    document.getElementById('character-rank').textContent = rank;
    document.getElementById('global-xp-label').textContent = (sum % 10) + '/10';
    document.getElementById('global-xp-bar').style.width = pctWithinLevel + '%';
    document.getElementById('next-rank-label').textContent = nextRankLabel(level);

    const unlocked = specializationsUnlocked();
    document.getElementById('specialization-status').textContent = unlocked
      ? 'Desbloqueadas — bom trabalho, Sênior.'
      : 'Bloqueadas até Rank Sênior (nível 50)';
    document.getElementById('btn-specializations').disabled = !unlocked;
  }

  // =====================================================================
  // 18.1 META SEMANAL
  // =====================================================================
  function renderWeeklyGoal() {
    const weekAgo = Date.now() - 7 * 86400000;
    const xpThisWeek = sumXpKp(weekAgo).xp;
    const goal = state.weeklyGoal || 200;
    const pct = Math.max(0, Math.min(100, (xpThisWeek / goal) * 100));

    document.getElementById('weekly-goal-progress').textContent = xpThisWeek + ' / ' + goal + ' XP';
    const bar = document.getElementById('weekly-goal-bar');
    bar.style.width = pct + '%';
    bar.classList.toggle('mastered', xpThisWeek >= goal);
  }

  function setupWeeklyGoal() {
    document.getElementById('btn-edit-weekly-goal').addEventListener('click', function () {
      const input = window.prompt('Nova meta semanal de XP:', String(state.weeklyGoal || 200));
      if (input === null) return;
      const val = parseInt(input, 10);
      if (!isNaN(val) && val > 0) {
        state.weeklyGoal = val;
        saveState();
        renderWeeklyGoal();
      }
    });
  }

  // =====================================================================
  // 18.1.1 CELEBRAÇÃO (categoria completa / meta semanal batida)
  // Um "momento de pausa" maior que um toast — reforço de recompensa
  // mais forte pra marcos que realmente importam.
  // =====================================================================
  function showCelebration(icon, title, subtitle) {
    document.getElementById('celebration-icon').textContent = icon;
    document.getElementById('celebration-title').textContent = title;
    document.getElementById('celebration-subtitle').textContent = subtitle;
    // Reaparecer de "hidden" pra visível já reinicia a animação CSS do
    // confete sozinho (elementos display:none não rodam @keyframes).
    document.getElementById('celebration-overlay').hidden = false;
  }

  function closeCelebration() {
    document.getElementById('celebration-overlay').hidden = true;
  }

  function checkCelebrations() {
    // Categoria masterizada 100% — uma vez por categoria, pra sempre.
    categoriesSorted.forEach(function (cat) {
      if (state.categoriesCelebrated[cat.id]) return;
      if (categoryProgressPercent(cat.id) >= 100) {
        state.categoriesCelebrated[cat.id] = true;
        showCelebration('🏆', 'Categoria Completa!', 'Você masterizou "' + cat.name + '" inteira. Mandou bem.');
      }
    });

    // Meta semanal batida — no máximo 1 celebração a cada 6 dias, pra não
    // disparar de novo a cada clique dentro da mesma semana já celebrada.
    const daysSinceLastCelebration = (Date.now() - (state.weeklyGoalCelebratedAt || 0)) / 86400000;
    if (daysSinceLastCelebration >= 6) {
      const xpThisWeek = sumXpKp(Date.now() - 7 * 86400000).xp;
      const goal = state.weeklyGoal || 200;
      if (xpThisWeek >= goal) {
        state.weeklyGoalCelebratedAt = Date.now();
        showCelebration('🎯', 'Meta Semanal Batida!', 'Você alcançou ' + xpThisWeek + ' de ' + goal + ' XP essa semana. Streak de ' + state.streak.current + ' dias.');
      }
    }
  }

  function setupCelebration() {
    document.getElementById('btn-close-celebration').addEventListener('click', closeCelebration);
    document.getElementById('celebration-overlay').addEventListener('click', function (e) {
      if (e.target.id === 'celebration-overlay') closeCelebration();
    });
  }

  // =====================================================================
  // 18.2 RECOMENDAÇÃO DE SKILL ("O que estudar hoje?")
  // =====================================================================
  function recommendSkill() {
    // Prioriza nós do núcleo já "active" (disponíveis, não bloqueados) com
    // o MENOR XP acumulado — ou seja, o que está mais perto de "só começar".
    const candidates = coreSkills().filter(function (s) {
      return computeNodeVisual(s).stateClass === 'active';
    });

    if (candidates.length === 0) {
      showToast('🎉 Tudo que está disponível agora já foi masterizado — parabéns!', 'achievement');
      return;
    }

    candidates.sort(function (a, b) { return getNodeState(a.id).xp - getNodeState(b.id).xp; });
    const pick = candidates[0];

    focusCategory(pick.category); // síncrono — já deixa o nó pronto no DOM
    openDrawer(pick.id);
    showToast('🎯 Sugestão de hoje: "' + pick.name + '" — bom ponto pra continuar.', 'suggestion');
  }

  function setupRecommendation() {
    document.getElementById('btn-recommend-skill').addEventListener('click', recommendSkill);
  }

  // =====================================================================
  // 19. TOASTS
  // =====================================================================
  const MAX_SIMULTANEOUS_TOASTS = 4;

  function showToast(message, type) {
    const container = document.getElementById('toast-container');

    // column-reverse: o item mais NOVO fica no topo do array de filhos.
    // Se já tiver 4+ toasts visíveis, remove o mais antigo (o último filho).
    while (container.children.length >= MAX_SIMULTANEOUS_TOASTS) {
      container.removeChild(container.lastElementChild);
    }

    const toast = document.createElement('div');
    toast.className = 'toast toast-' + (type || 'info');
    toast.textContent = message;
    container.appendChild(toast);
    const duration = type === 'suggestion' ? 6000 : 4000;
    setTimeout(function () {
      toast.classList.add('is-leaving');
      setTimeout(function () { toast.remove(); }, 300);
    }, duration);
  }

  // =====================================================================
  // 20. TIMERS (Pomodoro + Sessão)
  // Não iniciam sozinhos — ficam parados até o usuário clicar em "Iniciar".
  // =====================================================================
  const timers = {
    pomodoro: { remaining: POMODORO_SECONDS, running: false, mode: 'countdown', started: false },
    session: { remaining: 0, running: false, mode: 'countup', started: false }
  };

  function formatTime(totalSeconds) {
    const s = Math.max(0, totalSeconds);
    const mm = Math.floor(s / 60).toString().padStart(2, '0');
    const ss = Math.floor(s % 60).toString().padStart(2, '0');
    return mm + ':' + ss;
  }

  function pauseButtonLabel(t) {
    if (t.running) return 'Pausar';
    return t.started ? 'Retomar' : 'Iniciar';
  }

  function updateTimerButton(key) {
    const t = timers[key];
    const pauseBtn = document.querySelector('.btn-timer[data-timer="' + key + '"][data-action="pause"]');
    if (pauseBtn) pauseBtn.textContent = pauseButtonLabel(t);
  }

  function tickTimers() {
    ['pomodoro', 'session'].forEach(function (key) {
      const t = timers[key];
      if (!t.running) return;
      t.remaining = t.mode === 'countdown' ? Math.max(0, t.remaining - 1) : t.remaining + 1;
      document.getElementById(key + '-value').textContent = formatTime(t.remaining);
      if (key === 'pomodoro' && t.mode === 'countdown' && t.remaining === 0) {
        t.running = false;
        t.started = false;
        updateTimerButton('pomodoro');
        logHistory('session', 'Pomodoro concluído', '25 min de foco');
        registerActivityToday();
        showToast('🍅 Pomodoro concluído — hora de uma pausa.', 'success');
        renderHistory();
        renderCharacterSheet(); // streak pode ter mudado
      }
    });
  }

  // Encerra a Sessão de propósito: registra o tempo decorrido no histórico
  // (conta pro streak e pro heatmap) e zera, pronta pra uma próxima sessão.
  // Diferente de "Reiniciar", que só descarta sem guardar nada.
  function endSession() {
    const t = timers.session;
    const minutes = Math.round(t.remaining / 60);

    if (minutes >= 1) {
      logHistory('session', 'Sessão de estudo concluída', minutes + ' min');
      registerActivityToday();
      showToast('✅ Sessão de ' + minutes + ' min registrada no histórico.', 'success');
    } else {
      showToast('Sessão encerrada — menos de 1 minuto, não foi registrada.', 'info');
    }

    t.remaining = 0;
    t.running = false;
    t.started = false;
    document.getElementById('session-value').textContent = formatTime(0);
    updateTimerButton('session');

    if (minutes >= 1) afterStateChange(); // atualiza histórico/heatmap/streak na hora
  }

  function setupTimers() {
    setInterval(tickTimers, 1000);
    // Rótulo correto ("Iniciar") já na primeira renderização, antes de qualquer clique
    updateTimerButton('pomodoro');
    updateTimerButton('session');

    document.querySelectorAll('.btn-timer').forEach(function (btn) {
      btn.addEventListener('click', function () {
        const key = btn.dataset.timer;
        const t = timers[key];
        if (btn.dataset.action === 'pause') {
          t.running = !t.running;
          if (t.running) t.started = true;
          updateTimerButton(key);
        } else if (btn.dataset.action === 'end' && key === 'session') {
          endSession();
        } else if (btn.dataset.action === 'reset') {
          // "Reiniciar" descarta sem registrar nada — quem registra de
          // verdade a sessão no histórico é o botão "Encerrar" (endSession).
          t.remaining = key === 'pomodoro' ? POMODORO_SECONDS : 0;
          t.running = false;
          t.started = false;
          document.getElementById(key + '-value').textContent = formatTime(t.remaining);
          updateTimerButton(key);
        }
      });
    });

    document.getElementById('btn-session').addEventListener('click', function () {
      document.getElementById('topbar-timers').classList.toggle('is-compact');
    });
  }

  // =====================================================================
  // 21. GESTÃO DE DADOS (Exportar / Importar / Backup / Reiniciar)
  // =====================================================================
  function setupDataControls() {
    document.getElementById('btn-export').addEventListener('click', function () {
      downloadJson({ embedded: DATA, state: state }, 'codex-export-' + Date.now() + '.json');
      showToast('Progresso exportado.', 'success');
    });

    document.getElementById('btn-backup').addEventListener('click', function () {
      try {
        localStorage.setItem('codex_backup_' + Date.now(), JSON.stringify(state));
        showToast('Backup salvo localmente.', 'success');
      } catch (e) {
        showToast('Não foi possível criar o backup.', 'warning');
      }
    });

    document.getElementById('btn-import').addEventListener('click', function () {
      document.getElementById('import-file-input').click();
    });
    document.getElementById('import-file-input').addEventListener('change', function (e) {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = function () {
        try {
          const parsed = JSON.parse(reader.result);
          if (!parsed.state || !parsed.state.nodes) throw new Error('Esquema inválido');
          const replace = window.confirm('OK = Substituir todo o progresso atual.\nCancelar = Mesclar com o progresso atual (mantém o maior XP de cada nó).');
          state = replace ? Object.assign(defaultState(), parsed.state) : mergeState(state, parsed.state);
          saveState();
          afterStateChange();
          showToast('Importação concluída.', 'success');
        } catch (err) {
          showToast('Arquivo inválido — importação cancelada.', 'warning');
        }
      };
      reader.readAsText(file);
      e.target.value = '';
    });

    document.getElementById('btn-reset').addEventListener('click', function () {
      if (!window.confirm('Isso vai apagar todo o progresso salvo. Tem certeza?')) return;
      state = seedFromEmbedded();
      saveState();
      afterStateChange();
      showToast('Progresso reiniciado.', 'info');
    });
  }

  function mergeState(current, incoming) {
    const merged = JSON.parse(JSON.stringify(current));
    Object.keys(incoming.nodes || {}).forEach(function (id) {
      const inc = incoming.nodes[id];
      const cur = merged.nodes[id] || { xp: 0, kp: 0 };
      merged.nodes[id] = { xp: Math.max(cur.xp, inc.xp || 0), kp: Math.max(cur.kp, inc.kp || 0) };
    });
    merged.bonusXp = Math.max(merged.bonusXp || 0, incoming.bonusXp || 0);
    merged.streak.current = Math.max(merged.streak.current || 0, (incoming.streak || {}).current || 0);
    const existingMissionIds = new Set(merged.missions.map(function (m) { return m.id; }));
    (incoming.missions || []).forEach(function (m) { if (!existingMissionIds.has(m.id)) merged.missions.push(m); });
    Object.keys(incoming.achievements || {}).forEach(function (id) {
      if (incoming.achievements[id].unlocked) merged.achievements[id] = incoming.achievements[id];
    });
    merged.history = (merged.history || []).concat(incoming.history || []).slice(0, 500);
    return merged;
  }

  function downloadJson(obj, filename) {
    const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  // =====================================================================
  // 22. BUSCA
  // =====================================================================
  function setupSearch() {
    const input = document.getElementById('skill-search');
    input.addEventListener('input', function () {
      const term = input.value.trim().toLowerCase();
      document.querySelectorAll('.skill-node').forEach(function (el) {
        const skill = skillsById[el.dataset.skillId];
        const match = !term || skill.name.toLowerCase().includes(term);
        el.classList.toggle('search-dim', !match && term.length > 0);
      });
    });
    input.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter') return;
      const term = input.value.trim().toLowerCase();
      if (!term) return;
      const match = DATA.skills.find(function (s) { return s.name.toLowerCase().includes(term); });
      if (match) focusCategory(match.category);
    });
  }

  // =====================================================================
  // 23. ATALHOS DE TECLADO
  // =====================================================================
  function setupKeyboardShortcuts() {
    document.addEventListener('keydown', function (e) {
      const tag = (document.activeElement && document.activeElement.tagName) || '';
      const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';

      if (e.key === 'Escape') {
        closeDrawer();
        document.getElementById('mission-form-overlay').hidden = true;
        closeCelebration();
        return;
      }
      if (typing) return;

      if (e.key === 's' || e.key === 'S') {
        e.preventDefault();
        document.getElementById('skill-search').focus();
        return;
      }
      const num = parseInt(e.key, 10);
      if (num >= 1 && num <= categoriesSorted.length) {
        focusCategory(categoriesSorted[num - 1].id);
      }
    });
  }

  // =====================================================================
  // 24. ORQUESTRAÇÃO
  // =====================================================================
  function afterStateChange() {
    checkAchievements();
    checkCelebrations();
    saveState();
    renderTree();
    renderCategoryTabs();
    renderCharacterSheet();
    renderWeeklyGoal();
    renderMissions();
    renderAchievements();
    renderStats();
    renderHistory();
  }

  function init() {
    state = loadState();

    renderCategoryTabs();
    focusCategory(currentCategoryId);
    renderCharacterSheet();
    renderWeeklyGoal();
    renderMissions();
    renderAchievements();
    renderStats();
    renderHistory();

    setupZoomPanControls();
    setupDrawerControls();
    setupMissionFilters();
    setupMissionForm();
    setupSidePanelTabs();
    setupTimers();
    setupDataControls();
    setupSearch();
    setupKeyboardShortcuts();
    setupWeeklyGoal();
    setupRecommendation();
    setupCelebration();

    window.addEventListener('resize', applyTransform);

    checkAchievements();
    checkCelebrations();
    saveState();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
