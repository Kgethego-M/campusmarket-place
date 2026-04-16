# SPRINT 2 PLANNING DOCUMENT

## 1. Sprint Overview

Sprint 2 builds on the foundation established in Sprint 1. The focus of this sprint is to deliver a complete buyer experience, in-app messaging, user dashboards and profiles for all roles, and a seller rating system.

## 2. Sprint Goal

Deliver a working system that includes:

- Complete user dashboards for Student, Staff, and Admin roles
- Seller rating and review system
- Purchase and trade offer initiation
- Real-time buyer-seller chat
- Trade facility slot booking

## 3. Selected Backlog Items

- US-D1: Student Dashboard & Profile
- US-D2: Staff Dashboard & Profile
- US-D3: Admin Dashboard & Profile
- US7: View Seller Rating
- US8: Initiate Purchase or Trade Offer
- US9: Buyer-Seller Chat
- US10: Book Drop-Off Slot
- US16: Leave Rating and Review
- Sprint 1 Gap Fix: Wire up CreateListing, AdminUsers, AccessDenied

## 4. Task Allocation

Tasks were assigned as follows:

| Dev | Task |
|-----|------|
| Dev 1 | Student Dashboard & Profile + Book Drop-Off Slot (US10) |
| Dev 2 | Staff Dashboard & Profile + Sprint 1 Gap Fix |
| Dev 3 | Admin Dashboard & Profile |
| Dev 4 | Initiate Purchase or Trade Offer (US8) |
| Dev 5 | Buyer-Seller Chat (US9) |
| Dev 6 | View Seller Rating (US7) + Leave Rating and Review (US16) |

## 5. Dependencies Identified

- Student Dashboard must be completed before transaction history can be linked
- Transaction schema must be agreed upon before chat and slot booking can begin
- Review schema must be finalised before rating display can be implemented
- All team members must have Sprint 1 codebase merged and stable before starting

## 6. Definition of Done

- All features implemented and tested
- Code reviewed and merged
- CI/CD pipeline functional
- Real-time features (chat, notifications) work consistently
- No critical bugs

## 7. Tools and Technologies

- Firebase (Auth, Firestore, Hosting)
- Cloudinary (Image storage)
- GitHub (Version control and project management)
