Fonctionnalite: Réinitialisation du mot de passe

  Scenario: Demander un lien de réinitialisation avec un email valide
    Given l'utilisateur est sur la page de connexion
    When l'utilisateur entre un email valide
    And l'utilisateur soumet le formulaire de réinitialisation
    Then un message générique devrait être affiché

  Scenario: Demander un lien de réinitialisation avec un email non enregistré
    Given l'utilisateur est sur la page de connexion
    When l'utilisateur entre un email non enregistré
    And l'utilisateur soumet le formulaire de réinitialisation
    Then un message générique devrait être affiché

  Scenario Outline: Nouveau mot de passe avec une politique minimale
    Given l'utilisateur est sur la page de réinitialisation du mot de passe
    When l'utilisateur entre "<password>"
    And l'utilisateur soumet le formulaire de réinitialisation
    Then un message d'erreur devrait être affiché si le mot de passe est invalide

    Examples:
      | password    |
      | azerty      | 
      | 1234567     | 
      | azerty1     | 

  Scenario: Nouveau mot de passe valide
    Given l'utilisateur est sur la page de réinitialisation du mot de passe
    When l'utilisateur entre un mot de passe avec au moins 8 caractères et 1 chiffre
    And l'utilisateur soumet le formulaire de réinitialisation
    Then l'utilisateur devrait être redirigé