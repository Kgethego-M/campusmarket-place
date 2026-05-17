# Sprint 4 — Day 5 Minutes

**Date:** Saturday, 17 May 2025

-----

## Victor

**Yesterday:**

- Added offer cancellation button to delete an initiated transaction before it is accepted

**Today:**

- Fixed small-screen layout for Chat and My Listings in Profile
- Fixed the promotion button to be unclickable after a listing has been promoted
- Fixed Trade Facility to remove a listing where drop-off has been confirmed
- Added cancellation of a purchase to Listing Details
- Documentation for the sprint
- Individual sprint retrospective

**Blockers:** Waiting for group members to send content for the Sprint 3 retrospective

-----

## Athalia

**Yesterday:**

- Fixed glitching stars in reviews
- Changed colour of tab text in My Purchases
- Changed alerts to pop-ups for the partial payment minimum

**Today:**

- Make shifts dynamic in the staff dashboard so that admin time changes are reflected in real time
- Connect the Staff page to revenue — increment when staff confirm payment for partial and full cash transactions
- Fix payments
- Add pop-ups and remove remaining alerts
- Fix flow of notifications associated with worked-on pages

**Blockers:** None

-----

## Mmaphefo

**Yesterday:**

- Finalised testing and reviewed completed changes before submission

**Today:**

- Pushed all completed work and updates to the GitHub repository

**Blockers:** None

-----

## Tebogo

**Yesterday:**

- Worked on Ad payments
- Added CSV and PDF export on the Suspended page in Admin

**Today:**

- Fixed ad payments and backend Python issues
- Created a local `minimal_main.py` for backend testing
- Fixed CSV and PDF export in the Admin page

**Blockers:** None

-----

## Kgethie

**Yesterday:**

- Still working on notifications logic

**Today:**

- Planning to complete all outstanding notifications logic and fixes

**Blockers:** None

-----

## Nontokozo

**Yesterday:**

- Full reporting system implemented — proof photo uploads, required fields, Warn User action, Reported Users Summary table, admin preview mode for listings and profiles, `resolvedBy` Firestore field, Security Rules updates, and 3 CI test fixes

**Today:**

*ViewRating improvements:*

- Added “Listings Reported” count to the Report History summary stats — fixed a root cause bug where the count always showed 0 because listing reports store the listing ID (not the user ID) as `reportedId`; fixed with a second Firestore query to fetch the user’s listing IDs first, then match against those
- Moved the Report History table to appear above Seller Reviews
- Account Warning banner is now hidden from public view entirely — it only appears in admin preview mode (`?preview=true`), positioned after the report table
- Capped Seller Reviews, Active Listings, Pending Reports, and Resolved Reports to 3 items each, with an inline “View more / View less” toggle (replaced the original Drawer-based “View all” approach)
- Added report type pill and clickable listing name to each row in the Report History table; clicking only applies to listing-type reports (navigates to the listing) — user and review report rows are non-clickable since you are already on their profile

*Reports Page improvements:*

- Capped Pending Reports and Resolved Reports to 3 items each with an inline “View more / View less” toggle
- Both toggles reset to collapsed whenever the search input changes

**Blockers:** None