# Acceptance Tests — Campus Marketplace

## Sprint 4

### US26 — Cancel Initiation of Purchase

**Test 1: Cancel button visible during purchase flow**
- **Given** a buyer has started the purchase flow (e.g., selected product, entered details)
- **When** they are on any pre-confirmation screen
- **Then** a visible Cancel, Back, or X button is present

**Test 2: Canceling returns to previous screen without charge**
- **Given** a buyer taps Cancel during purchase initiation
- **When** confirmation is requested (if applicable)
- **Then** they are returned to the previous safe screen (e.g., listing or cart) and no payment authorization is triggered

**Test 3: No pending holds or charges after cancellation**
- **Given** a buyer cancels before final confirmation
- **When** they check their payment method or transaction history
- **Then** there is no pending hold, authorization, or charge for this attempt

**Test 4: Cancel available at every step of initiation**
- **Given** a buyer is at any step of the multi-step purchase flow (e.g., address, shipping, payment details)
- **When** they look for a way to exit
- **Then** a cancel option is available on every screen until the final Confirm/Buy button