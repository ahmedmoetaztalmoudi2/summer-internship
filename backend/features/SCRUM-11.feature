Fonctionnalite: Consultation des guichets physiques

  Scenario: Affichage de la liste des guichets physiques
    Given l'utilisateur est sur la page "Nos guichets"
    Then la liste des points de vente doit être affichée

  Scenario: Filtre des guichets physiques par gouvernorat/ville
    Given l'utilisateur est sur la page "Nos guichets"
    When l'utilisateur sélectionne un gouvernorat/ville
    Then la liste des points de vente doit être filtrée en fonction du gouvernorat/ville sélectionné

  Scenario: Affichage des informations de chaque point de vente
    Given l'utilisateur est sur la page "Nos guichets"
    Then chaque point de vente doit afficher les informations suivantes : Nom, Adresse complète, Horaires d'ouverture et numéro de téléphone

  Scenario: Géolocalisation d'un guichet physique
    Given l'utilisateur est sur la page "Nos guichets"
    When l'utilisateur clique sur le lien Google Maps
    Then le guichet le plus proche doit être géolocalisé