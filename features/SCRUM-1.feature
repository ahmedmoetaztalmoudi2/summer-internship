Fonctionnalite: Connexion utilisateur

  Arrière-plan:
    Étant donné que l'utilisateur est sur la page de connexion

  Scénario: Connexion avec des identifiants invalides
    Étant donné que l'utilisateur entre une adresse email
    Et que l'utilisateur entre un mot de passe
    Lorsque l'utilisateur soumet le formulaire de connexion
    Alors un message d'erreur devrait être affiché

  Scénario: Connexion avec un email non enregistré
    Étant donné que l'utilisateur entre un email non enregistré
    Et que l'utilisateur entre un mot de passe
    Lorsque l'utilisateur soumet le formulaire de connexion
    Alors un message d'erreur devrait être affiché

  Scénario: Connexion avec un mot de passe incorrect
    Étant donné que l'utilisateur entre une adresse email
    Et que l'utilisateur entre un mot de passe incorrect
    Lorsque l'utilisateur soumet le formulaire de connexion
    Alors un message d'erreur devrait être affiché

  Scénario Outline: Connexion avec des identifiants invalides multiples fois
    Étant donné que l'utilisateur entre "<email>"
    Et que l'utilisateur entre "<password>"
    Lorsque l'utilisateur soumet le formulaire de connexion
    Et que l'utilisateur répète les étapes de connexion avec des identifiants incorrects "<nbTentatives>" fois
    Alors un message d'erreur devrait être affiché

    Exemples:
      | email          | password    | nbTentatives |
      | wrong@test.com | Secret123!  | 5           |
      | user@example.com | WrongPass | 3           |