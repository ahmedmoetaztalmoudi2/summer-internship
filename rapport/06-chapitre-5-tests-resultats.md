# Chapitre 5. Tests, validation et résultats

Ce chapitre présente la démarche de validation du « QA Testing Agent » et les résultats obtenus. Il expose d'abord les vérifications statiques du code, puis les trois campagnes d'exécution réalisées, et discute enfin les limites constatées.

---

## 5.1 Démarche de validation

La validation s'est faite en trois niveaux, du plus statique au plus dynamique.

**Le premier niveau** est constitué de vérifications de cohérence, sans exécution. Elles portent sur la cohérence entre le code, les fichiers de configuration et les artefacts produits. Leur résultat est présenté en 5.2.

**Le deuxième niveau** est constitué de campagnes d'exécution de bout en bout, qui mobilisent le pipeline complet sur un ou plusieurs tickets. Trois campagnes ont été réalisées ; leurs résultats sont présentés en 5.3.

**Le troisième niveau** est constitué de l'observation de la boucle de réparation : vérifier que le système ne se contente pas de constater les échecs, mais qu'il les traite et relance les tests. Ce niveau est couvert par les artefacts de `repair-history/` et `repair-backups/`.

---

## 5.2 Vérifications statiques

Ces vérifications ont été conduites sans exécuter le pipeline. Elles consistent à confronter les valeurs déclarées dans le code et les fichiers de configuration aux artefacts réellement produits. Le tableau ci-dessous présente les contrôles effectués et leur résultat.

> **Tableau 5.1 : Vérifications statiques et résultats**

| Contrôle | Éléments confrontés | Résultat |
|---|---|---|
| Cohérence de la configuration du LLM | `.env` et valeur capturée par `generator.ts:462` | **Incohérence constatée** — la valeur lue au chargement du module restait figée en cours d'exécution. Corrigé par `forceProviderFromEnv` (voir 4.11.4) |
| Cohérence cible / base de sélecteurs | `BASE_URL` et fichier `selectors/teskerti.tn.json` | Cohérente — le domaine du fichier correspond à la cible configurée |
| Cohérence des délais d'exécution | `playwright.config.ts` et `playwright.demo.config.ts` | Cohérente — `timeout: 15 000`, `expect.timeout: 10 000`, `workers: 1`, `retries: 0` dans les deux fichiers |
| Cohérence des types de rapport | `FailureReport` déclaré dans `types.ts` et fichiers de `failure-reports/` | Cohérente — les champs `scenario`, `status`, `failureType`, `confidence`, `rootCause` sont présents dans les artefacts |
| Cohérence du plan de réparation | `RepairPlan` et fichiers de `repair-reports/` | Cohérente — les actions déclarées correspondent à des modifications effectives des scripts |
| Respect de la borne de reprise | `MAX_REPAIR_ATTEMPTS` dans `retry-runner.ts` et noms de fichiers de `repair-history/` | Cohérente — les fichiers portent des indices de `attempt-0` à `attempt-3`, la borne n'est pas dépassée |
| Comptage des artefacts | Dossiers `failure-reports/`, `repair-reports/`, `repair-history/`, `repair-backups/` | **65** fichiers de rapports d'échec dont **64** par scénario, **66** fichiers de plans dont **64** par scénario, **61** fichiers d'historique, **16** dossiers de sauvegarde |
| Gaine de contexte | `trimSelectorContext` (limite 900) et taille de `selectors/teskerti.tn.json` (≈ 26 Ko) | Le filtrage est nécessaire — la base brute dépasse le budget défini |

**Deux observations méritent d'être relevées.** La première est que l'incohérence de la configuration du LLM est le seul écart constaté entre le code et son comportement attendu, et qu'elle a été corrigée en cours de développement. La seconde est que la vérification des types de rapport a porté sur les champs obligatoires : elle confirme que les artefacts produits sont exploitables par l'étape suivante, mais ne préjuge pas de l'exactitude de la classification d'un échec donné. Cette distinction entre *cohérence de forme* et *exactitude de fond* est importante : elle définit ce que ces vérifications permettent d'affirmer, et ce qu'elles ne permettent pas.

---

## 5.3 Résultats des campagnes

### 5.3.1 Campagne SCRUM-1 — authentification

Cette campagne porte sur le ticket SCRUM-1, qui couvre les scénarios de connexion au site cible.

**Résultat : 3 tests sur 3 réussis, en 712,9 secondes.**

