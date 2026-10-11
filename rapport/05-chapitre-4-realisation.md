# Chapitre 4. Réalisation et implémentation

Ce chapitre décrit l'implémentation du « QA Testing Agent ». Il présente l'environnement d'exécution, puis détaille les modules du pipeline. Les sections 4.2, 4.3, 4.5, 4.9, 4.10 et 4.11 exposent les fonctions que j'ai écrites ; les sections 4.4, 4.7 et 4.8 décrivent les modules conçus pour l'interaction avec le reste du système.

---

## 4.1 Environnement d'exécution

Le backend s'exécute sur Node.js, les fichiers TypeScript étant chargés directement par `tsx` sans étape de compilation. Le typage statique est activé dans `tsconfig.json` avec `"strict": true`, la cible `ES2022` et le module `NodeNext` : toute propriété potentiellement non définie doit donc être traitée explicitement. C'est cette contrainte qui a influencé la forme des garde-fous décrits en 4.5 et 4.11.

Les paramètres de connexion sont lus dans un fichier `.env` par `dotenv`, jamais dans le code. Les variables utilisées sont :

> **Tableau 4.1 : Variables d'environnement par catégorie**

| Catégorie | Variables |
|---|---|
| Jira | `JIRA_DOMAIN`, `JIRA_EMAIL`, `JIRA_API_TOKEN` |
| LLM | `LLM_PROVIDER`, `GROQ_API_KEY`, `GROQ_BASE_URL`, `GROQ_MODEL`, `GEMINI_API_KEY`, `GEMINI_MODEL` |
| Pipeline | `BASE_URL`, `API_PORT`, `GROQ_SCENARIO_COOLDOWN_MS`, `TEST_LLM_PROVIDER`, `TEST_LLM_FALLBACK` |
| Interface | `VITE_QA_API_URL` (côté `frontend/.env`) |

L'API écoute sur le port `3001` par défaut (`api-server.ts:47`), l'interface sur le port `8080`. La configuration de tests générés par `playwright.config.ts` impose une exécution séquentielle : `workers: 1` et `retries: 0`. Ces deux valeurs sont décrites plus loin en 4.6.

---

## 4.2 Module d'ingestion Jira et conversion ADF

### 4.2.1 Extraction des tickets

Le module `jira-fetcher.js` contient cinq fonctions. `getEnv` (ligne 8) lit une variable d'environnement en renvoyant une chaîne vide si elle est absente, ce qui évite que l'absence de configuration interrompe le chargement du module. `getAuthHeader` (ligne 20) construit l'en-tête `Authorization` en Basic, à partir du couple e-mail / jeton d'API.

`jiraFetch` (ligne 34) est le point d'accès unique à l'API. J'ai choisi d'y centraliser la construction de l'URL, l'injection de l'en-tête et la lecture de la réponse, de sorte que les deux fonctions appelantes n'aient à se préoccuper que de leur logique. Cette fonction accepte un paramètre `overrides` qui permet de fournir des identifiants différents de ceux du fichier `.env` — c'est ce mécanisme que l'interface utilise lorsque l'utilisateur saisit ses propres paramètres Jira dans une modale.

`mapIssue` (ligne 61) transforme un objet `issue` brut de l'API en une structure interne : identifiant, résumé, description au format ADF, et type de ticket. Cette normalisation m'a servi à éviter que la forme brute de la réponse Jira ne se propage dans le reste du pipeline.

`getTicket` (ligne 74) récupère un ticket par sa clé, et `getAllTickets` (ligne 86) récupère l'ensemble des tickets correspondant à une requête JQL. La valeur par défaut est `'project IS NOT EMPTY ORDER BY key ASC'`, c'est-à-dire tous les tickets du projet triés par identifiant — un choix fait pour rendre les exécutions reproductibles. Cette fonction gère la pagination par `nextPageToken`, sans quoi une Jira dépassant une page de tickets serait tronquée silencieusement.

### 4.2.2 Conversion du format ADF

Jira ne renvoie pas du texte, mais du **JSON au format ADF** (*Atlassian Document Format*), une structure arborescente décrivant le document. `adfToText` (ligne 14) produit le texte exploitable qui servira de contexte au modèle de langage.

