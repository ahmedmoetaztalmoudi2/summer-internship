Fonctionnalite: Connexion utilisateur

  Contexte:
    Étant donné que l'utilisateur est sur la page de connexion

  Scenario: Connexion réussie avec des identifiants valides
    Étant donné que l'utilisateur saisit une adresse email valide dans le champ email
    Et que l'utilisateur saisit un mot de passe valide dans le champ mot de passe
    Lorsque l'utilisateur soumet le formulaire de connexion
    Alors l'utilisateur devrait être redirigé vers son tableau de bord

  Scenario Outline: Connexion échouée avec mot de passe incorrect
    Étant donné que l'utilisateur saisit "<email>" dans le champ email
    Et que l'utilisateur saisit "<mot de passe>" dans le champ mot de passe
    Lorsque l'utilisateur soumet le formulaire de connexion
    Alors un message d'erreur "Nom d'utilisateur ou mot de passe erroné !" devrait être affiché

    Exemples:
      | email               | mot de passe   |
      | user@example.com    | mauvaisMotDePasse |
      | autre@exemple.com   | mauvaisPass123 |

  Scenario Outline: Connexion échouée avec email non enregistré
    Étant donné que l'utilisateur saisit "<email>" dans le champ email
    Et que l'utilisateur saisit "<mot de passe>" dans le champ mot de passe
    Lorsque l'utilisateur soumet le formulaire de connexion
    Alors un message d'erreur "Nom d'utilisateur ou mot de passe erroné !" devrait être affiché

    Exemples:
      | email               | mot de passe   |
      | inconnu@domain.com  | quelconqueMotDePasse |
      | pasinscrit@test.com | MotDePasseValide |