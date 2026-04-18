# Product Backlog

**Campus Marketplace** | Software Design 2026  
**Prepared:** 30 March 2026 | **Backend:** Firebase | **Frontend:** React

---

## Epic Overview

| Epic | Description | Sprint | Stories | Priority |
|---|---|---|---|---|
| E1 | User Verification & Roles | Sprint 1 | US1, US2 | 🔴 High |
| E2 | Item Listings | Sprint 1 | US3, US4, US5 | 🔴 High / 🟡 Medium |
| E3 | Buyer Experience | Sprint 2 | US6, US7, US8 | 🔴 High |
| E4 | In-App Messaging | Sprint 2 | US9 | 🟡 Medium |
| E5 | Trade Facility Management | Sprint 2 | US10, US11, US12 | 🟡 Medium |
| E6 | Payments | Sprint 2 | US13, US14, US15 | 🔴 High / 🟡 Medium |
| E7 | Rating & Trust System | Sprint 3 | US16, US17 | 🟡 Medium |
| E8 | SA Data Integration | Sprint 2 | US18 | 🟡 Medium |
| E9 | Analytics & Reporting | Sprint 3 | US19–US22 | 🔵 Low |

---

## E1 · User Verification & Roles — Sprint 1

### US1 — Student Registration & Login
> **Priority:** 🔴 High | **Status:** ✅ Complete

As a student, I want to register and log in using a third-party identity provider so that my identity is verified and my account is secure.

| Task | Status |
|---|---|
| Research & choose identity provider (Firebase Auth / Google OAuth) | ✅ Done |
| Configure identity provider credentials and app settings | ✅ Done |
| Build login and registration page UI | ✅ Done |
| Integrate frontend auth flow with chosen provider | ✅ Done |
| Store user profile in Firestore on first login | ✅ Done |
| Implement route guards — redirect unauthenticated users to login | ✅ Done |

**Acceptance Tests**

| Given | When | Then |
|---|---|---|
| A new student visits the site | They click Sign Up and complete the identity provider flow | Their account is created and they are redirected to the home page as a Student role |
| A registered student is logged out | They enter valid credentials | They are authenticated and land on their dashboard |
| An unauthenticated user tries to access a protected page | They navigate directly via URL | They are redirected to the login page |

---

### US2 — Role Assignment
> **Priority:** 🔴 High | **Status:** ✅ Complete

As an admin, I want to assign roles (Student, Trade Facility Staff, Admin) to users so that each user only has access to features appropriate to their role.

| Task | Status |
|---|---|
| Define roles in Firestore user schema | ✅ Done |
| Implement RBAC using Firebase custom claims | ✅ Done |
| Build admin UI to view users and assign or change roles | ✅ Done |
| Write tests confirming Students cannot access Staff or Admin pages | ✅ Done |

**Acceptance Tests**

| Given | When | Then |
|---|---|---|
| A logged-in admin opens the user management panel | They assign a user the Trade Facility Staff role and save | That user gains staff feature access and loses student-only access |
| A student user is authenticated | They attempt to access the admin dashboard URL directly | They receive an Access Denied response |

---

## E2 · Item Listings — Sprint 1

### US3 — Create an Item Listing
> **Priority:** 🔴 High | **Status:** ✅ Complete

As a student seller, I want to create an item listing with photos, description, category, condition rating, and price so that other students can discover and purchase or trade my item.

| Task | Status |
|---|---|
| Design listing creation form UI | ✅ Done |
| Implement photo upload (min. 1, max. 5) using Firebase Storage | ✅ Done |
| Build category dropdown (Textbooks, Electronics, Furniture, Clothing, Other) | ✅ Done |
| Build condition rating selector (New, Like New, Good, Fair, Poor) | ✅ Done |
| Add listing type toggle: For Sale / For Trade / Either | ✅ Done |
| Save listing document to Firestore linked to seller UID | ✅ Done |
| Show success confirmation and redirect to new listing page | ✅ Done |

**Acceptance Tests**

