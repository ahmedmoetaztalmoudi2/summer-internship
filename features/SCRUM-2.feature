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

  Scenario Outline: Expiration du lien de réinitialisation
    Given l'utilisateur reçoit un lien de réinitialisation
    When l'utilisateur attend "<delai>" avant de cliquer sur le lien
    Then le lien de réinitialisation devrait être "<etat>"

    Examples:
      | delai      | etat       |
      | moins de 24 heures | valide     |
      | plus de 24 heures  | expiré     |

  Scenario: Réutilisation d'un lien de réinitialisation déjà utilisé
    Given l'utilisateur a déjà utilisé un lien de réinitialisation
    When l'utilisateur tente de réutiliser le même lien
    Then un message d'erreur devrait être affiché indiquant que le lien est déjà utilisé
    And la réinitialisation du mot de passe devrait échouer

  Scenario Outline: Nouveau mot de passe avec une politique minimale
    Given l'utilisateur clique sur le lien de réinitialisation
    When l'utilisateur entre un nouveau mot de passe "<mot_de_passe>"
    Then la réinitialisation du mot de passe devrait être "<resultat>"

    Examples:
      | mot_de_passe | resultat      |
      | azerty      | échouer       |
      | azerty1     | échouer       |
      | azerty12    | échouer       |
      | azerty123   | échouer       |
      | azerty1234  | échouer       |
      | azerty12345 | échouer       |
      | azerty1234a | échouer       |
      | azerty1234A | échouer       |
      | azerty1A    | réussir       |