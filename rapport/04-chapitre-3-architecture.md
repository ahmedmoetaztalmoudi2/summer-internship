# Chapitre 3. Architecture et conception

Ce chapitre présente l'architecture du « QA Testing Agent » et les choix de conception qui la sous-tendent. Il décrit la chaîne de traitement, les technologies retenues et leur justification, les structures de données qui relient les étapes, puis les conceptions d'interface qui portent l'interaction avec l'utilisateur.

---

## 3.1 Architecture globale

Le système est un pipeline déterministe composé de huit étapes, dont deux font appel à un modèle de langage. L'état partagé entre les étapes est persisté sous forme de fichiers JSON, ce qui rend chaque étape indépendamment inspectable.

> **Figure 3.1 : Architecture globale du pipeline**
> Fichier source : `diagrammes/fig-3-1-architecture-globale.puml`

**Les deux étapes colorées en orange** dans le diagramme sont les seules à faire appel à un modèle de langage. Les six autres sont du code déterministe. Cette répartition n'est pas un détail d'implémentation : c'est un choix de conception qui détermine la prévisibilité du système et son coût d'exécution.

**Les deux stockages sous forme de dossiers** (base de sélecteurs et artefacts de rapport) sont des intermédiaires persistés sur disque. Chaque étape écrit un fichier, et l'étape suivante le relit. Ce mode de partage d'état a une conséquence importante : **un échec au milieu du pipeline ne perd pas le travail déjà accompli**. Si l'étape 5 échoue, les scénarios Gherkin de l'étape 3 restent disponibles, et le pipeline peut être relancé sans tout refaire.

### 3.1.1 Les deux modes d'exécution

La Figure 3.1 distingue deux zones à partir de l'étape 7. Cette distinction n'est pas une simplification pédagogique : elle correspond à deux jeux de fonctions réellement séparés dans le code.

> **Tableau 3.1 : Comparaison des deux modes d'exécution**

| | **Mode ligne de commande** | **Mode API et interface web** |
|---|---|---|
| **Point d'entrée** | `full-pipeline.ts` | `api-server.ts` |
| **Étape 7 — analyse** | `failure-analysis/rules.ts` | `analyzeFailures()` (`agents/failure-analysis.ts:195`) |
| **Étape 8 — propositions** | `generateRepairProposals()` (déclarée dans `repair-agent/repair-agent.ts:57`, appelée par `full-pipeline.ts:232`) | `generateRepairProposals()` (appelée par `api-server.ts:473`) |
| **Validation du plan** | Oui (`validator.ts`) | Non |
| **Sauvegarde du script** | Oui (`repair-backups/`) | Non |
| **Application du correctif** | Oui (`patcher.ts`) | Non |
| **Relance du scénario** | Oui, jusqu'à 3 réparations | Non |
| **Écriture dans `repair-history/`** | Oui | Non |

**Le mode ligne de commande va jusqu'à la fin de la boucle.** `full-pipeline.ts` appelle `autoRepairAndRetry` (ligne 246) après avoir produit les propositions (ligne 232) : le correctif est validé, sauvegardé, appliqué, puis le scénario est relancé. En cas d'échec, le cycle recommence, **au maximum trois fois**. Passé ce seuil, la version d'origine est restaurée et le cas est renvoyé à une revue humaine. Cette boucle est détaillée au chapitre 4 (Figure 4.1).

**Le mode API s'arrête après la proposition.** `api-server.ts` appelle `generateRepairProposals` (ligne 473) puis met à jour l'étape `repair` au statut terminé : aucun appel à `validateRepair`, `applyRepair` ou `runScenario` n'est effectué. L'interface affiche donc l'analyse et les propositions de correction, mais **ne peut pas déclencher l'application du correctif**.

Cette limite a une conséquence sur la traçabilité qui explique un constat observable : les fichiers de `repair-history/` n'existent que pour les exécutions en mode ligne de commande. Elle correspond à la formulation retenue en 2.5 pour le hors-périmètre, et constitue une perspective du chapitre 5.5.

