# Sprint 2 — Planning Document

**Campus Marketplace** | Software Design 2026  
**Prepared:** April 2026 | **Duration:** 1 Week

---

## Sprint Goals

- ✅ Deliver complete user dashboards and profiles for Student, Staff, and Admin roles
- ✅ Implement seller rating and review system (US7)
- ✅ Enable buyers to initiate purchase and trade offers (US8)
- ✅ Build real-time buyer-seller chat (US9)
- ✅ Implement trade facility slot booking (US10)
- ✅ Complete rating and review submission (US16)
- ✅ Resolve Sprint 1 gaps: properly wire up `AdminUsers.jsx`, `AccessDenied.jsx`, and `CreateListing`

---

## Story Summary

| Story ID | Title | Priority | Status |
|---|---|---|---|
| US23-D1 | Student Dashboard & Profile | 🔴 High | 📋 To Do |
| US23-D2 | Staff Dashboard & Profile | 🔴 High | 📋 To Do |
| US23-D3 | Admin Dashboard & Profile | 🔴 High | 📋 To Do |
| US-S1 | Sprint 1 Gap Fix: Wire up CreateListing, AdminUsers, AccessDenied | 🔴 High | 📋 To Do |
| US7 | View Seller Rating | 🟡 Medium | 📋 To Do |
| US8 | Initiate Purchase or Trade Offer | 🔴 High | 📋 To Do |
| US9 | Buyer-Seller Chat | 🟡 Medium | 📋 To Do |
| US10 | Book Drop-Off Slot | 🟡 Medium | 📋 To Do |
| US16 | Leave Rating and Review | 🟡 Medium | 📋 To Do |

---

## Frontend Routes

| Route | Component | Access |
|---|---|---|
| `/dashboard` | `StudentDashboard.jsx` | Authenticated students |
| `/staff/dashboard` | `StaffDashboard.jsx` | Staff & Admin only |
| `/admin/dashboard` | `AdminDashboard.jsx` | Admin only |
| `/profile/:uid` | `StudentProfile.jsx` | Public |
| `/listing/:id` | `ViewListingDetail.jsx` | Public |
| `/chat/:transactionId` | `Chat.jsx` | Transaction parties only |
| `/book-slot/:transactionId` | `SlotBooking.jsx` | Accepted transaction parties |
| `/review/:transactionId` | `ReviewForm.jsx` | Completed transaction parties |

---

## US23-D1 — Student Dashboard & Profile

> As a student, I want a personalised dashboard showing my listings, active transactions, and messages so that I can manage my marketplace activity in one place.

**Route:** `/dashboard` (private) | `/profile/:uid` (public)

| Task | Assignee | Status |
|---|---|---|
| Build `StudentDashboard.jsx` page | TBD | 📋 To Do |
| Display user profile info (name, photo, email, role) from Firestore | TBD | 📋 To Do |
| Show student's active listings with edit/delete (filter by user UID) | TBD | 📋 To Do |
| Show active transactions (buying and selling) | TBD | 📋 To Do |
| Show unread message count badge | TBD | 📋 To Do |
| Build `StudentProfile.jsx` viewable by other users | TBD | 📋 To Do |
| Display average rating and review count on profile | TBD | 📋 To Do |

**Acceptance Tests**

| Given | When | Then |
|---|---|---|
| A logged-in student opens their dashboard | The page loads | They see their profile info, active listings, and transaction summary |
| A buyer views a seller listing | They click the seller's name | The seller's public profile opens showing rating and listings |

---

## US23-D2 — Staff Dashboard & Profile

> As trade facility staff, I want a dashboard showing upcoming drop-offs, collections, and pending confirmations so that I can efficiently manage facility operations.

**Route:** `/staff/dashboard` | Access: Staff & Admin only (`useRequireRole`)

| Task | Assignee | Status |
|---|---|---|
| Build `StaffDashboard.jsx` page | TBD | 📋 To Do |
| Display upcoming drop-offs and collections from Firestore transactions | TBD | 📋 To Do |
| Add Confirm Drop-Off and Confirm Collection buttons | TBD | 📋 To Do |
| Show outstanding cash shortfall per transaction | TBD | 📋 To Do |
| Build `StaffProfile.jsx` with role badge | TBD | 📋 To Do |
| Restrict staff dashboard to staff/admin roles only | TBD | 📋 To Do |

