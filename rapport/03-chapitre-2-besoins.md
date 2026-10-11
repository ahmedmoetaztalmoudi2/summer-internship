# Chapitre 2. Analyse des besoins et spécifications

Ce chapitre formalise le besoin auquel le système « QA Testing Agent » répond, à partir des documents de stage et de l'état de l'implémentation. Il distingue le besoin initial du besoin étendu, précise les acteurs et les exigences fonctionnelles et non fonctionnelles, et délimite le périmètre couvert.

---

## 2.1 Analyse de l'existant

### 2.1.1 Le besoin initial

Le sujet du stage, formulé par mon encadrante et validé au début de la période du 06/07/2026 au 06/09/2026, est le suivant :

> « Développement d'une solution basée sur l'intelligence artificielle pour la génération automatique de cas de tests et de scripts d'automatisation à partir des user stories Jira ».

Le besoin initial porte donc sur **deux livrables** : la génération automatique de cas de tests et la génération de scripts d'automatisation, tous deux dérivés des *user stories* Jira.

Ce besoin répond à une difficulté concrète du travail de l'équipe QA. Les critères d'acceptation sont rédigés dans Jira sous forme de *user stories*. Les cas de tests qui en découlent sont aujourd'hui écrits manuellement, puis traduits manuellement en scripts d'automatisation. Ce double travail présente trois défauts :

- **un coût de rédaction élevé** : chaque *user story* demande une relecture, une rédaction de scénario, puis une traduction en code ;
- **un risque de divergence** : le scénario manuel et le script d'automatisation sont deux documents distincts, qui ne sont pas resynchronisés lorsque le besoin évolue ;
- **une fragilité du script** : un script d'automatisation repose sur des sélecteurs d'éléments de l'interface. Toute modification de la page — un *div* renommé, un bouton déplacé, une classe CSS retirée — rend le script invalide.

Le troisième point est le plus coûteux. La maintenance des scripts d'automatisation devient un travail permanent, sans valeur ajoutée pour l'utilisateur : le test qui échoue ne signale pas nécessairement une régression du produit, mais simplement que l'interface a changé.

### 2.1.2 Le besoin étendu

Le périmètre demandé à l'origine ne couvrait que la génération. L'état du système livré va au-delà, et cette extension a été conduite **à mon initiative** au cours du stage :

> **Tableau 2.1 : Extensions livrées au-delà du besoin initial**

| Extension | Problème qu'elle traite | État |
|---|---|---|
| **Analyse des échecs** (classification des causes) | Un test qui échoue renvoie un message technique opaque | Livré — 64 rapports d'échec produits |
| **Réparation automatique** (correction puis relance) | La correction manuelle d'un sélecteur demande de rouvrir le script, comprendre l'erreur, puis relancer | Livré — 64 plans de réparation, 16 dossiers de sauvegarde |
| **Interface web de supervision** | Le pipeline se pilotait en ligne de commande, ce qui le réserve aux développeurs | Livré — formulaire, suivi des 8 étapes, résultats |

Le besoin étendu peut se formuler ainsi : *« aller au-delà de la génération, et prendre en charge la maintenance des scripts générés »*. C'est cette extension qui constitue l'apport principal du travail, et c'est elle qui fait passer l'outil d'un générateur à un agent.

### 2.1.3 Positionnement par rapport à l'existant

Le système ne se substitue pas à l'écriture manuelle des cas de tests : il s'appuie sur les critères d'acceptation déjà présents dans Jira comme source d'entrée. Il se situe entre la **spécification** (rédigée par le métier) et le **test exécutable** (écrit par la QA), et automatise cette transformation.

---

## 2.2 Acteurs du système

L'identification des acteurs permet de délimiter les responsabilités et les échanges. Quatre acteurs interviennent dans le fonctionnement du « QA Testing Agent » :

> **Tableau 2.2 : Acteurs du système et interactions**

| Acteur | Rôle dans le système | Interaction |
|---|---|---|
| **Utilisateur / analyste QA** | Pilote le système : saisit l'URL du site, l'identifiant du ticket Jira, les identifiants de connexion au site cible, puis consulte les résultats | **Interface web** — formulaires de saisie, suivi des étapes, affichage des résultats |
| **Site cible** | Système sous test : l'application web dont on veut tester le comportement | **Navigateur headless (Playwright)** — exploration, exécution des tests |
| **Jira Cloud** | Source des exigences : *user stories* et critères d'acceptation | **API REST v3** — lecture seule des tickets |
| **Fournisseur de LLM** | Fournit les modèles de langage qui génèrent les scénarios Gherkin et les scripts Playwright | **API Groq (défaut) ou Gemini** — requêtes HTTP synchrone |

