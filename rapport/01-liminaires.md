# Pages liminaires

## Page de garde

**République Tunisienne**

**Ministère de l'Enseignement Supérieur et de la Recherche Scientifique**

**ESPRIT — École Supérieure Privée d'Ingénierie et de Technologies**

**Département Génie Informatique**

---

**Étudiant :** Ahmed Moetaz Talmoudi

**Encadrante professionnelle :** Zakia Hidouri, Senior QA | People Manager — Capgemini Engineering

**Sujet de stage :**

**Développement d'une solution basée sur l'intelligence artificielle pour la génération automatique de cas de tests et de scripts d'automatisation à partir des user stories Jira**

---

**Période du stage :** du 06 juillet 2026 au 06 septembre 2026

**Année universitaire :** `[À COMPLÉTER]`

**Date de soutenance :** `[À COMPLÉTER]`

---

## Remerciements

Ce travail est l'aboutissement d'un stage de deux mois au sein de Capgemini Engineering, dans le domaine de la qualité logicielle. Je tiens à exprimer ma gratitude aux personnes qui ont rendu cette expérience formatrice possible et l'ont accompagnée tout au long de son déroulement.

Je remercie chaleureusement mon encadrante, Madame Zakia Hidouri, Senior QA | People Manager, pour le cadrage rigoureux du sujet, la précision de ses retours et la confiance qu'elle m'a accordée. Ses orientations m'ont permis de distinguer, dans ce travail, ce qui relève de la construction du système de ce qui relève de sa validation honnête.

Je remercie également l'équipe qualité dans laquelle j'ai été intégré, pour son accueil et pour les échanges qui ont nourri ma compréhension des pratiques de test en environnement agile.

J'adresse enfin mes remerciements à l'École Supérieure Privée d'Ingénierie et de Technologies (ESPRIT) et à son corps enseignant, pour la formation qui m'a préparé à aborder les problèmes d'ingénierie abordés dans ce rapport.

---

## Résumé

Le test d'acceptation automatisé se heurte à un coût de traduction : chaque user story doit être transformée manuellement en cas de test, puis en script d'automatisation, puis maintenue lorsque l'interface cible évolue. Ce stage propose une solution qui prend en charge ces trois opérations. Le système développé, nommé QA Testing Agent, extrait les tickets Jira, convertit leur description au format Atlassian Document Format, génère des scénarios Gherkin à partir des critères d'acceptation, explore le site cible pour construire une base de sélecteurs, produit des scripts Playwright exécutables et les exécute. Lorsqu'un test échoue, un moteur déterministe classe l'échec, en déduit une cause racine et propose une correction ; en mode ligne de commande, il applique la correction, la relance et consigne chaque tentative dans un journal, jusqu'à trois relances. Trois campagnes de validation ont été menées : elles établissent que la chaîne fonctionne de bout en bout, que les diagnostics d'échec sont exploitables et que la boucle de réparation reste bornée. Les limites tiennent au périmètre d'étude — un seul site — et à l'usage de comptes gratuits de modèles de langage.

**Mots-clés :** qualité logicielle, génération automatique de tests, Gherkin, Playwright, Jira, intelligence artificielle, modèles de langage.

---

## Abstract

Automated acceptance testing faces a translation cost: every user story must be turned manually into test cases, then into automation scripts, then maintained when the target interface changes. This internship addresses all three operations. The system, named QA Testing Agent, fetches Jira tickets, converts their description from the Atlassian Document Format, generates Gherkin scenarios from the acceptance criteria, explores the target site to build a selector base, produces executable Playwright scripts and runs them. When a test fails, a deterministic engine classifies the failure, infers a root cause and proposes a repair; in command-line mode it applies the repair, re-runs the test and records every attempt in a journal, up to three re-runs. Three validation campaigns establish that the chain works end to end, that failure diagnostics are actionable and that the repair loop remains bounded. The limitations concern the study perimeter, a single site, and the use of free large-language-model accounts.

**Keywords:** software quality, automated test generation, Gherkin, Playwright, Jira, artificial intelligence, large language models.

