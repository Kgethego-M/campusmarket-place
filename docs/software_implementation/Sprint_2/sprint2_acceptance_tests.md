# Acceptance Tests — Campus Marketplace

## Sprint 2

### US-D1 — Student Dashboard & Profile

**Test 1: Student dashboard loads**
- **Given** a logged-in student opens their dashboard
- **When** the page loads
- **Then** they see their profile info, active listings, and transaction summary

**Test 2: View seller public profile**
- **Given** a buyer views a seller listing
- **When** they click the seller's name
- **Then** the seller's public profile opens showing rating and listings

### US-D2 — Staff Dashboard & Profile

**Test 1: Staff dashboard loads**
- **Given** a logged-in staff member opens their dashboard
- **When** the page loads
- **Then** they see upcoming drop-offs and collections with confirm buttons

**Test 2: Student denied staff dashboard access**
- **Given** a student tries to access /staff/dashboard
- **When** they navigate to the URL
- **Then** they are shown the AccessDenied page

### US-D3 — Admin Dashboard & Profile

**Test 1: Admin dashboard loads**
- **Given** a logged-in admin opens their dashboard
- **When** the page loads
- **Then** they see platform stats and links to user management and moderation

**Test 2: Student denied admin dashboard access**
- **Given** a student tries to access /admin/dashboard
- **When** they navigate to the URL
- **Then** they are shown the AccessDenied page

### US7 — View Seller Rating

**Test 1: View seller rating from listing**
- **Given** a buyer views a listing
- **When** they click on the seller's name
- **Then** the seller's profile opens showing their average rating and completed transaction count

**Test 2: Seller with no reviews**
- **Given** a seller has no reviews yet
- **When** a buyer views their profile
- **Then** the profile shows 'No reviews yet' and a rating of 0

### US8 — Initiate Purchase or Trade Offer

**Test 1: Buyer initiates purchase**
- **Given** a logged-in buyer views a For Sale listing
- **When** they click Buy Now
- **Then** a transaction is created with status pending and the seller receives a notification

**Test 2: Seller accepts offer**
- **Given** a seller receives a trade offer
- **When** they click Accept
- **Then** the transaction status updates to Accepted and the buyer is notified

**Test 3: Seller declines offer**
- **Given** a seller receives an offer they don't want
- **When** they click Decline
- **Then** the transaction status updates to Declined and the buyer is notified

**Test 4: Owner views own listing**
- **Given** the listing owner views their own listing
- **When** the page loads
- **Then** the Buy Now and Make Trade Offer buttons are not visible

### US9 — Buyer-Seller Chat

**Test 1: Real-time messaging**
- **Given** a buyer initiates an offer and a transaction is created
- **When** either party opens the chat
- **Then** both parties can send and receive messages in real time

**Test 2: Unauthorized chat access denied**
- **Given** a student tries to access a chat they are not part of
- **When** they navigate to the chat URL
- **Then** they are denied access and shown an error

**Test 3: Unread message badge updates**
- **Given** a user receives a new message while on their dashboard
- **When** the page is open
- **Then** an unread message badge updates in real time

### US10 — Book Drop-Off Slot

**Test 1: Successful slot booking**
- **Given** a student has an accepted transaction
- **When** they select an available slot and confirm
- **Then** the slot is booked and a confirmation notification is sent

**Test 2: Slot already booked**
- **Given** a slot is already fully booked
- **When** a student tries to book it
- **Then** the slot shows as unavailable and cannot be selected

**Test 3: Student without accepted transaction cannot book**
- **Given** a student without an accepted transaction tries to book
- **When** they access the booking page
- **Then** they are redirected with an error message

### US16 — Leave Rating and Review

**Test 1: Both parties prompted to review**
- **Given** a transaction is marked complete
- **When** both parties are prompted to leave a review
- **Then** each can submit a star rating and written review

**Test 2: Average rating updates immediately**
- **Given** a user receives a new review
- **When** the review is submitted
- **Then** their average rating is updated immediately on their profile

**Test 3: Duplicate review prevented**
- **Given** a user tries to review the same transaction twice
- **When** they attempt to submit a second review
- **Then** the form shows an error and the duplicate is not saved