### 3.1.2 Les huit étapes du pipeline

> **Tableau 3.2 : Les huit étapes du pipeline**

| # | Étape | Module | Mécanisme | LLM |
|---|---|---|---|---|
| 1 | Extraction Jira | `jira-fetcher.js` | API REST v3 | Non |
| 2 | Conversion ADF | `adf-to-text.js` | Analyse syntaxique JSON | Non |
| 3 | Génération Gherkin | `gherkin-generator.js` | Appel Groq, 5 tentatives | **Oui** |
| 4 | Compréhension du site | `agents/website-understanding.ts` | Crawl Playwright headless | Non |
| 5 | Génération Playwright | `src/generator.ts` | Appel Groq + base de sélecteurs | **Oui** |
| 6 | Exécution | `src/runner.ts` | `npx playwright test` | Non |
| 7 | Analyse des échecs | `failure-analysis/rules.ts` via `agents/failure-analysis.ts` | Moteur à règles, premier conforme | Non |
| 8 | Réparation | `repair-agent/repair-agent.ts` puis, en mode CLI seulement, `agents/auto-repair.ts` | Proposer toujours ; appliquer et relancer en mode CLI | Non |

Les étapes 1 à 6 sont identiques dans les deux modes. La divergence commence à l'étape 7 et ne porte que sur la partie appliquative de l'étape 8.

Les huit noms d'étapes exposés par l'API et affichés par l'interface sont : `jira_analysis`, `acceptance_criteria`, `gherkin_generation`, `selector_verification`, `playwright_generation`, `test_execution`, `failure_analysis`, `repair`. Ils ne correspondent pas exactement au tableau ci-dessus, car ils décrivent le **point de vue utilisateur** — ce qu'il attend — tandis que le tableau décrit la **décomposition technique**.

---

## 3.2 Choix technologiques et justification

### 3.2.1 Technologies retenues

Les versions ci-dessous sont celles déclarées dans `backend/package.json`, reproduites telles qu'elles y figurent.

> **Tableau 3.3 : Technologies retenues et versions**

| Technologie | Version | Rôle | Fichier source |
|---|---|---|---|
| `@playwright/test` | `^1.55.0` | Exécution des tests de bout en bout | `backend/package.json` (dependencies) |
| `express` | `^5.2.1` | Serveur API | `backend/package.json` (dependencies) |
| `node-fetch` | `^2.7.0` | Appels HTTP sortants (Jira, LLM) | `backend/package.json` (dependencies) |
| `dotenv` | `^17.4.2` | Chargement de `.env` | `backend/package.json` (dependencies) |
| `cors` | `^2.8.6` | Autorisation cross-origin frontend/backend | `backend/package.json` (dependencies) |
| `figlet` | `^1.11.4` | Bannière ASCII en console | `backend/package.json` (dependencies) |
| `typescript` | `^5.5.4` | Typage statique (`strict: true`) | `backend/package.json` (devDependencies) |
| `tsx` | `^4.19.0` | Exécution directe de TypeScript | `backend/package.json` (devDependencies) |
| `@types/node` | `^22.0.0` | Définitions de types Node.js | `backend/package.json` (devDependencies) |

Les **modèles de langage** ne sont pas des dépendances npm : ce sont des services distants, configurés par variables d'environnement. Les valeurs par défaut déclarées dans le code sont :

> **Tableau 3.4 : Valeurs par défaut des modèles de langage**

| Usage | Valeur par défaut | Variable d'environnement | Fichier source |
|---|---|---|---|
| Génération Gherkin (étape 3) | `qwen/qwen3.6-27b` | `GROQ_MODEL` | `gherkin-generator.js:8, 205` |
| Génération Playwright (étape 5) | `openai/gpt-oss-20b` | `GROQ_TEST_MODEL` puis `GROQ_MODEL` | `generator.ts:462` |
| Fournisseur de secours | `gemini-1.5-flash` | `GEMINI_MODEL` | `generator.ts:351` |