Deux dépendances externes méritent d'être signalées, car elles conditionnent le fonctionnement du système : **les quotas d'appel des fournisseurs de LLM** (détaillés au chapitre 4.11) et **la disponibilité du site cible au moment de l'exécution**.

Les comptes LLM utilisés (Groq, Gemini) sont **persuels** et n'ont pas été fournis par l'entité d'accueil. Cette précision est importante : elle signifie que le fonctionnement du système dépend d'un service externe gratuit dont les conditions d'usage ne sont pas garanties.

---

## 2.3 Exigences fonctionnelles

Les exigences fonctionnelles sont extraites du périmètre demandé et de l'état du système livré. La colonne « Priorité » distingue trois niveaux : **Must** (nécessaire au fonctionnement), **Should** (important) et **Could** (utile mais différable).

> **Tableau 2.3 : Exigences fonctionnelles (EF1 à EF12)**

| Réf. | Exigence | Priorité | Implémentation |
|---|---|---|---|
| EF1 | Cibler un site web **quelconque**, identifié par son URL | Should | `storage.ts` (`getDomainFromUrl`), `full-pipeline.ts:118-126` |
| EF2 | Extraire le contenu d'un *user story* depuis Jira | Must | `jira-fetcher.js` (`getTicket`, `getAllTickets`) |
| EF3 | Convertir la description Jira en texte exploitable | Must | `adf-to-text.js` (`adfToText`) |
| EF4 | Générer des scénarios Gherkin à partir des critères d'acceptation | Must | `gherkin-generator.js` (`generateAndSaveFeature`) |
| EF5 | Construire une base de sélecteurs propre au domaine cible | Must | `selector-onboarding.ts`, `storage.ts` (`mergeSelectorMap`) |
| EF6 | Générer des tests Playwright exécutables à partir des scénarios Gherkin | Must | `generator.ts` (`generatePlaywrightTestsForFeatures`) |
| EF7 | Exécuter les tests générés sur le site cible | Must | `runner.ts` (`runGeneratedTests`), `playwright.config.ts` |
| EF8 | Classifier chaque échec et en identifier la cause | Should | `failure-analysis/rules.ts` (13 règles) |
| EF9 | Appliquer automatiquement une correction à un test en échec, puis le relancer | Should | Mode CLI uniquement : `agents/auto-repair.ts` (`autoRepairAndRetry`), max 3 réparations |
| EF10 | Proposer une correction pour chaque échec réparable | Should | `repair-agent/strategies.ts` (`buildRepairPlan`), appelé par le pipeline et par l'API |
| EF11 | Exposer l'état d'exécution via une API et afficher analyses et propositions dans l'interface | Should | `api-server.ts` (`/api/test/:runId/status`, `/results`) ; `api-server.ts:473` appelle `generateRepairProposals` sans appliquer le correctif |
| EF12 | Permettre la saisie des paramètres et la consultation des résultats dans une interface web | Could | `frontend/src/routes/`, `hooks/useTestRun.ts` |

**EF1 est classée en Should et non en Must** : le système fonctionne sur un seul domaine, mais l'architecture impose que la cible soit un paramètre et non une constante. La distinction est traitée au chapitre 5.5, qui montre que cette exigence n'est pas encore validée empiriquement.

La lecture du tableau met en évidence un point d'architecture : **EF2 à EF7 forment une chaîne obligatoire**, entièrement non interactive. **EF8 et EF10 forment la partie propositionnelle d'une boucle optionnelle**, qui ne s'active qu'en cas d'échec. **EF9 en constitue la partie appliquative**, et elle n'est offerte que par le mode ligne de commande.

Cette distinction a une conséquence directe sur l'usage : **l'interface web ne déclenche pas l'auto-réparation**. Le mode API s'arrête après la proposition ; le correctif doit être vérifié puis appliqué en ligne de commande, via `autoRepairAndRetry`. Les deux modes sont détaillés au chapitre 3.1 et la boucle au chapitre 4.8. La limite est reprise au chapitre 5.5 comme perspective d'évolution.

---

## 2.4 Exigences non fonctionnelles

Les exigences non fonctionnelles sont définies par les contraintes observées lors de l'implémentation. Elles sont présentées sous forme de tableau critère / exigence / moyen de vérification.

> **Tableau 2.4 : Exigences non fonctionnelles et moyens de vérification**

