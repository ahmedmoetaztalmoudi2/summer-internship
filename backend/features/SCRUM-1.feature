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

     Scénario: Connexion échouée avec un email non enregistré
       Étant donné que l'utilisateur saisit "email_non_existant@test.com" dans le champ email
       Et que l'utilisateur saisit "123456789" dans le champ mot de passe
       Quand l'utilisateur clique sur le bouton "Se connecter"
       Alors le message d'erreur "Nom d'utilisateur ou mot de passe erroné !" doit s'afficher