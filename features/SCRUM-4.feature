Fonctionnalite: Ajout de produit au panier

  Background:
    Given l'utilisateur est sur la fiche produit ou la liste de résultats
    And le panier est vide

  Scenario: Ajouter un produit au panier
    Given le produit est en stock
    And la quantité disponible est de 10
    When l'utilisateur clique sur "Ajouter au panier"
    Then le compteur du panier dans l'en-tête est incrémenté de 1
    And un message de confirmation s'affiche brièvement

  Scenario: Ajouter un produit déjà dans le panier
    Given le produit est déjà dans le panier avec une quantité de 2
    And la quantité disponible est de 10
    When l'utilisateur clique sur "Ajouter au panier"
    Then la quantité du produit dans le panier est incrémentée de 1
    And le compteur du panier dans l'en-tête est incrémenté de 1
    And un message de confirmation s'affiche brièvement

  Scenario: Produit en rupture de stock
    Given le produit est en rupture de stock
    When l'utilisateur tente de cliquer sur "Ajouter au panier"
    Then le bouton "Ajouter au panier" est désactivé
    And le message "Rupture de stock" est affiché

  Scenario Outline: Quantité ajoutée ne peut pas dépasser le stock disponible
    Given le produit est en stock avec une quantité disponible de "<stock_disponible>"
    And l'utilisateur tente d'ajouter "<quantite_ajoutee>" articles au panier
    When l'utilisateur clique sur "Ajouter au panier"
    Then la quantité du produit dans le panier est de "<quantite_attendue>"
    And un message de confirmation s'affiche brièvement

    Examples:
      | stock_disponible | quantite_ajoutee | quantite_attendue |
      | 5               | 3               | 3                 |
      | 5               | 10              | 5                 |
      | 10              | 5               | 5                 |

  Scenario: Ajouter plusieurs produits au panier
    Given le produit est en stock avec une quantité disponible de 10
    When l'utilisateur clique sur "Ajouter au panier" plusieurs fois
    Then le compteur du panier dans l'en-tête est incrémenté de la quantité ajoutée
    And un message de confirmation s'affiche brièvement après chaque ajout