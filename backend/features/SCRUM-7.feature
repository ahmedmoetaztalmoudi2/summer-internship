Fonctionnalite: Application d'un code promo

  Background:
    Given le client est sur la page de son panier

  Scenario: Application d'un code promo valide
    Given le client saisit un code promo "PROMO20"
    When le client valide le code promo
    Then le montant total du panier est réduit de 20%
    And le nouveau montant total est affiché

  Scenario: Erreur avec un code promo invalide ou expiré
    Given le client saisit un code promo "INVALID"
    When le client valide le code promo
    Then un message d'erreur "Code promo invalide ou expiré" est affiché

  Scenario: Suppression du code promo
    Given le client a appliqué un code promo "PROMO20"
    And le montant total du panier a été réduit
    When le client supprime le code promo
    Then le prix est réinitialisé au montant initial
    And le montant total initial est affiché

  Scenario Outline: Application de différents codes promo
    Given le client saisit un code promo "<code_promo>"
    When le client valide le code promo
    Then le montant total du panier est réduit de "<reduction>"%
    And le nouveau montant total est affiché

    Examples:
      | code_promo | reduction |
      | PROMO10   | 10        |
      | PROMO20   | 20        |
      | PROMO30   | 30        |

  Scenario Outline: Erreur avec des codes promo invalides ou expirés
    Given le client saisit un code promo "<code_promo>"
    When le client valide le code promo
    Then un message d'erreur "Code promo invalide ou expiré" est affiché

    Examples:
      | code_promo |
      | INVALID    |
      | EXPIRE      |
      | FAUX        |