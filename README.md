# ✦ Compendium: Codex do Engenheiro de Dados

![HTML5](https://img.shields.io/badge/HTML5-E34F26?logo=html5&logoColor=white)
![CSS3](https://img.shields.io/badge/CSS3-1572B6?logo=css3&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-ES6+-F7DF1E?logo=javascript&logoColor=black)
![PWA](https://img.shields.io/badge/PWA-Ready-5A0FC8?logo=pwa&logoColor=white)
![License](https://img.shields.io/badge/license-MIT-green)

[🇧🇷 Português](#português) | [🇺🇸 English](#english)

---

<a name="português"></a>
## 🇧🇷 Português

Uma árvore de habilidades estilo RPG para gamificar o estudo contínuo da trilha de **Engenharia de Dados** — 100% local, sem conta, sem backend, sem instalar nada além de um navegador.

<p align="center">
  <img src="screenshots/dark-theme.png" alt="Compendium — tema Manuscrito Arcano (escuro)" width="100%">
</p>

<details>
<summary>Ver no tema claro (Blueprint)</summary>
<p align="center">
  <img src="screenshots/light-theme.png" alt="Compendium — tema Blueprint (claro)" width="100%">
</p>
</details>

---

### O que é

Cada habilidade da trilha — de lógica de programação a arquitetura de pipelines — é um nó numa árvore, com XP e progresso próprios. Em vez de uma lista de tópicos pra marcar como "concluído", o Compendium trata isso como um jogo de verdade: nível, rank, conquistas, streak, especializações. A ideia é simples — **estudar deveria dar vontade de voltar no dia seguinte.**

### Funcionalidades

**Sistema de progressão**
- 8 categorias (Fundamentos, Programação, Banco de Dados, Engenharia de Dados, Cloud, DevOps, Visualização, Soft Skills), mais de 60 habilidades
- XP e KP (Conhecimento) independentes por nó — pré-requisito é sugestão, nunca bloqueio
- Rank global (Aprendiz → Estudante → Praticante → Avançado → Sênior → Mestre do Codex)
- Especializações avançadas por categoria, desbloqueadas ao masterizar o projeto principal daquela trilha
- Atributos estilo RPG (INT/DEX/CON/WIS/CHA), calculados a partir do seu progresso real

**Conteúdo de estudo**
- Recursos recomendados (documentação oficial) direto no nó
- Checklist de entrega nos projetos "Marco Principal"
- Campo de portfólio pra linkar seu repositório quando conclui um projeto
- Bloco de notas por habilidade

**Hábito e produtividade**
- Timer Pomodoro + timer de Sessão (soma num total de horas de estudo permanente)
- Streak de dias consecutivos, com indicador visual de risco
- Recomendação inteligente — botão "O que estudar hoje?" olha prazos de missão e nós esquecidos
- Resumo ao reabrir o app, notificações do navegador (opcionais), desfazer último lançamento

**Missões e conquistas**
- Missões vinculadas a habilidades específicas (inclusive recorrentes)
- Conquistas por categoria e globais, com tiers bronze/prata/ouro
- Fila de revisão — sinaliza conhecimento (KP) que está parado há mais de 7 dias

**Interface**
- Dois temas completos — Manuscrito Arcano (escuro) e Blueprint (claro) — trocáveis a qualquer momento
- Painéis retráteis, busca de habilidades, atalhos de teclado
- Instalável como app (PWA), funciona offline

### Seus dados

Tudo fica só no seu navegador (`localStorage`) — não existe servidor, conta ou telemetria. Isso também significa que o progresso é por navegador/endereço: `Exportar` e `Importar` (no menu ☰) são o jeito de levar seu progresso entre dispositivos ou versões.

### Como rodar localmente

Não precisa de instalação — é HTML/CSS/JS puro, sem build:

```bash
git clone https://github.com/loweri/codexv1.git
cd codexv1
python3 -m http.server 8000
```

Abra `http://localhost:8000`. Servir por HTTP (não abrir o `index.html` direto como arquivo) é necessário pra o service worker e a instalação como PWA funcionarem.

### Publicar com HTTPS (pra instalar no celular)

PWA exige um contexto seguro — `localhost` já conta, mas um IP de rede local não. O jeito mais simples e gratuito:

1. Suba os arquivos pra um repositório no GitHub
2. **Settings → Pages** → Source: branch `main`, pasta `/ (root)`
3. Espera publicar (1-2 min) e acessa a URL gerada (`loweri.github.io/codexv1`) em qualquer aparelho
4. No celular: Chrome → menu → "Instalar aplicativo" · Safari (iOS) → Compartilhar → "Adicionar à Tela de Início"

---

<a name="english"></a>
## 🇺🇸 English

An RPG-style skill tree to gamify continuous learning in **Data Engineering** — 100% local, no account required, no backend, no installation needed beyond a modern browser.

### What it is

Every skill in the learning path — from programming logic to pipeline architecture — is a node in a tree, with its own XP and progression. Instead of a simple checklist, the Compendium treats learning like a real RPG game: levels, ranks, achievements, streaks, and specializations. The core philosophy is simple — **learning should make you want to come back tomorrow.**

### Features

**Progression System**
- 8 categories (Fundamentals, Programming, Databases, Data Engineering, Cloud, DevOps, Visualization, Soft Skills) with over 60 skills
- Independent XP and KP (Knowledge) per node — prerequisites are suggestions, never hard blocks
- Global Ranks (Apprentice → Student → Practitioner → Advanced → Senior → Codex Master)
- Advanced category specializations unlocked upon mastering main milestone projects
- RPG-style Attributes (INT/DEX/CON/WIS/CHA) calculated from your actual progression

**Study Content**
- Recommended resources (official documentation links) directly inside each skill node
- Delivery checklists for "Main Milestone" projects
- Portfolio input field to link your GitHub repository upon completing a project
- Dedicated notepad per skill

**Habit & Productivity**
- Pomodoro Timer + Session Timer (accumulates into lifetime permanent study hours)
- Consecutive day streaks with visual risk indicator
- Smart recommendations — "What to study today?" button analyzes mission deadlines and forgotten nodes
- App re-open summary, optional browser notifications, and undo last entry feature

**Missions & Achievements**
- Skill-linked missions (including recurring daily/weekly challenges)
- Category and global achievements with Bronze/Silver/Gold tiers
- Review queue — flags knowledge (KP) untouched for more than 7 days

**User Interface**
- Two complete themes — Arcane Manuscript (Dark) and Blueprint (Light) — toggleable anytime
- Collapsible sidebars, skill search bar, and keyboard shortcuts
- Installable as a Progressive Web App (PWA), works 100% offline

### Your Data

Everything stays exclusively in your browser (`localStorage`) — no servers, accounts, or telemetry. Progress is stored per browser/domain: `Export` and `Import` (in the ☰ menu) allow transferring your progress across devices or versions.

### How to Run Locally

No build tools required — 100% pure HTML/CSS/JS:

```bash
git clone https://github.com/loweri/codexv1.git
cd codexv1
python3 -m http.server 8000
```

Open `http://localhost:8000` in your browser. Serving over HTTP (rather than opening `index.html` directly) is required for the Service Worker and PWA installation.

### Publish via HTTPS (to install on mobile)

PWA installation requires a secure context — `localhost` qualifies, but local network IP addresses do not. The simplest free hosting method:

1. Push your repository files to GitHub
2. **Settings → Pages** → Source: branch `main`, folder `/ (root)`
3. Wait 1-2 minutes for publication, then open the generated URL (`loweri.github.io/codexv1`) on any mobile device
4. On Mobile: Chrome → Menu → "Install App" · Safari (iOS) → Share → "Add to Home Screen"

---

### Project Structure / Estrutura do Projeto

```
├── index.html          → Page structure and application entry point
├── style.css           → Base layout and structural styling (grid, spacing)
├── theme.css           → Arcane Manuscript (Dark Theme) aesthetics
├── theme-light.css     → Blueprint (Light Theme) aesthetics
├── script.js           → Core engine logic: XP/KP, state management, missions, achievements
├── data-embedded.js    → Application data: categories, skills, missions, achievements
├── manifest.json       → PWA metadata configuration
├── service-worker.js    → Offline caching strategy (network-first)
└── icons/              → Application icons in multiple dimensions
```

---

*Desenvolvido por / Developed by **Ericles Fernandes Oliveira** · Engenharia de Dados* 🚀
