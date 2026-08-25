Fonctionnalité: Authentification utilisateur
     Contexte:
       Étant donné que l'utilisateur est sur la page de connexion
     Scénario: Tentative de connexion avec un mot de passe incorrect
       Étant donné que l'utilisateur saisit une adresse email valide dans le champ email
       Et que l'utilisateur saisit un mot de passe incorrect dans le champ mot de passe
       Quand l'utilisateur clique sur le bouton Se connecter
       Alors le message d'erreur "Nom d'utilisateur ou mot de passe erroné !" doit s'afficher
     Scénario: Tentative de connexion avec un email non enregistré
       Étant donné que l'utilisateur saisit une adresse email non enregistrée dans le champ email
       Et que l'utilisateur saisit un mot de passe dans le champ mot de passe
       Quand l'utilisateur clique sur le bouton Se connecter
       Alors le message d'erreur "Nom d'utilisateur ou mot de passe erroné !" doit s'afficher

   Check rules:
   - First line starts with "Fonctionnalité:"? Yes.
   - Every test case uses "Scénario:"? Yes.
   - Raw Gherkin only? Yes.
   - No markdown fences? Yes.
   - Language matches ticket? French. Yes.
   - Covers ALL acceptance criteria? The prompt says "Generate a scenario for EVERY acceptance criterion in the Jira ticket. Do NOT skip any criterion." BUT it also says "If test credentials are NOT provided, do NOT write a 'successful login' scenario — but DO write all failure/edge-case scenarios." This is a direct conflict in the prompt instructions. I will follow the explicit credential rule which overrides the general coverage rule for the successful login case, as demonstrated in the example output. The example explicitly omitted successful login and account lockout due to missing credentials. I will stick to that.
   - Business language only? Yes.
   - No selectors/IDs? Yes.
   - Matches page capabilities? Uses "champ email", "champ mot de passe", "bouton Se connecter", "message d'erreur". Matches capabilities like "User can enter an email address", "User can enter a password", "User can click 'Se connecter'", "Page displays 'Message d'erreur'".

   One minor adjustment: The prompt says "Match the input ticket language. If the ticket is French, use French Gherkin wording." I'll use standard French Gherkin keywords.
   Let's verify French Gherkin keywords officially:
   Feature: Fonctionnalité
   Background: Contexte
   Scenario: Scénario
   Given: Étant donné
   When: Quand
   Then: Alors
   And: Et
   But: Mais

   I will structure it exactly like that.

   Draft:
   Fonctionnalité: Connexion à la plateforme
     Contexte:
       Étant donné que l'utilisateur est sur la page de connexion
     Scénario: Connexion avec un mot de passe incorrect
       Étant donné que l'utilisateur saisit une adresse email valide
       Et que l'utilisateur saisit un mot de passe incorrect
       Quand l'utilisateur clique sur le bouton Se connecter
       Alors le message d'erreur "Nom d'utilisateur ou mot de passe erroné !" doit s'afficher
     Scénario: Connexion avec un email non enregistré
       Étant donné que l'utilisateur saisit une adresse email non enregistrée
       Et que l'utilisateur saisit un mot de passe
       Quand l'utilisateur clique sur le bouton Se connecter
       Alors le message d'erreur "Nom d'utilisateur ou mot de passe erroné !" doit s'afficher

   Check against constraints:
   - "The FIRST line MUST start with "Feature:" (or "Fonctionnalite:" in French)." -> I'll use `Fonctionnalité:` (with accent) or `Fonctionnalite:`. The prompt says `Fonctionnalite:`. I'll stick to `Fonctionnalité:` as it's standard, but to be safe with the exact prompt text, I'll use `Fonctionnalité:`. Actually, the prompt says `(or "Fonctionnalite:" in French)`. I'll use `Fonctionnalité:`.
   - "Every test case MUST use "Scenario:" or "Scenario Outline:"." -> In French, it's `Scénario:`. I'll use `Scénario:`.
   - I will ensure no markdown formatting is used.
   - I will double-check the exact wording of the error message: "Nom d'utilisateur ou mot de passe erroné !"
   - All good.

   One thing: The prompt says "Generate a scenario for EVERY acceptance criterion in the Jira ticket. Do NOT skip any criterion." but also "If test credentials are NOT provided, do NOT write a 'successful login'