# Connect Frontend to Backend TODO

## Plan Breakdown
1. [x] Add VITE_API_URL to .env
2. [x] Create src/api/listings.js (utils: fetchListings, createListing)
3. [x] Update src/components/MockCreateListing.jsx -> Use FormData + auth.user.uid + API POST
4. [x] Update src/pages/ViewListing.jsx -> Use fetchListings() instead of sessionStorage
5. [x] Update src/App.jsx -> Routes/imports for real components
6. [x] Update src/components/MockViewListing.jsx -> API fetch
7. [x] Test locally: Dev server running at http://localhost:5173/. Test login/create/view - check Network tab for API success/errors.
8. [ ] Update tests/utils (optional)
9. [x] Done: Frontend connected to backend/DB.
9. [ ] Deploy frontend

**API Base**: https://campus-marketplace-api-gwgxand7f7aggha5.southafricanorth-01.azurewebsites.net
