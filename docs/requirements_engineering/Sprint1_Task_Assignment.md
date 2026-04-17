# Sprint 1 — Task Assignment

**Software Design 2026** | Prepared: 30 March 2026  
**Backend:** Firebase + Google Auth | **Frontend:** React  
**Duration:** 31 March – 13 April 2026 (14 days) | **Team:** 6 Developers

---

## Sprint Goal

Deliver a working registration, login, and role system backed by Firebase Auth and Google OAuth, together with full listing creation, editing, and type-flagging capability. All features must be deployed to Firebase Hosting via the CI/CD pipeline before sprint close.

---

## Story Summary

| Developer | Story | Description | Epic | Priority | Points |
|---|---|---|---|---|---|
| Dev 1 | — | Project setup & Firebase config | Infra | 🔴 Blocker | ~3 |
| Dev 2 | US1 | Student registration & login | E1 | 🔴 High | 5 |
| Dev 3 | US2 | Role assignment | E1 | 🔴 High | 3 |
| Dev 4 | US3 | Create an item listing | E2 | 🔴 High | 5 |
| Dev 5 | US4 | Edit or remove a listing | E2 | 🟡 Medium | 3 |
| Dev 6 | US5 | Mark listing type | E2 | 🟡 Medium | 2 |

**Total: 18 story points**

---

## Critical Day-1 Dependencies

```
Dev 1 → shares Firebase config → everyone else can begin
Dev 3 → finalises Firestore user schema → Dev 2 can store user profiles
Dev 4 + Dev 6 → agree listing schema (listingType field) → both can write to Firestore
Dev 1 → sets up Firebase Storage permissions → Dev 4 can test photo uploads
Dev 3 → publishes role schema → Dev 5 can write Firestore security rules
```

---

## Definition of Done

- [ ] All acceptance tests pass with no failing scenarios
- [ ] Code reviewed and merged to `main` via pull request
- [ ] Firestore security rules deployed and tested in Firebase console
- [ ] UI components responsive — tested on mobile and desktop
- [ ] CI/CD pipeline (GitHub Actions → Firebase Hosting) active and passing
- [ ] No critical or high-severity bugs open at sprint close
- [ ] Each member has regular, incremental commits spread across the sprint

---

## Developer Breakdowns

### Dev 1 — Project Setup & Firebase Config
> **Priority:** Blocker | **Points:** ~3 | Must complete Day 1

| # | Task | Status |
|---|---|---|
| 1 | Create and configure Firebase project (Auth, Firestore, Storage, Hosting) | ✅ Done |
| 2 | Set up Git repo folder structure: `/public`, `/src`, `/functions` | ✅ Done |
| 3 | Add Firebase SDK to the HTML shell and confirm connection works | ✅ Done |
| 4 | Set up GitHub Actions CI/CD — lint + deploy on push to `main` | ✅ Done |
| 5 | Write `.env.example` and README with setup instructions | ✅ Done |
| 6 | Share Firebase config keys with the team via secure channel | ✅ Done |

**Acceptance Tests**

| Given | When | Then |
|---|---|---|
| A teammate clones the repo and follows the README | They run the setup steps | The app loads and Firebase connects without errors |
| A push is made to `main` | GitHub Actions workflow triggers | The app builds and deploys to Firebase Hosting successfully |

---

### Dev 2 — US1: Student Registration & Login
> **Priority:** High | **Points:** 5

| # | Task | Status |
|---|---|---|
| 1 | Configure Google OAuth in the Firebase console (enable provider, set redirect URIs) | ✅ Done |
| 2 | Build the login and registration page UI (`login.html`) | ✅ Done |
| 3 | Integrate `signInWithPopup` / `signInWithRedirect` using Firebase Auth SDK | ✅ Done |
| 4 | On first login, write user profile document to Firestore (`uid`, `email`, `displayName`, `role: 'student'`) | ✅ Done |
| 5 | Implement route guards — check `onAuthStateChanged` and redirect if unauthenticated | ✅ Done |
| 6 | Write acceptance tests for all three scenarios | ✅ Done |

**Acceptance Tests**

| Given | When | Then |
|---|---|---|
| A new student visits the site | They click Sign Up and complete the Google OAuth flow | Their account is created and they are redirected to the home page as a Student role |
| A registered student is logged out | They enter valid credentials | They are authenticated and land on their dashboard |
| An unauthenticated user tries to access a protected page | They navigate directly via URL | They are redirected to the login page |

---

### Dev 3 — US2: Role Assignment
> **Priority:** High | **Points:** 3

> ⚠️ Share the agreed schema in the team chat immediately — Dev 2 and Dev 5 are blocked until this is done.

| # | Task | Status |
|---|---|---|
| 1 | Define and document Firestore user schema (`uid`, `email`, `role`, `createdAt`) | ✅ Done |
| 2 | Implement RBAC using Firebase custom claims via Cloud Function or Admin SDK | ✅ Done |
| 3 | Build admin panel — list all users, assign or change role, save to Firestore | ✅ Done |
| 4 | Write Firestore security rules blocking students from `/admin` paths | ✅ Done |
| 5 | Write tests confirming students receive Access Denied on admin URL | ✅ Done |

