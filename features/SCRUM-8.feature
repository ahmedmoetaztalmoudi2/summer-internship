Fonctionnalite: Creation de Compte

  Background:
    Given l'utilisateur est sur la page d'inscription

  Scenario: Creation de compte avec email et mot de passe valides
    Given l'utilisateur entre un email valide "user@example.com"
    And l'utilisateur entre un mot de passe valide "Secret123!"
    When l'utilisateur soumet le formulaire d'inscription
    Then l'utilisateur devrait être redirigé vers la page de profil
    And un message de bienvenue devrait être affiché

  Scenario: Creation de compte avec email déjà existant
    Given l'utilisateur entre un email déjà existant "existinguser@example.com"
    And l'utilisateur entre un mot de passe valide "Secret123!"
    When l'utilisateur soumet le formulaire d'inscription
    Then un message d'erreur "Un compte existe déjà avec cet email" devrait être affiché

  Scenario Outline: Creation de compte avec mot de passe invalide
    Given l'utilisateur entre un email valide "user@example.com"
    And l'utilisateur entre un mot de passe "<password>"
    When l'utilisateur soumet le formulaire d'inscription
    Then un message d'erreur "<error_message>" devrait être affiché

    Examples:
      | password | error_message                           |
      | pass     | Le mot de passe doit contenir au moins 8 caractères |
      | abcdefg  | Le mot de passe doit contenir au moins 8 caractères |