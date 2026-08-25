Feature: User login

  Scenario: Successful login
    Given the user is on the login page at "https://teskerti.tn/user/login"
    When the user enters email in input with placeholder "Email" and password in input with placeholder "Mot de passe"
    And clicks on button with text "Se connecter"
    Then the user should be redirected to "https://teskerti.tn/client/home"