Une précision de lecture : `generator.ts:462` lit `GROQ_TEST_MODEL` **avant** `GROQ_MODEL`. Cette priorité permet d'utiliser un modèle différent pour la génération de code et pour la génération de scénarios, sans modifier le code. La valeur par défaut de l'étape 3 (`qwen/qwen3.6-27b`) et celle de l'étape 5 (`openai/gpt-oss-20b`) sont d'ailleurs différentes, ce qui traduit le choix fait pendant le développement : la génération de code demande un modèle différent de la génération de texte structuré.

Le fournisseur de secours Gemini est **prévu et configuré**, mais aucune trace d'une exécution réussie avec Gemini n'a été trouvée dans les artefacts produits. Il est donc décrit dans ce rapport comme un mécanisme de repli prévu, non comme un mécanisme effectivement validé.

### 3.2.2 Arbitrage : orchestrateur maison ou framework multi-agents

L'un des points de conception les plus significatifs du projet a été de décider si le pipeline devait rester un **orchestrateur écrit spécifiquement** ou passer à un **framework d'agents**.

La question s'est posée parce que le code est organisé en « agents » (`agents/`, `failure-analysis/`, `repair-agent/`), et que les frameworks d'agents sont largement présentés comme la voie naturelle pour un système de ce type. Une revue d'architecture documentée dans `docs/architecture-review.md` a examiné trois options, que ce document désigne par les lettres **A**, **B** et **C** : **A** est l'orchestrateur TypeScript actuel, **B** un système multi-agents fondé sur CrewAI, **C** une architecture hybride.

Le tableau ci-dessous confronte ces trois options aux cinq critères qui ont servi l'arbitrage. Il s'agit d'une **évaluation qualitative** : chaque colonne résume les arguments de la revue pour le critère concerné, sans mesure ni expérimentation.

> **Tableau 3.5 : Comparaison des options d'architecture**
> Source : `docs/architecture-review.md`

| Critère | Option A — Orchestrateur actuel | Option B — Multi-agents CrewAI | Option C — Hybride |
|---|---|---|---|
| **Déterminisme** | Entièrement déterministe, sauf deux appels ponctuels au LLM | Chaque étape devient un agent doté d'un modèle et d'une mémoire, donc comportement non garanti | Déterminisme intégral de l'option A conservé |
| **Dépendances** | Aucune : `full-pipeline.ts` n'ajoute aucune bibliothèque | Dépendance externe et modèle de données imposé | Dépendance limitée à une interface de nœud, non introduite à ce stade |
| **Rejouabilité** | Le pipeline se rejoue à l'identique, l'état étant sur disque | Un comportement non garanti rend la rejouabilité incertaine | Identique à l'option A |
| **Débogage** | Pile d'appels explicite : l'origine d'un échec est localisée | Chaque étape devient une boîte noire dont le comportement interne est masqué | Identique à l'option A |
| **Adéquation au graphe réel** | Correspond exactement : étapes linéaires et une seule boucle bornée | Inadapté : le modèle « rôle, objectif, mémoire » ne correspond pas à des étapes à responsabilité fixe | Correspond au graphe réel, avec une couture pour un nœud LLM-outillé futur |

**Verdict.** L'option A est retenue, l'option B écartée, l'option C conservée comme option d'ouverture plutôt que comme migration. La revue attribue à chacune une note de recommandation sur dix — **A : 9, C : 8, B : 4** — qui traduit une appréciation d'ensemble de l'auteur de la revue et non une mesure. Sa conclusion est explicite : « *Adopt Option A now; keep Option C's seam in mind* ».

