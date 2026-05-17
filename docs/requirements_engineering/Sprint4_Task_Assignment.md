# Sprint 4 — Planning Document

**Campus Marketplace** | Software Design 2026  
**Prepared:** May 2026 | **Duration:** 3 Weeks  
**Sprint Type:** Final Recorded Sprint — PO Problem-Fixing Sprint

---

## Sprint Goals (Problem-Fixing Focus)

- ✅ Enable buyer to cancel purchase initiation before payment confirmation (US26)
- ✅ Restrict drop-off dates to within 7 days of payment (US27)
- ✅ Auto-cancel + refund buyer when inspection fails (US28)
- ✅ Allow students to trade items instead of direct payments (US29)
- ✅ Notify seller of overdue drop-off + auto-cancel after grace period (US30)
- ✅ Fix notification logic for cash payments after inspection passes (US31)
- ✅ Replace "Sell Item" nav link with floating action button (+) (US32)
- ✅ Make listings clickable in admin report review screen (US33)
- ✅ Implement overdue collection penalties and compensation logic (US34)
- ✅ Remove legacy statuses: At Facility, Declined, Completed (US35)
- ✅ Change cart icon to "Favourites" (US36)
- ✅ Remove all "collection" terminology from app (US37)
- ✅ Promote listings for payments (paid promotion feature) (US38)
- ✅ Add loader/loading states throughout app (US39)
- ✅ Fix overall app flow end-to-end (US40)
- ✅ Implement staff page functionality (US41)
- ✅ Automate payment process where possible (US42)

---

## Story Summary

| Story ID | Title | Priority | Status |
|---|---|---|---|
| US26 | Cancel Initiation of Purchase | 🔴 High | 📋 To Do |
| US27 | Restrict Drop-Off Dates to ≤7 Days After Payment | 🔴 High | 📋 To Do |
| US28 | Cancel + Refund Buyer When Inspection Fails | 🔴 High | 📋 To Do |
| US29 | Allow Students to Trade Instead of Direct Payments | 🟡 Medium | 📋 To Do |
| US30 | Notify Seller About Overdue Drop-Off + Auto-Cancel | 🔴 High | 📋 To Do |
| US31 | Fix Cash Payment Notification Logic After Inspection | 🔴 High | 📋 To Do |
| US32 | Replace Sell Item Nav Link with Floating Action Button | 🟡 Medium | 📋 To Do |
| US33 | Make Listings Clickable in Admin Report Review Screen | 🟡 Medium | 📋 To Do |
| US34 | Overdue Collection Penalties & Compensation Logic | 🔴 High | 📋 To Do |
| US35 | Remove Legacy Statuses (At Facility, Declined, Completed) | 🟢 Low | 📋 To Do |
| US36 | Change Cart Icon to "Favourites" | 🟢 Low | 📋 To Do |
| US37 | Remove All "Collection" Terminology from App | 🟢 Low | 📋 To Do |
| US38 | Promote Listings for Payments (Paid Promotion) | 🟡 Medium | 📋 To Do |
| US39 | Add Loader/Loading States Throughout App | 🟢 Low | 📋 To Do |
| US40 | Fix Overall App Flow (End-to-End) | 🔴 High | 📋 To Do |
| US41 | Staff Page Implementation/Cleanup | 🟡 Medium | 📋 To Do |
| US42 | Automate Payment Process Where Possible | 🔴 High | 📋 To Do |

---

## Frontend Routes (Sprint 4 Updates)

| Route | Component | Access | Change |
|---|---|---|---|
| `/listing/create` | `CreateListing.jsx` | Authenticated students | Remove nav link → FAB only |
| `/admin/reports` | `ReportsDashboard.jsx` | Admin only | Listings become clickable |
| `/staff/dashboard` | `StaffDashboard.jsx` | Staff & Admin only | Staff page cleanup |
| `/favourites` | `FavouritesPage.jsx` | Authenticated students | Renamed from Cart |
| `/payment/:transactionId` | `PaymentGateway.jsx` | Buyer only | Automation improvements |
| `/checkout/:transactionId` | `CheckoutPage.jsx` | Buyer only | Trade option added |
| `/trade-offer/:transactionId` | `TradeOfferPage.jsx` | Buyer/Seller | New route for trading |
| `/sponsor/:listingId` | `SponsorListing.jsx` | Listing owner only | Promote listings |

