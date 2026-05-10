# SPRINT 3 PLANNING DOCUMENT

## 1. Sprint Overview

Sprint 3 focuses on administrative and operational features, payment handling, moderation tools, reporting, and platform enhancements. The sprint also includes responsive design improvements and sponsored listings to drive engagement and revenue.

## 2. Sprint Goal

Deliver a working system that includes:

- Staff item receipt and release confirmation
- Facility hours and capacity configuration
- Online payment and partial payment with cash shortfall handling
- Staff confirmation of cash shortfall payments
- Abusive content moderation
- SA price suggestions for sellers
- Popular categories, facility utilisation, and moderated content reports
- Report export functionality (CSV/PDF)
- Sponsored listings (pop-up and banner ads)
- Responsive design for small screens across all pages

## 3. Selected Backlog Items

- US11: Staff Confirm Item Receipt and Release
- US12: Configure Facility Hours and Capacity
- US13: Online Payment
- US14: Partial Payment with Cash Shortfall
- US15: Staff Confirm Cash Shortfall
- US17: Moderate Abusive Content
- US18: SA Price Suggestions
- US19: Popular Categories Report
- US20: Trade Facility Utilisation Report
- US21: Moderated Content Summary Report
- US22: Export Reports
- US23: Sponsored Listings
- US24: Responsive Design for Small Screens

## 4. Task Allocation

Tasks were assigned as follows:

| Dev | Task |
|-----|------|
| Dev 1 | US11 (Staff Confirm Item Receipt and Release) + US19 (Popular Categories Report) |
| Dev 2 | US12 (Configure Facility Hours and Capacity) + US20 (Trade Facility Utilisation Report) |
| Dev 3 | US13 (Online Payment) + US14 (Partial Payment with Cash Shortfall) |
| Dev 4 | US15 (Staff Confirm Cash Shortfall) + US18 (SA Price Suggestions) |
| Dev 5 | US17 (Moderate Abusive Content) + US21 (Moderated Content Summary Report) |
| Dev 6 | US22 (Export Reports) + US24 (Sponsored Listings) |
| All Devs | US25 (Responsive Design for Small Screens) — applied across all pages |

## 5. Dependencies Identified

- Payment gateway integration (US13, US14) must be completed before cash shortfall confirmation (US15) can be fully tested
- Moderation queue (US17) must be completed before moderated content summary report (US21) can display data
- Popular categories report (US19) and facility utilisation report (US20) depend on completed transactions and bookings from Sprint 2
- Sponsored listings (US23) require listing schema to include sponsorship fields (isSponsored, sponsorshipExpiry)
- Export functionality (US22) requires all report data structures to be finalised
- All team members must have Sprint 2 codebase merged and stable before starting
- Responsive design fixes should be applied incrementally and reviewed collectively

## 6. Definition of Done

- All features implemented and tested
- Acceptance tests pass for each user story
- Code reviewed and merged
- Payment gateway works in test mode
- Reports generate accurate data from real transactions
- Responsive design works on screens ≤ 375px wide
- Sponsored listings appear correctly as pop-ups and banners
- No critical bugs
- CI/CD pipeline functional

## 7. Tools and Technologies

- Firebase (Auth, Firestore, Hosting)
- Payment Gateway (e.g., PayStack, Yoco, or Stripe — SA compatible)
- Cloudinary (Image storage)
- Charting Library (for reports — e.g., Chart.js or Recharts)
- GitHub (Version control and project management)
