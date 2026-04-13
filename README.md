# Campus Marketplace

Link to the deployed app: https://campus-market-place-dnczhjgjc0bqh4ew.southafricanorth-01.azurewebsites.net/
This is the foundation for the Campus Marketplace, built using **Vite**, **React (JSX)**, and **Firebase**.

## Project Infrastructure (Dev 1-Kgthego)
- **Bundler:** Vite 8.0.3
- **Database:** Cloud Firestore
- **Authentication:** Firebase Auth (Google OAuth)
- **Storage:** Firebase Cloud Storage (for item photos)
- **Deployment:** Firebase Hosting via GitHub Actions (CI/CD)

---

## Getting Started

Follow these steps to set up your local development environment.

### 1. Clone and Install
```bash
git clone https://github.com/Kgethego-M/campusmarket-place.git
cd campusmarket-place
npm install
``` 

### 2. Local Development
To start the project locally, run:
```bash
npm run dev
``` 



### CI/CD Pipeline
- **Provider:** GitHub Actions
- **Trigger:** Automatic deployment on every push to the `main` branch.
- **Build Command:** `npm run build` (Vite)
- **Deploy Target:** Firebase Hosting