*Source de cette campagne : la capture d'écran de la page de suivi de l'exécution SCRUM-1, qui affiche le résumé quantitatif « 3/3 » et la durée totale de 712,9 s (capture n° 5). Le fichier `report.json` correspondant n'a pas été conservé, ce qui limite la vérification à la lecture de l'interface.*

Les trois scénarios vérifiés sont la connexion avec des identifiants valides, la connexion avec un mot de passe incorrect et la connexion avec une adresse électronique non enregistrée. Les deux derniers cas sont des scénarios d'échec attendu : ils vérifient que le site rejette correctement une saisie invalide, et non que le test doive réussir au sens du scénario.

Cette campagne est la démonstration la plus directe de la chaîne complète : extraction Jira, conversion du format ADF, génération Gherkin, compréhension du site, génération Playwright, exécution, puis analyse. Sa durée, 712,9 secondes pour trois tests, soit environ douze minutes, est nettement supérieure au temps d'exécution des scénarios eux-mêmes. Le délai d'attente entre scénarios décrit en 4.11.1 constitue une explication plausible de cet écart, mais le rapport chronométré de cette exécution n'a pas été conservé : la part exacte du délai d'attente dans la durée totale n'a pas pu être établie.

### 5.3.2 Campagne de démonstration

Une seconde campagne porte sur cinq tests de démonstration, définis dans `tests/demo/scrum-2-demo.spec.ts` et exécutés par une configuration dédiée, `playwright.demo.config.ts`, qui n'appelle aucun modèle de langage. Ces tests sont écrits manuellement et servent de référence indépendante : leur réussite ne dépend donc pas du générateur.

**Résultat enregistré : 5 tests sur 5 réussis.**

> **Tableau 5.2 : Tests vérifiables de la campagne de démonstration**

| Test vérifié |
|---|
| Les cartes d'événements affichent salle, nom et date, avec un lien vers l'événement |
| Le bouton « Réservez vos billets » est présent dans la section héros |
| Navigation depuis la section héros vers la fiche d'un événement en vedette |
| Navigation vers la page contact via le lien de pied de page |
| Navigation vers la catégorie Spectacle depuis la navigation principale |

Cette campagne a une portée qui la première n'a pas. Les cinq tests couvrent des **parcours de navigation distincts**, et non des variantes d'un même parcours : page d'accueil, fiche d'un événement, page contact, page de catégorie. La réussite des cinq indique que les sélecteurs collectés par le module de compréhension du site sont valides au-delà de la seule page de connexion.

**Une réserve doit être mentionnée.** Lors d'une exécution ultérieure de cette même campagne, les cinq tests ont échoué sur un dépassement de délai de 15 000 ms lors du chargement initial de la page (`page.goto`). Les captures produites lors de cette exécution montrent la page effectivement rendue, ce qui oriente vers une hypothèse de **latence de réponse du site cible** plutôt que vers un défaut des tests. Cette hypothèse est plausible mais n'est pas démontrée : je n'ai pas mesuré le temps de réponse du site ni comparé les deux exécutions sur la même fenêtre. Elle doit être vérifiée avant d'être présentée comme une explication établie. La conclusion générale en tire une perspective : une mesure du temps de réponse initial du site rendrait cette distinction vérifiable.

### 5.3.3 Campagne report.json — quatre scénarios

La troisième campagne est celle consignée dans `report.json`, portant sur quatre scénarios liés à l'affichage d'informations sur les événements.

**Résultat : 4 tests, 2 réussis et 2 échoués.**

Les deux échecs concernent l'affichage d'informations de base d'un événement et l'affichage des détails d'un événement. Le message d'erreur enregistré est identique pour les deux :

```
Locator: locator('.event-date').first()
Expected: visible
Timeout: 10000ms
Error: element(s) not found
```

Autrement dit, l'élément portant la classe `event-date` n'a pas été trouvé sur la page. Ce message est précisément le type d'anomalie que le module d'analyse des échecs est conçu pour traiter : il distingue un sélecteur devenu invalide d'une donnée réellement absente du produit. C'est le type d'échec que le module de réparation peut traiter, puisqu'un sélecteur remplacé par un sélecteur actuel constitue une correction vérifiable par relance.

**Cette campagne doit être lue comme le matériau de la section suivante, et non comme un échec du système.** Les deux tests en échec ont alimenté la boucle de réparation, dont les traces sont conservées dans `repair-history/` et `repair-backups/`. Une campagne entièrement verte n'aurait démontré aucune capacité d'analyse d'échec ni de réparation automatique.

### 5.3.4 Observation de la boucle de réparation

Les artefacts de la boucle constituent le troisième niveau de validation.

> **Tableau 5.3 : Artefacts produits par les campagnes**