---

## US26 — Cancel Initiation of Purchase

> As a student buyer, I want to cancel the purchase process before confirming payment so that I can back out without completing a transaction if I change my mind or spot a mistake.

**Route:** All purchase flow screens | Access: Buyer during checkout

| Task | Assignee | Status |
|---|---|---|
| Add Cancel/Back/X button on every screen of purchase flow before final confirmation | Dev 1 | 📋 To Do |
| Ensure no payment authorization is triggered on cancellation | Dev 1 | 📋 To Do |
| Return user to previous safe screen (listing or cart) after cancellation | Dev 1 | 📋 To Do |
| Verify no pending holds or charges remain after cancellation | Dev 1 | 📋 To Do |

**Acceptance Tests**

| Given | When | Then |
|---|---|---|
| A buyer has started the purchase flow | They are on any pre-confirmation screen | A visible Cancel, Back, or X button is present |
| A buyer taps Cancel during purchase initiation | Confirmation is requested (if applicable) | They are returned to the previous safe screen and no payment authorization is triggered |
| A buyer cancels before final confirmation | They check their payment method or transaction history | There is no pending hold, authorization, or charge for this attempt |
| A buyer is at any step of the multi-step purchase flow | They look for a way to exit | A cancel option is available on every screen until the final Confirm/Buy button |

---

## US27 — Restrict Drop-Off Dates to Not More Than 7 Days After Buyer Paid

> As a marketplace admin, I want drop-off slots to be restricted to dates within 7 days of the buyer making payment so that transactions complete in a timely manner and sellers aren't waiting indefinitely for drop-off.

**Route:** Drop-off slot selection screen | Access: Buyer after payment

| Task | Assignee | Status |
|---|---|---|
| Store payment date in Firestore transaction document | Dev 2 | 📋 To Do |
| Filter available drop-off slots to dates ≤ payment date + 7 days | Dev 2 | 📋 To Do |
| Disable or hide slots beyond 7-day window with error message | Dev 2 | 📋 To Do |
| Recalculate 7-day window on final payment after partial payment | Dev 2 | 📋 To Do |

**Acceptance Tests**

| Given | When | Then |
|---|---|---|
| A buyer has paid for an item on date D | They attempt to select a drop-off slot on date D+8 or later | The slot is either disabled, not shown, or shows an error message |
| A buyer has paid for an item on date D | They attempt to select a drop-off slot on any date from D to D+7 | The slot is selectable and the booking proceeds normally |
| A buyer makes a partial payment on date D1, then final payment on date D2 | They select a drop-off slot after D2 | The allowed window is D2 to D2+7 (not based on D1) |
| A buyer pays on date D | They select a drop-off slot on D+7 at 11:59 PM | The slot is accepted |

---

## US28 — Allow Students to Trade Instead of Direct Payments

> As a student buyer, I want to offer an item I own in trade instead of paying money so that I can acquire needed items without spending cash and participate in a barter economy on campus.

**Route:** `/checkout/:transactionId` and `/trade-offer/:transactionId` | Access: Buyer and Seller

| Task | Assignee | Status |
|---|---|---|
| Add "Trade" as payment option during checkout | Dev 4 | 📋 To Do |
| Build trade offer UI for buyer to select/describe item(s) they offer | Dev 4 | 📋 To Do |
| Create seller trade offer screen (accept/reject/counter) | Dev 4 | 📋 To Do |
| Implement ownership transfer on trade acceptance (update Firestore item ownership fields) | Dev 4 | 📋 To Do |
| Add "Completed — Trade" status to transaction history | Dev 4 | 📋 To Do |
| Disable refunds for trade transactions unless both parties agree to reverse | Dev 4 | 📋 To Do |
| Build counter-offer flow (buyer can accept/reject/counter again) | Dev 4 | 📋 To Do |

**Acceptance Tests**

