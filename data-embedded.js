/**
 * data-embedded.js
 * Compendium: Codex do Engenheiro de Dados
 *
 * Fonte única de dados da árvore de habilidades. Consumido por script.js.
 * Segue as regras definidas em PROMPT_BASE.md — não alterar schema sem
 * atualizar também script.js (weight, row, prereq têm significado mecânico).
 *
 * weight: 0.5 = ramal leve | 1 (default) = padrão | 1.5 = is-boss | 2 = especialização
 * row:    0 = espinha dorsal | 1,2,3... = ramais paralelos independentes
 * prereq: apenas ordem cronológica SUGERIDA — nunca bloqueio real (ver seção 6.1 do PROMPT_BASE)
 */

window.__EMBEDDED_SKILLS__ = {

  // ---------------------------------------------------------------------
  // CATEGORIAS (abas / árvores independentes)
  // ---------------------------------------------------------------------
  categories: [
    { id: "fundamentos",         name: "Fundamentos",          order: 1, color: "#c9a24b" },
    { id: "programacao",         name: "Programação",          order: 2, color: "#4bb3c9" },
    { id: "banco-dados",         name: "Banco de Dados",       order: 3, color: "#4bc98a" },
    { id: "engenharia-dados",    name: "Engenharia de Dados",  order: 4, color: "#d98a3d" },
    { id: "cloud",               name: "Cloud",                order: 5, color: "#7a7ad9" },
    { id: "devops",              name: "DevOps",               order: 6, color: "#d94b6a" },
    { id: "visualizacao",        name: "Visualização",         order: 7, color: "#d9c94b" },
    { id: "soft-skills",         name: "Soft Skills",          order: 8, color: "#a94bd9" }
  ],

  // ---------------------------------------------------------------------
  // SKILLS (nós da árvore)
  // ---------------------------------------------------------------------
  skills: [

    // ===================== 1. FUNDAMENTOS =====================
    // Espinha dorsal pura — sem ramais, sequência pedagógica direta.
    { id: "fund_logica",      name: "Lógica",             category: "fundamentos", tier: 0, row: 0, prereq: null,             weight: 1,   description: "Estruturas condicionais, loops e pensamento algorítmico básico." },
    { id: "fund_dados",       name: "Dados",              category: "fundamentos", tier: 1, row: 0, prereq: "fund_logica",    weight: 1,   description: "O que são dados, tipos primitivos e representação." },
    { id: "fund_informacao",  name: "Informação",         category: "fundamentos", tier: 2, row: 0, prereq: "fund_dados",     weight: 1,   description: "Diferença entre dado, informação e conhecimento." },
    { id: "fund_algoritmos",  name: "Algoritmos",         category: "fundamentos", tier: 3, row: 0, prereq: "fund_informacao",weight: 1,   description: "Complexidade (Big O), recursão, estruturas de dados básicas." },
    { id: "fund_estruturas",  name: "Estruturas",         category: "fundamentos", tier: 4, row: 0, prereq: "fund_algoritmos",weight: 1,   description: "Listas, pilhas, filas, árvores e grafos." },
    { id: "fund_boss",        name: "Desafio de Lógica",  category: "fundamentos", tier: 5, row: 0, prereq: "fund_estruturas",weight: 1.5, description: "Projeto: resolver 20 desafios de lógica/algoritmos.", isBoss: true },

    // ===================== 2. PROGRAMAÇÃO =====================
    // Espinha: Python → Logging → POO → Boas Práticas
    { id: "prog_python",         name: "Python",         category: "programacao", tier: 0, row: 0, prereq: null,              weight: 1,   description: "Sintaxe, tipos, funções e fluxo básico em Python." },
    { id: "prog_logging",        name: "Logging",        category: "programacao", tier: 1, row: 0, prereq: "prog_python",     weight: 1,   description: "Registro de eventos e depuração estruturada." },
    { id: "prog_poo",            name: "POO",             category: "programacao", tier: 2, row: 0, prereq: "prog_logging",   weight: 1,   description: "Classes, objetos, herança e encapsulamento." },
    { id: "prog_boas_praticas",  name: "Boas Práticas",  category: "programacao", tier: 3, row: 0, prereq: "prog_poo",        weight: 1,   description: "Clean code, PEP8, type hints, testes." },
    // Ramal: Ambiente
    { id: "prog_pip",            name: "Pip",             category: "programacao", tier: 1, row: 1, prereq: "prog_python",    weight: 0.5, description: "Gerenciador de pacotes do Python." },
    { id: "prog_venv",           name: "Virtual Env",    category: "programacao", tier: 2, row: 1, prereq: "prog_pip",        weight: 0.5, description: "Ambientes virtuais isolados (venv/poetry)." },
    // Ramal: Dados
    { id: "prog_pandas",         name: "Pandas",          category: "programacao", tier: 1, row: 2, prereq: "prog_python",    weight: 0.5, description: "Manipulação de dados tabulares." },
    { id: "prog_numpy",          name: "NumPy",           category: "programacao", tier: 2, row: 2, prereq: "prog_pandas",    weight: 0.5, description: "Arrays numéricos e computação vetorizada." },
    // Ramal: Web
    { id: "prog_requests",       name: "Requests",       category: "programacao", tier: 1, row: 3, prereq: "prog_python",     weight: 0.5, description: "Cliente HTTP para consumo de serviços web." },
    { id: "prog_apis",           name: "APIs",            category: "programacao", tier: 2, row: 3, prereq: "prog_requests",  weight: 0.5, description: "Consumo e construção de APIs REST, autenticação básica." },
    // Boss
    { id: "prog_boss",           name: "Script de ETL",  category: "programacao", tier: 4, row: 0, prereq: "prog_boas_praticas", weight: 1.5, description: "Projeto: construir um script de ETL simples ponta a ponta em Python.", isBoss: true },

    // ===================== 3. BANCO DE DADOS =====================
    // Espinha: SQL → Consultas → Chaves → Índices
    { id: "db_sql",           name: "SQL",             category: "banco-dados", tier: 0, row: 0, prereq: null,              weight: 1,   description: "Sintaxe base de SQL (SELECT, WHERE, ORDER BY)." },
    { id: "db_consultas",     name: "Consultas",       category: "banco-dados", tier: 1, row: 0, prereq: "db_sql",          weight: 1,   description: "JOINs, GROUP BY, subqueries, window functions." },
    { id: "db_chaves",        name: "Chaves",          category: "banco-dados", tier: 2, row: 0, prereq: "db_consultas",    weight: 1,   description: "Chaves primárias, estrangeiras, integridade referencial." },
    { id: "db_indices",       name: "Índices",         category: "banco-dados", tier: 3, row: 0, prereq: "db_chaves",       weight: 1,   description: "Índices e otimização de performance de queries." },
    // Ramal: Modelagem
    { id: "db_modelagem",     name: "Modelagem",       category: "banco-dados", tier: 1, row: 1, prereq: "db_sql",          weight: 0.5, description: "Modelagem entidade-relacionamento (ER)." },
    { id: "db_normalizacao",  name: "Normalização",   category: "banco-dados", tier: 2, row: 1, prereq: "db_modelagem",     weight: 0.5, description: "1FN, 2FN, 3FN — eliminação de redundância." },
    // Ramal: Tecnologia
    { id: "db_postgresql",    name: "PostgreSQL",     category: "banco-dados", tier: 1, row: 2, prereq: "db_sql",           weight: 0.5, description: "Recursos específicos e administração básica do Postgres." },
    // Boss
    { id: "db_boss",          name: "Modelagem Completa", category: "banco-dados", tier: 4, row: 0, prereq: "db_indices",   weight: 1.5, description: "Projeto: modelar e implementar um banco relacional completo.", isBoss: true },

    // ===================== 4. ENGENHARIA DE DADOS (trilha principal) =====================
    // Espinha: ETL → ELT
    { id: "eng_etl", name: "ETL", category: "engenharia-dados", tier: 0, row: 0, prereq: null,       weight: 1, description: "Extract, Transform, Load — conceito e padrão clássico." },
    { id: "eng_elt", name: "ELT", category: "engenharia-dados", tier: 1, row: 0, prereq: "eng_etl",  weight: 1, description: "Extract, Load, Transform — padrão moderno orientado a warehouse." },
    // Ramal: Armazenamento
    { id: "eng_dw",        name: "Data Warehouse", category: "engenharia-dados", tier: 1, row: 1, prereq: "eng_etl",     weight: 0.5, description: "Armazenamento analítico estruturado (BigQuery/Snowflake/Redshift)." },
    { id: "eng_datalake",  name: "Data Lake",      category: "engenharia-dados", tier: 2, row: 1, prereq: "eng_dw",      weight: 0.5, description: "Armazenamento bruto e semi-estruturado (S3 + Parquet)." },
    { id: "eng_lakehouse", name: "Lakehouse",       category: "engenharia-dados", tier: 3, row: 1, prereq: "eng_datalake",weight: 0.5, description: "Arquitetura híbrida Lake + Warehouse (Delta Lake)." },
    // Ramal: Modelagem Analítica
    { id: "eng_moddim",       name: "Modelagem Dimensional", category: "engenharia-dados", tier: 1, row: 2, prereq: "eng_etl",        weight: 0.5, description: "Fatos e dimensões para modelagem analítica." },
    { id: "eng_starschema",   name: "Star Schema",           category: "engenharia-dados", tier: 2, row: 2, prereq: "eng_moddim",      weight: 0.5, description: "Modelo estrela — simplicidade para BI." },
    { id: "eng_snowflake",    name: "Snowflake Schema",      category: "engenharia-dados", tier: 3, row: 2, prereq: "eng_starschema",  weight: 0.5, description: "Normalização de dimensões do modelo estrela." },
    // Ramal: Operação
    { id: "eng_orquestracao", name: "Orquestração",   category: "engenharia-dados", tier: 1, row: 3, prereq: "eng_etl",           weight: 0.5, description: "Agendamento e dependência de pipelines (Airflow)." },
    { id: "eng_qualidade",    name: "Qualidade de Dados", category: "engenharia-dados", tier: 2, row: 3, prereq: "eng_orquestracao", weight: 0.5, description: "Testes de dados, validação e monitoramento (Great Expectations)." },
    // Boss
    { id: "eng_boss", name: "Pipeline Completo", category: "engenharia-dados", tier: 4, row: 0, prereq: "eng_elt", weight: 1.5, description: "Projeto: pipeline completo ingestão → transformação → carga em DW.", isBoss: true },

    // ===================== 5. CLOUD =====================
    // Espinha: AWS → S3 → IAM
    { id: "cloud_aws", name: "AWS", category: "cloud", tier: 0, row: 0, prereq: null,        weight: 1, description: "Fundamentos da AWS: console, regiões, serviços core." },
    { id: "cloud_s3",  name: "S3",  category: "cloud", tier: 1, row: 0, prereq: "cloud_aws",  weight: 1, description: "Armazenamento de objetos, buckets, políticas de acesso." },
    { id: "cloud_iam", name: "IAM", category: "cloud", tier: 2, row: 0, prereq: "cloud_s3",   weight: 1, description: "Gerenciamento de identidade e acesso." },
    // Ramais standalone
    { id: "cloud_azure",     name: "Azure",     category: "cloud", tier: 1, row: 1, prereq: "cloud_aws", weight: 0.5, description: "Fundamentos do Microsoft Azure." },
    { id: "cloud_gcp",       name: "GCP",        category: "cloud", tier: 1, row: 2, prereq: "cloud_aws", weight: 0.5, description: "Fundamentos do Google Cloud Platform." },
    { id: "cloud_bigquery",  name: "BigQuery",  category: "cloud", tier: 2, row: 2, prereq: "cloud_gcp",  weight: 0.5, description: "Data warehouse serverless do GCP." },
    { id: "cloud_supabase",  name: "Supabase",  category: "cloud", tier: 1, row: 3, prereq: "cloud_aws",  weight: 0.5, description: "Backend-as-a-service moderno sobre Postgres." },
    // Boss
    { id: "cloud_boss", name: "Arquitetura Multi-Cloud", category: "cloud", tier: 3, row: 0, prereq: "cloud_iam", weight: 1.5, description: "Projeto: desenhar uma arquitetura resiliente multi-cloud.", isBoss: true },

    // ===================== 6. DEVOPS =====================
    // Espinha: Git → GitHub → CI/CD
    { id: "devops_git",    name: "Git",    category: "devops", tier: 0, row: 0, prereq: null,           weight: 1, description: "Versionamento local: commits, branches, merge." },
    { id: "devops_github", name: "GitHub", category: "devops", tier: 1, row: 0, prereq: "devops_git",   weight: 1, description: "Colaboração remota: PRs, issues, workflow em equipe." },
    { id: "devops_cicd",   name: "CI/CD",  category: "devops", tier: 2, row: 0, prereq: "devops_github",weight: 1, description: "Integração e entrega contínua — pipelines automatizados." },
    // Ramais standalone
    { id: "devops_linux",  name: "Linux",  category: "devops", tier: 1, row: 1, prereq: "devops_git", weight: 0.5, description: "Terminal, shell scripting, permissões e processos." },
    { id: "devops_docker", name: "Docker", category: "devops", tier: 1, row: 2, prereq: "devops_git", weight: 0.5, description: "Containers, imagens, Dockerfile e docker-compose." },
    // Boss
    { id: "devops_boss", name: "Pipeline CI/CD", category: "devops", tier: 3, row: 0, prereq: "devops_cicd", weight: 1.5, description: "Projeto: pipeline de CI/CD completo com testes automatizados.", isBoss: true },

    // ===================== 7. VISUALIZAÇÃO =====================
    // Espinha: Dashboards → KPIs → Storytelling
    { id: "viz_dashboards",  name: "Dashboards",   category: "visualizacao", tier: 0, row: 0, prereq: null,             weight: 1, description: "Princípios de construção de dashboards eficazes." },
    { id: "viz_kpis",        name: "KPIs",          category: "visualizacao", tier: 1, row: 0, prereq: "viz_dashboards", weight: 1, description: "Definição e escolha de indicadores-chave." },
    { id: "viz_storytelling",name: "Storytelling",  category: "visualizacao", tier: 2, row: 0, prereq: "viz_kpis",       weight: 1, description: "Narrativa de dados para tomada de decisão." },
    // Ramais standalone
    { id: "viz_powerbi",  name: "Power BI", category: "visualizacao", tier: 1, row: 1, prereq: "viz_dashboards", weight: 0.5, description: "Modelagem e visualização com Power BI." },
    { id: "viz_metabase", name: "Metabase", category: "visualizacao", tier: 1, row: 2, prereq: "viz_dashboards", weight: 0.5, description: "BI open-source self-service." },
    // Boss
    { id: "viz_boss", name: "Dashboard Executivo", category: "visualizacao", tier: 3, row: 0, prereq: "viz_storytelling", weight: 1.5, description: "Projeto: dashboard com pelo menos 3 KPIs que contam uma história.", isBoss: true },

    // ===================== 8. SOFT SKILLS =====================
    // Espinha: Comunicação → Documentação → Resolução de Problemas
    { id: "soft_comunicacao",  name: "Comunicação",             category: "soft-skills", tier: 0, row: 0, prereq: null,                 weight: 1, description: "Comunicação clara com áreas técnicas e de negócio." },
    { id: "soft_documentacao", name: "Documentação",            category: "soft-skills", tier: 1, row: 0, prereq: "soft_comunicacao",    weight: 1, description: "Escrita técnica: READMEs, ADRs, runbooks." },
    { id: "soft_resolucao",    name: "Resolução de Problemas",  category: "soft-skills", tier: 2, row: 0, prereq: "soft_documentacao",   weight: 1, description: "Diagnóstico estruturado e tomada de decisão sob incerteza." },
    // Ramais standalone
    { id: "soft_arquitetura", name: "Arquitetura", category: "soft-skills", tier: 1, row: 1, prereq: "soft_comunicacao", weight: 0.5, description: "Pensamento sistêmico e trade-offs de arquitetura." },
    { id: "soft_entrevistas", name: "Entrevistas", category: "soft-skills", tier: 1, row: 2, prereq: "soft_comunicacao", weight: 0.5, description: "Preparação técnica e comportamental para entrevistas." },
    // Boss
    { id: "soft_boss", name: "Liderança Técnica", category: "soft-skills", tier: 3, row: 0, prereq: "soft_resolucao", weight: 1.5, description: "Marco: liderar tecnicamente uma entrega ou mentoria.", isBoss: true },

    // ===================== ESPECIALIZAÇÕES (desbloqueiam em Rank Sênior, nível ≥ 50) =====================
    // Cada uma ancorada no boss da categoria-mãe. Não entram no cálculo de globalLevel.

    { id: "spec_fund_1", name: "Estruturas de Dados Avançadas", category: "fundamentos",        tier: 6, row: 0, prereq: "fund_boss",   weight: 2, description: "Árvores balanceadas, heaps, grafos avançados.", isSpecialization: true },
    { id: "spec_fund_2", name: "Complexidade Avançada",         category: "fundamentos",        tier: 7, row: 0, prereq: "spec_fund_1", weight: 2, description: "Programação dinâmica e otimização de algoritmos.", isSpecialization: true },

    { id: "spec_prog_1", name: "Programação Assíncrona",  category: "programacao",       tier: 5, row: 0, prereq: "prog_boss",   weight: 2, description: "asyncio, concorrência e paralelismo em Python.", isSpecialization: true },
    { id: "spec_prog_2", name: "Empacotamento & Deploy",  category: "programacao",       tier: 6, row: 0, prereq: "spec_prog_1", weight: 2, description: "Build de pacotes, publicação, distribuição.", isSpecialization: true },

    { id: "spec_db_1", name: "Tuning Avançado", category: "banco-dados", tier: 5, row: 0, prereq: "db_boss",  weight: 2, description: "Query planning, particionamento, sharding.", isSpecialization: true },
    { id: "spec_db_2", name: "Bancos Distribuídos", category: "banco-dados", tier: 6, row: 0, prereq: "spec_db_1", weight: 2, description: "Consistência, CAP theorem, réplicas.", isSpecialization: true },

    { id: "spec_eng_1", name: "Streaming & Tempo Real", category: "engenharia-dados", tier: 5, row: 0, prereq: "eng_boss",    weight: 2, description: "Kafka, Kafka Connect, processamento em streaming.", isSpecialization: true },
    { id: "spec_eng_2", name: "Processamento Distribuído", category: "engenharia-dados", tier: 6, row: 0, prereq: "spec_eng_1", weight: 2, description: "Apache Spark e paralelismo em larga escala.", isSpecialization: true },
    { id: "spec_eng_3", name: "Data Mesh", category: "engenharia-dados", tier: 7, row: 0, prereq: "spec_eng_2", weight: 2, description: "Domínios de dados descentralizados e governança federada.", isSpecialization: true },

    { id: "spec_cloud_1", name: "Infra as Code",     category: "cloud", tier: 4, row: 0, prereq: "cloud_boss",   weight: 2, description: "Terraform e provisionamento declarativo.", isSpecialization: true },
    { id: "spec_cloud_2", name: "Kubernetes",         category: "cloud", tier: 5, row: 0, prereq: "spec_cloud_1", weight: 2, description: "Orquestração de containers em produção.", isSpecialization: true },
    { id: "spec_cloud_3", name: "FinOps",             category: "cloud", tier: 6, row: 0, prereq: "spec_cloud_2", weight: 2, description: "Otimização de custo em ambientes cloud.", isSpecialization: true },

    { id: "spec_devops_1", name: "Observabilidade", category: "devops", tier: 4, row: 0, prereq: "devops_boss",   weight: 2, description: "Logs, métricas, tracing e alertas.", isSpecialization: true },
    { id: "spec_devops_2", name: "GitOps",           category: "devops", tier: 5, row: 0, prereq: "spec_devops_1", weight: 2, description: "Deploy declarativo orientado por versionamento.", isSpecialization: true },

    { id: "spec_viz_1", name: "Modelagem Semântica", category: "visualizacao", tier: 4, row: 0, prereq: "viz_boss",   weight: 2, description: "Camadas semânticas para BI (dbt metrics, LookML-like).", isSpecialization: true },
    { id: "spec_viz_2", name: "Design de Dashboards", category: "visualizacao", tier: 5, row: 0, prereq: "spec_viz_1", weight: 2, description: "Princípios avançados de UX para dados.", isSpecialization: true },

    { id: "spec_soft_1", name: "Mentoria Técnica",     category: "soft-skills", tier: 4, row: 0, prereq: "soft_boss",   weight: 2, description: "Estruturar e conduzir mentorias técnicas.", isSpecialization: true },
    { id: "spec_soft_2", name: "Negociação & Stakeholders", category: "soft-skills", tier: 5, row: 0, prereq: "spec_soft_1", weight: 2, description: "Negociação de prazos, escopo e expectativas.", isSpecialization: true }
  ],

  // ---------------------------------------------------------------------
  // MISSÕES (exemplos iniciais — o usuário adiciona as próprias pelo painel)
  // ---------------------------------------------------------------------
  missions: [
    {
      id: "mission_consulta_certeira",
      name: "Consulta Certeira",
      description: "Escreva uma query SQL com JOIN, GROUP BY e uma window function.",
      difficulty: "Médio",
      tag: "banco-dados",
      recurring: false,
      deadline: null,
      status: "em_andamento", // pendente | em_andamento | concluida | removida
      linkedNodes: [
        { skillId: "db_sql",       xp: 40, kp: 20 },
        { skillId: "db_consultas", xp: 60, kp: 30 }
      ]
    },
    {
      id: "mission_pipeline_vivo",
      name: "Pipeline Vivo",
      description: "Construa um pipeline ETL simples que extrai de uma API e carrega em uma tabela.",
      difficulty: "Difícil",
      tag: "engenharia-dados",
      recurring: false,
      deadline: null,
      status: "pendente",
      linkedNodes: [
        { skillId: "eng_etl",      xp: 80, kp: 40 },
        { skillId: "prog_apis",    xp: 40, kp: 20 }
      ]
    },
    {
      id: "mission_painel_que_fala",
      name: "Painel que Fala",
      description: "Monte um dashboard com pelo menos 3 KPIs que contem uma história para o negócio.",
      difficulty: "Médio",
      tag: "visualizacao",
      recurring: false,
      deadline: null,
      status: "pendente",
      linkedNodes: [
        { skillId: "viz_dashboards",   xp: 50, kp: 25 },
        { skillId: "viz_storytelling", xp: 50, kp: 25 }
      ]
    },
    {
      id: "mission_revisao_semanal_docker",
      name: "Revisão Semanal: Docker",
      description: "Revisar conceitos de Docker e praticar por 25 minutos.",
      difficulty: "Fácil",
      tag: "devops",
      recurring: true,
      deadline: null,
      status: "pendente",
      linkedNodes: [
        { skillId: "devops_docker", xp: 15, kp: 10 }
      ]
    }
  ],

  // ---------------------------------------------------------------------
  // CONQUISTAS (modelo híbrido: por categoria + globais, com tiers)
  // ---------------------------------------------------------------------
  achievements: [
    // --- Globais ---
    { id: "ach_streak_7",    name: "Uma Semana de Ritual",   scope: "global", tier: "bronze", hidden: false, condition: "streak >= 7",  bonusXp: 50  },
    { id: "ach_streak_30",   name: "Um Mês de Disciplina",   scope: "global", tier: "prata",   hidden: false, condition: "streak >= 30", bonusXp: 150 },
    { id: "ach_streak_100",  name: "Cem Dias de Codex",       scope: "global", tier: "ouro",    hidden: false, condition: "streak >= 100",bonusXp: 400 },
    { id: "ach_first_week",  name: "Primeiros Passos",       scope: "global", tier: "bronze", hidden: false, condition: "daysActive >= 1", bonusXp: 20 },
    { id: "ach_rank_senior", name: "Rank Sênior Alcançado",  scope: "global", tier: "ouro",    hidden: false, condition: "rank == 'Sênior'", bonusXp: 400 },
    { id: "ach_surprise_1",  name: "???",                     scope: "global", tier: "prata",   hidden: true,  condition: "totalXp >= 3000", bonusXp: 200 },

    // --- Por categoria (exemplo replicável para as 8 categorias) ---
    { id: "ach_prog_50",     name: "Metade do Caminho: Programação", scope: "categoria", categoryId: "programacao",      tier: "bronze", hidden: false, condition: "categoryProgress('programacao') >= 50",      bonusXp: 60 },
    { id: "ach_prog_100",    name: "Mestre em Programação",           scope: "categoria", categoryId: "programacao",      tier: "ouro",    hidden: false, condition: "categoryProgress('programacao') >= 100",     bonusXp: 200 },
    { id: "ach_eng_50",      name: "Metade do Caminho: Eng. de Dados",scope: "categoria", categoryId: "engenharia-dados", tier: "bronze", hidden: false, condition: "categoryProgress('engenharia-dados') >= 50", bonusXp: 60 },
    { id: "ach_eng_100",     name: "Mestre em Engenharia de Dados",   scope: "categoria", categoryId: "engenharia-dados", tier: "ouro",    hidden: false, condition: "categoryProgress('engenharia-dados') >= 100",bonusXp: 200 },
    { id: "ach_eng_surprise",name: "???",                              scope: "categoria", categoryId: "engenharia-dados", tier: "prata",   hidden: true,  condition: "categoryProgress('engenharia-dados') >= 75", bonusXp: 120 },

    // --- Especializações (uma por categoria concluída) ---
    { id: "ach_spec_eng",   name: "Especialista em Engenharia de Dados", scope: "categoria", categoryId: "engenharia-dados", tier: "ouro", hidden: false, condition: "specializationComplete('engenharia-dados')", bonusXp: 400 },
    { id: "ach_spec_cloud", name: "Especialista em Cloud",                scope: "categoria", categoryId: "cloud",            tier: "ouro", hidden: false, condition: "specializationComplete('cloud')",            bonusXp: 400 }
  ]
};