| Artefact | Volume | Ce qui est observé |
|---|---|---|
| `failure-reports/` | 65 fichiers | 64 rapports de scénario, un pour chaque échec analysé, plus un fichier de synthèse (`failure-report.json`) |
| `repair-reports/` | 66 fichiers | 64 plans de réparation, un pour chaque échec, plus deux fichiers de synthèse (`repair-report.json` et `auto-repair-report.json`) |
| `repair-history/` | 60 fichiers d'essai, indices de `attempt-0` à `attempt-3`, plus `history.json` | La boucle a été parcourue, et **la borne de trois tentatives n'a jamais été dépassée** |
| `repair-backups/` | 16 sous-dossiers, 32 fichiers | Chaque dossier contient `original.spec.ts` et la copie du script précédant la première tentative ; 11 écritures d'historique mentionnent la restauration de la version d'origine |

Le respect de la borne est le point le plus important de cette observation. Une boucle de reprise sans borne minimale peut entrer dans un cycle indéterminé, consommer des quotas jusqu'à épuisement et ne jamais produire de verdict. Le fait que les indices s'arrêtent à `attempt-3` montre que le mécanisme d'abandon et d'escalade fonctionne comme prévu.

Cette lecture doit toutefois être nuancée. L'indice `attempt-0` n'est pas une tentative de réparation : il signale un scénario écarté dès la validation initiale, avant l'entrée dans la boucle (`auto-repair.ts:124`). Un même nom de scénario peut donc porter à la fois un fichier `attempt-0` et des fichiers `attempt-1` à `attempt-3`, sans que ces écritures proviennent d'une même exécution : le nom de fichier couple l'identifiant du scénario à l'indice d'essai, et une exécution ultérieure écrase le fichier correspondant au lieu de l'accumuler. Seul `history.json` agrège les écritures : il contient 72 entrées réparties sur 60 couples scénario et essai, ce qui conserve l'historique complet des relances. Le regroupement par scénario et par horodatage est donc nécessaire pour lire ces traces, et le volume de 61 fichiers du dossier, qui couvre 37 scénarios, ne doit pas être interprété comme le nombre de scénarios traités ni comme le nombre de tentatives.

Les scénarios couverts sont `./login` (identifiants valides et invalides), la navigation vers les pages événements, programme, contact et à propos, le filtrage par catégorie, les listes déroulantes de dates et de salles, l'affichage des prix et l'ajout au panier. Cette diversité montre que la boucle n'est pas limitée à un type de scénario, mais qu'elle s'exerce sur des pages de nature différente.

---

## 5.4 Analyse des résultats

Trois enseignements se dégagent de ces campagnes.

**La génération de tests est fonctionnelle, et la distinction des échecs l'est également.** Les campagnes 5.3.1 et 5.3.2 établissent que la chaîne produit des tests qui réussissent, y compris sur des parcours de navigation distincts. La campagne 5.3.3 établit que lorsqu'un test échoue, le message d'erreur produit est exploitable : il nomme le sélecteur en cause, ce qui permet une réparation ciblée.

**La répartition échecs / réussites de la campagne 5.3.3 ne mesure pas la qualité du générateur.** Les deux tests en échec portent sur le même sélecteur, ce qui indique une même cause. Un test généré sur un critère d'acceptation correct peut échouer si l'interface a changé depuis la collecte des sélecteurs. C'est précisément le cas que la boucle de réparation traite, et non un défaut de la génération Gherkin.

**Le coût d'exécution est élevé et largement improvable.** Les 712,9 secondes de la campagne SCRUM-1 pour trois tests montrent que le temps d'exécution est très supérieur à celui des scénarios. Le délai d'attente entre scénarios, appliqué pour respecter les quotas, en est une explication plausible ; sa part exacte reste à vérifier (5.3.1). Ce coût tient principalement à l'usage de modèles de langage sur des services gratuits, et non à la conception du pipeline. Il serait réduit par un service payant, sans modification du code.

---

## 5.5 Limites constatées

### 5.5.1 Limites de conception

**Validation limitée à un seul domaine.** L'architecture permet de cibler n'importe quel site : l'URL est un paramètre (`BASE_URL` en ligne de commande, `websiteUrl` par requête API, saisie dans l'interface) et la base de sélecteurs est indexée par domaine (`storage.ts:9`). Toutefois, **le seul fichier de base construit est `selectors/teskerti.tn.json`**. La généricité est donc démontrée par la conception et non par l'expérience. Elle reste à valider sur un second domaine.