| Given | When | Then |
|---|---|---|
| A logged-in student completes all required listing fields | They submit the form | A new listing is created and visible on the marketplace |
| A student creates a listing and uploads a photo | The form is submitted | The photo is stored in Firebase Storage and displayed on the listing page |
| A student leaves a required field empty | They click Submit | The form shows a validation error and does not submit |

---

### US4 — Edit or Remove a Listing
> **Priority:** 🟡 Medium | **Status:** ✅ Complete

As a student seller, I want to edit or delete my own listings so that I can keep them accurate or remove items that are no longer available.

| Task | Status |
|---|---|
| Show Edit and Delete buttons only to the listing owner | ✅ Done |
| Build pre-populated edit form from Firestore data | ✅ Done |
| Implement delete with confirmation dialog | ✅ Done |
| Add Firestore security rules preventing non-owners from editing or deleting | ✅ Done |

**Acceptance Tests**

| Given | When | Then |
|---|---|---|
| A logged-in seller views their own listing | They click Edit, update the price, and save | The listing reflects the new price immediately |
| A logged-in seller views their own listing | They click Delete and confirm | The listing is removed from the marketplace |
| A student who did not create a listing | They attempt to access the edit URL directly | They are denied access with an error |

---

### US5 — Mark Listing Type
> **Priority:** 🟡 Medium | **Status:** ✅ Complete

As a student seller, I want to mark my listing as for sale, for trade, or either so that buyers know what kind of exchange I am open to.

| Task | Status |
|---|---|
| Add `listingType` field to Firestore listing schema | ✅ Done |
| Display listing type badge prominently on listing card and detail page | ✅ Done |
| Allow filtering by listing type on the browse page | ✅ Done |

**Acceptance Tests**

| Given | When | Then |
|---|---|---|
| A seller creates a listing and selects For Trade | The listing is published | A For Trade badge is visible on the listing card and detail page |
| A buyer browses listings and filters by For Sale | The filter is applied | Only listings marked For Sale or Either are shown |

---

## E3 · Buyer Experience — Sprint 2

### US6 — Search and Filter Listings
> **Priority:** 🔴 High | **Status:** 📋 To Do

As a student buyer, I want to search and filter listings by category, condition, and price so that I can quickly find items I am looking for.

| Task | Status |
|---|---|
| Build search bar with Firestore full-text or Algolia integration | 📋 To Do |
| Implement category, condition, and price range filter controls | 📋 To Do |
| Display filtered results in responsive listing grid | 📋 To Do |
| Show empty state when no results match | 📋 To Do |

**Acceptance Tests**

| Given | When | Then |
|---|---|---|
| A buyer is on the browse page | They type "Calculus" into the search bar | Only listings with "Calculus" in the title or description are shown |
| A buyer filters by Electronics and condition New | The filters are applied | Only New Electronics listings are returned |
| No listings match the search query | The buyer submits the search | A friendly no results message is displayed |

---

### US7 — View Seller Rating
> **Priority:** 🟡 Medium | **Status:** 📋 To Do

As a student buyer, I want to view a seller's rating and transaction history so that I can assess their trustworthiness before buying.

| Task | Status |
|---|---|
| Display average star rating and review count on seller profile | 📋 To Do |
| Show completed transaction count on seller profile | 📋 To Do |
| Link seller name on listing page to their profile | 📋 To Do |

**Acceptance Tests**

| Given | When | Then |
|---|---|---|
| A buyer views a listing | They click on the seller's name | The seller's profile opens showing their rating and completed transaction count |
| A seller has no reviews | A buyer views their profile | The profile shows "No reviews yet" |

---

### US8 — Initiate Purchase or Trade Offer
> **Priority:** 🔴 High | **Status:** 📋 To Do

As a student buyer, I want to initiate a purchase or trade offer on a listing so that I can begin the transaction process.

| Task | Status |
|---|---|
| Add Buy Now and Make Trade Offer buttons on listing detail page | 📋 To Do |
| Create Firestore transaction document on offer initiation | 📋 To Do |
| Notify seller of new offer via in-app notification | 📋 To Do |
| Allow seller to accept or decline the offer | 📋 To Do |

**Acceptance Tests**

