# Sprint 3 — Planning Document

**Campus Marketplace** | Software Design 2026  
**Prepared:** May 2026 | **Duration:** 3 Weeks

---

## Sprint Goals

- ✅ Enable staff to confirm item receipt and release (US11)
- ✅ Allow admin configuration of facility hours and capacity (US12)
- ✅ Implement online payment gateway integration (US13)
- ✅ Enable partial payment with cash shortfall recording (US14)
- ✅ Allow staff to confirm cash shortfall before item release (US15)
- ✅ Implement abusive content moderation (US17)
- ✅ Display SA price suggestions on listing creation (US18)
- ✅ Build popular categories, facility utilisation, and moderation summary reports (US19, US20, US21)
- ✅ Add CSV and PDF export functionality for reports (US22)
- ✅ Implement sponsored listings as pop-up ads and banners (US24)
- ✅ Ensure all pages are responsive on small screens (US25)

---

## Story Summary

| Story ID | Title | Priority | Status |
|---|---|---|---|
| US11 | Staff Confirm Item Receipt and Release | 🟡 Medium | 📋 To Do |
| US12 | Configure Facility Hours and Capacity | 🟢 Low | 📋 To Do |
| US13 | Online Payment | 🔴 High | 📋 To Do |
| US14 | Partial Payment with Cash Shortfall | 🟡 Medium | 📋 To Do |
| US15 | Staff Confirm Cash Shortfall | 🟡 Medium | 📋 To Do |
| US17 | Moderate Abusive Content | 🟢 Low | 📋 To Do |
| US18 | SA Price Suggestions | 🟡 Medium | 📋 To Do |
| US19 | Popular Categories Report | 🟢 Low | 📋 To Do |
| US20 | Trade Facility Utilisation Report | 🟢 Low | 📋 To Do |
| US21 | Moderated Content Summary Report | 🟢 Low | 📋 To Do |
| US22 | Export Reports | 🟢 Low | 📋 To Do |
| US24 | Sponsored Listings | 🟡 Medium | 📋 To Do |
| US25 | Responsive Design for Small Screens | 🟡 Medium | 📋 To Do |

---

## Frontend Routes

| Route | Component | Access |
|---|---|---|
| `/staff/dashboard` | `StaffDashboard.jsx` | Staff & Admin only |
| `/admin/dashboard` | `AdminDashboard.jsx` | Admin only |
| `/admin/settings` | `FacilitySettings.jsx` | Admin only |
| `/admin/moderation` | `ModerationQueue.jsx` | Admin only |
| `/admin/reports` | `ReportsDashboard.jsx` | Admin only |
| `/listing/create` | `CreateListing.jsx` | Authenticated students |
| `/payment/:transactionId` | `PaymentGateway.jsx` | Buyer only |
| `/checkout/:transactionId` | `PartialPayment.jsx` | Buyer only |
| `/sponsor/:listingId` | `SponsorListing.jsx` | Listing owner only |

---

## US11 — Staff Confirm Item Receipt and Release

> As trade facility staff, I want to confirm receipt and release of items so that transactions are properly tracked and both parties are protected.

**Route:** `/staff/dashboard` | Access: Staff & Admin only

| Task | Assignee | Status |
|---|---|---|
| Display upcoming drop-offs and collections on staff dashboard | Dev 1 | 📋 To Do |
| Add Confirm Drop-Off button per transaction for received items | Dev 1 | 📋 To Do |
| Add Confirm Collection button per transaction for released items | Dev 1 | 📋 To Do |
| Update Firestore transaction status on each confirmation | Dev 1 | 📋 To Do |
| Notify both buyer and seller when item status changes | Dev 1 | 📋 To Do |

**Acceptance Tests**

| Given | When | Then |
|---|---|---|
| Staff receives an item from a seller | They click Confirm Drop-Off | The transaction status updates and both students are notified |
| Staff releases an item to the buyer | They click Confirm Collection | The transaction is marked complete |

---

## US12 — Configure Facility Hours and Capacity