Le constat central de cette revue porte sur une **confusion entre un agent et une étape de workflow**. Un agent se caractérise par une perception, une décision autonome, un choix d'outils et une mémoire. Or chaque étape du pipeline a une responsabilité unique et fixe, est appelée dans un ordre fixe, et exécute du code déterministe — à l'exception des deux appels à un modèle de langage, qui sont des appels uniques et sans mémoire.

La conclusion retenue est que **le pipeline est un graphe orienté acyclique avec exactement une boucle de reprise bornée**, et non un système multi-agents. Le chapitre 5.5 montre que cette distinction a une conséquence concrète : le pipeline est rejouable et débogable, ce qu'un système piloté par des décisions de modèle ne garantit pas.

Ce choix présente un coût, qu'il faut assumer : toute la logique de coordination a été écrite. Le bénéfice est que rien dans l'orchestration ne dépend du comportement d'un modèle de langage.

### 3.2.3 Pourquoi Playwright plutôt que Selenium

Les deux bibliothèques d'automatisation de navigateurs les plus répandues ont été envisagées. Selenium impose un serveur WebDriver externe, à installer et maintenir séparément, et son modèle de sélection est centré sur des sélecteurs CSS ou XPath. Playwright pilote le navigateur directement via le protocole DevTools, sans serveur externe, et fournit une API de sélection plus expressive.

Deux besoins concrets ont orienté ce choix. Le premier est le **strict mode** de Playwright, qui échoue explicitement lorsqu'un sélecteur correspond à plusieurs éléments — ce qui évite des tests silencieusement faux (cf. chapitre 4.5). Le second est la **capture de trace** (`trace: 'on-first-retry'`, `playwright.config.ts`), qui enregistre les actions du navigateur et sert de preuve lors de l'analyse d'échec (cf. chapitre 4.7).

---

## 3.3 Modèle de données

Quatre structures de données relient les étapes. Elles sont décrites dans cette section parce qu'elles constituent le contrat entre les modules : c'est leur forme qui détermine ce que l'étape suivante peut consommer.

### 3.3.1 `SelectorMap` — base de sélecteurs

C'est la structure centrale du système. Elle associe, **par domaine**, les sélecteurs des éléments d'interface aux pages qui ont été explorées.

```
SelectorMap
├── domain: string                    // "teskerti.tn"
├── analyzedAt: string                // horodatage ISO
├── pages: Record<string, PageInfo>   // clés : chemins ("/", "/user/login")
│   └── PageInfo
│       ├── url: string
│       ├── selectors: Record<string, SelectorInfo>  // nom logique → sélecteur
│       └── widgets: WidgetInfo[]     // listes déroulantes, carrousels, formulaires
├── login: { email, password, submit }   // sélecteurs de connexion, si applicable
└── forms: Record<string, SelectorInfo[]>  // formulaires détectés
```

Deux propriétés sont déterminantes.

**L'indexation par domaine** (`storage.ts:9`, `getDomainFromUrl`) permet de conserver plusieurs sites dans le même format sans les confondre. La base de sélecteurs n'est donc pas une donnée propre à un site, mais un format de données indexé par site. C'est ce qui rend l'outil indépendant de sa cible.

**La fusion « le plus récent gagne »** (`mergeSelectorMap`, `storage.ts:63`) permet de réanalyser un site sans perdre les sélecteurs déjà collectés pour les pages qui n'ont pas été visitées lors du dernier passage.

### 3.3.2 Autres structures

> **Tableau 3.6 : Structures de données intermédiaires**

| Structure | Rôle | Consignée dans |
|---|---|---|
| `JsonReport` | Résultat brut de l'exécution Playwright (liste de tests, statut, messages d'erreur) | `report.json` |
| `FailureReport` | Analyse d'un échec : catégorie, cause racine, confiance, raisonnement, preuves | `failure-reports/` (65 fichiers) |
| `RepairPlan` | Plan de correction : modifications à apporter au script, justification | `repair-reports/` (66 fichiers) |

