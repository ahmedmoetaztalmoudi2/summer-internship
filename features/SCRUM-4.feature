Feature: -> Fonctionnalité: (or Feature: is fine, but prompt says "Fonctionnalite:" in French)
   Background: -> Contexte:
   Given: -> Etant donné que
   When: -> Quand
   Then: -> Alors
   And: -> Et

   I will use standard French Gherkin keywords.
   Let's draft carefully.

   Feature: Gestion de la sélection et de l'ajout de billets au panier
     Contexte:
       Etant donné que l'utilisateur est sur la fiche d'un événement

     Scenario: Sélection du nombre de billets souhaité
       Quand l'utilisateur sélectionne un nombre de billets supérieur à zéro
       Alors le sélecteur de quantité doit refléter le nombre choisi

     Scenario: Ajout des billets au panier via le bouton d'achat
       Etant donné que l'utilisateur a sélectionné un nombre de billets
       Quand l'utilisateur clique sur le bouton d'achat
       Alors les billets doivent être ajoutés au panier

     Scenario: Incrémentation du compteur du panier dans l'en-tête
       Etant donné que le panier est actuellement vide
       Et que l'utilisateur a sélectionné 3 billets
       Quand l'utilisateur clique sur le bouton d'achat
       Alors le compteur du panier dans l'en-tête doit s'incrémenter de 3

     Scenario: Ajustement du total en TND selon la quantité
       Etant donné que le prix unitaire du billet est de 50 TND
       Et que l'utilisateur a sélectionné 2 billets
       Quand l'utilisateur clique sur le bouton d'achat
       Alors le total affiché doit s'ajuster à 100 TND

     Scenario: Affichage du message de confirmation après l'ajout
       Etant donné que l'utilisateur a sélectionné un nombre de billets
       Quand l'utilisateur clique sur le bouton d'achat
       Alors un message de confirmation doit s'afficher

   Check against rules:
   - Output ONLY valid Gherkin feature file.
   - FIRST line MUST start with "Feature:" or "Fonctionnalite:". I'll use "Fonctionnalité:" (or "Feature:" as allowed). I'll stick to "Feature:" to be safe, or "Fonctionnalité:" since it's French. The prompt says "Feature:" (or "Fonctionnalite:" in French). I'll use "Fonctionnalité:".
   - Every test case MUST use "Scenario:" or "Scenario Outline:".
   - Output raw Gherkin only. No markdown fences.
   - No CSS, XPath, etc.
   - Match input language: French.
   - Generate a scenario for EVERY acceptance criterion: 5 criteria -> 5 scenarios. Checked.
   - Business-level language only. Checked.
   - No test credentials provided -> irrelevant here, but I didn't add login. Checked.
   - Cover happy path, edge cases, etc. The criteria are all happy path/validation. I'll stick to them.

   One minor adjustment: The prompt says "Feature:" or "Fonctionnalite:". I will use "Fonctionnalité:".
   I will ensure the formatting is exact.
   Let's verify the French keywords are standard:
   Fonctionnalité:
   Contexte:
   Etant donné que
   Quand
   Alors
   Et
   Scenario:

   All good.
   I will produce the raw text now.
   Wait, should I combine them into a single scenario that covers all criteria? The prompt says "Generate a scenario for EVERY acceptance criterion. Do NOT skip any criterion. If the Jira ticket lists 5 acceptance criteria, you MUST produce at