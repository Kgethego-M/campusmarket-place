# Acceptance Tests — Campus Marketplace

## Sprint 3

### US11 — Staff Confirm Item Receipt and Release

**Test 1: Staff confirms drop-off**
- **Given** staff receives an item from a seller
- **When** they click Confirm Drop-Off
- **Then** the transaction status updates and both students are notified

**Test 2: Staff releases item to buyer**
- **Given** staff releases an item to the buyer
- **When** they click Confirm Collection
- **Then** the transaction is marked complete

---

### US12 — Configure Facility Hours and Capacity

**Test 1: Updated hours restrict bookings**
- **Given** an admin updates the facility to close at 16:00
- **When** a student tries to book a 17:00 slot
- **Then** the slot is not available

---

### US13 — Online Payment

**Test 1: Successful payment**
- **Given** a buyer proceeds to payment
- **When** they complete the gateway flow
- **Then** the transaction is marked Paid and both parties are notified

**Test 2: Failed payment**
- **Given** a payment fails
- **When** the gateway returns an error
- **Then** the transaction remains unpaid and the buyer sees an error message

---

### US14 — Partial Payment with Cash Shortfall

**Test 1: Partial payment creates shortfall**
- **Given** a buyer pays R300 of a R500 item online
- **When** the payment is confirmed
- **Then** the transaction shows R200 outstanding cash shortfall

---

### US15 — Staff Confirm Cash Shortfall

**Test 1: Staff confirms cash payment and releases item**
- **Given** a transaction has an outstanding cash shortfall
- **When** staff confirm cash received and click release
- **Then** the transaction is marked Fully Paid and the item can be released

---

### US17 — Moderate Abusive Content

**Test 1: Admin reviews reported content**
- **Given** a user reports a review as abusive
- **When** an admin views the moderation queue
- **Then** the reported review appears and can be removed or dismissed

---

### US18 — SA Price Suggestions

**Test 1: Price suggestion displays on form load**
- **Given** a seller creates an Electronics listing
- **When** the form loads
- **Then** a suggested price range based on SA consumer price data is displayed

**Test 2: Price suggestions update with data refresh**
- **Given** the SA data source is updated
- **When** the ingestion job runs
- **Then** the displayed price suggestions reflect the updated data

---

### US19 — Popular Categories Report

**Test 1: Admin views category analytics**
- **Given** an admin opens the analytics dashboard
- **When** they select a date range
- **Then** a chart showing completed transactions per category for that period is displayed

---

### US20 — Trade Facility Utilisation Report

**Test 1: Admin views facility utilisation**
- **Given** an admin views the facility report
- **When** all bookings for the week are loaded
- **Then** utilisation percentage is shown per day and time slot

---

### US21 — Moderated Content Summary Report

**Test 1: Admin views moderation summary**
- **Given** an admin opens the moderation report
- **When** the data loads
- **Then** a table showing total reports, removals, and dismissals for the selected period is shown

---

### US22 — Export Reports

**Test 1: Export as CSV**
- **Given** an admin views a report
- **When** they click Export as CSV
- **Then** a CSV file is downloaded containing the report data

**Test 2: Export as PDF**
- **Given** an admin views a report
- **When** they click Export as PDF
- **Then** a formatted PDF of the report is downloaded

---

### US24 — Sponsored Listings

**Test 1: Seller can sponsor a listing**
- **Given** a logged-in student seller views one of their active listings
- **When** they click Sponsor Listing and complete the sponsorship payment/process
- **Then** the listing is marked as sponsored and appears in ad placements

**Test 2: Sponsored listing appears as pop-up ad**
- **Given** a sponsored listing is active
- **When** another user logs into the platform
- **Then** the sponsored listing appears as a pop-up ad (once per session or as configured)

**Test 3: Sponsored listing appears in ad banner**
- **Given** a sponsored listing is active
- **When** a user browses the marketplace (e.g., home page, category page)
- **Then** the sponsored listing appears within an ad banner or sponsored section alongside regular listings

**Test 4: Sponsored badge distinguishes from regular listings**
- **Given** a sponsored listing appears in search results or category view
- **When** a user views the listing card
- **Then** a visible Sponsored or Ad badge is displayed to differentiate from organic listings

**Test 5: Sponsorship has defined duration**
- **Given** a seller sponsors a listing for a specific period (e.g., 7 days, 30 days)
- **When** the sponsorship period expires
- **Then** the listing no longer appears in pop-up ads or banners and the sponsored badge is removed

**Test 6: Seller cannot sponsor inappropriate content**
- **Given** a listing has been flagged or moderated as abusive/inappropriate
- **When** the seller tries to sponsor that listing
- **Then** the sponsorship option is disabled with an explanation message

**Test 7: Buyer can dismiss or close pop-up ad**
- **Given** a sponsored pop-up ad appears to a user
- **When** they click a close or X button
- **Then** the pop-up closes and the user returns to their previous activity

---

### US25 — Responsive Design for Small Screens

**Test 1: Purchase interface reflows on small screen**
- **Given** a user with a screen width of 375px or less
- **When** they open any purchase page (listing, checkout, payment)
- **Then** all content is visible without horizontal scrolling and text remains readable

**Test 2: Touch targets are sufficiently sized**
- **Given** a user on a small-screen device
- **When** they interact with buttons or form inputs
- **Then** each touch target is at least 44x44 pixels and spaced to prevent accidental taps

**Test 3: No elements are cut off or hidden**
- **Given** a user on a small-screen device
- **When** they navigate through the purchase flow
- **Then** all critical UI elements (price, buy button, quantity selector) are fully visible

**Test 4: Modals and dialogs fit small screens**
- **Given** a modal or dialog opens (e.g., confirmation prompt)
- **When** viewed on a screen width of 375px or less
- **Then** the modal content is scrollable if needed and all buttons remain accessible
