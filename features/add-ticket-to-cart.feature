Feature: Add ticket to cart

  Scenario: User adds a ticket to the cart
    Given the user is on an event details page
    When the user selects a ticket quantity
    And clicks on "Book" or "Reserve"
    Then the ticket should be added to the cart
