# SPRINT 4 REVIEW

**Project Name:** Campus Marketplace
**Sprint:** Sprint 4 (Final Sprint)
**Sprint Duration:** 12 – 17 May 2025
**Review Type:** Sprint Demonstration & Evaluation

---

# 1. Sprint Goal

The goal of Sprint 4 was to:

* Complete all remaining transaction, notification, and reporting workflows
* Fully implement ad promotion & payment system with Stripe
* Finalise admin dashboard with export capabilities and revenue tracking
* Fix UI inconsistencies, rename “Cart” to “Favourites”, and polish user experience
* Deliver a fully integrated, deployment-ready application

---

# 2. Demo Overview

During the Sprint Review, the team demonstrated the following completed features:

---

## 2.1 Trade & Transaction Logic

* Buyers can now initiate trade offers
* Sellers can accept or decline trade offers
* Buyers can cancel initiated transactions before acceptance
* Staff dashboard allows confirmation of cash payments during collection
* Partial payments integrated with revenue increment logic

---

## 2.2 Ad Promotion & Payments (Stripe)

* Added “Promote Listing” functionality
* Fully integrated Stripe checkout session creation and webhook handling
* Automatic ad creation after successful payment
* Ads stored in Firestore and displayed instantly
* Added ad revenue tracking in Admin Dashboard

### Revenue Categories

| Revenue Type    | Description                                     |
| --------------- | ----------------------------------------------- |
| Listing Revenue | Revenue generated from marketplace transactions |
| Ad Revenue      | Revenue generated from promoted listings        |
| Total Revenue   | Combined listing + ad revenue                   |

---

## 2.3 Admin Dashboard Enhancements

* CSV/PDF export added to:

  * Suspended Users
  * Completed Transactions

* Revenue breakdown dashboard implemented

* Admins can warn users directly

* Added Reported Users Summary table

* Added Admin Preview Mode (`?preview=true`) for listings and profiles

---

## 2.4 Reporting System (Finalised)

* Reporting integrated into listings, reviews, and user profiles
* Added proof photo uploads (up to 5 images) using Cloudinary
* Added validation for report descriptions
* User profiles now show report history
* Admin warnings stored in Firestore user documents
* Reports now store the resolving admin ID

---

## 2.5 Staff Dashboard & Notifications

* Added “Member Since” using Firebase Auth metadata
* Facility hours now pulled live from Firestore
* Staff can send overdue alerts
* Improved notifications:

  * “Mark all as read”
  * Most recent notifications first
  * Direct redirection to related item

---

## 2.6 Profile & UI Polish

* Renamed “Cart” to “Favourites” throughout the system
* Improved profile layouts with full-screen design
* Fixed rating stars glitch
* Fixed My Purchases tab text colour issues
* Replaced alerts with proper pop-ups
* Added initials-based avatars in Admin Dashboard

---

## 2.7 Backend & CI/CD

* Fixed Stripe backend endpoint issues
* Added `verify-session` endpoint
* Updated Firestore Security Rules
* Fixed failing CI tests in `ListingDetail.test.jsx`
* Frontend and backend successfully deploy to Azure

---

# 3. What Was Not Completed

All planned Sprint 4 features were completed successfully.

No major backlog items remain.

---

# 4. Challenges Encountered

| Challenge                                                        | Resolution                                                             |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Merge conflicts in `Admindashboard.jsx` and `PromoteSuccess.jsx` | Manual conflict resolution while preserving teammate functionality     |
| Firestore quota exceeded                                         | Upgraded to Blaze plan and implemented idempotent writes               |
| Stripe 404 production issue                                      | Configured `VITE_API_URL` correctly in GitHub Actions                  |
| Corrupted `stripe_payments.py` file                              | Recreated file using proper UTF-8 encoding                             |
| Backend test failures                                            | Added `get_stripe()` helper function                                   |
| Duplicate ad creation in React Strict Mode                       | Used Stripe session ID as Firestore document ID and added session lock |

---

# 5. Outcomes & Achievements

* 100% feature completion for the final sprint
* Fully automated ad promotion system
* Complete reporting and moderation workflow
* Admin dashboard now supports export and revenue analytics
* Fully integrated Stripe payment system
* Stable CI/CD deployment pipeline
* Improved UI consistency across the platform
* Updated sprint documentation and reviews

---

# 6. Stakeholder Feedback (Product Owner)

## Positive Feedback

* Full buy/sell/trade workflow functions correctly end-to-end
* Stripe integration exceeded expectations
* Reporting system is detailed and user-friendly
* UI improvements significantly improved usability
* “Favourites” terminology is clearer and more intuitive

## Concerns Raised

* No major concerns raised

---

# 7. Next Steps (Post-Sprint)

* Final deployment to production
* User acceptance testing
* Performance monitoring
* Documentation handover
* Final stakeholder presentation

---

# 8. Conclusion

Sprint 4 successfully delivered a fully integrated and deployment-ready marketplace application.

The sprint completed all planned functionality, including:

* Trade workflows
* Stripe payment integration
* Admin reporting and analytics
* Moderation and reporting systems
* UI and notification improvements

Despite several technical challenges involving deployment, Stripe integration, Firestore limits, and merge conflicts, the team successfully delivered a stable and production-ready system.

---

**Prepared by:** Tebogo Sebopela
**Date:** 17 May 2025
