# Bibliographie et annexes

Ce dernier fichier regroupe les références mobilisées par le rapport et les extraits d'artefacts qui illustrent, pièce à pièce, le fonctionnement du système. Chaque extrait provient d'un fichier réel du dépôt du projet.

---

## Bibliographie

Les adresses suivantes ont été consultées pendant la période du stage, pour la documentation des outils utilisés et de l'écosystème dans lequel s'inscrit le travail.

1. Cucumber Open Source Project — *Gherkin Reference*, documentation de la syntaxe Gherkin et de ses mots-clés. https://cucumber.io/docs/gherkin/

2. Microsoft — *Playwright, Installation*, documentation officielle du framework de tests de bout en bout. https://playwright.dev/docs/intro

3. Atlassian — *Atlassian Document Format*, format structurel des descriptions de tickets Jira exploité par le module de conversion. https://developer.atlassian.com/cloud/jira/platform/apis/document/structure/

4. Atlassian — *Jira Cloud platform REST API v3*, référence des opérations de recherche et de lecture des tickets utilisées par le module d'ingestion. https://developer.atlassian.com/cloud/jira/platform/rest/v3/introduction/

5. Groq — *API Overview*, documentation du fournisseur de modèles de langage utilisé par défaut. https://console.groq.com/docs/overview

6. Google — *Gemini API*, documentation du fournisseur de secours prévu par le système. https://ai.google.dev/gemini-api/docs

7. TanStack — *Start, a full-stack React framework*, documentation du framework utilisé pour l'interface web. https://tanstack.com/start/latest

8. The TypeScript Team — *TypeScript Documentation*, documentation du langage dans lequel le projet est écrit. https://www.typescriptlang.org/docs/

9. OpenJS Foundation — *Node.js Documentation*, documentation du runtime. https://nodejs.org/docs/latest/api/

10. Meta / React — *React Documentation*, documentation de la bibliothèque d'interface utilisateur. https://react.dev

11. Document interne — *Décision d'architecture : orchestrateur déterministe ou framework multi-agents*, document de travail conservé dans le dépôt sous `backend/docs/architecture-review.md`, examiné au chapitre 3.

12. Dépôt du projet — *Summer Internship — Capgemini Engineering*, ensemble du code et des artefacts cités dans ce rapport, accessible depuis l'adresse `https://github.com/ahmedmoetaztalmoudi2/summer-internship---Capgemini-engineering`.

---

## Annexe A : User story Jira exploitée (extrait)

Le ticket SCRUM-2, tel qu'il a été récupéré par le module d'ingestion et converti du format Atlassian Document Format vers le langage naturel. Le fichier brut est conservé dans `backend/jira-tickets/SCRUM-2.txt`.

```text
La section héros de la page d'accueil affiche un bouton « Réservez vos billets »
qui mène vers la fiche d'un événement en vedette.
Chaque section de catégorie (ex : Spectacle, Carthage Off) affiche ses événements
avec un bouton « Voir Plus » qui ouvre la page des événements de la catégorie.

Critères d'acceptation:
- La section héros de la page d'accueil affiche un bouton « Réservez vos billets »
- Cliquer sur « Réservez vos billets » ouvre la fiche détaillée d'un événement en vedette
- Les sections de catégories affichent un bouton « Voir Plus » qui ouvre la page des événements de la catégorie
- Les cartes d'événements (div.owl-item div.tour_container) de la page d'accueil
  affichent la salle, le nom de l'événement et la date. NOTE: le prix en TND
  n'apparaît PAS sur la carte d'accueil, seulement sur la fiche détaillée de l'événement.
- Le bouton « Contactez-nous! » à côté de la héros mène à la page de contact de Teskerti
```

---

## Annexe B : Feature Gherkin généré (extrait)

Le fichier généré par l'étape 3 pour le ticket SCRUM-1. Il illustre la traduction des critères d'acceptation en scénarios structurés, avec les mots-clés localisés en français. Le fichier complet est conservé dans `backend/features/SCRUM-1.feature`.

```gherkin
Fonctionnalité: Authentification utilisateur

     Contexte:
       Étant donné que l'utilisateur est sur la page de connexion

     Scénario: Connexion réussie avec des identifiants valides
       Étant donné que l'utilisateur saisit "mellitisabaa@gmail.com" dans le champ email
       Et que l'utilisateur saisit "123456789" dans le champ mot de passe
       Quand l'utilisateur clique sur le bouton "Se connecter"
       Alors l'utilisateur doit être redirigé vers la page d'accueil

     Scénario: Connexion échouée avec un mot de passe incorrect
       Étant donné que l'utilisateur saisit "mellitisabaa@gmail.com" dans le champ email
       Et que l'utilisateur saisit "MotDePasseIncorrect" dans le champ mot de passe
       Quand l'utilisateur clique sur le bouton "Se connecter"
       Alors le message d'erreur "Nom d'utilisateur ou mot de passe erroné !" doit s'afficher
```

---

## Annexe C : Extrait de script Playwright généré

