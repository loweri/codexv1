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
  // Preferências de UI (painéis retraídos etc.) — chave própria, separada do
  // progresso, pra Exportar/Importar/Reiniciar nunca mexerem em layout.
  const UI_PREFS_KEY = 'codex_ui_prefs_v1';
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

  // Regra trocada por decisão consciente (era: nível global >= 50 liberava
  // TODAS as especializações de TODAS as categorias de uma vez — exigia em
  // média ~79% de mastery nos 62 nós do núcleo antes de ver qualquer uma).
  // Agora é por categoria: dominar o boss DAQUELA categoria já libera as
  // especializações dela, sem depender do resto da árvore.
  function specializationsUnlockedForCategory(categoryId) {
    const boss = DATA.skills.find(function (s) { return s.category === categoryId && s.isBoss; });
    if (!boss) return false;
    return nodeLevelFromXp(getNodeState(boss.id).xp, getWeight(boss)) >= MAX_NODE_LEVEL;
  }

  function anySpecializationUnlocked() {
    return DATA.categories.some(function (c) { return specializationsUnlockedForCategory(c.id); });
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
      weeklyGoalCelebratedAt: 0,  // timestamp da última celebração de meta semanal
      totalStudySeconds: 0    // soma de TODAS as sessões já encerradas — só cresce,
                               // nunca é recalculado a partir do history[] (que tem
                               // teto de 500 itens e apagaria sessões antigas).
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

  // =====================================================================
  // ATRIBUTOS RPG
  // Uma fórmula só pra todos os 5 — nasce em 10 (mediano) e sobe até 20
  // conforme a média de progresso das categorias associadas chega em 100%.
  // Mapeamento aprovado:
  //   INT = Fundamentos + Banco de Dados   (raciocínio lógico, modelagem)
  //   DEX = Programação + DevOps           (agilidade técnica, ferramentas)
  //   CON = Engenharia de Dados + Cloud     (robustez de pipeline/infra)
  //   WIS = Visualização                    (percepção, traduzir dado em insight)
  //   CHA = Soft Skills                     (comunicação)
  // =====================================================================
  const ATTRIBUTE_CATEGORIES = {
    INT: ['fundamentos', 'banco-dados'],
    DEX: ['programacao', 'devops'],
    CON: ['engenharia-dados', 'cloud'],
    WIS: ['visualizacao'],
    CHA: ['soft-skills']
  };

  function computeAttributes() {
    const result = {};
    Object.keys(ATTRIBUTE_CATEGORIES).forEach(function (attr) {
      const cats = ATTRIBUTE_CATEGORIES[attr];
      const avgProgress = cats.reduce(function (sum, catId) { return sum + categoryProgressPercent(catId); }, 0) / cats.length;
      result[attr] = 10 + Math.round(avgProgress / 10);
    });
    return result;
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
    if (skill.isSpecialization && !specializationsUnlockedForCategory(skill.category)) {
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
    const unlocked = specializationsUnlockedForCategory(categoryId);
    const skills = skillsByCategory(categoryId).filter(function (s) {
      return !s.isSpecialization || unlocked;
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
    renderCharacterSheet(); // status de especializações agora é por categoria — precisa atualizar ao trocar de aba
  }

  // Ação do botão "Ver Especializações" — pana/foca no ramo de especialização
  // da categoria atualmente aberta (o botão não sabe de categoria por conta
  // própria, vive na ficha do personagem, então usa a aba ativa no momento).
  function revealSpecializations() {
    if (!specializationsUnlockedForCategory(currentCategoryId)) return;
    const cat = DATA.categories.find(function (c) { return c.id === currentCategoryId; });
    const specs = DATA.skills.filter(function (s) { return s.category === currentCategoryId && s.isSpecialization; });
    if (specs.length === 0) return;
    const positions = specs.map(function (s) { return layoutCache.nodePositions[s.id]; }).filter(Boolean);
    if (positions.length === 0) return;
    const avgX = positions.reduce(function (sum, p) { return sum + p.x; }, 0) / positions.length;
    const avgY = positions.reduce(function (sum, p) { return sum + p.y; }, 0) / positions.length;
    focal = { x: avgX, y: avgY };
    applyTransform();
    showToast('🔍 Mostrando as especializações de ' + cat.name + '.', 'suggestion');
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

  // Anotações — chave própria (NOTES_KEY), separada do progresso: não entram
  // em Exportar/Importar/Reiniciar, que continuam só sobre XP/KP/missões/etc.
  const NOTES_KEY = 'codex_notes_v1';
  const NOTES_CHAR_LIMIT = 600;
  let notes = {};
  let notesSaveTimeout = null;

  function loadNotes() {
    try {
      const raw = localStorage.getItem(NOTES_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (e) {
      return {};
    }
  }

  function flushNotesSave() {
    clearTimeout(notesSaveTimeout);
    try {
      localStorage.setItem(NOTES_KEY, JSON.stringify(notes));
    } catch (e) {
      showToast('Não foi possível salvar a anotação — armazenamento local indisponível.', 'warning');
    }
  }

  function saveNotesDebounced() {
    clearTimeout(notesSaveTimeout);
    notesSaveTimeout = setTimeout(flushNotesSave, 500);
  }

  function updateNotesCharCount(len) {
    const el = document.getElementById('notes-char-count');
    if (!el) return;
    el.textContent = len + '/' + NOTES_CHAR_LIMIT;
    el.classList.toggle('is-near-limit', len >= NOTES_CHAR_LIMIT - 50);
  }

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
    flushNotesSave();
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

    // Recursos recomendados — curados por nó, só aparece quem tem
    const resourcesBlock = document.getElementById('drawer-resources');
    if (skill.resources && skill.resources.length > 0) {
      document.getElementById('resources-list').innerHTML = skill.resources.map(function (r) {
        return '<li><a href="' + r.url + '" target="_blank" rel="noopener noreferrer">' + r.label + '</a></li>';
      }).join('');
      resourcesBlock.hidden = false;
    } else {
      resourcesBlock.hidden = true;
    }

    // Checklist de entrega — só nós is-boss que tiverem deliverables definidos
    const deliverablesBlock = document.getElementById('drawer-deliverables');
    if (skill.isBoss && skill.deliverables && skill.deliverables.length > 0) {
      const checked = ns.checkedDeliverables || [];
      document.getElementById('deliverables-list').innerHTML = skill.deliverables.map(function (item, i) {
        const isChecked = !!checked[i];
        return '<li><label class="deliverable-item' + (isChecked ? ' is-checked' : '') + '">' +
          '<input type="checkbox" data-deliverable-index="' + i + '"' + (isChecked ? ' checked' : '') + '>' +
          '<span>' + item + '</span></label></li>';
      }).join('');
      deliverablesBlock.hidden = false;
    } else {
      deliverablesBlock.hidden = true;
    }

    // Link de portfólio — nós is-boss e especializações (onde faz sentido ter "algo pra mostrar")
    const portfolioBlock = document.getElementById('drawer-portfolio');
    if (skill.isBoss || skill.isSpecialization) {
      document.getElementById('portfolio-url-input').value = ns.portfolioUrl || '';
      portfolioBlock.hidden = false;
    } else {
      portfolioBlock.hidden = true;
    }

    // Anotações — todos os nós, vêm do storage separado (notes), não de state
    const notesText = notes[skill.id] || '';
    document.getElementById('notes-textarea').value = notesText;
    updateNotesCharCount(notesText.length);
  }

  // Desfazer — cobre só o último +/- XP ou KP (não missões nem conquistas,
  // que têm efeito em cascata e complicariam demais um "ops, cliquei errado").
  let lastAction = null; // { skillId, type: 'xp'|'kp', delta }

  function updateUndoButton() {
    const btn = document.getElementById('btn-undo');
    if (!btn) return;
    if (!lastAction) {
      btn.disabled = true;
      btn.title = 'Desfaz o último +/- XP ou KP';
      btn.setAttribute('aria-label', 'Desfazer último lançamento');
      return;
    }
    const skill = skillsById[lastAction.skillId];
    const sign = lastAction.delta > 0 ? '+' : '';
    const description = 'Desfazer: ' + sign + lastAction.delta + ' ' + lastAction.type.toUpperCase() + ' em ' + (skill ? skill.name : '?');
    btn.disabled = false;
    btn.title = description;
    btn.setAttribute('aria-label', description);
  }

  function undoLastAction() {
    if (!lastAction) return;
    const action = lastAction;
    if (action.type === 'xp') applyXpChange(action.skillId, -action.delta);
    else applyKpChange(action.skillId, -action.delta);
    const skill = skillsById[action.skillId];
    showToast('↺ Desfeito: ' + (action.delta > 0 ? '+' : '') + action.delta + ' ' + action.type.toUpperCase() + ' em ' + (skill ? skill.name : '?'), 'success');
    lastAction = null; // não permite desfazer o desfazer — mantém simples
    updateUndoButton();
    if (activeDrawerSkillId) renderDrawer();
  }

  function applyXpChange(skillId, delta) {
    const skill = skillsById[skillId];
    if (!skill) return;
    const ns = getNodeState(skillId);
    const cap = nodeMaxXp(getWeight(skill));
    ns.xp = Math.max(0, Math.min(cap, ns.xp + delta));
    logHistory('xp', skill.name, (delta > 0 ? '+' : '') + delta + ' XP');
    registerActivityToday();
    lastAction = { skillId: skillId, type: 'xp', delta: delta };
    updateUndoButton();
    afterStateChange();
  }

  function applyKpChange(skillId, delta) {
    const skill = skillsById[skillId];
    if (!skill) return;
    const ns = getNodeState(skillId);
    ns.kp = Math.max(0, ns.kp + delta); // KP sem teto (PROMPT_BASE.md seção 6.4)
    ns.lastKpTs = Date.now(); // guardado no próprio nó — history tem teto de
    // 500 itens e pode "esquecer" esse KP antigo mesmo com o valor (sem teto)
    // ainda ali; isso é o que causava "Infinityd" na fila de revisão.
    logHistory('kp', skill.name, (delta > 0 ? '+' : '') + delta + ' KP');
    registerActivityToday();
    lastAction = { skillId: skillId, type: 'kp', delta: delta };
    updateUndoButton();
    afterStateChange();
  }

  // Reinicia SÓ este nó (não o app inteiro) — resolve o caso de errar um
  // valor e não querer ficar clicando em "-" até zerar.
  function resetNode(skillId) {
    const skill = skillsById[skillId];
    if (!skill) return;
    if (!window.confirm('Reiniciar "' + skill.name + '"? Isso zera o XP e o KP só desta habilidade.')) return;
    state.nodes[skillId] = { xp: 0, kp: 0 };
    if (lastAction && lastAction.skillId === skillId) { lastAction = null; updateUndoButton(); }
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

    // Checklist — delegado no container, já que a lista inteira é recriada
    // a cada renderDrawer() (senão os listeners diretos se perderiam).
    document.getElementById('deliverables-list').addEventListener('change', function (e) {
      const checkbox = e.target.closest('[data-deliverable-index]');
      if (!checkbox || !activeDrawerSkillId) return;
      const idx = parseInt(checkbox.dataset.deliverableIndex, 10);
      const ns = getNodeState(activeDrawerSkillId);
      if (!ns.checkedDeliverables) ns.checkedDeliverables = [];
      ns.checkedDeliverables[idx] = checkbox.checked;
      checkbox.closest('.deliverable-item').classList.toggle('is-checked', checkbox.checked);
      saveState();
    });

    // Portfólio — salva ao digitar, sem disparar o re-render pesado de afterStateChange()
    document.getElementById('portfolio-url-input').addEventListener('input', function (e) {
      if (!activeDrawerSkillId) return;
      getNodeState(activeDrawerSkillId).portfolioUrl = e.target.value;
      saveState();
    });

    // Notas — storage separado (notes), com debounce pra não escrever no
    // localStorage a cada tecla
    document.getElementById('notes-textarea').addEventListener('input', function (e) {
      if (!activeDrawerSkillId) return;
      notes[activeDrawerSkillId] = e.target.value;
      updateNotesCharCount(e.target.value.length);
      saveNotesDebounced();
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
  // Nó com XP máximo (nível 10) E KP alto no mesmo nó — diferencia quem só
  // "bateu os botões" de quem voltou várias vezes pra reforçar de verdade.
  const DEEP_MASTERY_KP_THRESHOLD = 100;

  function deepMasteryCount() {
    return coreSkills().filter(function (s) {
      const ns = getNodeState(s.id);
      return nodeLevelFromXp(ns.xp, getWeight(s)) >= MAX_NODE_LEVEL && ns.kp >= DEEP_MASTERY_KP_THRESHOLD;
    }).length;
  }

  function evaluateCondition(conditionStr) {
    try {
      // Conditions vêm de data-embedded.js (arquivo confiável do próprio projeto,
      // não de entrada do usuário) — Function() é aceitável aqui, escopo controlado.
      const fn = new Function(
        'streak', 'rank', 'totalXp', 'daysActive', 'categoryProgress', 'specializationComplete', 'totalHours', 'deepMasteryCount',
        'return (' + conditionStr + ');'
      );
      return !!fn(
        state.streak.current,
        rankForLevel(globalLevel()),
        totalXpForAchievements(),
        daysActiveCount(),
        categoryProgressPercent,
        specializationComplete,
        (state.totalStudySeconds || 0) / 3600,
        deepMasteryCount()
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

  const RECURRING_RESET_MS = 7 * 24 * 60 * 60 * 1000; // 7 dias — mesma cadência
  // da própria missão semente ("Revisão Semanal: Docker"), que é o único
  // exemplo de recorrência que já existia no projeto antes desta função.

  // Roda no carregamento do app: qualquer missão recorrente concluída há 7+
  // dias volta pra "Pendente", pronta pra fazer de novo. Não reaplica XP/KP
  // sozinha — a recompensa só volta quando o usuário clicar "Concluir" de novo.
  function checkRecurringMissions() {
    const now = Date.now();
    let anyReset = false;
    state.missions.forEach(function (m) {
      if (m.recurring && m.status === 'concluida' && m.completedAt && (now - m.completedAt) >= RECURRING_RESET_MS) {
        m.status = 'pendente';
        delete m.completedAt;
        logHistory('mission', m.name, 'Missão recorrente disponível de novo');
        anyReset = true;
      }
    });
    return anyReset;
  }

  function handleMissionAction(action, missionId) {
    const mission = state.missions.find(function (m) { return m.id === missionId; });
    if (!mission) return;

    if (action === 'iniciar') {
      mission.status = 'em_andamento';
      logHistory('mission', mission.name, 'Missão iniciada');
    } else if (action === 'concluir') {
      mission.status = 'concluida';
      mission.completedAt = Date.now();
      (mission.linkedNodes || []).forEach(function (n) {
        applyXpChange(n.skillId, n.xp || 0);
        if (n.kp) applyKpChange(n.skillId, n.kp);
      });
      // "Desfazer" só cobre um clique isolado de XP/KP — depois de uma
      // missão (que pode mexer em vários nós de uma vez), desfazer só o
      // último pedaço deixaria status "concluída" com recompensa pela
      // metade. Mais seguro desabilitar aqui do que arriscar isso.
      lastAction = null;
      updateUndoButton();
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

  // Nó cujo KP não sobe há X dias — usa KP especificamente (não XP), porque
  // a ideia aqui é sinalizar retenção/revisão, não volume de prática.
  const KP_REVIEW_THRESHOLD_DAYS = 7;

  function kpReviewQueue() {
    return coreSkills()
      .filter(function (s) { return getNodeState(s.id).kp > 0 && getNodeState(s.id).lastKpTs; })
      // ^ progresso de antes desse campo existir não teria lastKpTs ainda —
      // melhor não aparecer na fila do que mostrar um número inventado.
      // Volta a aparecer sozinho assim que receber o próximo +/- KP.
      .map(function (s) { return { skill: s, days: daysSince(getNodeState(s.id).lastKpTs) }; })
      .filter(function (x) { return x.days >= KP_REVIEW_THRESHOLD_DAYS; })
      .sort(function (a, b) { return b.days - a.days; });
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

    const queue = kpReviewQueue();
    const queueHtml = queue.length === 0
      ? '<p class="empty-state">Nada pra revisar agora — ou ainda não tem KP suficiente registrado nos nós.</p>'
      : '<ul class="review-queue-list">' + queue.slice(0, 8).map(function (item) {
          return '<li><button type="button" class="review-queue-item" data-skill-id="' + item.skill.id + '">' +
            '<span>' + item.skill.name + '</span>' +
            '<span class="font-mono">' + item.days + 'd</span>' +
            '</button></li>';
        }).join('') + '</ul>';

    el.innerHTML =
      '<div class="stat-summary">' +
      '<div><span class="font-mono">' + globalLevel() + '</span><br>Nível Global</div>' +
      '<div><span class="font-mono">' + rankForLevel(globalLevel()) + '</span><br>Rank</div>' +
      '<div><span class="font-mono">' + state.streak.current + '</span><br>Streak (dias)</div>' +
      '</div>' +
      '<h3>Horas Totais de Estudo <span class="stat-hint">(soma de todas as sessões encerradas)</span></h3><p class="font-mono">' + formatDuration(state.totalStudySeconds || 0) + '</p>' +
      '<h3>Fila de Revisão <span class="stat-hint">(KP parado há ' + KP_REVIEW_THRESHOLD_DAYS + '+ dias)</span></h3>' + queueHtml +
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

    // Fila de revisão fica dentro de #stats-content, que é recriado a cada
    // renderStats() — delegar no container estável evita perder o listener.
    document.getElementById('stats-content').addEventListener('click', function (e) {
      const item = e.target.closest('.review-queue-item');
      if (!item) return;
      const skill = skillsById[item.dataset.skillId];
      if (!skill) return;
      focusCategory(skill.category);
      openDrawer(skill.id);
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

    const cat = DATA.categories.find(function (c) { return c.id === currentCategoryId; });
    const catUnlocked = specializationsUnlockedForCategory(currentCategoryId);
    document.getElementById('specialization-status').textContent = catUnlocked
      ? ('Desbloqueadas para ' + cat.name + ' — bom trabalho!')
      : ('Bloqueadas até completar o Marco Principal de ' + cat.name);
    document.getElementById('btn-specializations').disabled = !catUnlocked;
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
  function daysSince(ts) {
    if (!ts) return Infinity;
    return Math.floor((Date.now() - ts) / 86400000);
  }

  // history guarda o NOME da skill (não o id) no campo label — mesmo jeito
  // que logHistory('xp', skill.name, ...) grava. history é unshift (mais
  // recente primeiro), então o primeiro match já é o mais recente.
  function lastTouchedTs(skillName) {
    for (let i = 0; i < state.history.length; i++) {
      const h = state.history[i];
      if ((h.type === 'xp' || h.type === 'kp') && h.label === skillName) return h.ts;
    }
    return null;
  }

  // Acrescenta um empurrão de urgência na mensagem se ainda não estudou
  // hoje, já é fim de tarde, e existe uma streak (ou já é dia de começar uma).
  function streakAtRiskSuffix() {
    const today = new Date().toDateString();
    if (state.streak.lastDate === today) return '';
    if (new Date().getHours() < 17) return '';
    return state.streak.current > 0
      ? (' Sua streak de ' + state.streak.current + ' dias ainda dá pra manter hoje.')
      : '';
  }

  function recommendSkill() {
    const activeCore = coreSkills().filter(function (s) {
      return computeNodeVisual(s).stateClass === 'active';
    });

    if (activeCore.length === 0) {
      showToast('🎉 Tudo que está disponível agora já foi masterizado — parabéns!', 'achievement');
      return;
    }

    const activeById = {};
    activeCore.forEach(function (s) { activeById[s.id] = s; });

    // 1) Missão com prazo em até 3 dias cujo nó vinculado já está disponível
    //    agora — evita perder prazo por simplesmente não saber o que priorizar.
    const now = Date.now();
    const urgent = state.missions
      .filter(function (m) { return (m.status === 'pendente' || m.status === 'em_andamento') && m.deadline; })
      .map(function (m) {
        const days = Math.ceil((new Date(m.deadline).getTime() - now) / 86400000);
        const linkedActive = (m.linkedNodes || []).map(function (n) { return activeById[n.skillId]; }).filter(Boolean);
        return { mission: m, days: days, linkedActive: linkedActive };
      })
      .filter(function (x) { return x.linkedActive.length > 0 && x.days <= 3; })
      .sort(function (a, b) { return a.days - b.days; });

    if (urgent.length > 0) {
      const top = urgent[0];
      const pick = top.linkedActive[0];
      const dayLabel = top.days <= 0 ? 'vence hoje' : ('vence em ' + top.days + ' dia' + (top.days > 1 ? 's' : ''));
      focusCategory(pick.category);
      openDrawer(pick.id);
      showToast('🎯 A missão "' + top.mission.name + '" ' + dayLabel + ' — "' + pick.name + '" é o próximo passo.' + streakAtRiskSuffix(), 'suggestion');
      return;
    }

    // 2) Nó já começado (XP > 0) que esfriou (5+ dias sem receber XP/KP) —
    //    prioriza retomar o que já estava em andamento antes de abrir algo novo.
    const cooling = activeCore
      .filter(function (s) { return getNodeState(s.id).xp > 0; })
      .map(function (s) { return { skill: s, days: daysSince(lastTouchedTs(s.name)) }; })
      .filter(function (x) { return x.days >= 5; })
      .sort(function (a, b) { return b.days - a.days; });

    if (cooling.length > 0) {
      const pick = cooling[0].skill;
      focusCategory(pick.category);
      openDrawer(pick.id);
      showToast('🎯 Faz ' + cooling[0].days + ' dias que "' + pick.name + '" não recebe atenção — bom retomar antes de esfriar de vez.' + streakAtRiskSuffix(), 'suggestion');
      return;
    }

    // 3) Fallback original: entre os disponíveis, o de MENOR XP acumulado
    //    — ou seja, o que está mais perto de "só começar".
    activeCore.sort(function (a, b) { return getNodeState(a.id).xp - getNodeState(b.id).xp; });
    const pick = activeCore[0];

    focusCategory(pick.category); // síncrono — já deixa o nó pronto no DOM
    openDrawer(pick.id);
    showToast('🎯 Sugestão de hoje: "' + pick.name + '" — bom ponto pra continuar.' + streakAtRiskSuffix(), 'suggestion');
  }

  function setupRecommendation() {
    document.getElementById('btn-recommend-skill').addEventListener('click', recommendSkill);
  }

  // Reposiciona o botão flutuante relativo à borda real do tree-viewport
  // (não um left fixo) — assim ele nunca cobre os painéis laterais (o problema
  // original) nem fica cortado pelo overflow:hidden do canvas quando a coluna
  // da árvore está estreita (o que aconteceria se ele vivesse position:absolute
  // ali dentro). position:fixed escapa de qualquer overflow:hidden ancestral,
  // então só precisa saber ONDE ficar — isso quem calcula é este JS.
  function positionRecommendButton() {
    const btn = document.getElementById('btn-recommend-skill');
    if (!btn) return;
    const rect = treeViewport.getBoundingClientRect();
    btn.style.left = (rect.left + 24) + 'px';
  }

  // =====================================================================
  // 18.3 PAINÉIS RETRÁTEIS
  // QoL pra tela dividida: recolhe ficha/painel lateral pra faixas finas de
  // 44px, liberando espaço pra árvore. Preferência própria (UI_PREFS_KEY),
  // separada do progresso — Exportar/Importar/Reiniciar não tocam nisso.
  // =====================================================================
  let uiPrefs = { leftCollapsed: false, rightCollapsed: false, notificationsEnabled: false, onboardingSeen: false, theme: 'dark' };

  function loadUiPrefs() {
    try {
      const raw = localStorage.getItem(UI_PREFS_KEY);
      return raw ? Object.assign({ leftCollapsed: false, rightCollapsed: false, notificationsEnabled: false, onboardingSeen: false, theme: 'dark' }, JSON.parse(raw)) : { leftCollapsed: false, rightCollapsed: false, notificationsEnabled: false, onboardingSeen: false, theme: 'dark' };
    } catch (e) {
      return { leftCollapsed: false, rightCollapsed: false, notificationsEnabled: false, onboardingSeen: false, theme: 'dark' };
    }
  }

  function saveUiPrefs() {
    try {
      localStorage.setItem(UI_PREFS_KEY, JSON.stringify(uiPrefs));
    } catch (e) {
      // Preferência de layout não é crítica o bastante pra interromper com um toast.
    }
  }

  function applySidebarState() {
    const appLayout = document.querySelector('.app-layout');
    appLayout.classList.toggle('left-collapsed', uiPrefs.leftCollapsed);
    appLayout.classList.toggle('right-collapsed', uiPrefs.rightCollapsed);

    const btnLeft = document.getElementById('btn-toggle-left');
    btnLeft.textContent = uiPrefs.leftCollapsed ? '›' : '‹';
    btnLeft.setAttribute('aria-expanded', String(!uiPrefs.leftCollapsed));
    btnLeft.setAttribute('aria-label', uiPrefs.leftCollapsed ? 'Expandir ficha do personagem' : 'Recolher ficha do personagem');

    const btnRight = document.getElementById('btn-toggle-right');
    btnRight.textContent = uiPrefs.rightCollapsed ? '‹' : '›';
    btnRight.setAttribute('aria-expanded', String(!uiPrefs.rightCollapsed));
    btnRight.setAttribute('aria-label', uiPrefs.rightCollapsed ? 'Expandir painel lateral' : 'Recolher painel lateral');
  }

  function setupSidebarToggles() {
    uiPrefs = loadUiPrefs();
    applySidebarState();

    // A árvore só recalcula o zoom/pan depois que a coluna termina de
    // animar — usar o retângulo do canvas ANTES da transição acabar
    // deixaria o nó raiz descentralizado por um frame.
    document.querySelector('.app-layout').addEventListener('transitionend', function (e) {
      if (e.propertyName === 'grid-template-columns') {
        applyTransform();
        positionRecommendButton();
      }
    });

    document.getElementById('btn-toggle-left').addEventListener('click', function () {
      uiPrefs.leftCollapsed = !uiPrefs.leftCollapsed;
      saveUiPrefs();
      applySidebarState();
    });
    document.getElementById('btn-toggle-right').addEventListener('click', function () {
      uiPrefs.rightCollapsed = !uiPrefs.rightCollapsed;
      saveUiPrefs();
      applySidebarState();
    });
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
  // Timers guardados como timestamp (accumulated + runningSince), não como
  // "quantidade restante" que soma ±1 a cada disparo do setInterval — o
  // navegador reduz DRASTICAMENTE a frequência desse disparo quando a aba
  // fica fora de foco (throttling de economia de bateria; depois de ~1min
  // some pra 1 disparo por minuto ou menos). Um timer "por tick" perderia
  // tempo real toda vez a aba ficasse em segundo plano. Com accumulated +
  // runningSince (Date.now()), o valor exibido é sempre recalculado a partir
  // do relógio de verdade — não importa quantos ticks o navegador pulou,
  // quando o próximo disparar (ou quando a aba volta ao foco) o número já
  // vem certo, sem precisar "recuperar o atraso".
  const timers = {
    pomodoro: { mode: 'countdown', totalSeconds: POMODORO_SECONDS, accumulated: 0, runningSince: null, started: false },
    session: { mode: 'countup', totalSeconds: null, accumulated: 0, runningSince: null, started: false }
  };

  function elapsedSeconds(t) {
    const live = t.runningSince ? Math.floor((Date.now() - t.runningSince) / 1000) : 0;
    return t.accumulated + live;
  }

  function displaySeconds(t) {
    return t.mode === 'countdown' ? Math.max(0, t.totalSeconds - elapsedSeconds(t)) : elapsedSeconds(t);
  }

  function startOrResumeTimer(t) {
    t.runningSince = Date.now();
    t.started = true;
  }

  function pauseTimer(t) {
    if (t.runningSince) {
      t.accumulated += Math.floor((Date.now() - t.runningSince) / 1000);
      t.runningSince = null;
    }
  }

  function resetTimerState(t) {
    t.accumulated = 0;
    t.runningSince = null;
    t.started = false;
  }

  function formatTime(totalSeconds) {
    const s = Math.max(0, totalSeconds);
    const mm = Math.floor(s / 60).toString().padStart(2, '0');
    const ss = Math.floor(s % 60).toString().padStart(2, '0');
    return mm + ':' + ss;
  }

  // Formata segundos longos (horas totais de estudo) como "Xh YYmin" —
  // diferente de formatTime(), que é só pro relógio mm:ss dos timers.
  // Sessões com menos de 1 minuto mostram segundos ("45s"), senão ficaria
  // idêntico a "0min" de quem ainda não estudou nada.
  function formatDuration(totalSeconds) {
    const s = Math.max(0, Math.floor(totalSeconds || 0));
    if (s === 0) return '0min';
    if (s < 60) return s + 's';
    const h = Math.floor(s / 3600);
    const mm = Math.floor((s % 3600) / 60).toString().padStart(2, '0');
    if (h === 0) return Math.floor(s / 60) + 'min';
    return h + 'h ' + mm + 'min';
  }

  function pauseButtonLabel(t) {
    if (t.runningSince) return 'Pausar';
    return t.started ? 'Retomar' : 'Iniciar';
  }

  function updateTimerButton(key) {
    const t = timers[key];
    const pauseBtn = document.querySelector('.btn-timer[data-timer="' + key + '"][data-action="pause"]');
    if (pauseBtn) pauseBtn.textContent = pauseButtonLabel(t);
  }

  function redrawTimer(key) {
    const t = timers[key];
    document.getElementById(key + '-value').textContent = formatTime(displaySeconds(t));
  }

  function tickTimers() {
    ['pomodoro', 'session'].forEach(function (key) {
      const t = timers[key];
      if (!t.runningSince) return; // pausado ou nunca iniciado — nada novo a mostrar
      const shown = displaySeconds(t);
      document.getElementById(key + '-value').textContent = formatTime(shown);
      if (key === 'pomodoro' && shown === 0) {
        pauseTimer(t); // trava — Math.max(0, ...) em displaySeconds garante que não passa de 00:00 daqui pra frente
        updateTimerButton('pomodoro');
        showToast('🍅 Pomodoro concluído — hora de uma pausa.', 'success');
        if (document.hidden) fireNotification('Pomodoro concluído 🍅', 'Hora de uma pausa.');
      }
    });
    maybeNotifyStreakRisk();
    renderStreakIndicator();
  }

  // Atualiza os dois lugares que mostram o total — topbar (sempre visível)
  // e ficha do personagem. Chamado em afterStateChange() e no init().
  function renderTotalHours() {
    const label = formatDuration(state.totalStudySeconds || 0);
    const topbarEl = document.getElementById('total-hours-value');
    const sheetEl = document.getElementById('character-total-hours');
    if (topbarEl) topbarEl.textContent = label;
    if (sheetEl) sheetEl.textContent = label;
  }

  // Indicador de streak na topbar — 3 estados: neutro (ainda dá tempo),
  // ativo (já estudou hoje), em risco (não estudou e já é fim de tarde).
  // Mesmo limiar de "tarde" (17h) usado em streakAtRiskSuffix(), pra ficar
  // consistente em vez de dois números diferentes espalhados pelo app.
  function renderStreakIndicator() {
    const el = document.getElementById('streak-indicator');
    const countEl = document.getElementById('streak-count-topbar');
    if (!el || !countEl) return;
    countEl.textContent = state.streak.current;
    const today = new Date().toDateString();
    const studiedToday = state.streak.lastDate === today;
    const isLate = new Date().getHours() >= 17;
    el.classList.toggle('is-active', studiedToday);
    el.classList.toggle('is-at-risk', !studiedToday && isLate && state.streak.current > 0);
    el.title = studiedToday
      ? ('Streak de ' + state.streak.current + ' dia' + (state.streak.current === 1 ? '' : 's') + ' — hoje já contou.')
      : (isLate ? 'Ainda não estudou hoje — a streak está em risco.' : 'Ainda não estudou hoje.');
  }

  function renderAttributes() {
    const attrs = computeAttributes();
    Object.keys(attrs).forEach(function (key) {
      const el = document.getElementById('attr-' + key);
      if (el) el.textContent = attrs[key];
    });
  }

  // [i] de atributos: hover funciona só de CSS (:hover/:focus-within); este
  // toggle cobre toque em celular, onde hover não existe de verdade.
  function setupInfoTooltips() {
    document.querySelectorAll('.info-tooltip').forEach(function (tip) {
      const btn = tip.querySelector('.info-icon');
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        const isOpen = tip.classList.toggle('is-open');
        btn.setAttribute('aria-expanded', String(isOpen));
        document.querySelectorAll('.info-tooltip.is-open').forEach(function (other) {
          if (other !== tip) { other.classList.remove('is-open'); other.querySelector('.info-icon').setAttribute('aria-expanded', 'false'); }
        });
      });
    });
    document.addEventListener('click', function () {
      document.querySelectorAll('.info-tooltip.is-open').forEach(function (tip) {
        tip.classList.remove('is-open');
        tip.querySelector('.info-icon').setAttribute('aria-expanded', 'false');
      });
    });
  }

  // =====================================================================
  // 18.4 NOTIFICAÇÕES DO NAVEGADOR (opt-in — desligado por padrão)
  // =====================================================================
  // =====================================================================
  // 18.5 SELETOR DE TEMA (Manuscrito Arcano escuro ↔ Blueprint claro)
  // As duas folhas de estilo já estão no <head> (ver index.html) — aqui só
  // alterna qual está desabilitada. Preferência salva em uiPrefs (não em
  // state), mesma lógica dos outros ajustes de UI.
  // =====================================================================
  function applyThemeChoice() {
    const isLight = uiPrefs.theme === 'light';
    const darkLink = document.getElementById('theme-dark-link');
    const lightLink = document.getElementById('theme-light-link');
    if (darkLink) darkLink.disabled = isLight;
    if (lightLink) lightLink.disabled = !isLight;

    const btn = document.getElementById('btn-theme-toggle');
    if (btn) btn.textContent = isLight ? '🎨 Escuro' : '🎨 Claro';

    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) metaTheme.setAttribute('content', isLight ? '#0e2c48' : '#0f0c09');
  }

  function setupThemeToggle() {
    const btn = document.getElementById('btn-theme-toggle');
    if (!btn) return;
    applyThemeChoice(); // uiPrefs já foi carregado em setupSidebarToggles(), chamado antes deste na init()
    btn.addEventListener('click', function () {
      uiPrefs.theme = uiPrefs.theme === 'light' ? 'dark' : 'light';
      saveUiPrefs();
      applyThemeChoice();
    });
  }

  // Menu ☰ — reúne o que não precisa de acesso imediato (notificações, tema,
  // exportar/importar/backup/reiniciar). Sessão e Desfazer ficam de fora de
  // propósito, por precisarem de acesso rápido.
  function closeTopbarMenu() {
    const dropdown = document.getElementById('topbar-menu-dropdown');
    const btn = document.getElementById('btn-topbar-menu');
    if (dropdown) dropdown.hidden = true;
    if (btn) btn.setAttribute('aria-expanded', 'false');
  }

  // Instalar app — em vez de depender do usuário achar o ícone do navegador
  // (que tem cooldown de ~3 meses depois de dispensado uma vez, é
  // inconsistente entre navegadores e fácil de não notar), a gente escuta o
  // evento que o PRÓPRIO navegador dispara quando confirma que dá pra
  // instalar, guarda ele, e só aí revela um botão dentro do app. Só aparece
  // quando o navegador de fato confirmou — nunca promete o que não pode dar.
  let deferredInstallPrompt = null;

  function setupInstallPrompt() {
    const btn = document.getElementById('btn-install-app');
    if (!btn) return;

    window.addEventListener('beforeinstallprompt', function (e) {
      e.preventDefault(); // segura o mini-infobar nativo do navegador
      deferredInstallPrompt = e;
      btn.hidden = false;
    });

    btn.addEventListener('click', function () {
      if (!deferredInstallPrompt) return;
      deferredInstallPrompt.prompt();
      deferredInstallPrompt.userChoice.then(function (choice) {
        if (choice.outcome === 'accepted') {
          showToast('📲 Instalado — procure o ícone do Compendium no seu sistema.', 'success');
        }
        deferredInstallPrompt = null;
        btn.hidden = true;
      });
    });

    // Já instalado (aberto como app, não como aba) — não faz sentido oferecer
    // de novo. matchMedia pode não existir em todo ambiente, daí a guarda.
    if (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) {
      btn.hidden = true;
    }
    window.addEventListener('appinstalled', function () {
      btn.hidden = true;
      deferredInstallPrompt = null;
    });
  }

  function setupTopbarMenu() {
    const btn = document.getElementById('btn-topbar-menu');
    const dropdown = document.getElementById('topbar-menu-dropdown');
    if (!btn || !dropdown) return;

    function positionDropdown() {
      const rect = btn.getBoundingClientRect();
      dropdown.style.top = (rect.bottom + 8) + 'px';
      dropdown.style.right = (window.innerWidth - rect.right) + 'px';
    }

    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      if (dropdown.hidden) {
        positionDropdown();
        dropdown.hidden = false;
        btn.setAttribute('aria-expanded', 'true');
      } else {
        closeTopbarMenu();
      }
    });
    // Clicar em qualquer item fecha o menu — padrão de dropdown comum,
    // mesmo pros toggles (notificações/tema), que dá pra reabrir fácil.
    dropdown.addEventListener('click', function (e) {
      if (e.target.closest('.topbar-menu-item')) closeTopbarMenu();
    });
    document.addEventListener('click', function (e) {
      if (!dropdown.hidden && !dropdown.contains(e.target) && e.target !== btn) closeTopbarMenu();
    });
    window.addEventListener('resize', function () {
      if (!dropdown.hidden) positionDropdown();
    });
  }

  function notificationsSupported() {
    return typeof Notification !== 'undefined';
  }

  function requestNotificationPermission() {
    if (!notificationsSupported()) return Promise.resolve('unsupported');
    if (Notification.permission === 'granted' || Notification.permission === 'denied') {
      return Promise.resolve(Notification.permission);
    }
    return Notification.requestPermission();
  }

  function fireNotification(title, body) {
    if (!notificationsSupported() || Notification.permission !== 'granted') return;
    try {
      new Notification(title, { body: body });
    } catch (e) {
      // Alguns navegadores exigem Service Worker registrado pra notificação
      // funcionar fora da aba em foco — falha aqui não deve quebrar o app.
    }
  }

  function updateNotificationsButton() {
    const btn = document.getElementById('btn-notifications');
    if (!btn) return;
    const on = !!uiPrefs.notificationsEnabled && notificationsSupported() && Notification.permission === 'granted';
    btn.textContent = '🔔 Notificações: ' + (on ? 'Ligadas' : 'Desligadas');
    btn.setAttribute('aria-pressed', String(on));
  }

  function setupNotificationsToggle() {
    const btn = document.getElementById('btn-notifications');
    if (!btn) return;
    if (!notificationsSupported()) {
      btn.disabled = true;
      btn.title = 'Seu navegador não suporta notificações.';
      return;
    }
    updateNotificationsButton();
    btn.addEventListener('click', function () {
      if (!uiPrefs.notificationsEnabled) {
        requestNotificationPermission().then(function (perm) {
          uiPrefs.notificationsEnabled = perm === 'granted';
          saveUiPrefs();
          updateNotificationsButton();
          if (perm === 'granted') {
            showToast('Notificações ativadas — aviso quando o Pomodoro acabar ou a streak estiver em risco.', 'success');
          } else if (perm === 'denied') {
            showToast('Notificações bloqueadas pelo navegador — precisa liberar nas configurações do site.', 'warning');
          }
        });
      } else {
        uiPrefs.notificationsEnabled = false;
        saveUiPrefs();
        updateNotificationsButton();
      }
    });
  }

  // Avisa no máximo 1x por dia, só depois das 20h, só se ainda não estudou
  // hoje — pra não virar spam de notificação.
  let streakNotifiedOn = null;
  function maybeNotifyStreakRisk() {
    if (!uiPrefs.notificationsEnabled) return;
    const today = new Date().toDateString();
    if (state.streak.lastDate === today) return;
    if (streakNotifiedOn === today) return;
    if (new Date().getHours() < 20) return;
    streakNotifiedOn = today;
    const body = state.streak.current > 0
      ? ('Sua streak de ' + state.streak.current + ' dias ainda pode continuar hoje.')
      : 'Ainda dá tempo de estudar um pouco hoje.';
    fireNotification('Compendium — não perca o dia', body);
  }

  function setupTimers() {
    setInterval(tickTimers, 1000);
    // Se a aba volta a ficar visível, recalcula na hora — não espera o
    // próximo disparo do setInterval (que pode ter ficado throttled).
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) tickTimers();
    });
    // Rótulo correto ("Iniciar") já na primeira renderização, antes de qualquer clique
    updateTimerButton('pomodoro');
    updateTimerButton('session');

    document.querySelectorAll('.btn-timer').forEach(function (btn) {
      btn.addEventListener('click', function () {
        const key = btn.dataset.timer;
        const t = timers[key];
        if (btn.dataset.action === 'pause') {
          if (t.runningSince) {
            pauseTimer(t);
          } else {
            startOrResumeTimer(t);
          }
          redrawTimer(key);
          updateTimerButton(key);
        } else if (btn.dataset.action === 'stop') {
          // "Encerrar" — só existe no timer de Sessão. Soma o tempo decorrido
          // ao total permanente, loga no Histórico e conta pro streak/heatmap.
          // Diferente de "Reiniciar": aqui o tempo FICA registrado.
          const elapsed = elapsedSeconds(t); // sessão é count-up, elapsed = decorrido
          if (elapsed > 0) {
            state.totalStudySeconds = (state.totalStudySeconds || 0) + elapsed;
            logHistory('session', 'Sessão de estudo', formatDuration(elapsed));
            registerActivityToday();
            showToast('⏱️ Sessão de ' + formatDuration(elapsed) + ' somada ao seu total.', 'success');
          }
          resetTimerState(t);
          redrawTimer(key);
          updateTimerButton(key);
          if (elapsed > 0) afterStateChange();
        } else if (btn.dataset.action === 'reset') {
          // "Reiniciar" descarta sem contar — pra quando a sessão foi um
          // engano (ex: esqueceu rodando). Não soma ao total, não vai pro
          // Histórico. Pomodoro só tem essa opção mesmo (não acumula total).
          resetTimerState(t);
          redrawTimer(key);
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
    document.getElementById('btn-undo').addEventListener('click', undoLastAction);
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

  function countChecked(arr) {
    return (arr || []).filter(Boolean).length;
  }

  function mergeState(current, incoming) {
    const merged = JSON.parse(JSON.stringify(current));
    Object.keys(incoming.nodes || {}).forEach(function (id) {
      const inc = incoming.nodes[id];
      const cur = merged.nodes[id] || { xp: 0, kp: 0 };
      const mergedNode = { xp: Math.max(cur.xp, inc.xp || 0), kp: Math.max(cur.kp, inc.kp || 0) };
      // Checklist de entrega e link de portfólio não existiam antes desta
      // rodada — sem tratar aqui, um merge reconstruiria o nó só com xp/kp
      // e apagaria os dois campos silenciosamente.
      mergedNode.checkedDeliverables = countChecked(inc.checkedDeliverables) >= countChecked(cur.checkedDeliverables)
        ? inc.checkedDeliverables : cur.checkedDeliverables;
      mergedNode.portfolioUrl = inc.portfolioUrl || cur.portfolioUrl;
      // lastKpTs — pega o mais recente dos dois lados (maior timestamp = mais recente)
      mergedNode.lastKpTs = Math.max(inc.lastKpTs || 0, cur.lastKpTs || 0) || undefined;
      merged.nodes[id] = mergedNode;
    });
    merged.bonusXp = Math.max(merged.bonusXp || 0, incoming.bonusXp || 0);
    merged.totalStudySeconds = Math.max(merged.totalStudySeconds || 0, incoming.totalStudySeconds || 0);
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
        closeOnboarding();
        closeTopbarMenu();
        document.querySelectorAll('.info-tooltip.is-open').forEach(function (tip) {
          tip.classList.remove('is-open');
          tip.querySelector('.info-icon').setAttribute('aria-expanded', 'false');
        });
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
  // 24. ONBOARDING (primeira visita)
  // Guardado em uiPrefs (não em state) — Reiniciar não deve trazer isso de
  // volta pra quem já conhece o app, só resetar progresso.
  // =====================================================================
  function closeOnboarding() {
    const overlay = document.getElementById('onboarding-overlay');
    if (overlay) overlay.hidden = true;
    if (!uiPrefs.onboardingSeen) {
      uiPrefs.onboardingSeen = true;
      saveUiPrefs();
    }
  }

  function setupOnboarding() {
    const overlay = document.getElementById('onboarding-overlay');
    if (!overlay) return;
    document.getElementById('btn-close-onboarding').addEventListener('click', closeOnboarding);
    overlay.addEventListener('click', function (e) {
      if (e.target.id === 'onboarding-overlay') closeOnboarding();
    });
    if (!uiPrefs.onboardingSeen) overlay.hidden = false;
  }

  // =====================================================================
  // 25. ORQUESTRAÇÃO
  // =====================================================================
  function afterStateChange() {
    checkAchievements();
    checkCelebrations();
    saveState();
    renderTree();
    renderCategoryTabs();
    renderCharacterSheet();
    renderTotalHours();
    renderAttributes();
    renderStreakIndicator();
    renderWeeklyGoal();
    renderMissions();
    renderAchievements();
    renderStats();
    renderHistory();
  }

  // Extrai o número assinado do início de um detail tipo "+40 XP" / "-10 KP"
  // — mesmo formato que logHistory() já grava, então é seguro reaproveitar.
  function extractSignedNumber(detail) {
    const m = /^([+-]\d+)/.exec(detail || '');
    return m ? parseInt(m[1], 10) : 0;
  }

  // Resumo ao reabrir — 1x por dia (controlado via uiPrefs, não via state,
  // porque é uma questão de "já vi isso hoje neste aparelho", não progresso).
  function maybeShowWelcomeBackSummary() {
    const today = new Date().toDateString();
    if (uiPrefs.lastWelcomeShown === today) return;
    uiPrefs.lastWelcomeShown = today;
    saveUiPrefs();

    const yesterday = new Date(Date.now() - 86400000).toDateString();
    let xpYesterday = 0;
    state.history.forEach(function (h) {
      if (h.type === 'xp' && new Date(h.ts).toDateString() === yesterday) {
        xpYesterday += extractSignedNumber(h.detail);
      }
    });
    const streak = state.streak.current;
    const streakPart = streak > 0 ? ('streak em ' + streak + ' dia' + (streak === 1 ? '' : 's') + '.') : '';

    let msg;
    if (xpYesterday > 0 && streakPart) {
      msg = '🌅 Bem-vindo de volta! Ontem: +' + xpYesterday + ' XP — ' + streakPart;
    } else if (xpYesterday > 0) {
      msg = '🌅 Bem-vindo de volta! Ontem: +' + xpYesterday + ' XP.';
    } else if (streakPart) {
      msg = '🌅 Bem-vindo de volta! Sua ' + streakPart;
    } else {
      msg = '🌅 Bem-vindo de volta! Bom te ver por aqui.';
    }
    showToast(msg, 'suggestion');
  }

  function setupManualHoursEntry() {
    const btn = document.getElementById('btn-add-manual-hours');
    if (!btn) return;
    btn.addEventListener('click', function () {
      const input = window.prompt('Quantos minutos você quer adicionar ao total de horas de estudo? (ex: 45)');
      if (input === null) return; // cancelou
      const minutes = parseInt(input, 10);
      if (!minutes || minutes <= 0) {
        showToast('Valor inválido — digite um número de minutos maior que 0.', 'warning');
        return;
      }
      const seconds = minutes * 60;
      state.totalStudySeconds = (state.totalStudySeconds || 0) + seconds;
      logHistory('session', 'Registro manual', formatDuration(seconds));
      registerActivityToday();
      showToast('⏱️ ' + formatDuration(seconds) + ' adicionados ao seu total.', 'success');
      afterStateChange();
    });
  }

  function init() {
    state = loadState();
    notes = loadNotes();
    if (checkRecurringMissions()) saveState();
    // Checa conquistas já no load — sem isso, quem já qualifica pra uma
    // conquista recém-adicionada (ex: as de Domínio Profundo desta rodada)
    // só receberia crédito na próxima ação, não retroativamente.
    checkAchievements();
    saveState();

    renderCategoryTabs();
    focusCategory(currentCategoryId); // já chama renderCharacterSheet() internamente
    renderTotalHours();
    renderAttributes();
    renderStreakIndicator();
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
    setupSidebarToggles();
    setupThemeToggle();
    setupTopbarMenu();
    setupInstallPrompt();
    maybeShowWelcomeBackSummary();
    positionRecommendButton();
    setupNotificationsToggle();
    document.getElementById('btn-specializations').addEventListener('click', revealSpecializations);
    setupInfoTooltips();
    setupOnboarding();
    setupManualHoursEntry();

    if ('serviceWorker' in navigator) {
      window.addEventListener('load', function () {
        navigator.serviceWorker.register('service-worker.js').catch(function () {
          // PWA é opcional — se o navegador bloquear (ex: aberto via file://
          // sem servidor), o app segue funcionando normalmente sem ela.
        });
      });
    }

    window.addEventListener('resize', function () {
      applyTransform();
      positionRecommendButton();
    });

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