`FailureReport` est la structure la plus riche. Elle porte une **catégorie** d'échec (par exemple : sélecteur introuvable, élément masqué, erreur d'authentification, donnée absente, page en maintenance), une **cause racine**, un **niveau de confiance** entre 0 et 1, un **raisonnement** en langage naturel et des **preuves** extraites du message d'erreur. Le niveau de confiance n'est pas une estimation libre : il est renvoyé par la règle qui a effectivement classé l'échec, et une règle de confiance élevée produit une classification fiable et une proposition de réparation correspondante.

> **Figure 3.2 : Modèle de données du pipeline**
> Fichier source : `diagrammes/fig-3-2-modele-de-donnees.puml`

**Les trois liens entre structures sont importants.**

Le lien entre `SelectorMap` et `Feature` est un lien de **filtrage** : seuls les sélecteurs utiles au scénario considéré sont transmis au modèle de langage (`filterSelectorsForScenario`, `generator.ts:137`). Cette limitation n'est pas seulement une question de coût de requête ; elle est une mesure de fiabilité. Un modèle qui reçoit une base de sélecteurs complète mais non pertinente produit du code qui utilise des sélecteurs plausibles mais faux. Le filtrage réduit l'espace des réponses possibles et améliore la qualité du code produit.

Le lien entre `SelectorMap` et `FailureReport` est un lien d'**ancrage** : la base de sélecteurs n'alimente pas l'analyse, mais fournit les sélecteurs de référence qui servent à qualifier un échec et à en déduire une cause. C'est ce qui distingue une analyse fondée sur des éléments observés d'une interprétation libre.

Le lien entre `RepairPlan` et `JsonReport` **referme la boucle** : c'est la relance du test qui produit un nouveau résultat, lequel est à nouveau analysé. Le schéma est donc acyclique pour les étapes 1 à 8, et cyclique uniquement à partir de l'étape 6.

---

## 3.4 Conception de l'interaction principale

Le système se pilote par une interface web qui appelle l'API. La Figure 3.3 décrit la séquence d'une exécution complète.

> **Figure 3.3 : Séquence d'une exécution complète**
> Fichier source : `diagrammes/fig-3-3-sequence-execution.puml`

Cette séquence comporte trois choix de conception.

**La suspension de l'exécution.** Après réception du ticket et de l'URL, le système ne lance pas immédiatement la génération. Il inspecte d'abord la page de connexion du site cible pour **détecter les champs de formulaire réels**, puis demande à l'utilisateur de les renseigner. L'exécution ne reprend qu'après cette saisie (`resumePipeline`, `api-server.ts:563`).

La Figure 3.3 représente le mode API. Le participant central y est `executePipelineCore()` (`api-server.ts:369`), et non `full-pipeline.ts` : le serveur implémente lui-même l'enchaînement des étapes 1 à 6 en appelant directement les mêmes modules que le mode ligne de commande. Le tableau 3.1 reste néanmoins valable : les deux modes partagent les mêmes six premières étapes, et ne divergent qu'à partir de l'analyse et de la réparation.

Ce choix répond à un constat : la génération des tests de connexion ne peut pas aboutir sans identifiants valides, et la structure du formulaire n'est pas connue à l'avance. Demander les champs plutôt que les supposer évite de produire un test qui échoue systématiquement sur l'étape d'authentification. La détection est faite par analyse du DOM (`field-detection.ts`), et non par configuration : les noms de champs sont lus sur la page.

**L'asynchronisme avec interrogation périodique.** L'interface n'ouvre pas de connexion persistante. Elle interroge l'API toutes les 1 500 ms. Ce choix évite la complexité d'un canal bidirectionnel, mais présente un défaut assumé : la mise à jour n'est pas immédiate, et le nombre de requêtes augmente proportionnellement à la durée de l'exécution. Le remplacement par WebSocket ou Server-Sent Events figure parmi les perspectives de la conclusion générale.