**Acceptance Tests**

| Given | When | Then |
|---|---|---|
| A logged-in admin opens the user management panel | They assign a user the Trade Facility Staff role and save | That user gains staff feature access and loses student-only access |
| A student user is authenticated | They attempt to access the admin dashboard URL directly | They receive an Access Denied response |

---

### Dev 4 — US3: Create an Item Listing
> **Priority:** High | **Points:** 5

> ⚠️ Coordinate with Dev 6 on the `listingType` field name and values before writing any Firestore documents.

| # | Task | Status |
|---|---|---|
| 1 | Design and build listing creation form UI (`create-listing.html`) | ✅ Done |
| 2 | Implement photo upload (min 1, max 5) to Firebase Storage — store download URLs in Firestore | ✅ Done |
| 3 | Build category dropdown (Textbooks, Electronics, Furniture, Clothing, Other) | ✅ Done |
| 4 | Build condition selector (New, Like New, Good, Fair, Poor) | ✅ Done |
| 5 | Add listing type toggle: For Sale / For Trade / Either (coordinate field name with Dev 6) | ✅ Done |
| 6 | Save listing document to Firestore with `sellerUID`, `timestamp`, and all form fields | ✅ Done |
| 7 | Show success confirmation and redirect to new listing detail page | ✅ Done |
| 8 | Implement client-side validation — show inline errors for empty required fields | ✅ Done |

**Acceptance Tests**

| Given | When | Then |
|---|---|---|
| A logged-in student completes all required listing fields | They submit the form | A new listing is created and visible on the marketplace |
| A student creates a listing and uploads a photo | The form is submitted | The photo is stored in Firebase Storage and displayed on the listing page |
| A student leaves a required field empty | They click Submit | The form shows a validation error and does not submit |

---

### Dev 5 — US4: Edit or Remove a Listing
> **Priority:** Medium | **Points:** 3

> Start once Dev 3 has published the user schema and Dev 4 has the listing schema in Firestore.

| # | Task | Status |
|---|---|---|
| 1 | Show Edit and Delete buttons only when the logged-in user is the listing owner (match `uid`) | ✅ Done |
| 2 | Build a pre-populated edit form — load existing listing data from Firestore on page load | ✅ Done |
| 3 | Implement delete with a confirmation dialog before issuing the Firestore delete call | ✅ Done |
| 4 | Write Firestore security rules: only owner (`request.auth.uid == resource.data.sellerUID`) may update or delete | ✅ Done |
| 5 | Test all three acceptance scenarios including direct URL access by a non-owner | ✅ Done |

**Acceptance Tests**

| Given | When | Then |
|---|---|---|
| A logged-in seller views their own listing | They click Edit, update the price, and save | The listing reflects the new price immediately |
| A logged-in seller views their own listing | They click Delete and confirm | The listing is removed from the marketplace |
| A student who did not create a listing | They attempt to access the edit URL directly | They are denied access with an error |

---

### Dev 6 — US5: Mark Listing Type
> **Priority:** Medium | **Points:** 2

> ⚠️ Agree on `listingType` field name and values with Dev 4 on Day 1. Then add the toggle as a PR on top of Dev 4's form.

| # | Task | Status |
|---|---|---|
| 1 | Agree `listingType` field name and allowed values with Dev 4 (e.g. `'sale'`, `'trade'`, `'either'`) | ✅ Done |
| 2 | Add listing type toggle UI to creation form (separate PR on top of Dev 4's work) | ✅ Done |
| 3 | Display For Sale / For Trade / Either badge on listing card and detail page | ✅ Done |
| 4 | Build browse page (`browse.html`) with filter by listing type | ✅ Done |
| 5 | Ensure listings marked `Either` appear in both For Sale and For Trade filter results | ✅ Done |
| 6 | Write acceptance tests for badge display and filter behaviour | ✅ Done |

**Acceptance Tests**

| Given | When | Then |
|---|---|---|
| A seller creates a listing and selects For Trade | The listing is published | A For Trade badge is visible on the listing card and detail page |
| A buyer browses listings and filters by For Sale | The filter is applied | Only listings marked For Sale or Either are shown |

---

## Academic Integrity Reminders

- Commits must be **incremental and spread across the sprint** — not clustered in the 24 hours before the deadline
- Each commit must be **attributable to the individual** who wrote the code
- Markers will review the **full git commit history** — a spike of commits before a deadline is a red flag
- The GitHub Actions pipeline must be **active and building throughout the sprint**
- Each member must individually submit a **written retrospective (200–400 words)** at sprint end
- Retrospectives will be **cross-referenced with git commit history**
- At the sprint viva, markers will ask you to **explain specific parts of the codebase live**
