Feature: User authentication

  Scenario: User logs in
    Given I am on the login page
    When I enter "user@test.com" and "password123"
    And I click the login button
    Then I should see the dashboard