> As an admin, I want to configure trade facility operating hours and slot capacity so that the facility runs efficiently and students can only book valid times.

**Route:** `/admin/settings` | Access: Admin only

| Task | Assignee | Status |
|---|---|---|
| Build admin settings UI for operating hours and slots per hour | Dev 2 | 📋 To Do |
| Store facility config in Firestore (openingTime, closingTime, slotCapacity) | Dev 2 | 📋 To Do |
| Apply facility config to slot availability logic in booking system | Dev 2 | 📋 To Do |

**Acceptance Tests**

| Given | When | Then |
|---|---|---|
| An admin updates the facility to close at 16:00 | A student tries to book a 17:00 slot | The slot is not available |

---

## US13 — Online Payment

> As a student buyer, I want to pay for an item online via a third-party payment gateway so that the transaction is completed securely.

**Route:** `/payment/:transactionId` | Access: Buyer only

| Task | Assignee | Status |
|---|---|---|
| Research and select payment gateway (PayFast / Yoco / Stripe) | Dev 3 | 📋 To Do |
| Integrate payment gateway checkout into transaction flow | Dev 3 | 📋 To Do |
| Record payment status in Firestore on webhook confirmation | Dev 3 | 📋 To Do |
| Display payment confirmation to buyer and seller | Dev 3 | 📋 To Do |

**Acceptance Tests**

| Given | When | Then |
|---|---|---|
| A buyer proceeds to payment | They complete the gateway flow | The transaction is marked Paid and both parties are notified |
| A payment fails | The gateway returns an error | The transaction remains unpaid and the buyer sees an error message |

---

## US14 — Partial Payment with Cash Shortfall

> As a student buyer, I want to pay a partial amount online and have the cash shortfall recorded so that I can settle the remainder in person at the trade facility.

**Route:** `/checkout/:transactionId` | Access: Buyer only

| Task | Assignee | Status |
|---|---|---|
| Allow buyer to enter a partial payment amount at checkout | Dev 3 | 📋 To Do |
| Record online amount paid and outstanding cash shortfall in Firestore | Dev 3 | 📋 To Do |
| Display outstanding cash amount clearly to trade facility staff | Dev 3 | 📋 To Do |

**Acceptance Tests**

| Given | When | Then |
|---|---|---|
| A buyer pays R300 of a R500 item online | The payment is confirmed | The transaction shows R200 outstanding cash shortfall |

---

## US15 — Staff Confirm Cash Shortfall

> As trade facility staff, I want to confirm that any cash shortfall has been paid before releasing an item so that sellers always receive their full payment.

**Route:** `/staff/dashboard` | Access: Staff & Admin only

| Task | Assignee | Status |
|---|---|---|
| Show outstanding cash amount on staff transaction view | Dev 4 | 📋 To Do |
| Add Confirm Cash Received button, locked until item is present | Dev 4 | 📋 To Do |
| Update Firestore transaction to Fully Paid on confirmation | Dev 4 | 📋 To Do |

**Acceptance Tests**

| Given | When | Then |
|---|---|---|
| A transaction has an outstanding cash shortfall | Staff confirm cash received and click release | The transaction is marked Fully Paid and the item can be released |

---

## US17 — Moderate Abusive Content

> As an admin, I want to flag or remove abusive reviews so that the platform remains safe and trustworthy for all users.

**Route:** `/admin/moderation` | Access: Admin only

| Task | Assignee | Status |
|---|---|---|
| Add Report button on each review visible to all users | Dev 5 | 📋 To Do |
| Build admin moderation queue showing reported reviews | Dev 5 | 📋 To Do |
| Allow admin to remove review or dismiss report | Dev 5 | 📋 To Do |

**Acceptance Tests**

| Given | When | Then |
|---|---|---|
| A user reports a review as abusive | An admin views the moderation queue | The reported review appears and can be removed or dismissed |

---

## US18 — SA Price Suggestions

> As a student seller, I want to see a suggested price for my listing based on publicly available South African consumer price data so that I can price my item competitively and fairly.

