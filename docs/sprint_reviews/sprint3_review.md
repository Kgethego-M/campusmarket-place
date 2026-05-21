# Sprint 3 Review – Campus Marketplace

## 1. Project Information

* **Project Name:** Campus Marketplace
* **Sprint:** Sprint 3
* **Sprint Duration:** 27 April – 10 May 2026
* **Review Type:** Sprint Demonstration & Evaluation

---

## 2. Sprint Goal

The goal of Sprint 3 was to:

* Improve administrative and reporting functionality
* Expand transaction and trade facility workflows
* Introduce advertisement and promotion features
* Improve analytics and operational management
* Enhance payment and booking flows
* Improve UI/UX consistency and responsiveness
* Strengthen system usability for admins, staff, buyers, and sellers

---

## 3. Demo Overview

During the Sprint Review, the team demonstrated the following completed features:

---

### 3.1 Export Reports System (US22)

The admin dashboard now supports exporting reports as both CSV and PDF.

Implemented features include:

* CSV export functionality across all major admin report tabs
* PDF export using print-friendly stylesheets
* Reusable export architecture using:

  * `useExportReport`
  * `ExportButtons`
  * `ReportCard`
* Export support for:

  * Summary Reports
  * Users
  * Moderation
  * Payments
  * Reports
  * Suspended Users
  * Utilisation Reports

---

### 3.2 Sponsored Ads & Promotions

A complete sponsored advertisement system was implemented.

Features demonstrated:

* Banner advertisements
* Premium popup advertisements
* Promote Listing feature
* Mock payment workflow for promotions
* Session-based popup controls
* Auto-close premium popup advertisements
* Firestore integration for storing and fetching ads
* AdPopup component integrated into listings page

The premium popup:

* Appears a maximum of three times per session
* Uses sessionStorage to track visibility
* Includes automatic timing and reset logic

---

### 3.3 Trade Facility Improvements

Major improvements were made to transaction and booking workflows.

Implemented functionality:

* Sellers can only book drop-offs for valid waiting transactions
* Dynamic payment messaging (`online`, `COD`, `partial`)
* Same-day booking support
* Slot availability filtering
* Double-booking prevention
* Staff workflow improvements
* Collection and drop-off gating based on booking times

Additional improvements:

* New `BookCollection.jsx`
* Improved Trade Facility dashboard behaviour
* Full-page transaction detail panels for staff

---

### 3.4 Facility Configuration & Utilisation Reporting (US12 & US20)

Admin-side operational management features were introduced.

Implemented functionality:

* Configurable operating hours
* Adjustable slots-per-hour configuration
* Dynamic slot generation
* Live slot previews
* Utilisation reporting dashboard
* Weekly utilisation tables
* Colour-coded utilisation indicators
* Booking capacity calculations

Reports now display:

* Booking utilisation percentages
* Capacity per time slot
* Daily summaries
* Weekly analytics

---

### 3.5 Analytics Dashboard

A dedicated Admin Analytics page was developed.

Features demonstrated:

* Platform statistics
* Revenue tracking
* User-type breakdowns
* Listings by category
* Bookings by weekday
* Transaction status analytics
* Charts and visual summaries

The analytics page integrates data from:

* Users
* Listings
* Bookings
* Transactions

---

### 3.6 Payments & Transaction Workflows

The team implemented and refined multiple payment-related workflows.

Completed features:

* Staff confirmation of cash shortfall settlement (US15)
* Buyer payment confirmation handling
* Promote listing payment flow (mock implementation)
* Dynamic payment status updates

Additional work:

* Stripe payment integration attempt
* Frontend payment flow preparation
* Success and cancel payment pages

Due to backend deployment issues, mock payments were used for the sprint demonstration.

---

### 3.7 Price Suggestions for Listings (US18)

A pricing recommendation system was implemented.

Features include:

* CPI dataset integration
* Category mapping
* Suggested price ranges during listing creation
* Research and integration of South African public datasets

---

### 3.8 Reporting & Moderation Features

New moderation and reporting functionality was added.

Implemented features:

* Report user functionality
* Report listing functionality
* Report review functionality
* Suspended users tab
* Moderation search tools
* Notification improvements

---

### 3.9 UI/UX Improvements

Significant UI and usability improvements were completed across the application.

Enhancements include:

* Dark mode support using ThemeContext
* Responsive layout fixes for smaller devices
* Improved profile layouts
* Improved navigation and loaders
* View Cart implementation
* Multiple-image support
* Better mobile responsiveness
* Notification improvements

Dark mode now:

* Persists using localStorage
* Applies globally across the application
* Uses theme-aware styling

---

### 3.10 Documentation & Team Coordination

The sprint also included:

* Updated Sprint documentation
* Use case diagrams
* Retrospectives
* Sprint minutes
* Shared repository updates
* Integration support between teammates

---

## 4. What Was Not Fully Completed

The following items remain incomplete or partially implemented:

* Real Stripe payment integration
* Full PayStack/PayFast verification
* Complete backend deployment for payment services
* Full dark mode refactoring across all components
* Automated testing coverage improvements

---

## 5. Challenges Encountered

### 5.1 Payment Integration Delays

* PayStack and PayFast approvals delayed implementation
* Backend deployment issues prevented real Stripe checkout
* Mock payment system used for demonstrations

---

### 5.2 Merge Conflicts & Shared Components

* Multiple conflicts occurred while merging dashboard changes
* Shared components were occasionally missing after pulls
* Manual conflict resolution and testing were required

---

### 5.3 Dark Mode Refactoring

* Hardcoded colours prevented full dark mode compatibility
* Additional refactoring was required across components

---

### 5.4 Deployment & Testing Issues

* Azure deployment difficulties
* GitHub memory limitations affecting tests
* Some tests temporarily skipped during deployment troubleshooting

---

### 5.5 Time-Based Booking Logic

* Complex date/time slot parsing
* Same-day booking edge cases
* Synchronisation between booking and staff workflows

---

## 6. Outcomes & Achievements

Despite the challenges encountered, the team successfully:

* Delivered a complete export reporting system
* Implemented sponsored advertisements and popup promotions
* Expanded trade facility functionality
* Added advanced analytics and utilisation reporting
* Improved moderation and reporting workflows
* Implemented dark mode support
* Improved system responsiveness and UI consistency
* Enhanced transaction workflows and operational logic

The sprint significantly improved both:

* Administrative capabilities
* Operational workflows for trade facilities and transactions

---

## 7. Stakeholder Feedback (Product Owner)

### Positive Feedback

* Strong improvements in admin functionality
* Professional export reporting features
* Improved operational workflow management
* Enhanced UI/UX consistency
* Effective analytics dashboard implementation

### Concerns Raised

* Real payment integration still pending
* Some deployment and testing instability
* Dark mode still requires refinement in a few areas

---

## 8. Next Steps (Sprint 4)

The following priorities were identified for Sprint 4:

* Finalize real payment integration
* Improve automated testing coverage
* Continue dark mode refactoring
* Stabilize deployment pipeline
* Improve backend deployment reliability
* Refine analytics and reporting
* Expand notification workflows
* Improve component reuse and documentation

---

## 9. Conclusion

Sprint 3 successfully expanded the operational and administrative capabilities of the Campus Marketplace system. The team delivered major features including export reporting, sponsored advertisements, analytics dashboards, trade facility enhancements, moderation tools, and dark mode support.

Although payment integration and deployment stability remain areas for improvement, the sprint goals were achieved and the system is now significantly more feature-complete and operationally mature.

---

**Prepared by:** Tebogo Sebopela
**Date:** 11 May 2026
