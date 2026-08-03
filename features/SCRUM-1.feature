Fonctionnalite: Connexion à la plateforme

  Background:
    Given l'utilisateur est sur la page de connexion

  Scenario: Connexion réussie avec des identifiants valides
    Given l'utilisateur saisit un email valide "utilisateur@example.com"
    And l'utilisateur saisit un mot de passe valide "Secret123!"
    When l'utilisateur soumet le formulaire de connexion
    Then l'utilisateur devrait être redirigé vers son tableau de bord

  Scenario Outline: Échec de connexion avec des identifiants invalides
    Given l'utilisateur saisit "<email>"
    And l'utilisateur saisit "<password>"
    When l'utilisateur soumet le formulaire de connexion
    Then un message d'erreur "<error_message>" devrait être affiché

    Examples:
      | email            | password   | error_message       |
      | wrong@test.com   | Secret123! | Identifiants invalides |
      | utilisateur@example.com | WrongPass  | Identifiants invalides |

  Scenario: Compte verrouillé après 5 tentatives échouées
    Given l'utilisateur a déjà échoué 4 fois à se connecter
    When l'utilisateur saisit un mot de passe incorrect pour la 5ème fois
    Then le compte devrait être verrouillé temporairement
    And un message d'erreur "Compte verrouillé pour 15 minutes" devrait être affiché

  Scenario: Affichage du mot de passe
    Given l'utilisateur est sur la page de connexion
    When l'utilisateur clique sur l'option pour afficher le mot de passe
    Then le mot de passe devrait être affiché
    When l'utilisateur clique à nouveau sur l'option pour masquer le mot de passe
    Then le mot de passe devrait être masqué à nouveau

  Scenario: Verrouillage temporaire du compte
    Given le compte a été verrouillé temporairement
    When 15 minutes se sont écoulées
    Then le compte devrait être déverrouillé automatiquement