| Given | When | Then |
|---|---|---|
| A student buyer is at the checkout screen | They view payment options | "Trade" is listed alongside credit card, campus cash, etc. |
| A buyer selects "Trade" as payment method | They attempt to submit the trade offer | They are required to select or describe at least one item they are offering in trade |
| A buyer submits a trade offer with item X for seller's item Y | The seller views the offer and clicks "Accept Trade" | Ownership of item X transfers to seller, ownership of item Y transfers to buyer, and no money changes hands |
| A buyer submits a trade offer | The seller clicks "Reject Trade" | The offer is closed, buyer is notified of rejection, and no ownership transfer occurs |
| A buyer submits a trade offer | The seller clicks "Counter Offer" and proposes a different trade item | The buyer receives the counteroffer and can accept, reject, or counter again |
| A trade offer is accepted | The transaction completes | Order status shows "Completed — Trade" and transaction history shows both items and both parties |

---

## US29 — Notify Seller About Overdue Drop-Off and Auto-Cancel After Exceeding Grace Period

> As a marketplace admin, I want the system to notify a seller when drop-off is overdue and automatically cancel the transaction if the seller fails to drop off within a specified grace period so that buyers aren't left waiting indefinitely and marketplace trust is maintained.

**Route:** System-level background job | Access: Automated

| Task | Assignee | Status |
|---|---|---|
| Add scheduled job to check for missed drop-off times | Dev 5 | 📋 To Do |
| Send in-app and email notification to seller immediately after missed drop-off | Dev 5 | 📋 To Do |
| Add configurable grace period (default: 24 hours) in admin settings | Dev 5 | 📋 To Do |
| Auto-cancel transaction if drop-off not completed within grace period | Dev 5 | 📋 To Do |
| Update order status to "Cancelled — Drop-off Overdue" on auto-cancel | Dev 5 | 📋 To Do |
| Trigger full refund to buyer on auto-cancel | Dev 5 | 📋 To Do |
| Notify both buyer and seller of cancellation with reason | Dev 5 | 📋 To Do |
| Resume normal flow if drop-off completed within grace period | Dev 5 | 📋 To Do |

**Acceptance Tests**

| Given | When | Then |
|---|---|---|
| A seller has a scheduled drop-off time of T | Current time passes T with no drop-off completed | System immediately sends in-app and email notification to seller and order status shows "Drop-off Overdue" |
| A seller missed drop-off time T and grace period is 24 hours | Seller completes drop-off at T+20 hours | Order proceeds to inspection normally, no cancellation occurs, and confirmation notification is sent to both parties |
| A seller missed drop-off time T and grace period is 24 hours | Current time reaches T+24 hours + 1 second with no drop-off completed | Transaction is automatically cancelled, order status updates to "Cancelled — Drop-off Overdue" |
| Transaction is auto-cancelled due to overdue drop-off | Cancellation occurs | Buyer receives full refund automatically and email/in-app notification with cancellation reason |
| Transaction is auto-cancelled due to overdue drop-off | Cancellation occurs | Seller receives email and in-app notification stating "Transaction cancelled — drop-off overdue beyond grace period" |

---

## US30 — Fix Cash Payment Notification Logic After Inspection

> As a buyer paying with full cash, I want to be notified after inspection passes so that I can come collect my item without confusion or delay.

**Route:** System-level / Staff dashboard | Access: Automated + Staff

| Task | Assignee | Status |
|---|---|---|
| Fix notification trigger to send after inspection passes (not before) | Dev 1 | 📋 To Do |
| Send email and in-app notification to buyer: "Item passed inspection — ready for collection" | Dev 1 | 📋 To Do |
| Update staff dashboard to show which cash-payment items are ready for pickup | Dev 1 | 📋 To Do |

**Acceptance Tests**

| Given | When | Then |
|---|---|---|
| A buyer paid with full cash and item passes inspection | Inspection status changes to "Passed" | Buyer receives email and in-app notification that item is ready for collection |
| A buyer paid with full cash | Inspection has not yet passed | No collection notification is sent to buyer |

---

## US31 — Replace "Sell Item" Nav Link with Floating Action Button

> As a user, I want a floating action button (+) to create a new listing instead of a navigation link so that the interface is cleaner and the primary action is more accessible.

