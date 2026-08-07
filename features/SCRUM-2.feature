Fonctionnalite: Réinitialisation du mot de passe

  Background:
    Given l'utilisateur est sur la page de connexion

  Scenario: Réinitialisation du mot de passe avec un email valide
    Given l'utilisateur entre un email valide "user@example.com" enregistré dans le système
    When l'utilisateur demande un lien de réinitialisation
    Then un email contenant un lien de réinitialisation unique devrait être envoyé à l'utilisateur dans les 2 minutes
    And l'utilisateur devrait recevoir un message de confirmation de l'envoi du lien de réinitialisation

  Scenario: Réinitialisation du mot de passe avec un email non enregistré
    Given l'utilisateur entre un email non enregistré "unknown@example.com"
    When l'utilisateur demande un lien de réinitialisation
    Then un message générique devrait être affiché sans confirmer ni infirmer l'existence de l'email
    And aucun email ne devrait être envoyé à l'utilisateur

  Scenario: Expiration du lien de réinitialisation
    Given l'utilisateur a reçu un lien de réinitialisation il y a 24 heures
    When l'utilisateur tente d'utiliser le lien de réinitialisation
    Then le lien de réinitialisation devrait être expiré
    And un message d'erreur "Lien de réinitialisation expiré" devrait être affiché

  Scenario: Réutilisation d'un lien de réinitialisation
    Given l'utilisateur a déjà utilisé un lien de réinitialisation
    When l'utilisateur tente de réutiliser le même lien de réinitialisation
    Then le lien de réinitialisation devrait être invalide
    And un message d'erreur "Lien de réinitialisation déjà utilisé" devrait être affiché

  Scenario Outline: Définition d'un nouveau mot de passe
    Given l'utilisateur a reçu un lien de réinitialisation valide
    When l'utilisateur entre un nouveau mot de passe "<password>"
    Then le système devrait "<resultat>"

    Examples:
      | password      | resultat                                    |
      | azerty        | afficher un message d'erreur "Mot de passe trop court" |
      | azerty123     | permettre la réinitialisation du mot de passe      |
      | azerty123!a   | permettre la réinitialisation du mot de passe      |
      | 12345678      | afficher un message d'erreur "Mot de passe doit contenir au moins une lettre" |