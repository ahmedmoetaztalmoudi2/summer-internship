Feature: Checkout process

  Scenario: User proceeds to checkout
    Given the user has tickets in the cart
    When the user navigates to the checkout page
    Then the user should see order summary
    And the user should be asked to enter personal information
    And the user should be able to proceed to payment
