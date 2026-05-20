# Sprint 4 — Day 4 Minutes

**Date:** Friday, 16 May 2025

-----

## Victor

**Yesterday:**

- Fully implemented the trade logic on the student side

**Today:**

- Trying to add an offer cancellation button to delete an initiated transaction before it is accepted

**Blockers:** None

-----

## Athalia

**Yesterday:**

- Connected the Staff page to revenue for partial and full cash transaction payment confirmations

**Today:**

- Fix glitching of stars in reviews
- Change the colour of the text on the tabs in My Purchases
- Change alerts to pop-ups for the partial payment minimum validation

**Blockers:** None

-----

## Mmaphefo

**Yesterday:**

- Fixed the cash payment logic on the staff dashboard to allow staff to confirm payment during collection

**Today:**

- Testing the implemented features and checking functionality of recent updates across the application

**Blockers:** None

-----

## Tebogo

**Yesterday:**

- Continued work on the Promote Listing page

**Today:**

- Working on payments for the Ad page
- Added CSV and PDF export buttons on the Suspended page in the Admin dashboard

**Blockers:** None

-----

## Kgethie

**Yesterday:**

- Fixed notification “mark all as read” on the student page
- Allowed search bars to search using receipt IDs
- Fixed trade transaction handling logic

**Today:**

- Trade facility (staff side) can now handle drop-offs and collections for all types of trades
- Staff can send alerts for overdue drop-offs and collections
- Most recent notifications now appear at the top
- Mark all as read works correctly
- In Profile and Trade Facility, item images and details for trade transactions now display correctly
- Still to fix: transaction cancellation (listing currently goes back up when cancelled — to be confirmed if this is the intended behaviour); cancellation logic for trade transactions still to be implemented

**Blockers:** None

-----

## Nontokozo

**Yesterday:**

- Staff Dashboard made fully functional — Member Since is now real (pulled from Firebase Auth `user.metadata.creationTime`) and facility hours are live from admin Firestore settings via `onSnapshot`
- Replaced the generic user icon in the Admin Dashboard navbar with an initials-based avatar circle
- Replaced emojis on the Reports page with Font Awesome icons

**Today:**

*Reporting System:*

- Built the full report flow — wired `ReportModal` into `ViewRating` so users can report listings, reviews, and users
- Added Cloudinary proof photo uploads (up to 5 images) with a grid preview and remove buttons; proof is required when reporting a user
- Moved the “Report user” button to the far right of the profile name row in `ViewRating`
- Made “describing what happened” required for user reports; for review/listing reports, removed the photo upload section, made description optional for reviews and required for listings
- Renamed the description field to “Reason of report” and the upload label to “Upload proof”
- Added proof photo thumbnails to each report row on the Reports page so admins can click and view submitted photos

*Admin Tools:*

- Added a Warn User action on pending user report rows — opens a modal where the admin writes a warning reason, stored in the user’s Firestore doc as a `warnings` array
- Warning banners now appear on the user’s own Profile page and on the `ViewRating` public profile, showing the reason and date of each warning
- Added a Reported Users Summary table on the Reports page — showing total, pending, dismissed, and resolved counts and top reason per reported user, with clickable names linking to the admin preview

*Admin Preview Mode:*

- When an admin clicks a reported listing, `ListingDetail` opens in read-only mode via `?preview=true` — navbar hidden, buyer/owner actions hidden, yellow “Admin preview — read-only view” banner shown with a “← Back to reports” button
- When an admin clicks a reported user, `ViewRating` also hides the navbar when opened with `?preview=true`
- In the admin preview of `ViewRating`, added a Report History card with stat tiles, scrollable report rows, and a Suspend Account button at the bottom

*Firestore & CI:*

- Added a `resolvedBy` (userId) field to the Firestore `reports` collection so the resolving admin is recorded without touching their profile document
- Updated Firestore Security Rules twice: first to fix general permissions for staff/admin operations, then specifically to allow unauthenticated reads on the `users` collection for the email pre-check
- Fixed 3 failing CI tests in `ListingDetail.test.jsx` — aligned Item Name placeholder regex, corrected empty-trade-item alert message, passed `tradeItem` as a plain string to `createTransaction`, and converted category/condition/photo blockers to soft warnings

**Blockers:** None