**Acceptance Tests**

| Given | When | Then |
|---|---|---|
| A logged-in staff member opens their dashboard | The page loads | They see upcoming drop-offs and collections with confirm buttons |
| A student tries to access `/staff/dashboard` | They navigate to the URL | They are shown the AccessDenied page |

---

## US23-D3 — Admin Dashboard & Profile

> As an admin, I want a comprehensive dashboard showing platform statistics, user management, and moderation tools so that I can oversee the entire marketplace.

**Route:** `/admin/dashboard` | Access: Admin only

| Task | Assignee | Status |
|---|---|---|
| Build `AdminDashboard.jsx` as the admin home page | TBD | 📋 To Do |
| Show platform stats (total users, listings, transactions) | TBD | 📋 To Do |
| Link to User Management (`AdminUsers.jsx`) | TBD | 📋 To Do |
| Link to reported content moderation queue | TBD | 📋 To Do |
| Build `AdminProfile.jsx` with admin badge | TBD | 📋 To Do |
| Restrict admin dashboard to admin role only | TBD | 📋 To Do |

**Acceptance Tests**

| Given | When | Then |
|---|---|---|
| A logged-in admin opens their dashboard | The page loads | They see platform stats and links to user management and moderation |
| A student tries to access `/admin/dashboard` | They navigate to the URL | They are shown the AccessDenied page |

---

## US7 — View Seller Rating

> As a student buyer, I want to view a seller's rating and transaction history so that I can assess their trustworthiness before buying.

| Task | Assignee | Status | Notes |
|---|---|---|---|
| Display average star rating on seller profile page | TBD | 📋 To Do | Aggregate from `reviews` collection |
| Show total review count on seller profile | TBD | 📋 To Do | |
| Show completed transaction count on seller profile | TBD | 📋 To Do | |
| Link seller name on listing card to their profile | TBD | 📋 To Do | Route: `/profile/:uid` |
| Build star rating display component (read-only) | TBD | 📋 To Do | Reuse in US16 |

**Acceptance Tests**

| Given | When | Then |
|---|---|---|
| A buyer views a listing | They click on the seller's name | The seller's profile opens showing their average rating and completed transaction count |
| A seller has no reviews yet | A buyer views their profile | The profile shows 'No reviews yet' and a rating of 0 |

---

## US8 — Initiate Purchase or Trade Offer

> As a student buyer, I want to initiate a purchase or trade offer on a listing so that I can begin the transaction process.

| Task | Assignee | Status | Notes |
|---|---|---|---|
| Add Buy Now button on listing detail page | TBD | 📋 To Do | Visible to non-owners only |
| Add Make Trade Offer button on listing detail page | TBD | 📋 To Do | Only for For Trade listings |
| Create transaction document in Firestore on offer initiation | TBD | 📋 To Do | `status: pending` |
| Notify seller of new offer via in-app notification | TBD | 📋 To Do | Firestore notification document |
| Allow seller to accept or decline the offer | TBD | 📋 To Do | Update transaction status |
| Build listing detail page (`ViewListingDetail.jsx`) | TBD | 📋 To Do | Route: `/listing/:id` |

**Acceptance Tests**

| Given | When | Then |
|---|---|---|
| A logged-in buyer views a For Sale listing | They click Buy Now | A transaction is created with status `pending` and the seller receives a notification |
| A seller receives a trade offer | They click Accept | The transaction status updates to `Accepted` and the buyer is notified |
| A seller receives an offer they don't want | They click Decline | The transaction status updates to `Declined` and the buyer is notified |
| The listing owner views their own listing | The page loads | The Buy Now and Make Trade Offer buttons are not visible |

---

## US9 — Buyer-Seller Chat

> As a student, I want to chat with a buyer or seller through the platform so that I can negotiate and arrange transaction details safely without sharing personal contact information.

**Route:** `/chat/:transactionId` | Access: Transaction parties only

| Task | Assignee | Status | Notes |
|---|---|---|---|
| Design `Chat.jsx` UI with message list and input box | TBD | 📋 To Do | |
| Implement real-time chat using Firestore messages subcollection | TBD | 📋 To Do | `onSnapshot` listener |
| Restrict chat access to the two parties in the transaction | TBD | 📋 To Do | Check `buyerId` and `sellerId` |
| Add unread message badge on dashboard | TBD | 📋 To Do | Count unread messages |
| Mark messages as read when chat is opened | TBD | 📋 To Do | |
| Add link to chat from transaction detail page | TBD | 📋 To Do | |