| Given | When | Then |
|---|---|---|
| A logged-in buyer views a For Sale listing | They click Buy Now | A transaction is created and the seller receives a notification |
| A seller receives an offer | They click Accept | The transaction status updates to Accepted and the buyer is notified |

---

## E4 · In-App Messaging — Sprint 2

### US9 — Buyer-Seller Chat
> **Priority:** 🟡 Medium | **Status:** 📋 To Do

As a student, I want to chat with a buyer or seller through the platform so that I can negotiate and arrange transaction details safely without sharing personal contact information.

| Task | Status |
|---|---|
| Design chat UI (message list and input box) | 📋 To Do |
| Implement real-time chat using Firestore or Firebase Realtime Database | 📋 To Do |
| Restrict chat to the two parties involved in a transaction | 📋 To Do |
| Add unread message badge indicator | 📋 To Do |

**Acceptance Tests**

| Given | When | Then |
|---|---|---|
| A buyer initiates an offer | The seller opens the transaction chat | Both parties can send and receive messages in real time |
| A student tries to access a chat they are not part of | They attempt to open the chat URL | They are denied access |

---

## E5 · Trade Facility Management — Sprint 2

### US10 — Book Drop-Off Slot
> **Priority:** 🟡 Medium | **Status:** 📋 To Do

| Task | Status |
|---|---|
| Display available time slots for the trade facility | 📋 To Do |
| Allow students involved in an accepted transaction to book a slot | 📋 To Do |
| Store booking in Firestore and prevent double-booking | 📋 To Do |
| Send booking confirmation notification to student | 📋 To Do |

---

### US11 — Staff Confirm Item Receipt and Release
> **Priority:** 🟡 Medium | **Status:** 📋 To Do

| Task | Status |
|---|---|
| Build staff dashboard showing upcoming drop-offs and collections | 📋 To Do |
| Add Confirm Drop-Off and Confirm Collection buttons per transaction | 📋 To Do |
| Update Firestore transaction status on each confirmation | 📋 To Do |
| Notify both parties when item status changes | 📋 To Do |

---

### US12 — Configure Facility Hours and Capacity
> **Priority:** 🔵 Low | **Status:** 📋 To Do

| Task | Status |
|---|---|
| Build admin settings UI for operating hours and slots per hour | 📋 To Do |
| Store facility config in Firestore and apply to slot availability logic | 📋 To Do |

---

## E6 · Payments — Sprint 2

### US13 — Online Payment
> **Priority:** 🔴 High | **Status:** 📋 To Do

| Task | Status |
|---|---|
| Research and select payment gateway (PayFast / Yoco / Stripe) | 📋 To Do |
| Integrate payment gateway checkout into transaction flow | 📋 To Do |
| Record payment status in Firestore on webhook confirmation | 📋 To Do |
| Display payment confirmation to buyer and seller | 📋 To Do |

**Acceptance Tests**

| Given | When | Then |
|---|---|---|
| A buyer accepts a transaction and proceeds to payment | They complete the payment gateway flow | The transaction is marked Paid and both parties are notified |
| A payment fails | The gateway returns an error | The transaction remains unpaid and the buyer sees an error message |

---

### US14 — Partial Payment with Cash Shortfall
> **Priority:** 🟡 Medium | **Status:** 📋 To Do

| Task | Status |
|---|---|
| Allow buyer to enter a partial payment amount at checkout | 📋 To Do |
| Record online amount paid and outstanding cash shortfall in Firestore | 📋 To Do |
| Display outstanding cash amount clearly to trade facility staff | 📋 To Do |

**Acceptance Tests**

| Given | When | Then |
|---|---|---|
| A buyer pays R300 of a R500 item online | The payment is confirmed | The transaction shows R200 outstanding cash shortfall |

---

### US15 — Staff Confirm Cash Shortfall Settled
> **Priority:** 🟡 Medium | **Status:** 📋 To Do

| Task | Status |
|---|---|
| Show outstanding cash amount on staff transaction view | 📋 To Do |
| Add Confirm Cash Received button, locked until item is present | 📋 To Do |
| Update Firestore transaction to Fully Paid on confirmation | 📋 To Do |

---

## E7 · Rating & Trust System — Sprint 3

