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

### US27 — Restrict drop-off dates to not be more than 7 days after buyer paid

**Test 1: Drop-off slots beyond 7 days are not selectable**
- **Given** a buyer has paid for an item on date D
- **When** they attempt to select a drop-off slot on date D+8 or later
- **Then** the slot is either disabled, not shown, or shows an error message "Drop-off must be within 7 days of payment"

**Test 2: Slots within 7 days are selectable**
- **Given** a buyer has paid for an item on date D
- **When** they attempt to select a drop-off slot on any date from D to D+7
- **Then** the slot is selectable and the booking proceeds normally

**Test 3: 7-day window recalculates on final payment after partial payment**
- **Given** a buyer makes a partial payment on date D1, then final payment on date D2
- **When** they select a drop-off slot after D2
- **Then** the allowed window is D2 to D2+7 (not based on D1)

**Test 4: Previously selected slot beyond 7 days becomes invalid if payment date changes later**
- **Given** a buyer selects a drop-off slot on D+6 after paying on D
- **When** the final payment date shifts to D+2 (e.g., due to additional authorization)
- **And** the original slot D+6 is now D+4 from new payment date
- **Then** the slot remains valid (since it's still ≤7 days from new payment date)

**Test 5: Edge case — exactly 7 days is allowed**
- **Given** a buyer pays on date D
- **When** they select a drop-off slot on D+7 at 11:59 PM
- **Then** the slot is accepted

### US28 — Cancel + refund buyer when inspection fails

**Test 1: Order status updates correctly on inspection failure**
- **Given** an item has been dropped off and is pending inspection
- **When** inspection fails (e.g., item damaged, wrong item, counterfeit)
- **Then** order status immediately updates to "Cancelled – Inspection Failed"

**Test 2: Buyer receives full automatic refund**
- **Given** inspection fails
- **When** the failure is recorded
- **Then** the buyer's original payment method is refunded the full amount within [specified time, e.g., 1 hour]
- **And** no manual intervention is required

**Test 3: Buyer is notified of failure and refund**
- **Given** inspection fails and refund is processed
- **When** both actions are complete
- **Then** buyer receives an email notification
- **And** buyer receives an in-app notification
- **And** the notification states both the failure reason and refund confirmation

**Test 4: Seller is notified of inspection failure**
- **Given** inspection fails
- **When** the failure is recorded
- **Then** seller receives an email notification
- **And** seller receives an in-app notification
- **And** the notification explains why the item failed inspection

**Test 5: No partial refunds or holds remain**
- **Given** inspection fails
- **When** refund is processed
- **Then** the buyer's balance shows $0 owed
- **And** no pending authorizations remain on the transaction

### US29 — Allow students to trade items instead of direct payments

**Test 1: Trade option available during checkout**
- **Given** a student buyer is at the checkout screen
- **When** they view payment options
- **Then** "Trade" is listed alongside credit card, campus cash, etc.

**Test 2: Buyer must list trade items before submitting**
- **Given** a buyer selects "Trade" as payment method
- **When** they attempt to submit the trade offer
- **Then** they are required to select or describe at least one item they are offering in trade
- **And** the system prevents submission without trade items specified

**Test 3: Seller can accept trade offer**
- **Given** a buyer submits a trade offer with item X for seller's item Y
- **When** the seller views the offer and clicks "Accept Trade"
- **Then** ownership of item X transfers to seller
- **And** ownership of item Y transfers to buyer
- **And** no money changes hands

**Test 4: Seller can reject trade offer**
- **Given** a buyer submits a trade offer
- **When** the seller clicks "Reject Trade"
- **Then** the offer is closed
- **And** buyer is notified of rejection
- **And** no ownership transfer occurs

**Test 5: Seller can counter a trade offer**
- **Given** a buyer submits a trade offer
- **When** the seller clicks "Counter Offer" and proposes a different trade item or additional item
- **Then** the buyer receives the counteroffer
- **And** the buyer can accept, reject, or counter again

**Test 6: Trade transactions are recorded correctly**
- **Given** a trade offer is accepted
- **When** the transaction completes
- **Then** order status shows "Completed — Trade"
- **And** transaction history shows both items and both parties
- **And** no refund option is available unless both parties agree to reverse

### US30 — Notify seller about overdue drop-off and auto-cancel after exceeding grace period

**Test 1: Overdue notification sent immediately after missed drop-off**
- **Given** a seller has a scheduled drop-off time of T
- **When** the current time passes T with no drop-off completed
- **Then** the system immediately sends an in-app notification to the seller
- **And** sends an email notification to the seller
- **And** order status shows "Drop-off Overdue"

**Test 2: Drop-off within grace period resumes normal flow**
- **Given** a seller missed the drop-off time T and grace period is 24 hours
- **When** the seller completes drop-off at T+20 hours
- **Then** the order proceeds to inspection normally
- **And** no cancellation occurs
- **And** a confirmation notification is sent to both parties

**Test 3: Auto-cancel after grace period expires**
- **Given** a seller missed the drop-off time T and grace period is 24 hours
- **When** the current time reaches T+24 hours + 1 second with no drop-off completed
- **Then** the transaction is automatically cancelled
- **And** order status updates to "Cancelled — Drop-off Overdue"

**Test 4: Buyer receives full refund on auto-cancel**
- **Given** transaction is auto-cancelled due to overdue drop-off
- **When** cancellation occurs
- **Then** buyer receives full refund automatically
- **And** buyer receives email and in-app notification with cancellation reason

**Test 5: Both parties notified of auto-cancel**
- **Given** transaction is auto-cancelled due to overdue drop-off
- **When** cancellation occurs
- **Then** buyer receives notification (per Test 4)
- **And** seller receives email and in-app notification stating: "Transaction cancelled — drop-off overdue beyond grace period"

**Test 6: Grace period length is configurable**
- **Given** an admin configures grace period to 48 hours instead of 24
- **When** a seller misses drop-off time T
- **Then** auto-cancel occurs at T+48 hours (not before)