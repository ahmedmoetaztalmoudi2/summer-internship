Fonctionnalite: Détails d'un événement

  Scenario: Afficher les détails d'un événement
    Given l'utilisateur clique sur une carte d'événement
    Then le titre de l'événement devrait être visible
    And l'image de l'affiche devrait être visible
    And la date de l'événement devrait être visible
    And l'heure de l'événement devrait être visible
    And le lieu de l'événement devrait être visible
    And le prix du billet devrait être visible
    And le bouton "Acheter mon billet" devrait être visible

Note: Puisque la structure de la page ne fournit pas d'éléments spécifiques pour les détails de l'événement, les étapes du scénario sont génériques et ne référencent pas d'éléments spécifiques du DOM. De plus, les informations de connexion ne sont pas fournies, donc aucun scénario de connexion réussie n'est inclus. Les éléments de la structure de la page fournie ne correspondent pas aux exigences de l'histoire utilisateur, il n'est donc pas possible d'écrire des scénarios plus spécifiques.