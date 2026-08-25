Fonctionnalité: Consultation des pages légales et d'information

  Contexte:
    Étant donné que l'utilisateur est sur une page du site

  Scénario: Vérification de la présence des liens légaux dans le pied de page
    Alors le pied de page affiche le lien "A propos"
    Et le pied de page affiche le lien "Termes et conditions"

  Scénario: Navigation vers la page "A propos"
    Quand l'utilisateur clique sur le lien "A propos" dans le pied de page
    Alors l'utilisateur est redirigé vers la page "A propos"
    Et la page affiche les informations sur la société Teskerti
    Et la page affiche l'adresse de la société
    Et la page affiche les coordonnées de contact

  Scénario: Navigation vers la page "Termes et conditions"
    Quand l'utilisateur clique sur le lien "Termes et conditions" dans le pied de page
    Alors l'utilisateur est redirigé vers la page des conditions d'utilisation
    Et la page affiche le contenu des conditions d'utilisation

  Scénario: Vérification des autres éléments du pied de page
    Alors le pied de page affiche la liste des catégories
    Et le pied de page affiche le lien "La liste de nos guichets"