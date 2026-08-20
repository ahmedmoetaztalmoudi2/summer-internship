Fonctionnalité: Filtrage des événements par salle et par date

  Contexte:
    Etant donné que l'utilisateur est sur la page de catégorie "Spectacle"

  Scénario: Affichage du menu déroulant des salles
    Quand l'utilisateur ouvre le menu déroulant "Sélectionner une salle"
    Alors le menu liste les salles disponibles comme "Théâtre de plein air de Hammamet" et "Amphithéâtre plein air Boukornine"

  Scénario: Affichage du menu déroulant des dates
    Quand l'utilisateur ouvre le menu déroulant "Sélectionner une Date"
    Alors le menu liste les dates des événements disponibles comme "15 Août 2026"

  Scénario: Filtrage des événements par salle et date
    Quand l'utilisateur sélectionne une salle dans le menu déroulant
    Et l'utilisateur sélectionne une date dans le menu déroulant
    Et l'utilisateur clique sur le bouton "Recherche"
    Alors seuls les événements correspondant à la salle et à la date sélectionnées sont affichés

  Scénario: Aucun événement ne correspond aux critères
    Quand l'utilisateur sélectionne une salle et une date sans événements associés
    Et l'utilisateur clique sur le bouton "Recherche"
    Alors aucun résultat ne s'affiche