**Route:** `/listing/create` | Access: Authenticated students

| Task | Assignee | Status |
|---|---|---|
| Research suitable SA public dataset (Stats SA CPI, SARB, or other) | Dev 4 | 📋 To Do |
| Document chosen data source and justify its reliability | Dev 4 | 📋 To Do |
| Build data ingestion script or API call to fetch current price index | Dev 4 | 📋 To Do |
| Map CPI categories to listing categories and compute price suggestion | Dev 4 | 📋 To Do |
| Display suggested price range on listing creation form | Dev 4 | 📋 To Do |

**Acceptance Tests**

| Given | When | Then |
|---|---|---|
| A seller creates an Electronics listing | The form loads | A suggested price range based on SA consumer price data is displayed |
| The SA data source is updated | The ingestion job runs | The displayed price suggestions reflect the updated data |

---

## US19 — Popular Categories Report

> As an admin, I want to view a report of the most popular item categories and completed transactions over time so that I can understand platform usage trends.

**Route:** `/admin/reports` | Access: Admin only

| Task | Assignee | Status |
|---|---|---|
| Aggregate completed transaction data from Firestore by category | Dev 1 | 📋 To Do |
| Build bar or line chart dashboard component | Dev 1 | 📋 To Do |
| Add date range filter to the report | Dev 1 | 📋 To Do |

**Acceptance Tests**

| Given | When | Then |
|---|---|---|
| An admin opens the analytics dashboard | They select a date range | A chart showing completed transactions per category for that period is displayed |

---

## US20 — Trade Facility Utilisation Report

> As an admin, I want to view a trade facility utilization report so that I can manage slot capacity effectively.

**Route:** `/admin/reports` | Access: Admin only

| Task | Assignee | Status |
|---|---|---|
| Aggregate slot bookings vs capacity from Firestore | Dev 2 | 📋 To Do |
| Display utilisation percentage per day and time slot | Dev 2 | 📋 To Do |

**Acceptance Tests**

| Given | When | Then |
|---|---|---|
| An admin views the facility report | All bookings for the week are loaded | Utilisation percentage is shown per day and time slot |

---

## US21 — Moderated Content Summary Report

> As an admin, I want to view a summary of flagged and moderated content so that I can monitor platform safety over time.

**Route:** `/admin/reports` | Access: Admin only

| Task | Assignee | Status |
|---|---|---|
| Count reported and removed reviews by period | Dev 5 | 📋 To Do |
| Display summary table on admin dashboard | Dev 5 | 📋 To Do |

**Acceptance Tests**

| Given | When | Then |
|---|---|---|
| An admin opens the moderation report | The data loads | A table showing total reports, removals, and dismissals for the selected period is shown |

---

## US22 — Export Reports

> As an admin, I want to export any dashboard report as a CSV or PDF so that I can share data with stakeholders offline.

**Route:** `/admin/reports` | Access: Admin only

| Task | Assignee | Status |
|---|---|---|
| Add Export as CSV button to each report using client-side CSV generation | Dev 6 | 📋 To Do |
| Add Export as PDF button using a print stylesheet or PDF library | Dev 6 | 📋 To Do |

**Acceptance Tests**

| Given | When | Then |
|---|---|---|
| An admin views a report | They click Export as CSV | A CSV file is downloaded containing the report data |
| An admin views a report | They click Export as PDF | A formatted PDF of the report is downloaded |

---

## US24 — Sponsored Listings

> As a student seller, I want to sponsor my listing so that it appears as a pop-up ad or in an ad banner on other users' screens to increase visibility and sell my item faster.

**Route:** `/sponsor/:listingId` | Access: Listing owner only