**Route:** All app pages (global FAB) | Access: Authenticated students

| Task | Assignee | Status |
|---|---|---|
| Remove "Sell Item" from navigation bar component | Dev 2 | 📋 To Do |
| Add floating action button (+) to main layout | Dev 2 | 📋 To Do |
| Navigate to `/listing/create` on FAB click | Dev 2 | 📋 To Do |
| Ensure FAB is visible on all authenticated screens | Dev 2 | 📋 To Do |
| Hide FAB on unauthenticated routes | Dev 2 | 📋 To Do |

**Acceptance Tests**

| Given | When | Then |
|---|---|---|
| A logged-in student user opens any app screen | They look at the navigation bar | "Sell Item" link is no longer present |
| A logged-in student user opens any app screen | They look at the bottom-right corner of the screen | A floating action button (+) is visible |
| A logged-in student clicks the floating action button | The button is clicked | The user is navigated to the listing creation screen |

---

## US32 — Make Listings Clickable in Admin Report Review Screen

> As an admin reviewing reports, I want listings to be clickable so that I can quickly navigate to the offending listing for moderation action.

**Route:** `/admin/reports` | Access: Admin only

| Task | Assignee | Status |
|---|---|---|
| Modify report row component to render listing title/ID as clickable link | Dev 6 | 📋 To Do |
| Navigate to listing detail page on click | Dev 6 | 📋 To Do |
| Ensure listing opens in same or new tab (admin preference) | Dev 6 | 📋 To Do |

**Acceptance Tests**

| Given | When | Then |
|---|---|---|
| An admin is viewing the reports dashboard with a list of reported listings | They click on any listing title or ID | The application navigates to that listing's detail page |
| An admin is viewing the moderation summary report | They see a flagged listing entry | The listing is clickable and opens the full listing view |

---

## US33 — Overdue Collection Penalties & Compensation Logic

> As a marketplace admin, I want overdue collection to trigger penalties and compensation so that buyers are incentivized to collect items on time and sellers are compensated for delays.

**Route:** System-level background job | Access: Automated

| Task | Assignee | Status |
|---|---|---|
| Define penalty rules based on context (e.g., % of item price per day, flat fee) | Dev 3 | 📋 To Do |
| Implement scheduled job to detect overdue collections | Dev 3 | 📋 To Do |
| Apply penalty to buyer (charge additional fee) or deduct from refund | Dev 3 | 📋 To Do |
| Apply compensation to seller (partial payment for storage/wait time) | Dev 3 | 📋 To Do |
| Log penalty/compensation amounts in transaction record | Dev 3 | 📋 To Do |
| Notify both parties of penalty applied | Dev 3 | 📋 To Do |

**Acceptance Tests**

| Given | When | Then |
|---|---|---|
| A buyer fails to collect an item within the required collection window | The overdue detection job runs | A penalty is applied to the buyer (e.g., daily fee) and seller receives compensation |
| An overdue collection is detected | Penalties are calculated | Both buyer and seller receive notifications explaining the penalty and compensation amounts |

---

## US34 — Remove Legacy Statuses (At Facility, Declined, Completed)

> As a marketplace admin, I want legacy statuses removed from the system so that the transaction state machine is cleaner and users are not confused by obsolete states.

**Route:** System-wide (Firestore schema + frontend) | Access: All users

| Task | Assignee | Status |
|---|---|---|
| Identify all references to "At Facility", "Declined", "Completed" in codebase | Dev 5 | 📋 To Do |
| Migrate existing Firestore transactions to new status values | Dev 5 | 📋 To Do |
| Remove status options from frontend dropdowns and filters | Dev 5 | 📋 To Do |
| Update documentation and state machine diagram | Dev 5 | 📋 To Do |

**Acceptance Tests**

| Given | When | Then |
|---|---|---|
| An admin or staff user views any transaction list | They look at status filters or dropdowns | "At Facility", "Declined", and "Completed" are no longer visible options |
| A developer queries the Firestore database | They look at existing transactions | Old status values have been migrated to new equivalents or removed |

---

## US35 — Change Cart Icon to "Favourites"

> As a user, I want the cart icon to be renamed to "Favourites" so that it accurately represents saving items for later rather than a shopping cart.

