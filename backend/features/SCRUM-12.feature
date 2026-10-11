Feature: Détails d'un événement

      Scenario: Ouverture de la fiche détaillée depuis la carte d'événement
        Given l'utilisateur est sur la page listant les événements
        When l'utilisateur clique sur la carte d'un événement
        Then la fiche détaillée de l'événement s'ouvre

      Scenario: Affichage des informations de base de l'événement
        Given l'utilisateur est sur la fiche détaillée d'un événement
        Then le titre de l'événement est affiché
        And la date de l'événement est affichée
        And l'heure de l'événement est affichée
        And le lieu (salle) de l'événement est affiché

      Scenario: Affichage des prix par catégorie de billet
        Given l'utilisateur est sur la fiche détaillée d'un événement
        Then les catégories de billets sont visibles
        And le prix de chaque catégorie en TND est affiché

      Scenario: Présence du bouton Ajouter au panier
        Given l'utilisateur est sur la fiche détaillée d'un événement
        Then le bouton « Ajouter au panier » est visible et mis en évidence