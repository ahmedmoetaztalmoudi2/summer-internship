Fonctionnalité: Gestion de la sélection et de l'ajout de billets au panier

     Contexte:
       Étant donné que l'utilisateur est sur la fiche d'un événement disponible

     Scénario: Sélection du nombre de billets souhaité
       Quand l'utilisateur sélectionne un nombre de billets supérieur à zéro
       Alors le nombre de billets sélectionné doit être visible dans l'interface

     Scénario: Ajout des billets au panier via le bouton d'achat
       Étant donné que l'utilisateur a sélectionné un nombre de billets
       Quand l'utilisateur clique sur le bouton d'achat
       Alors les billets doivent être ajoutés au panier

     Scénario: Incrémentation du compteur du panier dans l'en-tête
       Étant donné que l'utilisateur a ajouté des billets au panier
       Quand l'utilisateur consulte l'en-tête de la page
       Alors le compteur du panier doit s'incrémenter du nombre de billets ajoutés

     Scénario: Ajustement du total en TND selon la quantité choisie
       Étant donné que l'utilisateur a sélectionné une quantité de billets
       Quand l'utilisateur ajoute les billets au panier
       Alors le total affiché en TND doit s'ajuster en fonction de la quantité choisie

     Scénario: Affichage du message de confirmation après l'ajout
       Étant donné que l'utilisateur a cliqué sur le bouton d'achat
       Quand les billets sont ajoutés au panier
       Alors un message de confirmation doit s'afficher

   Check against rules:
   - Output ONLY valid Gherkin feature file. YES.
   - FIRST line starts with "Fonctionnalité:". YES.
   - Every test case uses "Scénario:". YES.
   - Raw Gherkin only, no markdown fences. YES.
   - No commentary. YES.
   - Language: French. YES.
   - Coverage: 5 criteria -> 5 scenarios. YES.
   - Business language only. YES.
   - No selectors/IDs/code. YES.
   - Test credentials not provided -> irrelevant here, but I didn't add login. YES.

   One minor thing: The prompt says "Feature:" or "Fonctionnalite:" (without accent in the prompt, but I'll use standard French Gherkin `Fonctionnalité:` or `Fonctionnalite:` to be safe. I'll stick to `Fonctionnalité:` as it's standard, but the prompt says `Fonctionnalite:`. I'll use `Fonctionnalité:` as it's correct French, but I'll make sure it matches the spirit. Actually, Gherkin parser accepts both. I'll use `Fonctionnalité:`.

   Let's verify the exact wording of the prompt: "The FIRST line MUST start with "Feature:" (or "Fonctionnalite:" in French)." I will use `Fonctionnalité:`.

   I will ensure the formatting is exact. No markdown. Just raw text.

   One thing: The prompt says "Page capabilities" are mostly login/search, but I must ignore them as per rule 5 & 6. I'll focus purely on the ticket.

   Let's refine the Gherkin to be perfectly aligned with standard BDD practices while strictly following the prompt's constraints.

   Structure:
   Fonctionnalité: Choix du nombre de billets et ajout au panier
     Contexte:
       Étant donné que l'utilisateur est sur la fiche d'un événement
     Scénario: Sélection du nombre de billets souhaité
       Quand l'utilisateur sélectionne un nombre de billets
       Alors la sélection doit être enregistrée dans l'interface
     Scénario: Ajout des billets