**Route:** Navigation bar | Access: All authenticated users

| Task | Assignee | Status |
|---|---|---|
| Change icon from cart (🛒) to heart (❤️) or star (⭐) | Dev 6 | 📋 To Do |
| Update label text from "Cart" to "Favourites" | Dev 6 | 📋 To Do |
| Update route from `/cart` to `/favourites` (or keep route but change display) | Dev 6 | 📋 To Do |
| Update all internal references (state, variables, comments) | Dev 6 | 📋 To Do |

**Acceptance Tests**

| Given | When | Then |
|---|---|---|
| A logged-in user opens the navigation bar | They look at the icon previously labeled "Cart" | They see a heart or star icon labeled "Favourites" instead |
| A user clicks the Favourites icon | They navigate to the page | The page displays saved/favourited listings (not a cart/checkout page) |

---

## US36 — Remove All "Collection" Terminology from App

> As a marketplace admin, I want all "collection" terminology removed from the app so that users are not confused by legacy terms that no longer match the drop-off/pickup model.

**Route:** System-wide | Access: All users

| Task | Assignee | Status |
|---|---|---|
| Search codebase for "collection" strings (UI, notifications, emails, Firestore fields) | Dev 4 | 📋 To Do |
| Replace with appropriate terms: "pickup", "drop-off", or "fulfillment" | Dev 4 | 📋 To Do |
| Update Firestore field names if necessary (migration required) | Dev 4 | 📋 To Do |
| Update all user-facing notifications and emails | Dev 4 | 📋 To Do |

**Acceptance Tests**

| Given | When | Then |
|---|---|---|
| A user navigates through any part of the app | They read any label, button, or instruction | No instance of the word "collection" appears (only "pickup", "drop-off", or "fulfillment") |
| A buyer or seller receives an email or in-app notification | They read the notification content | The term "collection" is not present |

---

## US37 — Promote Listings for Payments (Paid Promotion)

> As a student seller, I want to promote my listing for a fee so that it appears more prominently in search results or as a sponsored item.

**Route:** `/sponsor/:listingId` | Access: Listing owner only

| Task | Assignee | Status |
|---|---|---|
| Build promotion UI with duration and pricing options | Dev 6 | 📋 To Do |
| Integrate payment gateway for promotion fees | Dev 6 | 📋 To Do |
| Add isPromoted and promotionExpiry fields to listing document | Dev 6 | 📋 To Do |
| Modify search queries to prioritize promoted listings | Dev 6 | 📋 To Do |
| Add "Promoted" badge on promoted listings | Dev 6 | 📋 To Do |
| Implement auto-expiry after promotion duration ends | Dev 6 | 📋 To Do |

**Acceptance Tests**

| Given | When | Then |
|---|---|---|
| A seller views one of their active listings | They click "Promote Listing" and complete payment | The listing is marked as promoted and appears higher in search results |
| A promoted listing is active | A user searches for relevant keywords | The promoted listing appears before non-promoted listings with a "Promoted" badge |
| A seller promotes a listing for 7 days | The promotion period expires | The listing no longer appears promoted and the badge is removed |

---

## US38 — Add Loader/Loading States Throughout App

> As a user, I want to see loading indicators when data is being fetched so that I know the app is working and not frozen.

**Route:** All app pages (global improvement) | Access: All users

| Task | Assignee | Status |
|---|---|---|
| Add skeleton loaders or spinner components to all async data fetches | All Devs | 📋 To Do |
| Ensure loaders appear on listing grid, detail view, transaction history, and dashboard | All Devs | 📋 To Do |
| Add timeout handling for slow network with retry or error state | All Devs | 📋 To Do |

**Acceptance Tests**

| Given | When | Then |
|---|---|---|
| A user navigates to the marketplace home page | Listings are being fetched from Firestore | A loading spinner or skeleton placeholder is displayed |
| A slow network request occurs on any page | The user waits for data | A loading indicator is visible until data loads or timeout occurs |

---

## US39 — Fix Overall App Flow (End-to-End)

> As a user, I want the entire transaction flow to work seamlessly end-to-end so that I can buy, pay, drop off, inspect, and pick up without broken steps or missing notifications.