Le code ci-dessous est un extrait tel qu'il a été consigné dans le rapport d'analyse d'échec du scénario de connexion : il correspond à la partie du script généré qui a échoué. Cette même trace est ensuite consommée par le moteur de classification pour produire l'analyse de l'annexe E.

```ts
    // When l'utilisateur clique sur "Se connecter"
    await page.locator("button:has-text(\"Se connecter\")").click();
    await page.waitForNavigation();

    // Then l'utilisateur est redirigé vers la page d'accueil
    await expect(page).not.toHaveURL(/\/user\/login/);
```

---

## Annexe D : Base de sélecteurs (extrait)

La base de sélecteurs est le résultat de l'exploration du site cible. L'extrait montre la structure d'en-tête du fichier et la définition du formulaire de connexion. Le fichier complet est conservé dans `backend/selectors/teskerti.tn.json`.

```json
{
  "url": "https://teskerti.tn/contact",
  "domain": "teskerti.tn",
  "analyzedAt": "2026-08-30T23:26:06.604Z",
  "login": {
    "email": "input[name=\"email\"]",
    "password": "input[name=\"password\"]",
    "submit": "button:has-text(\"Se connecter\")"
  },
  "forms": {
    "form-1": {
      "email": "input[name=\"email\"]",
      "password": "input[name=\"password\"]",
      "submit": "button:has-text(\"Se connecter\")"
    }
  }
}
```

---

## Annexe E : Rapport d'analyse d'échec (extrait)

Le rapport d'échec produit par le moteur déterministe pour le scénario « Connexion réussie avec des identifiants valides ». La classification associe un type d'échec, une cause racine, un niveau de confiance et une trace de raisonnement. Le fichier complet est conservé dans `backend/failure-reports/connexion-r-ussie-avec-des-identifiants-valides.json`.

```json
{
  "scenario": "Connexion réussie avec des identifiants valides",
  "status": "failed",
  "failureType": "authentication_failure",
  "confidence": 0.87,
  "rootCause": "bad_test_data",
  "reasoning": [
    "Failure classified as \"authentication_failure\" with confidence 0.87.",
    "Root cause dimension: bad_test_data — the scenario data (Examples table / placeholder values / selected options) is invalid for this flow.",
    "Matched error signature: /tohaveurl[^\\n]*\\/login/i."
  ],
  "errorSummary": "Test timeout of 30000ms exceeded.",
  "location": {
    "file": "C:\\Users\\ahmed\\...\\tests\\generated\\connexion-r-ussie-avec-des-identifiants-valides.spec.ts",
    "column": 16,
    "line": 19
  },
  "analyzedAt": "2026-09-01T16:59:51.557Z"
}
```

---

## Annexe F : Plan de réparation (extrait)

Le plan de réparation associé au rapport de l'annexe E. Il dérive du type d'échec et de la cause racine, propose des actions ciblées et indique si la correction est automatique ou si elle exige une revue humaine. Le fichier complet est conservé dans `backend/repair-reports/connexion-r-ussie-avec-des-identifiants-valides.json`.

```json
{
  "scenario": "Connexion réussie avec des identifiants valides",
  "failureType": "authentication_failure",
  "rootCause": "bad_test_data",
  "repairType": "ensure_credentials",
  "target": "Credentials",
  "confidence": 0.47,
  "repairable": false,
  "requiresHumanReview": true,
  "actions": [
    {
      "action": "Provide valid credentials (e.g. via the --credentials flag / environment) and re-run.",
      "file": "C:\\Users\\ahmed\\...\\tests\\generated\\connexion-r-ussie-avec-des-identifiants-valides.spec.ts",
      "line": 19
    }
  ],
  "explanation": [
    "Authentication did not succeed (401/403 or still on the login page).",
    "Credentials cannot be invented deterministically — valid ones must be supplied."
  ]
}
```

---

## Annexe G : Journal de réparation (extrait)

Chaque tentative de réparation est consignée dans `repair-history/`. L'extrait ci-dessous est une entrée réelle du journal : le fichier de l'essai porte l'identifiant du scénario et l'indice de l'essai, tandis que `history.json` accumule l'ensemble des écritures. Le fichier présenté est `backend/repair-history/affichage-du-bouton-d-achat-attempt-1.json`.

```json
{
  "scenario": "Affichage du bouton d'achat",
  "failureType": "visibility_issue",
  "repairType": "add_visibility_guard",
  "attempt": 1,
  "result": "failed",
  "repairedFile": "C:\\Users\\ahmed\\...\\tests\\generated\\affichage-du-bouton-d-achat.spec.ts",
  "location": {
    "file": "C:\\Users\\ahmed\\...\\tests\\generated\\affichage-du-bouton-d-achat.spec.ts",
    "line": 11
  },
  "appliedAt": "2026-08-30T23:34:01.964Z",
  "reason": "Patch not applied: Patch produced no changes (already applied or no-op).. Original version restored and escalated."
}
```

---

*Liste des tableaux : aucune.*

*Liste des figures : aucune.*