---

## Liste des abréviations

- **ADF** — Atlassian Document Format, format structurel des descriptions de tickets Jira.
- **API** — Application Programming Interface, interface de programmation applicative.
- **CLI** — Command-Line Interface, interface en ligne de commande.
- **EF** — Exigence fonctionnelle (identifiants EF1 à EF12).
- **HTML** — HyperText Markup Language.
- **HTTP** — Hypertext Transfer Protocol.
- **JSON** — JavaScript Object Notation.
- **JQL** — Jira Query Language, langage de requête de Jira.
- **LLM** — Large Language Model, modèle de langage.
- **QA** — Quality Assurance, assurance qualité.
- **REST** — Representational State Transfer.
- **SSE** — Server-Sent Events.
- **UI** — User Interface, interface utilisateur.
- **URL** — Uniform Resource Locator.
- **WebSocket** — protocole de communication bidirectionnelle.

---

## Table des matières

Pages liminaires.

Chapitre 1. Introduction générale.

1.1 Contexte du stage.
1.2 Problématique.
1.3 Objectifs et périmètre du travail.
1.4 Démarche et méthodologie.
1.5 Structure du rapport.

Chapitre 2. Analyse des besoins et spécifications.

2.1 Analyse de l'existant.
2.2 Acteurs du système.
2.3 Exigences fonctionnelles.
2.4 Exigences non fonctionnelles.
2.5 Périmètre et conventions.

Chapitre 3. Architecture et conception.

3.1 Architecture globale.
3.2 Choix technologiques et justification.
3.3 Modèle de données.
3.4 Conception de l'interaction principale.
3.5 Conception de l'interface web.

Chapitre 4. Réalisation et implémentation.

4.1 Environnement d'exécution.
4.2 Module d'ingestion Jira et conversion ADF.
4.3 Module de génération Gherkin.
4.4 Module de compréhension du site et base de sélecteurs.
4.5 Module de génération des tests Playwright.
4.6 Module d'exécution.
4.7 Module d'analyse des échecs.
4.8 Module de réparation et auto-réparation.
4.9 Serveur API.
4.10 Interface web.
4.11 Fiabilité des appels aux modèles de langage.

Chapitre 5. Tests, validation et résultats.

5.1 Démarche de validation.
5.2 Vérifications statiques.
5.3 Résultats des campagnes.
5.4 Analyse des résultats.
5.5 Limites constatées.

Chapitre 6. Conclusion générale et perspectives.

Bibliographie et annexes.

> La numérotation des pages est générée par le traitement de texte lors de l'assemblage final du document.

---

## Liste des figures

- **Fig 3.1** Architecture globale du pipeline.
- **Fig 3.2** Modèle de données du pipeline.
- **Fig 3.3** Séquence d'une exécution complète.
- **Fig 4.1** Boucle de réparation automatique.
- **Fig 4.2** Flux de génération Gherkin.

---

## Liste des tableaux

- **Tab 2.1** Extensions livrées au-delà du besoin initial.
- **Tab 2.2** Acteurs du système.
- **Tab 2.3** Exigences fonctionnelles.
- **Tab 2.4** Exigences non fonctionnelles.
- **Tab 3.1** Comparaison des deux modes d'exécution.
- **Tab 3.2** Les huit étapes du pipeline.
- **Tab 3.3** Technologies retenues et versions.
- **Tab 3.4** Valeurs par défaut des modèles de langage.
- **Tab 3.5** Comparaison des options d'architecture.
- **Tab 3.6** Structures de données intermédiaires.
- **Tab 3.7** Routes de l'interface web.
- **Tab 4.1** Variables d'environnement par catégorie.
- **Tab 4.2** Points d'entrée du serveur API.
- **Tab 5.1** Vérifications statiques et résultats.
- **Tab 5.2** Tests vérifiables de la campagne de démonstration.
- **Tab 5.3** Artefacts produits par les campagnes.

---

*Prochaine section : chapitre 1 - Introduction générale.*