Le traitement repose sur une fonction `processNode` (ligne 47) qui parcourt l'arbre et délègue chaque type de nœud à une fonction dédiée. J'ai couvert vingt-quatre types de nœuds, dont les paragraphes, les six niveaux de titres, les listes à puces, numérotées, de tâches et de décisions, les blocs de code, les citations, les panneaux, les tableaux (avec cellules d'en-tête et de corps), les règles horizontales, ainsi que les nœuds en ligne : texte, mentions, émojis, dates, statuts et cartes intégrées.

Quatre traitements méritent d'être signalés, parce qu'ils répondent à des contraintes du format source :

- **`parsePossibleJson`** (ligne 32) : certains champs ADF contiennent du JSON imbriqué sous forme de chaîne. Cette fonction tente de l'analyser et, en cas d'échec, renvoie la chaîne brute plutôt que de lever une erreur.
- **`applyMarks`** (ligne 226) : les styles de texte (gras, italique, code, lien) sont portés par un tableau de marqueurs dans ADF. Cette fonction les convertit en Markdown.
- **`indentMultiline`** (ligne 253) : les listes imbriquées exigent une indentation cohérente. Sans elle, un scénario d'acceptation à plusieurs niveaux produirait un Gherkin invalide.
- **`normalizeDocument`** et **`normalizeWhitespace`** (lignes 261 et 268) : compactent les sauts de ligne parasites en fin de bloc. Sans cette normalisation, le modèle de langage recevait des descriptions hachées, et la qualité des scénarios générés était moins régulière.

---

## 4.3 Module de génération Gherkin

C'est la première des deux étapes qui font appel à un modèle de langage. Le module `gherkin-generator.js` transforme les critères d'acceptation Jira en fichiers `.feature` selon la syntaxe Gherkin.

### 4.3.1 Constitution de l'invite

`buildGherkinMessages` (ligne 145) assemble l'invite envoyée au modèle. Elle combine trois parties : des instructions générales, des exemples (*few-shot*) et le ticket à traiter. Le modèle par défaut est `qwen/qwen3.6-27b`, déclare en `DEFAULT_GROQ_MODEL` (ligne 8) et résolu par `generateGherkinWithGroq` (ligne 199) depuis la variable `GROQ_MODEL`.

`extractAcceptanceCriteria` (ligne 319) isole les critères d'acceptation dans la description du ticket. Cette séparation n'est pas cosmétique : le modèle doit écrire un scénario par critère, et lui fournir le texte entier de la description l'inciterait à inventer des critères absents. C'est l'un des rares endroits où j'ai volontairement réduit la quantité d'information fournie au modèle.

`extractBusinessCapabilities` (ligne 88) produit, à partir des sélecteurs connus, la liste des capacités métier du site (par exemple la réservation, le panier). Ces capacités sont ajoutées à l'invite pour que le modèle sache quelles fonctionnalités existent réellement, et n'en invente pas.

### 4.3.2 Contrôle qualité et détection de contamination

Le risque principal de cette étape est que le modèle produise autre chose que du Gherkin : du code, du JSON, des explications, ou une réponse qui mentionne ces éléments au lieu de les produire. C'est ce que j'ai nommé la **contamination**, et c'est le problème central de cette section.

Trois fonctions s'y opposent :

- **`cleanGherkinContent`** (ligne 356) nettoie la réponse brute. J'ai notamment abandonné toute trace de raisonnement en fin de sortie : certains modèles terminent leur réponse par des commentaires du type « j'ai vérifié que… », qui ne doivent pas figurer dans un fichier `.feature`. La fonction supprime aussi les blocs de code Markdown qui entourent parfois le Gherkin.
- **`detectContamination`** (ligne 400) inspecte le contenu nettoyé et renvoie le motif responsable s'il en détecte un : un identifiant de ticket, une citation de code, un objet JSON, une balise HTML. Elle renvoie une chaîne décrivant le problème, ce qui permet de journaliser la cause exacte du rejet.
- **`validateGherkinContent`** (ligne 425) est le contrôle final. Il échoue si la réponse est vide, si elle ne ressemble pas à un fichier `.feature` valide, ou si `detectContamination` signale un motif.

### 4.3.3 Boucle de tentatives

> **Figure 4.2 : Flux de génération Gherkin**
> Fichier source : `diagrammes/fig-4-2-flux-generation-gherkin.puml`

`generateGherkinWithGroq` (ligne 199) encapsule l'appel au fournisseur, avec **cinq tentatives** au maximum (`maxAttempts`, ligne 216). Deux mécanismes distincts governent le comportement entre les tentatives.

**Le délai entre tentatives** dépend du type d'erreur. Une réponse HTTP 429 (quota dépassé), 500, 502 ou 503 est considérée comme transitoire et entraîne un délai selon un recul exponentiel plafonné à 30 s (`Math.min(5000 * 2 ** (attempt - 1), 30000)`, ligne 238). Une erreur de validation de contenu, en revanche, n'est pas transitoire : attendre n'aurait rien changé, puisque c'est le comportement du modèle qui doit changer.

**L'invite est renforcée entre les tentatives.** `buildCoverageBoosterMessage` (ligne 127) complète l'invite précédente par une consigne explicite sur la couverture manquante, et la boucle continue avec cette invite enrichie. Le journal de génération (`[coverage] Retrying with stronger coverage prompt...`, ligne 261) trace ce mécanisme. L'objectif est d'éviter que cinq tentatives produisent cinq réponses trop proches : sans cet renforcement, la variabilité du modèle risquerait de renvoyer le même scénario incomplet.

À l'épuisement des cinq tentatives, la fonction **lève une erreur** (`throw lastError`, lignes 282 et 286) : aucune réponse de remplacement n'est substituée à celle du modèle. `generateMockGherkin` (ligne 289) n'est pas ce mécanisme de repli : il n'est appelé que si le fournisseur vaut explicitement `mock`, cas traité en amont dans `generateGherkin` (ligne 186), et il produit dans ce cas un squelette de scénario minimal.

`generateAndSaveFeature` (ligne 445) écrit le fichier `.feature` dans le dossier `features/` et retourne le chemin. `countScenarios` (ligne 329) décompte les scénarios produits, information reportée dans l'interface.

---

## 4.4 Module de compréhension du site et base de sélecteurs

Ce module construit la connaissance du site cible, qui conditionne la qualité de tout ce qui suit.

**Interface avec le reste du système.** Il expose deux fonctions. `ensureSelectorMap` (`selector-onboarding.ts`) est appelée par le pipeline et par l'API : elle reçoit une URL, en déduit le domaine, et garantit qu'une base de sélecteurs existe pour ce domaine avant de poursuivre. `getDomainFromUrl` (`storage.ts:9`) souligne cette correspondance entre l'URL et le domaine, et `mergeSelectorMap` (`storage.ts:63`) combine une base existante avec les résultat d'une nouvelle analyse, en donnant priorité aux données les plus récentes.

**Persistance.** Les sélecteurs sont écrits dans `selectors/<domain>.json`, le nom de fichier étant dérivé du domaine. Chaque page analysée produit une entrée contenant les sélecteurs trouvés et les composants d'interface détectés. Une section réservée aux sélecteurs de connexion est renseignée lorsque le site possède une page de ce type, ce qui évite de les redécouvrir à chaque génération.

**Alimentation du générateur.** C'est le point de contact principal avec le reste du système. Le module produit la structure `SelectorMap`, que `generator.ts` consomme pour alimenter la génération de code. La Figure 3.2 du chapitre 3 illustre cette liaison.

---

## 4.5 Module de génération des tests Playwright

C'est la seconde et la plus volumineuse des étapes faisant appel à un modèle de langage : le fichier `generator.ts` compte plus de mille lignes. Il produit, à partir des scénarios Gherkin, les scripts `.spec.ts` exécutés par Playwright.

### 4.5.1 Préparation du contexte

Trois fonctions préparent le travail avant l'appel au modèle.

**`expandScenarioExamples`** (ligne 70) développe les scénarios de type *Scenario Outline*. En Gherkin, un scénario paramétré par une table doit être instancié en autant de tests concrets qu'il comporte de lignes. Sans cette expansion, un seul test Playwright serait produit, et les autres cas resteraient non vérifiés.

**`filterSelectorsForScenario`** (ligne 137) ne transmet au modèle que les sélecteurs utiles au scénario traité. J'ai détaillé au chapitre 3.3 pourquoi ce filtrage améliore la fiabilité autant qu'il réduit le coût.

**`trimSelectorContext`** (ligne 192) applique un budget de contexte aux sélecteurs transmis. La base de `teskerti.tn.json` pèse environ 26 Ko, ce qui dépasse ce qui est utile dans une seule requête. La fonction réduit le contexte jusqu'à une limite de 900 éléments en conservant en priorité les sélecteurs les plus fréquemment utilisés sur la page. L'ordre de priorité est « le plus récent gagne », ce qui favorise les sélecteurs issus de la dernière analyse, donc les plus à jour.

### 4.5.2 Appels au modèle et reprise sur erreur

`buildScenarioPrompt` (ligne 250) constitue l'invite. L'appel au fournisseur passe par `callTestLlm` (ligne 590), qui répartit vers `callGroqForTestCode` (ligne 447) ou `callGeminiForTestCode` (ligne 327) selon le fournisseur retenu. Ce dernier est un mécanisme de repli **prévu** ; aucune exécution réussie avec Gemini n'a été observée dans les artefacts disponibles.

Trois protections encadrent cet appel.

**Détection des erreurs transitoires.** `isTransientLlmError` (ligne 547) distingue les erreurs qui justifient une nouvelle tentative des erreurs de configuration. `parseRetryDelay` (ligne 422) lit la durée d'attente indiquée par le fournisseur dans le message d'erreur et la respecte lorsque le service la fournit explicitement, ce qui évite de réessayer trop tôt.

**Reprise généralisée.** `callTestLlmWithRetry` (ligne 646) enveloppe l'appel dans une logique de nouvelle tentative, avec temporisation progressive.

**Rechargement de la configuration.** `forceProviderFromEnv` (ligne 570) lit la configuration du fournisseur directement depuis l'environnement au lieu de la valeur capturée au chargement du module. J'ai identifié ce point pendant le développement : dans un processus de longue durée, la configuration était figée au démarrage, et la modification de `.env` n'était pas prise en compte tant que le processus n'avait pas été relancé. Cette fonction supprime ce décalage.

### 4.5.3 Contrôle de validité du code produit

Un modèle de langage peut produire un texte qui ressemble à du TypeScript sans en être. Deux fonctions vérifient le code avant écriture.

`hasActionableBody` (ligne 682) rejette un corps de test vide ou constitué uniquement de commentaires : un tel test passe au vert tout en ne vérifiant rien, ce qui est le pire résultat possible. `isValidTypeScript` (ligne 998) contrôle la présence des éléments structurels attendus, notamment les appels `test` et `expect`.

En cas d'échec des deux contrôles, `generateFallbackTest` (ligne 699) produit un test minimal mais syntaxiquement correct. Le pipeline continue, et le test produit échouera à l'exécution — ce qui est le comportement souhaité : **un échec visible est préférable à un test vide qui réussit.**

### 4.5.4 Post-traitement du code

Le code produit par le modèle est réécrit par plusieurs passes. J'ai regroupé les transformations en deux intentions : corriger des choix fréquents et inadaptés, et supprimer des contradictions.

`wrapTestFile` (ligne 1008) ajoute l'en-tête `import` et l'appel `test()` manquants. `fixPlaywrightConventions` (ligne 982) corrige des appels qui fonctionnent mais ne suivent pas les conventions de l'API Playwright.

Deux transformations répondent à des échecs observés de manière répétée. `injectScrollBeforeVisibility` (ligne 809) insère un défilement avant une assertion de visibilité : plusieurs composants du site d'étude sont invisibles tant que la page n'a pas été parcourue, et l'assertion échouait alors que l'élément était présent. `relaxStrictVisibility` (ligne 926) transforme les assertions trop strictes en assertions tolérantes.

`sanitizeContradictoryAssertions` (ligne 791) supprime les assertions qui se contredisent. Le modèle produit parfois un `expect` suivi d'un second `expect` sur le même élément et la même propriété, avec des valeurs incompatibles : le second efface le premier, et le résultat du test ne signifie plus rien. `isFailureOutcome` (ligne 786) sert à distinguer un motif d'échec involontaire d'un motif intentionnel.

Enfin, deux fonctions corrigent des comportements non conformes aux règles anti-robots. `capCaptchaSubmission` (ligne 855) limite les soumissions d'un formulaire de vérification à visée anti-robot, et cette fonction est exportée pour être testée indépendamment.

`cleanGeneratedDirectory` (ligne 1044) vide le dossier `tests/generated/` avant chaque génération, ce qui évite qu'un test obsolète ne soit exécuté avec les nouveaux.

---

## 4.6 Module d'exécution

`runner.ts` exécute les tests générés et transforme le résultat brut en structure exploitable.

`runGeneratedTests` (ligne 142) invoque `npx playwright test` avec le rapporteur JSON, en capturant la sortie standard et la sortie d'erreur. `parsePlaywrightOutput` (ligne 64) analyse la sortie JSON, et `collectTestDetails` (ligne 77) extrait pour chaque test son titre, son statut et le message d'erreur éventuel.

`buildFailureFallback` (ligne 126) intervient lorsque la sortie JSON n'a pas pu être analysée — cas d'un plantage du lanceur ou d'une erreur de configuration. Sans elle, l'étape d'analyse des échecs n'aurait rien à traiter, et une erreur d'infrastructure serait indiscernable d'une absence de résultat. Cette fonction construit un rapport synthétique à partir des sorties texte, ce qui permet de poursuivre le pipeline.

**Les deux paramètres d'exécution** sont identiques dans `playwright.config.ts` et `playwright.demo.config.ts` : `fullyParallel: false`, `workers: 1` et `retries: 0`. Ces valeurs ne sont commentées ni dans les fichiers de configuration ni ailleurs dans le code ; le rapport se limite donc à les constater, sans leur attribuer une motivation que le projet n'énonce pas. Les trois délais — `timeout: 15 000` pour le test, `expect.timeout: 10 000` et le délai global de 300 000 ms — sont également identiques dans les deux fichiers, comme le confirme la vérification de cohérence du chapitre 5.

---

## 4.7 Module d'analyse des échecs

**Interface avec le reste du système.** Ce module consomme le rapport d'exécution (`JsonReport`) et produit un `FailureReport` par test en échec, persisté dans `failure-reports/`. Il expose deux fonctions principales : une fonction d'analyse qui, pour un échec donné, construit le contexte nécessaire puis retourne la première règle conforme, et une fonction de production de rapport qui itère sur l'ensemble des échecs.

**Mécanisme.** L'analyse repose sur un moteur à règles. `rules.ts` contient treize règles évaluées dans l'ordre ; la première dont les conditions sont satisfaites détermine la classification. Chaque règle définit la catégorie d'échec, la cause racine et une valeur de confiance. Cette dernière n'est pas décorative : elle est renvoyée par la règle et détermine la suite du traitement. Un échec classé avec une confiance élevée reçoit une proposition de réparation spécifique ; un échec de confiance faible est signalé sans proposition, pour revue humaine.

**Ce que le module produit.** Les types déclarés dans `types.ts` définissent douze catégories d'échec et sept causes racines. Les fichiers produits montrent que la classification discriminait effectivement des situations distinctes : sélecteur introuvable, élément masqué, erreur d'authentification, donnée attendue absente de la réponse, délai dépassé. Cette discrimination est la condition de l'utilité de l'étape suivante : sans distinction entre « l'interface a changé » et « le produit ne respecte pas le critère d'acceptation », aucune réparation automatique n'est possible.

---

## 4.8 Module de réparation et auto-réparation

**Interface avec le reste du système.** Ce module consomme les `FailureReport` et produit des `RepairPlan` dans `repair-reports/`. Il se décompose en deux fonctions distinctes, appelées par deux points d'entrée différents. `generateRepairProposals` (`repair-agent/repair-agent.ts:57`) construit les propositions sans modifier les scripts ; c'est elle qu'utilisent le pipeline (`full-pipeline.ts:232`) et l'API (`api-server.ts:473`). `autoRepairAndRetry` (`agents/auto-repair.ts:267`) enchaîne proposition, application, relance et consignation ; elle n'est appelée que par le pipeline (`full-pipeline.ts:246`) et par le traitement par lot du même fichier (ligne 331).

Cette séparation explique un constat fait sur les artefacts : l'API produit des propositions de réparation mais n'applique aucun correctif, contrairement à l'exécution en ligne de commande. Seuls les fichiers produits par le second chemin sont accompagnés d'une entrée correspondante dans `repair-history/`.

**Construction du plan.** `buildRepairPlan` (`repair-agent/strategies.ts`) détermine, à partir de la cause racine identifiée, la correction à apporter au script. Le module travaille sur la base de sélecteurs existante : il s'agit de remplacer le sélecteur utilisé par le test par le sélecteur désormais valide, et non de réécrire le test. Une fonction dédiée traite le cas particulier des listes déroulantes, où le sélecteur du conteneur et celui de l'option sont distincts.

**Contrôle avant application.** `validateRepair` (`repair-agent/validator.ts`) examine le plan avant toute modification. Ce contrôle est un garde-fou : une proposition qui ne répond pas aux attendus est rejetée, et le script n'est pas modifié. C'est ce qui distingue une réparation automatique d'une réécriture non contrôlée.

**Application et retour arrière.** `computePatch` détermine les différences à appliquer, `applyRepair` les écrit dans le fichier, et `rollbackRepair` (`patcher.ts`) restaure la version précédente. La sauvegarde est systématique et intervient avant la modification ; le dossier `repair-backups/` en conserve 16 copies, ce qui confirme que le mécanisme a été effectivement mobilisé.

**Reprise.** `runScenario` (`repair-agent/retry-runner.ts`) relance un scénario isolé et non la suite complète, ce qui réduit le temps de chaque cycle de la boucle. La borne `MAX_REPAIR_ATTEMPTS = 3` y est déclarée (ligne 9) et sert de valeur par défaut à `autoRepairAndRetry` (`maxAttempts = options.maxAttempts ?? MAX_REPAIR_ATTEMPTS`, `auto-repair.ts:274`). La boucle de `processScenario` (`auto-repair.ts:134`) parcourt `attempt = 1` jusqu'à `maxAttempts` inclus : **trois réparations au maximum par scénario**. `history.ts` consigne chaque étape dans `repair-history/`, avec un fichier par scénario et par indice de tentative. L'indice `attempt-0` n'est pas une première réparation : il correspond au cas où aucun plan applicable n'a été trouvé dès le départ, cas traité avant l'entrée dans la boucle (`auto-repair.ts:124`). L'étendue des indices observés, de `attempt-0` à `attempt-3`, correspond donc à quatre écritures possibles et non à quatre tentatives.

> **Figure 4.1 : Boucle de réparation automatique**
> Fichier source : `diagrammes/fig-4-1-boucle-reparation.puml`

---

## 4.9 Serveur API

J'ai développé ce module pour rendre le pipeline accessible sans manipulation de ligne de commande. Le fichier `src/api-server.ts` expose quatre points d'entrée, plus une ressource de contrôle.

> **Tableau 4.2 : Points d'entrée du serveur API**

| Méthode | Route | Rôle |
|---|---|---|
| `POST` | `/api/test/start` | Démarre une exécution : reçoit le ticket et l'URL du site cible |
| `POST` | `/api/test/:runId/input` | Transmet les identifiants saisis et relance le pipeline |
| `GET` | `/api/test/:runId/status` | Renvoie l'état des huit étapes |
| `GET` | `/api/test/:runId/results` | Renvoie le rapport d'exécution et les diagnostics |

### 4.9.1 Gestion des exécutions

L'état des exécutions est conservé dans une `Map` déclarée ligne 98, `runs`. Chaque entrée contient l'identifiant, l'état des étapes, les paramètres et le résultat. Cette structure en mémoire présente une limite assumée, développée au chapitre 5.5 : **un redémarrage du serveur perd les exécutions en cours**.

`generateRunId` (ligne 142) produit un identifiant unique, et `createInitialStages` (ligne 146) initialise les huit étapes à l'état « en attente ». `updateStage` (ligne 159) centralise la mise à jour d'une étape, ce qui garantit qu'une étape ne peut pas être marquée « terminée » sans passer par le même point que les autres.

### 4.9.2 Suspension et reprise du pipeline

`POST /api/test/start` (ligne 171) reçoit le ticket et l'URL, crée l'exécution, puis inspecte la page de connexion du site cible pour détecter les champs de formulaire. Le contrôle des identifiants est effectué par `field-detection.ts`, qui lit les champs réellement présents sur la page. La réponse contient l'identifiant d'exécution et la liste des champs à renseigner ; **le pipeline n'est pas encore lancé**.

`POST /api/test/:runId/input` (ligne 248) reçoit les valeurs saisies et appelle `resumePipeline` (ligne 563), qui poursuit le traitement à partir du point de suspension. Ce découpage en deux appels est ce que la Figure 3.3 du chapitre 3 représente.

### 4.9.3 Exécution et résultats

`executePipelineCore` (ligne 369) encapsule le traitement : il enchaîne les étapes, met à jour l'état de chacune, exécute l'analyse des échecs et la proposition de réparation, puis enregistre le résultat. `startPipeline` (ligne 541) déclenche le traitement initial.

Cette fonction rend le mode API indépendant de `full-pipeline.ts` : elle appelle directement les mêmes modules — `parser.ts`, `generator.ts`, `runner.ts`, `reporter.ts` — que le mode ligne de commande, sans passer par l'orchestrateur. La différence entre les deux modes ne porte donc pas sur les étapes 1 à 6, qui sont partagées à l'identique, mais sur la partie finale du traitement, décrite ci-dessous.

**L'API s'arrête à la proposition de réparation.** L'analyse est confiée à `analyzeFailures` (ligne 454), déclarée dans `agents/failure-analysis.ts` et fondée sur le moteur à règles de `failure-analysis/rules.ts`. Les propositions sont produites par `generateRepairProposals` (ligne 473). Ni `validateRepair`, ni `applyRepair`, ni `runScenario` ne sont appelés : après cette étape, `updateStage` marque `repair` comme terminé (ligne 479).

Il en résulte que **le serveur API ne dispose d'aucun mécanisme d'application des correctifs**. Cette fonction n'existe que dans le mode ligne de commande, via `autoRepairAndRetry` (`agents/auto-repair.ts:267`), appelée par `full-pipeline.ts:246`. Le tableau comparatif du chapitre 3.1.1 récapitule cette différence, et le chapitre 5.5 la traite comme une limite fonctionnelle à lever.

J'ai ajouté deux traitements qui n'étaient pas prévus initialement. D'une part, un **diagnostic de démarrage** journalisé lors de l'écoute du serveur (ligne 583), qui affiche le fournisseur de modèles retenu et les modèles configurés, lus par la fonction `forceProviderFromEnv` de `generator.ts`. Cette ligne a été ajoutée parce que le démarrage silencieux d'un fournisseur mal configuré produisait un échec plusieurs minutes plus tard, sans lien évident avec sa cause. D'autre part, `normalizeCredentials` (ligne 115) uniformise les valeurs transmises par l'interface : les champs de formulaire arrivent parfois sous forme de chaînes vides et parfois sous forme de valeurs absentes, et cette normalisation évite qu'un champ vide soit interprété comme une valeur définie.

---

## 4.10 Interface web

J'ai développé l'interface dans `frontend/`, avec TanStack Start et React 19. Elle porte le nom **« QA Testing Agent »**.

### 4.10.1 Deux écrans

L'écran de saisie (`routes/index.tsx`) regroupe le formulaire de ticket Jira, la saisie de l'URL du site cible et l'accès aux deux modales de paramètres. L'écran de suivi (`routes/run.$runId.tsx`) affiche la progression des huit étapes et les résultats. La séparation suit une règle simple : le premier écran ne dépend pas d'un identifiant d'exécution, le second en dépend.

Le composant `WebsiteInput` matérialise l'indépendance de l'outil vis-à-vis de sa cible : l'utilisateur saisit l'URL du site à tester, et celle-ci conditionne tout le traitement. C'est le seul endroit où la cible est choisie.

### 4.10.2 Suivi de l'exécution

`useTestRun` (`src/hooks/useTestRun.ts`) encapsule l'état d'une exécution. Il interroge `GET /api/test/:runId/status` toutes les 1 500 ms, met à jour l'état des huit étapes et interrompt l'interrogation lorsque l'exécution se termine. Centraliser cette logique dans un crochet plutôt que dans les composants évite que chaque écran maintienne sa propre copie de l'état, qui divergerait de celle des autres.

Le composant `PipelineProgress` affiche la progression, et `PipelineStep` représente une étape. L'état visuel de chaque étape reflète son état dans l'API : en attente, en cours, terminée, en échec.

`TestSummary` agrège les résultats quantitatifs et `TestResultCard` présente chaque scénario. Chaque carte donne accès au scénario Gherkin source (`GherkinViewer`), au script généré (`CodeViewer`), au diagnostic de l'échec (`FailureAnalysis`) et à l'état de la réparation (`RepairStatus`). Cette organisation permet de remonter d'un résultat vers sa chaîne de production complète sans quitter l'écran, ce qui est l'usage principal attendu d'un outil de supervision.

**Ce que l'interface affiche de la réparation, et ce qu'elle ne peut pas faire.** Le composant `RepairStatus` rend la proposition produite par `generateRepairProposals` : type de réparation, modifications envisagées et fichier concerné. Il s'agit d'un **affichage de proposition, non d'un déclenchement**. L'interface ne dispose d'aucun bouton d'application, et l'API ne lui en offrirait pas la possibilité même si elle en proposait un, puisque `generateRepairProposals` s'arrête à la construction du plan (voir 4.9.3).

Cette limite mérite d'être énoncée clairement, car l'ergonomie de l'écran peut laisser croire à un automatisme complet alors que la partie appliquative de la boucle reste accessible uniquement en ligne de commande. Elle est reprise comme perspective au chapitre 5.5.

### 4.10.3 Client API et typage

`services/qaApi.ts` définit les appels à l'API, et `services/httpClient.ts` les encapsule. `services/mockQaApi.ts` fournit une implémentation de substitution : si la variable `VITE_QA_API_URL` n'est pas définie, le client bascule sur cette API simulée et l'interface reste entièrement fonctionnelle. Cette disposition a été retenue pour permettre le développement et la démonstration de l'interface sans pipeline actif.

`types/qa.ts` déclare les types partagés entre l'interface et l'API : les huit étapes et leurs états, les informations de scénario, les diagnostics d'échec et de réparation. Ce typage partagé est ce qui garantit que l'interface reflète fidèlement ce que l'API renvoie, sans conversion manuelle.

---

## 4.11 Fiabilité des appels aux modèles de langage

Cette section décrit les dispositions prises pour que le système reste fonctionnel malgré les limites imposées par les fournisseurs de modèles de langage. Ces limites sont réelles : elles se manifestent par des erreurs HTTP 429 (quota par minute dépassé) et par des plafonds journaliers.

### 4.11.1 Les deux mécanismes de temporisation

Le projet comporte deux mécanismes d'attente, qui agissent à des étages différents.

**Le délai entre scénarios** concerne la génération Playwright. Un appel par scénario, sur une dizaine de scénarios, peut dépasser le quota par minute du fournisseur. La variable `GROQ_SCENARIO_COOLDOWN_MS` impose un délai entre deux appels, d'une durée par défaut de 60 000 ms (`generator.ts:1107`). Ce délai allonge nécessairement la durée totale d'une exécution : c'est un compromis assumé entre la vitesse et la fiabilité. Sans lui, les dernières requêtes d'une exécution échouent de manière quasi systématique. La génération Gherkin, décrite en 4.3, ne comporte pas d'attente de ce type entre les scénarios d'un même ticket.

**Le recul exponentiel** concerne la génération Gherkin et ne s'applique qu'aux codes de service 429, 500, 502 et 503 (`gherkin-generator.js:236`) : le délai croît par facteur deux à partir de 5 s et est plafonné à 30 s (`Math.min(5000 * 2 ** (attempt - 1), 30000)`, ligne 238). Un rejet de contenu n'est pas transitoire et n'appelle donc pas ce délai, mais l'attente fixe prévue avant la tentative suivante.

### 4.11.2 Le budget de contexte

`trimSelectorContext` (`generator.ts:192`) limite le contexte transmis à 900 éléments de sélecteurs. Cette limite a un effet secondaire utile : elle borne également la taille de la requête, ce qui réduit le risque de dépasser la fenêtre de contexte du modèle.

### 4.11.3 Le repli de fournisseur

`TEST_LLM_FALLBACK` permet de désigner un fournisseur de secours lorsque le fournisseur principal est indisponible. `hasGroqKey` (ligne 537) et `hasGeminiKey` (ligne 533) vérifient la présence d'une clé utilisable. Le mécanisme est **prévu et configuré** ; aucune trace d'une exécution réussie par le fournisseur de secours n'a été trouvée dans les artefacts disponibles, et il est donc décrit ici comme un mécanisme non validé en conditions réelles.

### 4.11.4 Le rejeu d'une configuration figée

`forceProviderFromEnv` (ligne 570) lit la configuration du fournisseur depuis l'environnement au lieu d'utiliser la valeur capturée au chargement du module. J'ai identifié ce défaut pendant le développement : dans un processus de longue durée, la configuration du fournisseur restait figée à sa valeur initiale, et une modification de `.env` n'était prise en compte qu'au redémarrage du processus. Comme une exécution complète peut durer plusieurs minutes et que le pipeline est parfois lancé dans un processus persistant — précisément le cas de l'API décrite en 4.9 — ce décalage produisait des échecs dont la cause n'était pas visible. Cette fonction rend la configuration effective à chaque appel.

---

*Liste des tableaux :*

- **Tab 4.1** Variables d'environnement par catégorie.
- **Tab 4.2** Points d'entrée du serveur API.

*Liste des figures :*

- **Fig 4.1** Boucle de réparation automatique.
- **Fig 4.2** Flux de génération Gherkin.

*Prochaine section : chapitre 5 - Tests, validation et résultats.*
