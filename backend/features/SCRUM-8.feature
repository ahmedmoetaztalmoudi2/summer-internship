Feature: Création de compte utilisateur

      Background:
        Given l'utilisateur est sur la page d'inscription

      Scenario: Création de compte avec email valide et mot de passe valide
        When l'utilisateur entre une adresse email valide
        And l'utilisateur entre un mot de passe de 8 caractères ou plus
        And l'utilisateur soumet le formulaire d'inscription
        Then le compte utilisateur est créé avec succès
        And l'utilisateur est redirigé vers la page de profil

      Scenario: Tentative d'inscription avec un email déjà existant
        When l'utilisateur entre une adresse email déjà utilisée
        And l'utilisateur entre un mot de passe valide
        And l'utilisateur soumet le formulaire d'inscription
        Then le message d'erreur "Un compte existe déjà avec cet email" doit s'afficher

      Scenario: Tentative d'inscription avec un mot de passe trop court
        When l'utilisateur entre une adresse email valide
        And l'utilisateur entre un mot de passe de moins de 8 caractères
        And l'utilisateur soumet le formulaire d'inscription
        Then le message d'erreur "Le mot de passe doit contenir au moins 8 caractères" doit s'afficher

6.  **Final Output Generation:** (Proceed to generate raw text).