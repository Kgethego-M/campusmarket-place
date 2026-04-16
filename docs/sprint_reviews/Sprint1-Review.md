# Sprint 1 Review

**Campus Marketplace** | Date: 13 April 2026  
**Sprint Duration:** 31 March – 13 April 2026 (14 days)  
**Sprint Goal:** Deliver a working foundation including authentication, role-based routing, item listing creation, editing, type-flagging, and a browsable listings page.

---

## 📊 Results at a Glance

| Metric | Value |
|---|---|
| Story Points Planned | 18 |
| Story Points Completed | **18 (100%)** |
| User Stories Completed | **5 / 5 (100%)** |
| Days in Sprint | 14 |
| Team Members | 6 |
| Infrastructure Pivots | 1 (Azure → Firebase) |
| Merge Conflicts Resolved | 4 |

---

## ✅ User Stories Completed

| Story | Developer(s) | Status |
|---|---|---|
| Student registration & login (US1) | Dev 1, Dev 2 | ✅ Complete |
| Role assignment (US2) | Dev 3 | ✅ Complete |
| Create an item listing (US3) | Dev 4 | ✅ Complete |
| Edit or remove a listing (US4) | Dev 5 | ✅ Complete |
| Mark listing type & search/filter (US5) | Dev 6 | ✅ Complete |

---

## 📈 Burndown

```
Story Points Remaining
20 |
18 |*
16 | \
14 |  \      Ideal
12 |   \----\
10 |         \    Actual
 8 |          \--\
 6 |              \
 4 |               \--\
 2 |                   \
 0 |____________________|
   Day 1              Day 14
```

> The team tracked slightly behind ideal pace in days 3–7 due to the Azure infrastructure pivot, but recovered and delivered all 18 story points by sprint close.

---

## 👥 Team Contribution

| Developer | Story Points Completed |
|---|---|
| Dev 1 — Kgethego | 3 pts (Infra) |
| Dev 2 — Nontokozo | 5 pts (US1) |
| Dev 3 — Athalia | 3 pts (US2) |
| Dev 4 — Victor | 5 pts (US3) |
| Dev 5 — Tebogo | 3 pts (US4) |
| Dev 6 — Mmaphefo | 2 pts (US5) |

---

## 🗓️ Sprint Timeline

| Day | Event |
|---|---|
| Day 1 | Firebase config started |
| Days 2–4 | Azure pivot blocked progress |
| Day 4 | Team decision: pivot fully to Firebase Hosting |
| Days 5–6 | Firebase Storage permission delays — team coordination required |
| Day 7–8 | Authentication implemented; role assignment in progress |
| Day 9 | Firebase issues fully resolved; first working build |
| Days 10–12 | Create listing, edit/delete, search & filter completed |
| Days 12–13 | Integration, merge conflict resolution |
| Day 14 | Deployment — app live on Firebase Hosting |

---

## 🎯 What Was Demonstrated

- ✅ Google OAuth login via Firebase
- ✅ Role-based dashboard routing (Student / Staff / Admin)
- ✅ Create listings with photos
- ✅ Edit and delete own listings
- ✅ Listings with category, condition, and price
- ✅ Browse page with search & filter
- ✅ App deployed and accessible online
- ✅ Vitest unit tests with coverage

---

## ⚠️ What Was Not Completed / Carried Forward

| Item | Reason | Sprint 2 Action |
|---|---|---|
| Firebase Auth not fully integrated into edit/delete | Auth completion still in progress | Edit/delete temporarily uses `sessionStorage` — wire up Auth in Sprint 2 |
| Firestore security rules | Pending role schema finalisation from Dev 3 | Complete in Sprint 2 |
| Firebase Storage permissions | Required team coordination; caused early delays | Resolved by Day 9; no Sprint 2 action needed |

---

## 🚧 Challenges & Resolutions

### 1. Azure Region Policy Block
- **Problem:** `RequestDisallowedByAzure` error blocked the original hosting plan
- **Resolution:** Team decision on Day 4 to pivot fully to Firebase Hosting as primary. Azure retained as secondary/fallback only.

### 2. Firebase Storage Permission Delays
- **Problem:** Storage bucket permissions were not initially configured correctly, blocking photo upload testing
- **Resolution:** Restructured team coordination, resolved by Day 9

### 3. Merge Conflicts
- **Problem:** Parallel development on overlapping features caused 4 merge conflicts
- **Resolution:** Careful branch review and code reviews — all conflicts resolved before integration

---

## 🏗️ Infrastructure Architecture

```
GitHub
  └── GitHub Actions (CI/CD)
        ├── Firebase Hosting (Primary) ──┬── Firebase Auth
        │                                ├── Cloud Firestore
        │                                └── Firebase Storage
        └── Azure (Secondary/Fallback)
```

---

## 💬 Team Reflections

| Developer | Key Reflection |
|---|---|
| Dev 1 — Kgethego | Managed infrastructure pivot from Azure to Firebase; maintained project documentation and sprint governance |
| Dev 2 — Nontokozo | Authentication implemented successfully; integration with other features in progress |
| Dev 3 — Athalia | Successfully implemented Firebase Storage and role assignment despite initial blockers |
| Dev 4 — Victor | Successfully implemented listing creation using React in a short period |
| Dev 5 — Tebogo | Built edit/delete feature with TDD approach; resolved merge conflicts |
| Dev 6 — Mmaphefo | Implemented dynamic search and filtering; will improve testing strategy in Sprint 2 |

---

## ➡️ Sprint 2 Priorities

1. Wire up Firebase Auth properly to edit/delete (currently using `sessionStorage`)
2. Deploy Firestore security rules
3. Build Student, Staff, and Admin dashboards & profiles
4. Implement seller rating view (US7)
5. Build buyer purchase/trade offer flow (US8)
6. Real-time buyer-seller chat (US9)

→ See [Sprint 2 Planning](sprint2-planning.md)
