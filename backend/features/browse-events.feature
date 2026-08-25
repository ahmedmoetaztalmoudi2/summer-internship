Feature: Browse events on Teskerti

  Scenario: User views available events
    Given the user is on the Teskerti homepage
    When the page loads
    Then the user should see a list of events
    And each event should display title, date, and price
