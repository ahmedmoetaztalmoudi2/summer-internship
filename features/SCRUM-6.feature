Fonctionnalite: Filtre d'événements

  Scenario: Sélection d'une catégorie d'événements
    Given une liste d'événements est affichée
    When l'utilisateur sélectionne une catégorie "Festivals"
    Then seuls les événements de la catégorie "Festivals" sont affichés

  Scenario: Sélection d'une ville pour les événements
    Given une liste d'événements est affichée
    When l'utilisateur sélectionne une ville "Tunis"
    Then la liste des événements est filtrée pour ne montrer que les événements à "Tunis"

  Scenario Outline: Filtre d'événements par catégorie et ville
    Given une liste d'événements est affichée
    When l'utilisateur sélectionne une catégorie "<categorie>"
    And l'utilisateur sélectionne une ville "<ville>"
    Then la liste des événements est filtrée pour ne montrer que les événements de la catégorie "<categorie>" à "<ville>"

    Examples:
      | categorie | ville   |
      | Festivals | Tunis   |
      | Sport     | Sousse  |

  Scenario: Aucun événement ne correspond aux filtres
    Given une liste d'événements est affichée
    When l'utilisateur sélectionne une catégorie "Théâtre"
    And l'utilisateur sélectionne une ville "Monastir"
    And aucun événement ne correspond à ces filtres
    Then le message "Aucun événement disponible pour ces critères" est affiché

  Scenario Outline: Filtre d'événements avec plusieurs combinaisons de catégorie et ville
    Given une liste d'événements est affichée
    When l'utilisateur sélectionne une catégorie "<categorie>"
    And l'utilisateur sélectionne une ville "<ville>"
    Then la liste des événements est filtrée pour ne montrer que les événements de la catégorie "<categorie>" à "<ville>"
    And si aucun événement ne correspond à ces filtres, le message "Aucun événement disponible pour ces critères" est affiché

    Examples:
      | categorie | ville   |
      | Festivals | Tunis   |
      | Sport     | Sousse  |
      | Théâtre   | Monastir|