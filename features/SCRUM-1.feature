Feature: Authentification Utilisateur

          Background:
            Given l'utilisateur est sur la page de connexion

          Scenario Outline: Connexion échouée avec des identifiants invalides
            Given l'utilisateur saisit "<email>" dans le champ email
            And l'utilisateur saisit "<password>" dans le champ mot de passe
            When l'utilisateur clique sur "Se connecter"
            Then le message d'erreur "Nom d'utilisateur ou mot de passe erroné !" doit s'afficher

            Examples:
              | email                | password      |
              | user@example.com     | MauvaisPass   |
              | inconnu@example.com  | N'importeQuoi |

    *   *Check against "Page capabilities":*
        *   "User can enter text in 'Email'" -> `saisit ... dans le champ email`
        *   "User can enter text in 'Mot de passe'" -> `saisit ... dans le champ mot de passe`
        *   "User can click 'Se connecter'" -> `clique sur "Se connecter"`
        *   "Page displays 'Message d'erreur'" -> `le message d'erreur ... doit s'afficher`

    *   *Check against "Acceptance Criteria":*
        *   Criterion 2 (Wrong password): Covered by row 1.
        *   Criterion 3 (Unregistered email): Covered by row 2.
        *   Criterion 1 (Success): Omitted per Rule 12.

    *   *Formatting:* Ensure no markdown blocks.

    *   *Final Polish:* The prompt asks for "Scenario Outline" when one behavior must be tested with multiple data rows. Here, the behavior (displaying the generic error) is the same for both cases, so Outline is appropriate.

    *   *Result:*
        Feature: Authentification Utilisateur

          Background:
            Given l'utilisateur est sur la page de connexion

          Scenario Outline: Connexion échouée avec des identifiants invalides
            Given l'utilisateur saisit "<email>" dans le champ email
            And l'utilisateur saisit "<password>" dans le champ mot de passe
            When l'utilisateur clique sur "Se connecter"
            Then le message d'erreur "Nom d'utilisateur ou mot de passe erroné !" doit s'afficher

            Examples:
              | email                | password      |
              | user@example.com     | MauvaisPass   |
              | inconnu@example.com  | N'importeQuoi |

    *   *Wait, check Rule 12 again:* "If test credentials are NOT provided, do NOT write a 'successful login' scenario".
    *   *Check Rule 3:* "Generate a scenario for EVERY acceptance criterion".
    *   *Conflict Resolution:* Rule 12 is a specific constraint regarding credentials. Rule 3 is general. Rule 12 overrides Rule 3 for the specific case of successful login when credentials are missing. The example output in the prompt confirms this: "successful login ... are OMITTED because no credentials were provided".

    *   *Final Output Construction.*

    Feature: Authentification Utilisateur

      Background:
        Given l'utilisateur est sur la page de connexion

      Scenario Outline: Connexion échouée avec des identifiants invalides
        Given l'utilisateur saisit "<email>" dans le champ email
        And l'utilisateur saisit "<password>" dans le champ mot de passe
        When l'utilisateur clique sur "Se connecter"
        Then le message d'erreur "Nom d'utilisateur ou mot de passe erroné !" doit s'afficher

        Examples:
          | email                | password      |
          | user@example.com     | MauvaisPass   |
          | inconnu@example.com  | N'importeQuoi |

    *   *One last check on language:* The ticket is French. The output must be French.
    *   *One last check on formatting:* No markdown fences.

    *   *Ready.*

    *   *Wait, looking at the capabilities list:* "User can click 'Afficher/masquer le mot de passe'". Should I include a scenario for this?
    *   *Analysis:* The Acceptance Criteria do not mention password visibility toggling. The instructions say "Generate a scenario for EVERY acceptance criterion". It does not say "Generate a scenario for every capability". Capabilities are for grounding language. So, I will stick to the ACs.

    *   *Final Output.*

    Feature: Authentification Utilisateur

      Background:
        Given l'utilisateur est sur la page de connexion

      Scenario Outline: Connexion échouée avec des identifiants