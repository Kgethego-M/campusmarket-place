# Campus Marketplace
Link to the deployed app: https://campus-market-place-dnczhjgjc0bqh4ew.southafricanorth-01.azurewebsites.net/

## Codecov Badge
[![codecov](https://codecov.io/gh/Kgethego-M/campusmarket-place/graph/badge.svg?token=VMCA8P0M48)](https://codecov.io/gh/Kgethego-M/campusmarket-place)

This is the foundation for the Campus Marketplace, built using **Vite**, **React (JSX)**, and **Firebase**.

## Project Infrastructure
- **Bundler:** Vite 8.0.3
- **Database:** Cloud Firestore
- **Authentication:** Firebase Auth (Google OAuth)
- **Storage:** Cloudinary Storage (Website Media)
- **Deployment:** Azure App Service via GitHub Actions (CI/CD)

---

## Documentation
All project documentation can be found in the **`docs/`** folder in this repository. This includes:
- Software Requirements Specification (SRS)
- Architecture and design documents
- Testing reports

The **Product Backlog** and **Sprint Backlogs** are accessible from two places:
- The `docs/` folder in this repository
- [GitHub Projects](https://github.com/Kgethego-M/campusmarket-place/projects) on this repository

---

## Reviewer Access Guide

The app uses **Google OAuth** via Firebase. Reviewers must sign in with a real Google-linked account that matches the role they are reviewing.

### Student
Sign up using the **Student** role with a verifiable **`@students.wits.ac.za`** email address.

### Staff
Sign up using the **Staff** role with a verifiable **`@wits.ac.za`** email address.

### Admin
Admin access is restricted to pre-approved emails only — sign up using the **Admin** role with one of emails specified in the submission document:

> **Note:** If you sign up with an email that does not match the role you selected, access will be denied. Make sure to choose the correct role for your email on the sign-up screen.

---

## Getting Started

Follow these steps to set up your local development environment.

### 1. Clone and Install
```bash
git clone https://github.com/Kgethego-M/campusmarket-place.git
cd campusmarket-place
npm install
```

### 2. Environment Variables
The `.env` file contains sensitive credentials and is not committed to the repository. A restricted Google Drive link containing the `.env` file has been shared with reviewers via Moodle submissions — download it and place it in the root of the project before running the app.

> If you have not received access to the Google Drive link, please contact the project team.

> **Note:** Contact the project team for the actual environment variable values — they are not committed to the repository for security reasons.

### 3. Run the Backend
The backend is a Python FastAPI server and must be running before the frontend will function correctly. Open a **separate terminal** in the project root and run:

```bash
cd backend
python -m uvicorn main:app --reload --port 8000
```

> Make sure you have Python and the required dependencies installed. If you haven't already, install them with:
> ```bash
> pip install -r requirements.txt
> ```

### 4. Run the Frontend
In a second terminal, start the Vite dev server:

```bash
npm run dev
```

The app will be available at `http://localhost:5173` by default.

---

## CI/CD Pipeline
- **Provider:** GitHub Actions
- **Trigger:** Automatic deployment on every push to the `main` branch
- **Build Command:** `npm run build` (Vite)
- **Deploy Target:** Azure App Service