### US16 — Leave Rating and Review
> **Priority:** 🟡 Medium | **Status:** 📋 To Do

As a student, I want to leave a star rating and written review after a completed transaction so that others can make informed decisions about trading with that person.

| Task | Status |
|---|---|
| Prompt both parties to rate after transaction is marked complete | 📋 To Do |
| Build star rating and text review submission form | 📋 To Do |
| Store review in Firestore and recalculate average rating for user | 📋 To Do |
| Display reviews on user profile page | 📋 To Do |

**Acceptance Tests**

| Given | When | Then |
|---|---|---|
| A transaction is marked complete | Both parties are prompted to leave a review | Each can submit a star rating and written review |
| A user receives a new review | The review is submitted | Their average rating is updated immediately on their profile |
| A user tries to review the same transaction twice | They attempt to submit a second review | The form shows an error and the duplicate is not saved |

---

### US17 — Moderate Abusive Content
> **Priority:** 🔵 Low | **Status:** 📋 To Do

| Task | Status |
|---|---|
| Add Report button on each review visible to all users | 📋 To Do |
| Build admin moderation queue showing reported reviews | 📋 To Do |
| Allow admin to remove review or dismiss report | 📋 To Do |

---

## E8 · SA Data Integration — Sprint 2

### US18 — SA Price Suggestions for Listings
> **Priority:** 🟡 Medium | **Status:** 📋 To Do

As a student seller, I want to see a suggested price for my listing based on publicly available South African consumer price data so that I can price my item competitively and fairly.

| Task | Status |
|---|---|
| Research suitable SA public dataset (Stats SA CPI, SARB, or other) | 📋 To Do |
| Document chosen data source and justify its reliability | 📋 To Do |
| Build data ingestion script or API call to fetch current price index | 📋 To Do |
| Map CPI categories to listing categories and compute price suggestion | 📋 To Do |
| Display suggested price range on listing creation form | 📋 To Do |

**Acceptance Tests**

| Given | When | Then |
|---|---|---|
| A seller creates an Electronics listing | The form loads | A suggested price range based on SA consumer price data is displayed |
| The SA data source is updated | The ingestion job runs | The displayed price suggestions reflect the updated data |

---

## E9 · Analytics & Reporting — Sprint 3

### US19 — Popular Categories Report
> **Priority:** 🔵 Low | **Status:** 📋 To Do

| Task | Status |
|---|---|
| Aggregate completed transaction data from Firestore by category | 📋 To Do |
| Build bar or line chart dashboard component | 📋 To Do |
| Add date range filter to the report | 📋 To Do |

---

### US20 — Trade Facility Utilisation Report
> **Priority:** 🔵 Low | **Status:** 📋 To Do

| Task | Status |
|---|---|
| Aggregate slot bookings vs capacity from Firestore | 📋 To Do |
| Display utilisation percentage per day and time slot | 📋 To Do |

---

### US21 — Moderated Content Summary Report
> **Priority:** 🔵 Low | **Status:** 📋 To Do

| Task | Status |
|---|---|
| Count reported and removed reviews by period | 📋 To Do |
| Display summary table on admin dashboard | 📋 To Do |

---

### US22 — Export Reports as CSV or PDF
> **Priority:** 🔵 Low | **Status:** 📋 To Do

| Task | Status |
|---|---|
| Add Export as CSV button to each report using client-side CSV generation | 📋 To Do |
| Add Export as PDF button using a print stylesheet or PDF library | 📋 To Do |

**Acceptance Tests**

| Given | When | Then |
|---|---|---|
| An admin views a report | They click Export as CSV | A CSV file is downloaded containing the report data |
| An admin views a report | They click Export as PDF | A formatted PDF of the report is downloaded |

---

## Status Key

| Symbol | Meaning |
|---|---|
| ✅ Done | Completed and merged |
| 🔄 In Progress | Actively being worked on |
| 📋 To Do | Not yet started |
| ⚠️ Blocked | Blocked by dependency |

## Priority Key

| Symbol | Meaning |
|---|---|
| 🔴 High | Must be in this sprint |
| 🟡 Medium | Should be in this sprint |
| 🔵 Low | Nice to have / Sprint 3 |
