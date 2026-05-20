# Acceptance Tests — Campus Marketplace

## Sprint 1

### US1 — Student Registration & Login

**Test 1: New student registration**
- **Given** a new student visits the site
- **When** they click Sign Up and complete the Google OAuth flow
- **Then** their account is created and they are redirected to the home page as a Student role

**Test 2: Existing student login**
- **Given** a registered student is logged out
- **When** they enter valid credentials
- **Then** they are authenticated and land on their dashboard

**Test 3: Unauthenticated access protection**
- **Given** an unauthenticated user tries to access a protected page
- **When** they navigate directly via URL
- **Then** they are redirected to the login page

### US2 — Role Assignment

**Test 1: Admin assigns new role**
- **Given** a logged-in admin opens the user management panel
- **When** they assign a user the Trade Facility Staff role and save
- **Then** that user gains staff feature access and loses student-only access

**Test 2: Student denied admin access**
- **Given** a student user is authenticated
- **When** they attempt to access the admin dashboard URL directly
- **Then** they receive an Access Denied response

### US3 — Create an Item Listing

**Test 1: Successful listing creation**
- **Given** a logged-in student completes all required listing fields
- **When** they submit the form
- **Then** a new listing is created and visible on the marketplace

**Test 2: Photo upload**
- **Given** a student creates a listing and uploads a photo
- **When** the form is submitted
- **Then** the photo is stored in Firebase Storage and displayed on the listing page

**Test 3: Validation prevents incomplete submission**
- **Given** a student submitting a listing leaves a required field empty
- **When** they click Submit
- **Then** the form shows a validation error and does not submit

### US4 — Edit or Remove a Listing

**Test 1: Edit own listing**
- **Given** a logged-in seller views their own listing
- **When** they click Edit, update the price, and save
- **Then** the listing reflects the new price immediately

**Test 2: Delete own listing**
- **Given** a logged-in seller views their own listing
- **When** they click Delete and confirm
- **Then** the listing is removed from the marketplace

**Test 3: Non-owner denied edit access**
- **Given** a student who did not create a listing
- **When** they attempt to access the edit URL directly
- **Then** they are denied access with an error

### US5 — Mark Listing Type

**Test 1: Listing type badge displays correctly**
- **Given** a seller creates a listing and selects For Trade
- **When** the listing is published
- **Then** a For Trade badge is visible on the listing card and detail page

**Test 2: Filter by listing type**
- **Given** a buyer browses listings and filters by For Sale
- **When** the filter is applied
- **Then** only listings marked For Sale or Either are shown

---