**La suspension du traitement des identifiants.** Les identifiants saisis sont transmis au pipeline, et non conservés dans l'interface. Ils sont utilisés pour l'exécution des tests, ce qui présente une implication de sécurité : ces identifiants sont des identifiants de test personnel, et leur stockage éventuel doit être examiné avant tout déploiement en contexte professionnel.

---

## 3.5 Conception de l'interface web

### 3.5.1 Structure

L'interface, nommée **« QA Testing Agent »**, comporte deux écrans :

> **Tableau 3.7 : Routes de l'interface web**

| Route | Rôle | Contenu |
|---|---|---|
| `/` | Saisie | Logo, formulaire de ticket Jira, saisie de l'URL du site cible, ouverture des modales de paramètres |
| `/run/$runId` | Suivi et résultats | Progression des 8 étapes, résumé quantitatif, carte par scénario, analyseurs d'échec et de réparation, visualiseurs de code |

Cette séparation est directe : l'écran de saisie ne dépend pas d'un `runId`, l'écran de résultats en dépend. Un `runId` permet de retrouver une exécution précise, ce qui limite le risque de confondre deux exécutions successives.

### 3.5.2 Composants principaux

L'arborescence des composants est la suivante :

```
/  (Saisie)
├── TicketForm                     formulaire de ticket Jira
├── WebsiteInput                   saisie de l'URL du site cible
├── JiraSettingsModal              paramètres Jira
└── Formulaire d'identifiants      champs détectés sur la page de connexion

/run/$runId  (Suivi et résultats)
└── useTestRun                     interrogation de l'API toutes les 1500 ms
    ├── PipelineProgress → PipelineStep      une composant par étape
    ├── TestSummary                          résumé quantitatif
    └── TestResultCard                       une carte par scénario
        ├── GherkinViewer                    scénario source
        ├── CodeViewer                       script Playwright généré
        ├── FailureAnalysis                  diagnostic de l'échec
        └── RepairStatus                     état de la réparation
```

La composante `useTestRun` est le point central de l'interface. C'est un crochet React (`src/hooks/useTestRun.ts`) qui encapsule l'état d'une exécution : il déclenche l'interrogation périodique de l'API, met à jour l'état des 8 étapes, et arrête l'interrogation lorsque l'exécution est terminée. Centraliser cette logique dans un crochet plutôt que dans les composants évite que chaque écran maintienne sa propre copie de l'état.

`TestSummary` agrège les résultats quantitatifs (nombre de tests, nombre de réussites, nombre d'échecs), tandis que `TestResultCard` présente chaque scénario individuellement. Chaque carte donne accès au scénario Gherkin qui l'a produit (`GherkinViewer`), au script Playwright généré (`CodeViewer`), au diagnostic de l'analyse (`FailureAnalysis`) et à l'état de la réparation (`RepairStatus`). Cette organisation permet de remonter d'un résultat vers sa chaîne de production complète sans quitter l'écran.

### 3.5.3 Robustesse de l'interface

L'interface est conçue pour rester utilisable lorsque le backend est absent. Le service `src/services/httpClient.ts` bascule vers une API simulée (`mockQaApi.ts`) si la variable `VITE_QA_API_URL` n'est pas définie. Cette disposition permet de développer et de présenter l'interface sans dépendre du pipeline.

---

*Liste des tableaux :*

- **Tab 3.1** Comparaison des deux modes d'exécution.
- **Tab 3.2** Les huit étapes du pipeline.
- **Tab 3.3** Technologies retenues et versions.
- **Tab 3.4** Valeurs par défaut des modèles de langage.
- **Tab 3.5** Comparaison des options d'architecture.
- **Tab 3.6** Structures de données intermédiaires.
- **Tab 3.7** Routes de l'interface web.

*Liste des figures :*

- **Fig 3.1** Architecture globale du pipeline.
- **Fig 3.2** Modèle de données du pipeline.
- **Fig 3.3** Séquence d'une exécution complète.

*Prochaine section : chapitre 4 - Réalisation et implémentation.*
