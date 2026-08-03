Fonctionnalite: Envoi d'email de confirmation de commande

  Scenario: Envoi d'email de confirmation après validation du paiement
    Given le paiement a été validé
    When l'email de confirmation est généré
    Then l'email est envoyé à l'adresse associée au compte dans les 5 minutes
    And l'email contient le numéro de commande
    And l'email contient la liste des articles
    And l'email contient le montant total

  Scenario Outline: Contenu de l'email de confirmation
    Given le paiement a été validé pour la commande "<commande>"
    When l'email de confirmation est généré
    Then l'email contient le numéro de commande "<num_commande>"
    And l'email contient la liste des articles "<liste_articles>"
    And l'email contient le montant total "<montant_total>"

    Examples:
      | commande | num_commande | liste_articles | montant_total |
      | commande1 | 12345       | article1, article2 | 100.00      |
      | commande2 | 67890       | article3, article4 | 200.00      |

  Scenario: Nouvelle tentative d'envoi en cas d'échec
    Given l'envoi de l'email de confirmation a échoué
    When 10 minutes se sont écoulées
    Then une nouvelle tentative d'envoi est effectuée

  Scenario: Envoi unique d'email par commande
    Given l'email de confirmation a déjà été envoyé pour la commande
    When la page est rechargée
    Then aucun email de confirmation supplémentaire n'est envoyé