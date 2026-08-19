Fonctionnalite: Filtrage des événements par salle et date sur la page de catégorie

Background:
    Given the user is on the category page "Spectacle"

Scenario: La page affiche le menu déroulant "Sélectionner une salle" listant les salles disponibles
    Then the dropdown "Sélectionner une salle" should be displayed
    And the dropdown should list the available rooms such as "Théâtre de plein air de Hammamet" and "Amphithéâtre plein air Boukornine"

Scenario: La page affiche le menu déroulant "Sélectionner une Date" listant les dates des événements
    Then the dropdown "Sélectionner une Date" should be displayed
    And the dropdown should list the available dates such as "19 Août 2026"

Scenario: Sélectionner une salle et une date puis cliquer sur "Recherche" affiche uniquement les événements correspondants
    Given the user selects "Théâtre de plein air de Hammamet" in the "Sélectionner une salle" dropdown
    And the user selects "19 Août 2026" in the "Sélectionner une Date" dropdown
    When the user clicks the "Recherche" button
    Then only events matching the selected room and date should be displayed

Scenario: Si aucun événement ne correspond aux critères, aucun résultat ne s'affiche
    Given the user selects a room that has no events on the selected date
    And the user selects a date that has no events for the selected room
    When the user clicks the "Recherche" button
    Then no results should be displayed