**Couplage résiduel au site d'étude.** L'instruction système utilisée pour générer les tests contient des chemins et un sélecteur propres à `teskerti.tn` (`generator.ts:287-288, 306`), et la table d'indices de pages associe des mots-clés à des chemins déterminés (`field-detection.ts:124`, `TICKET_PAGE_HINTS`). Ces éléments ont été introduits pour améliorer les résultats sur le site d'étude ; ils constituent une restriction de portée pour tout autre site. Leur extraction vers un fichier de configuration par domaine constitue le premier levier d'amélioration de cet outil.

**Exécutions conservées en mémoire.** L'état des exécutions réside dans une `Map` du processus du serveur (`api-server.ts:98`). Un redémarrage du serveur, ou un déploiement sur plusieurs instances, ferait perdre les exécutions en cours et l'historique associé. Une persistance sur disque ou en base de données est nécessaire avant tout usage partagé.

**Suivi par interrogation périodique.** L'interface actualise son état toutes les 1 500 ms, sans canal persistant. Ce choix évite la complexité d'un canal bidirectionnel, mais entraîne une mise à jour différée et un nombre de requêtes proportionnel à la durée de l'exécution.

**L'interface web ne déclenche pas l'auto-réparation.** C'est la limite la plus structurante du mode API. L'API analyse les échecs et produit des propositions de correction (`api-server.ts:473`), puis s'arrête : elle ne valide pas le plan, ne sauvegarde pas le script et n'applique aucun correctif. L'interface affiche ces propositions mais ne peut pas les mettre en œuvre. La boucle de réparation complète, avec ses trois tentatives et son mécanisme de retour arrière, n'est accessible qu'en mode ligne de commande, via `autoRepairAndRetry` (`agents/auto-repair.ts:267`).

Cette limite a des effets mesurables. D'abord, les fichiers de `repair-history/` et les dossiers de `repair-backups/` ne sont produits que par le mode ligne de commande : une exécution lancée depuis l'interface laisse les `repair-reports/` sans suivi d'application. Ensuite, l'utilisateur doit basculer entre deux modes pour achever le cycle, ce qui rompt la continuité de la supervision.

Le levier d'amélioration correspondant est connu et borné : il suffit d'exposer la partie appliquative déjà écrite dans `agents/auto-repair.ts` derrière un point d'entrée de l'API, en conservant la validation et le retour arrière existants. La fonction est donc réutilisable telle quelle ; ce qui manque est le câblage, non la logique. Ce point est repris parmi les perspectives du chapitre suivant.

### 5.5.2 Limites de l'environnement

**Quotas des modèles de langage.** Les comptes utilisés étant des comptes gratuits, le code prévoit deux dispositions : un délai entre scénarios lors de la génération Playwright (variable `GROQ_SCENARIO_COOLDOWN_MS`, valeur par défaut 60 000 ms, `generator.ts:1107`) et une reprise en cas de code HTTP 429 pour la génération Gherkin (`gherkin-generator.js:236`). Ces deux dispositions ont une influence directe sur le temps d'exécution et sur le taux d'échec des campagnes. Il faut noter que les deux mécanismes sont distincts : le délai entre scénarios ne s'applique pas à la génération Gherkin, qui ne comporte pas d'attente de ce type entre les scénarios d'un même ticket.

**Latence du site cible.** La campagne 5.3.2 a présenté un échec généralisé sur le délai de chargement initial, alors que les captures montraient la page rendue. L'hypothèse d'une latence de réponse du site est plausible (5.3.2) mais n'est pas démontrée. Le délai de 15 000 ms configuré dans `playwright.config.ts` ne distingue pas un chargement lent d'une page indisponible.

**Absence d'intégration continue.** Aucune chaîne d'intégration continue n'a été mise en place. L'exécution du pipeline reste déclenchée manuellement, ce qui limite la fréquence de validation.

### 5.5.3 Lacunes documentaires

**Glossaire obsolète.** `GLOSSARY.md` contient des entrées qui ne correspondent plus à l'état du projet : la mention d'un modèle Claude / Anthropic, alors que les fournisseurs utilisés sont Groq et Gemini, et l'indication d'un passage futur à TypeScript, alors que le projet est intégralement en TypeScript. Ces entrées doivent être corrigées ou supprimées avant diffusion du glossaire.

---

*Liste des tableaux :*

- **Tab 5.1** Vérifications statiques et résultats.
- **Tab 5.2** Tests vérifiables de la campagne de démonstration.
- **Tab 5.3** Artefacts produits par les campagnes.

*Prochaine section : chapitre 6 - Conclusion générale et perspectives.*
