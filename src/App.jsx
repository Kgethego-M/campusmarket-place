import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import CreateListing from "./components/MockCreateListing.jsx";
import ViewListings from "./components/MockViewListing.jsx";

export default function App() {
    return (
        <BrowserRouter>
            <Routes>
                <Route path="/" element={<Navigate to="/create-listing" replace />} />
                <Route path="/view-listing" element={<ViewListings />} />
                <Route path="/create-listing" element={<CreateListing />} />
            </Routes>
        </BrowserRouter>
    );
}
