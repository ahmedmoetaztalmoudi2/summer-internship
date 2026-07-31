Feature: User login

  Scenario: Successful login
    Given the user is on the login page
    When the user enters a valid email and password
    And clicks on "Se connecter"
    Then the user should be logged in
