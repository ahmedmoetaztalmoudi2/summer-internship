Feature: View event details

  Scenario: User opens an event page
    Given the user is on the Teskerti homepage
    When the user clicks on an event
    Then the user should be redirected to the event details page
    And the page should display event name, date, location, and price