| Critère | Exigence | Moyen de vérification dans le système |
|---|---|---|
| **Paramétrage** | Aucune URL de site cible ne doit être codée en dur dans la logique du pipeline | `BASE_URL` dans `.env.example` ; `websiteUrl` reçu par requête API (`api-server.ts:206`) |
| **Traçabilité** | Chaque décision du système doit rester inspectable après coup | Artefacts JSON persistés : `failure-reports/`, `repair-reports/`, `repair-history/`, `repair-backups/` |
| **Sécurité des modifications** | Aucune modification d'un test ne doit être appliquée sans validation et sans possibilité de retour arrière | `repair-agent/validator.ts` (`validateRepair`), `patcher.ts` (`applyRepair`, `rollbackRepair`) |
| **Déterminisme** | L'analyse et la réparation ne doivent pas dépendre d'un appel à un modèle de langage | `failure-analysis/rules.ts` et `repair-agent/strategies.ts` sont des fonctions déterministes ; les LLM n'interviennent qu'en EF4 et EF6 |
| **Robustesse face aux quotas** | Le système doit tolérer les limites de débit des fournisseurs de LLM | Cooldown par scénario (`GROQ_SCENARIO_COOLDOWN_MS`), backoff exponentiel plafonné à 30 s, traitement du 429 |
| **Bornitude** | La boucle de réparation doit être bornée pour garantir la terminaison | `MAX_REPAIR_ATTEMPTS = 3` ; condition réelle `for (attempt = 1; attempt <= maxAttempts; attempt++)` (`auto-repair.ts:134`) ; puis abandon et escalade vers une revue humaine |
| **Traçabilité des décisions** | Chaque échec doit être accompagné d'une confiance et d'une justification | `FailureReport` (`confidence`, `rootCause`, `reasoning`, `evidence`) |
| **Maintenabilité** | Les étapes doivent échanger des structures de données typées, non des chaînes libres | Contrats TypeScript partagés ; `tsconfig.json` en mode `strict: true` |

L'exigence de **déterminisme** mérite un mot. Elle découle directement d'une observation faite pendant le développement : un appel à un modèle de langage est plus coûteux qu'une règle, plus lent, et non reproductible. Appliquer un modèle de langage à l'analyse d'un échec n'apporterait aucune information que la cause de l'échec ne contienne déjà. La conception a donc restreint l'usage des LLM aux deux étapes où leur apport est réel : la **production de texte** (EF4) et la **production de code** (EF6). Ce choix est justifié au chapitre 3.2.

---

## 2.5 Périmètre et conventions

### 2.5.1 Hors périmètre

Les éléments suivants ne sont pas traités par le système. Les mentionner évite qu'un lecteur les recherche dans le rapport sans les trouver :

- **Multi-domaine en production** : l'architecture permet de cibler plusieurs sites, mais **un seul fichier a été construit : `selectors/teskerti.tn.json`**. La validation est donc limitée à un seul domaine (chapitre 5.5).
- **Persistance des exécutions** : l'état des exécutions est conservé **en mémoire** dans le processus du serveur, et non dans une base de données. Un redémarrage du serveur perd l'historique des exécutions en cours.
- **Notifications temps réel** : l'interface actualise son état par interrogation périodique toutes les 1 500 ms, et non par WebSocket ni Server-Sent Events.
- **Intégration continue** : aucune chaîne CI/CD n'a été mise en place ; l'exécution du pipeline reste déclenchée manuellement.
- **Tests non fonctionnels** : le système ne produit que des tests fonctionnels. Performance, charge, sécurité et accessibilité ne sont pas couverts.
- **Données de test métier** : la gestion des jeux de données de test (comptes, moyens de paiement) n'est pas outillée.
- **Application des correctifs depuis l'interface** : l'auto-réparation est offerte par le mode ligne de commande uniquement. Le mode API analyse les échecs et produit des propositions de correction, mais ne valide pas, ne sauvegarde pas et n'applique aucun correctif. L'interface affiche ces propositions sans pouvoir les déclencher (EF9, EF11).

### 2.5.2 Conventions de lecture

Trois conventions ont été adoptées pour que le rapport soit vérifiable :

- **Traçabilité au code** : chaque affirmation technique renvoie au fichier et à la ligne qui l'implémente. Les noms de fichiers cités sont ceux du dépôt ; ils correspondent à ce qui a été réellement écrit.
- **Usage d'un site d'étude** : `teskerti.tn`, une plateforme de billetterie en ligne, est le seul site analysé. Il sert de **cas d'étude** pour valider le fonctionnement du système. Il ne constitue pas une limitation de l'outil, dont la cible est paramétrée (EF1).
- **Périmètre personnel** : le rapport décrit le système tel qu'il a été livré au terme du stage. Les interventions de ma encadrante ont porté sur le cadrage du besoin et non sur l'implémentation.

---

*Liste des tableaux :*

- **Tab 2.1** Extensions livrées au-delà du besoin initial.
- **Tab 2.2** Acteurs du système.
- **Tab 2.3** Exigences fonctionnelles.
- **Tab 2.4** Exigences non fonctionnelles.

*Prochaine section : chapitre 3 - Architecture et conception.*
