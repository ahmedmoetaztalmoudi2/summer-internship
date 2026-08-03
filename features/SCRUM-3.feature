Fonctionnalite: Recherche de produits

  Background:
    Given l'utilisateur est sur la page d'accueil

  Scenario: Recherche d'un mot-clé existant
    Given l'utilisateur saisit un mot-clé "Chaussure" dans la barre de recherche
    When l'utilisateur valide la recherche
    Then seuls les produits correspondants au mot-clé "Chaussure" sont affichés

  Scenario Outline: Recherche insensible à la casse
    Given l'utilisateur saisit un mot-clé "<mot_clé>" dans la barre de recherche
    When l'utilisateur valide la recherche
    Then les résultats de la recherche correspondent aux produits contenant "<mot_clé>" ou "<mot_clé_minuscule>"

    Examples:
      | mot_clé    | mot_clé_minuscule |
      | Chaussure | chaussure         |
      | CHAUSSURE | chaussure         |

  Scenario: Recherche sans résultat
    Given l'utilisateur saisit un mot-clé "ProduitInexistant" dans la barre de recherche
    When l'utilisateur valide la recherche
    Then un message "Aucun résultat trouvé" est affiché
    And une suggestion est proposée à l'utilisateur

  Scenario: Temps de chargement des résultats
    Given l'utilisateur saisit un mot-clé "Chaussure" dans la barre de recherche
    When l'utilisateur valide la recherche
    Then les résultats de la recherche sont affichés en moins de 2 secondes

  Scenario: Champ de recherche vide
    Given l'utilisateur laisse le champ de recherche vide
    When l'utilisateur valide la recherche
    Then l'ensemble du catalogue est affiché par défaut

  Scenario Outline: Recherche avec fautes mineures
    Given l'utilisateur saisit un mot-clé "<mot_clé>" avec une faute mineure "<faute_minure>" dans la barre de recherche
    When l'utilisateur valide la recherche
    Then les résultats de la recherche correspondent aux produits contenant "<mot_clé>"

    Examples:
      | mot_clé    | faute_minure |
      | Chaussure | Chausure     |
      | Chaussure | Chaussur     |