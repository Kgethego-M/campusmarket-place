# SPRINT 2 REVIEW

## 1. Project Information
- **Project Name:** Campus Marketplace
- **Sprint:** Sprint 2
- **Sprint Duration:** 13 – 19 April 2026
- **Review Type:** Sprint Demonstration & Evaluation

---

## 2. Sprint Goal
The goal of Sprint 2 was to:
- Extend core marketplace functionality
- Improve user experience and UI consistency
- Introduce transaction-related features
- Begin backend integration with Azure
- Strengthen testing and deployment pipeline

---

## 3. Demo Overview

During the Sprint Review, the team demonstrated the following completed features:

### 3.1 Listings & Marketplace Enhancements
- Improved **View Listings UI**
- Added **search and filtering functionality**
- Fixed image refresh issues
- Implemented **Edit/Delete functionality** for user listings
- Added **“My Listings” tab** in user profile

---

### 3.2 Ratings & Reviews System
- Created **View Ratings page**
- Implemented **Leave Rating & Review feature**
- Built logic for:
  - Post-transaction review prompts
  - Rating aggregation and recalculation
- Integrated review data with user profiles

---

### 3.3 User Profiles & Dashboards
- Developed **Profile page**
- Built **Admin dashboard**
- Added **Trade Facility staff dashboard**
- Implemented:
  - Notification system
  - Profile-based listing retrieval
  - User activity tracking (history, offers)

---

### 3.4 Chat System (UI Implementation)
- Redesigned chat interface (WhatsApp-style)
- Features include:
  - Conversation sidebar
  - Media sharing panel
  - Responsive mobile layout
  - Improved navigation (back buttons)
- Prepared for backend integration (currently using mock data)

---

### 3.5 Transaction & Booking Features
- Designed and prototyped:
  - **Book Drop-Off Slot (US10)**
  - Trade facility workflows
- Implemented frontend mockups and initial logic

---

### 3.6 DevOps & CI/CD Improvements
- Implemented **GitHub Actions pipeline**
- Added **test-gated deployment**
- Integrated **Codecov (partial)**
- Ensured deployments only occur when tests pass

---

### 3.7 Media Handling
- Integrated **Cloudinary** for media storage
- Connected media handling with Firebase backend

---

### 3.8 Documentation & Project Structure
- Restructured documentation into organized folders
- Converted `.docx` and `.pdf` files into `.md`
- Updated:
  - Product backlog
  - Sprint backlog
  - Acceptance tests
  - Wireframes & mockups
  - README.md

---

## 4. What Was Not Completed

The following items were not fully completed:

- Azure backend integration
- Full API connectivity between frontend and backend
- Final implementation of transaction features (dependent on backend)
- Complete Codecov integration (backend pending)

---

## 5. Challenges Encountered

### 5.1 Azure CORS Issues
- Major blocker preventing frontend-backend communication
- Requests blocked due to missing/misconfigured headers
- Delayed multiple features dependent on API access

---

### 5.2 Dependency on Backend Integration
- Several features (chat, transactions) rely on backend
- Mock data used as temporary workaround

---

### 5.3 Merge Conflicts & Integration Issues
- Frequent conflicts during feature integration
- Required additional debugging and coordination

---

## 6. Outcomes & Achievements

Despite challenges, the team successfully:

- Delivered a **fully functional frontend system**
- Implemented **core marketplace features**
- Built **ratings, profiles, dashboards, and UI systems**
- Established a **CI/CD pipeline**
- Improved **project documentation and structure**
- Identified and documented **critical system dependencies**

---

## 7. Stakeholder Feedback (Product Owner)

- Positive feedback on:
  - UI/UX improvements
  - Feature completeness on frontend
  - Documentation structure
- Concerns raised:
  - Delays in backend integration
  - Need for fully functional transaction system

---

## 8. Next Steps (Sprint 3)

The following priorities were identified:

- Resolve Azure CORS issues
- Complete backend integration
- Replace mock data with real database connections
- Finalize transaction workflows
- Improve test coverage (backend + frontend)
- Stabilize system and reduce bugs

---

## 9. Conclusion

Sprint 2 successfully delivered major frontend functionality and system improvements. While backend integration challenges limited full feature completion, the team established a strong foundation for Sprint 3 to finalize system connectivity and complete remaining features.

---

**Prepared by:** Tebogo Sebopela
**Date:** 19 April 2026