| Task | Assignee | Status |
|---|---|---|
| Design sponsorship UI with duration options (e.g., 7 days, 30 days) | Dev 6 | 📋 To Do |
| Add Sponsor Listing button on seller's active listings | Dev 6 | 📋 To Do |
| Create sponsorship payment flow (integrate with existing payment gateway) | Dev 6 | 📋 To Do |
| Add isSponsored and sponsorshipExpiry fields to listing Firestore document | Dev 6 | 📋 To Do |
| Build pop-up ad component that appears on user login/session | Dev 6 | 📋 To Do |
| Build ad banner component that appears on marketplace home and category pages | Dev 6 | 📋 To Do |
| Add Sponsored badge to sponsored listings in search results | Dev 6 | 📋 To Do |
| Implement auto-expiry of sponsorship after duration ends | Dev 6 | 📋 To Do |
| Prevent sponsorship of flagged or moderated listings | Dev 6 | 📋 To Do |
| Add close/dismiss button on pop-up ads | Dev 6 | 📋 To Do |

**Acceptance Tests**

| Given | When | Then |
|---|---|---|
| A logged-in student seller views one of their active listings | They click Sponsor Listing and complete the sponsorship payment | The listing is marked as sponsored and appears in ad placements |
| A sponsored listing is active | Another user logs into the platform | The sponsored listing appears as a pop-up ad (once per session or as configured) |
| A sponsored listing is active | A user browses the marketplace | The sponsored listing appears within an ad banner or sponsored section |
| A sponsored listing appears in search results | A user views the listing card | A visible Sponsored or Ad badge is displayed |
| A seller sponsors a listing for 7 days | The sponsorship period expires | The listing no longer appears in ads and the sponsored badge is removed |
| A listing has been flagged as abusive | The seller tries to sponsor that listing | The sponsorship option is disabled with an explanation message |
| A sponsored pop-up ad appears | The user clicks the close button | The pop-up closes and the user returns to their previous activity |

---

## US25 — Responsive Design for Small Screens

> As a user with a small-screen device, I want the purchase interface to remain fully usable without horizontal scrolling or cut-off elements so that I can complete purchases reliably regardless of my screen size.

**Epic:** Cross-cutting | **Sprint:** 3 | **Priority:** Medium

**All Devs** — Apply to all pages across the platform

| Task | Assignee | Status |
|---|---|---|
| Apply responsive styles to purchase pages (listing, checkout, payment) | All Devs | 📋 To Do |
| Ensure touch targets are ≥44x44px on all interactive elements | All Devs | 📋 To Do |
| Test and fix modals and dialogs on screens ≤375px | All Devs | 📋 To Do |
| Ensure no horizontal scrolling on any page | All Devs | 📋 To Do |
| Verify text remains readable (min 14px body text) on small screens | All Devs | 📋 To Do |
| Test responsive behaviour on actual devices or emulators | All Devs | 📋 To Do |

**Acceptance Tests**

| Given | When | Then |
|---|---|---|
| A user with a screen width of 375px or less | They open any purchase page | All content is visible without horizontal scrolling and text remains readable |
| A user on a small-screen device | They interact with buttons or form inputs | Each touch target is at least 44x44 pixels and spaced to prevent accidental taps |
| A user on a small-screen device | They navigate through the purchase flow | All critical UI elements (price, buy button, quantity selector) are fully visible |
| A modal or dialog opens | Viewed on a screen width of 375px or less | The modal content is scrollable if needed and all buttons remain accessible |

---

## Task Allocation Summary

| Dev | Tasks |
|-----|-------|
| Dev 1 | US11 (Staff Confirm Item Receipt and Release) + US19 (Popular Categories Report) |
| Dev 2 | US12 (Configure Facility Hours and Capacity) + US20 (Trade Facility Utilisation Report) |
| Dev 3 | US13 (Online Payment) + US14 (Partial Payment with Cash Shortfall) |
| Dev 4 | US15 (Staff Confirm Cash Shortfall) + US18 (SA Price Suggestions) |
| Dev 5 | US17 (Moderate Abusive Content) + US21 (Moderated Content Summary Report) |
| Dev 6 | US22 (Export Reports) + US24 (Sponsored Listings) |
| All Devs | US25 (Responsive Design for Small Screens) — applied across all pages |

---
