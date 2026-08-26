Feature: Authentification utilisateur

      Background:
        Etant donné que l'utilisateur est sur la page de connexion

      Scenario: Connexion réussie avec des identifiants valides
        Quand l'utilisateur saisit "mellitisaba@gmail.com" dans le champ email
        Et l'utilisateur saisit "123456789" dans le champ mot de passe
        Et l'utilisateur clique sur "Se connecter"
        Alors l'utilisateur doit être redirigé vers la page d'accueil

      Scenario: Connexion échouée avec un mot de passe incorrect
        Quand l'utilisateur saisit "mellitisaba@gmail.com" dans le champ email
        Et l'utilisateur saisit "MotDePasseIncorrect" dans le champ mot de passe
        Et l'utilisateur clique sur "Se connecter"
        Alors le message d'erreur "Nom d'utilisateur ou mot de passe erroné !" doit s'afficher

      Scenario: Connexion échouée avec un email non enregistré
        Quand l'utilisateur saisit "email.non.existant@example.com" dans le champ email
        Et l'utilisateur saisit "N'importeQuelMotDePasse" dans le champ mot de passe
        Et l'utilisateur clique sur "Se connecter"
        Alors le message d'erreur "Nom d'utilisateur ou mot de passe erroné !" doit s'afficher

    *Check:* Looks good. Matches all rules.

    *Final Polish:* Ensure indentation is standard (2 spaces). Ensure no markdown blocks.

    *Result:*
    Feature: Authentification utilisateur

      Background:
        Etant donné que l'utilisateur est sur la page de connexion

      Scenario: Connexion réussie avec des identifiants valides
        Quand l'utilisateur saisit "mellitisaba@gmail.com" dans le champ email
        Et l'utilisateur saisit "123456789" dans le champ mot de passe
        Et l'utilisateur clique sur "Se connecter"
        Alors l'utilisateur doit être redirigé vers la page d'accueil

      Scenario: Connexion échouée avec un mot de passe incorrect
        Quand l'utilisateur saisit "mellitisaba@gmail.com" dans le champ email
        Et l'utilisateur saisit "MotDePasseIncorrect" dans le champ mot de passe
        Et l'utilisateur clique sur "Se connecter"
        Alors le message d'erreur "Nom d'utilisateur ou mot de passe erroné !" doit s'afficher

      Scenario: Connexion échouée avec un email non enregistré
        Quand l'utilisateur saisit "email.non.existant@example.com" dans le champ email
        Et l'utilisateur saisit "N'importeQuelMotDePasse" dans le champ mot de passe
        Et l'utilisateur clique sur "Se connecter"
        Alors le message d'erreur "Nom d'utilisateur ou mot de passe erroné !" doit s'afficher

    *Wait, one detail:* The prompt says "Output raw Gherkin only.