**Route:** Full transaction pipeline | Access: All users

| Task | Assignee | Status |
|---|---|---|
| Review and test entire transaction flow: listing → checkout → payment → drop-off → inspection → pickup → completion | Dev 1 | 📋 To Do |
| Fix any broken navigation links or state transitions | Dev 1 | 📋 To Do |
| Ensure all status updates trigger correct notifications | Dev 1 | 📋 To Do |
| Verify cash, card, and trade flows work completely | Dev 1 | 📋 To Do |
| Test edge cases (partial payment, inspection failure, overdue drop-off) | Dev 1 | 📋 To Do |

**Acceptance Tests**

| Given | When | Then |
|---|---|---|
| A buyer completes a full transaction from listing to pickup | All steps are performed | No broken links, missing notifications, or incorrect status updates occur |
| A transaction uses cash payment, passes inspection, and completes | The flow is executed | Buyer is notified to pick up, staff confirms pickup, and seller receives payment |

---

## US40 — Staff Page Implementation/Cleanup

> As a staff member, I want a fully functional staff dashboard so that I can manage drop-offs, inspections, and pickups efficiently.

**Route:** `/staff/dashboard` | Access: Staff & Admin only

| Task | Assignee | Status |
|---|---|---|
| Clean up existing staff dashboard code and UI | Dev 2 | 📋 To Do |
| Ensure all required staff actions are present (confirm drop-off, inspection result, confirm pickup) | Dev 2 | 📋 To Do |
| Add filtering/sorting by transaction status | Dev 2 | 📋 To Do |
| Add search by transaction ID or student name | Dev 2 | 📋 To Do |
| Ensure mobile responsiveness for staff dashboard | Dev 2 | 📋 To Do |

**Acceptance Tests**

| Given | When | Then |
|---|---|---|
| A staff member logs in and navigates to `/staff/dashboard` | The page loads | All pending transactions are visible with clear actions for drop-off confirmation, inspection, and pickup |
| A staff member searches for a specific transaction | They enter a transaction ID or student name | The matching transaction appears in the list |

---

## US42 — Automate Payment Process Where Possible

> As a marketplace admin, I want the payment process automated as much as possible so that manual intervention is minimized and transaction completion is faster.

**Route:** Payment system | Access: Automated

| Task | Assignee | Status |
|---|---|---|
| Automate refund triggering on cancellation (inspection fail, overdue drop-off) | Dev 3 | 📋 To Do |
| Automate payment confirmation webhook handling | Dev 3 | 📋 To Do |
| Automate fee calculation and deduction for promotions | Dev 3 | 📋 To Do |
| Automate seller payout release after item pickup | Dev 3 | 📋 To Do |
| Reduce manual staff steps in payment reconciliation | Dev 3 | 📋 To Do |

**Acceptance Tests**

| Given | When | Then |
|---|---|---|
| A transaction is cancelled due to inspection failure | The cancellation is recorded | Refund is triggered automatically without staff intervention |
| A buyer picks up an item | Staff confirms pickup in system | Seller payment is automatically released |
| A payment webhook is received from gateway | The webhook is processed | Transaction payment status updates automatically without manual verification |

---

## Task Allocation Summary

| Dev | Tasks |
|-----|-------|
| Dev 1 | US26 (Cancel Initiation) + US31 (Cash Payment Notification Fix) + US40 (Overall App Flow) |
| Dev 2 | US27 (7-Day Drop-Off Restriction) + US32 (FAB Replace Sell Item) + US41 (Staff Page Cleanup) |
| Dev 3 | US28 (Inspection Fail Cancel/Refund) + US34 (Overdue Collection Penalties) + US42 (Payment Automation) |
| Dev 4 | US29 (Trade Instead of Payments) + US37 (Remove Collection Terminology) |
| Dev 5 | US30 (Overdue Drop-Off Notify + Auto-Cancel) + US35 (Remove Legacy Statuses) |
| Dev 6 | US33 (Clickable Listings in Reports) + US36 (Cart → Favourites) + US38 (Promote Listings) |
| All Devs | US39 (Loader/Loading States) — applied across all pages |