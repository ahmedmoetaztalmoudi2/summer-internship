Fonctionnalité: Filtrage des événements par salle et par date sur une page de catégorie

     Background:
       Given l'utilisateur est sur la page de catégorie "Spectacle"

     Scenario: Affichage du menu déroulant des salles disponibles
       Then le menu déroulant "Sélectionner une salle" doit être visible
       And il doit lister les salles disponibles telles que "El Borj GOLDEN CARTHAGE TUNIS" et "Amphithéâtre plein air Boukornine"

     Scenario: Affichage du menu déroulant des dates disponibles
       Then le menu déroulant "Sélectionner une Date" doit être visible
       And il doit lister les dates des événements disponibles telles que "30 Août 2026"

     Scenario: Filtrage des événements selon la salle et la date sélectionnées
       When l'utilisateur sélectionne une salle dans le menu déroulant
       And l'utilisateur sélectionne une date dans le menu déroulant
       And l'utilisateur clique sur le bouton "Recherche"
       Then seuls les événements correspondant à la salle et à la date sélectionnées doivent s'afficher

     Scenario: Affichage de la liste vide lorsque aucun événement ne correspond aux critères
       When l'utilisateur sélectionne une salle dans le menu déroulant
       And l'utilisateur sélectionne une date dans le menu déroulant
       And l'utilisateur clique sur le bouton "Recherche"
       And aucun événement ne correspond aux critères sélectionnés
       Then aucun résultat ne doit s'afficher

4.  **Self-Correction/Verification against Rules:**