**Firestore Data Structure**

```
transactions/{transactionId}/messages/{messageId}
  ├── senderId: string        (Firebase UID)
  ├── content: string
  ├── timestamp: Timestamp
  └── isRead: boolean
```

**Acceptance Tests**

| Given | When | Then |
|---|---|---|
| A buyer initiates an offer and a transaction is created | Either party opens the chat | Both parties can send and receive messages in real time |
| A student tries to access a chat they are not part of | They navigate to the chat URL | They are denied access and shown an error |
| A user receives a new message while on their dashboard | The page is open | An unread message badge updates in real time |

---

## US10 — Book Drop-Off Slot

> As a student, I want to book a drop-off time slot at the trade facility so that I can securely hand over an item I have sold.

**Route:** `/book-slot/:transactionId` | Access: Accepted transaction parties only

| Task | Assignee | Status | Notes |
|---|---|---|---|
| Build `SlotBooking.jsx` page showing available time slots | TBD | 📋 To Do | |
| Fetch available slots from Firestore facility config | TBD | 📋 To Do | |
| Allow only students in an accepted transaction to book | TBD | 📋 To Do | Check transaction status |
| Store booking in Firestore and prevent double-booking | TBD | 📋 To Do | Use Firestore transactions |
| Send booking confirmation notification to student | TBD | 📋 To Do | Firestore notification |
| Display booked slot on transaction detail page | TBD | 📋 To Do | |

**Acceptance Tests**

| Given | When | Then |
|---|---|---|
| A student has an accepted transaction | They select an available slot and confirm | The slot is booked and a confirmation notification is sent |
| A slot is already fully booked | A student tries to book it | The slot shows as unavailable and cannot be selected |
| A student without an accepted transaction tries to book | They access the booking page | They are redirected with an error message |

---

## US16 — Leave Rating and Review

> As a student, I want to leave a star rating and written review after a completed transaction so that others can make informed decisions about trading with that person.

**Route:** `/review/:transactionId` | Access: Completed transaction parties only

| Task | Assignee | Status | Notes |
|---|---|---|---|
| Prompt both parties to rate after transaction is marked complete | TBD | 📋 To Do | Show review prompt on dashboard |
| Build `ReviewForm.jsx` with star rating selector (1–5) and text input | TBD | 📋 To Do | |
| Store review in Firestore `reviews` collection | TBD | 📋 To Do | Linked to transaction and reviewer |
| Recalculate and update average rating for reviewed user | TBD | 📋 To Do | Update user document |
| Display reviews list on user profile page (most recent first) | TBD | 📋 To Do | |
| Prevent duplicate reviews per transaction | TBD | 📋 To Do | Check if review exists |

**Acceptance Tests**

| Given | When | Then |
|---|---|---|
| A transaction is marked complete | Both parties are prompted to leave a review | Each can submit a star rating and written review |
| A user receives a new review | The review is submitted | Their average rating is updated immediately on their profile |
| A user tries to review the same transaction twice | They attempt to submit a second review | The form shows an error and the duplicate is not saved |

---

## Firestore Schema Overview (Sprint 2)

```
users/{uid}
  ├── firstName, lastName, email
  ├── role: 'student' | 'staff' | 'admin'
  ├── photoURL
  ├── rating: number (average)
  ├── totalRatings: number
  └── createdAt

listings/{listingId}
  ├── sellerUID, title, description
  ├── category, condition, listingType
  ├── price, imageURLs[]
  └── createdAt, status

transactions/{transactionId}
  ├── buyerId, sellerId, listingId
  ├── status: 'pending' | 'accepted' | 'declined' | 'complete'
  ├── paymentStatus, cashShortfall
  ├── dropOffSlot
  └── messages/{messageId}
        ├── senderId, content
        ├── timestamp, isRead

reviews/{reviewId}
  ├── reviewerId, reviewedUserId
  ├── transactionId
  ├── rating: 1–5
  ├── comment
  └── createdAt

facilityConfig/
  └── slots, operatingHours, capacity
```
