import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";

function EditListing() {
  const { listingId } = useParams();
  const navigate = useNavigate();

  const [listing, setListing] = useState(null);
  const [title, setTitle] = useState("");
  const [price, setPrice] = useState("");
  const [description, setDescription] = useState("");
  const [condition, setCondition] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [showConfirm, setShowConfirm] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Load listing from sessionStorage instead of Firebase (temporary)
  useEffect(() => {
    const stored = sessionStorage.getItem("listings");

    if (!stored) {
      setError("No listings found in session.");
      setLoading(false);
      return;
    }

    const listings = JSON.parse(stored);
    const found = listings.find((l) => l.id === listingId);

    if (!found) {
      setError("Listing not found.");
      setLoading(false);
      return;
    }

    // For now assume current user owns all listings (as Dev 4 instructed)
    // When Firebase auth is ready, replace this with uid check
    setListing(found);
    setTitle(found.title);
    setPrice(found.price);
    setDescription(found.description);
    setCondition(found.condition);
    setLoading(false);
  }, [listingId]);

  // Save updated listing back to sessionStorage
  function handleSave() {
    if (!title || !price) {
      setError("Title and price are required.");
      return;
    }

    const stored = sessionStorage.getItem("listings");
    const listings = JSON.parse(stored);

    const updated = listings.map((l) => {
      if (l.id === listingId) {
        return { ...l, title, price, description, condition };
      }
      return l;
    });

    sessionStorage.setItem("listings", JSON.stringify(updated));
    setSaveSuccess(true);
    setError("");

    // Navigate back after short delay so user sees success message
    setTimeout(() => navigate("/listings"), 1500);
  }

  // Delete listing from sessionStorage
  function handleDelete() {
    const stored = sessionStorage.getItem("listings");
    const listings = JSON.parse(stored);
    const updated = listings.filter((l) => l.id !== listingId);
    sessionStorage.setItem("listings", JSON.stringify(updated));
    navigate("/listings");
  }

  if (loading) return <p>Loading...</p>;
  if (error) return <p style={{ color: "red" }}>{error}</p>;

  return (
    <div style={{ padding: "20px", maxWidth: "600px", margin: "0 auto" }}>
      <h2>Edit Listing</h2>

      {saveSuccess && (
        <p style={{ color: "green", fontWeight: "bold" }}>
          ✅ Listing updated successfully!
        </p>
      )}

      <div style={{ marginBottom: "12px" }}>
        <label>Title</label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          style={{ display: "block", width: "100%", padding: "8px", marginTop: "4px" }}
        />
      </div>

      <div style={{ marginBottom: "12px" }}>
        <label>Price (R)</label>
        <input
          type="number"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          style={{ display: "block", width: "100%", padding: "8px", marginTop: "4px" }}
        />
      </div>

      <div style={{ marginBottom: "12px" }}>
        <label>Description</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          style={{ display: "block", width: "100%", padding: "8px", marginTop: "4px" }}
          rows={4}
        />
      </div>

      <div style={{ marginBottom: "12px" }}>
        <label>Condition</label>
        <select
          value={condition}
          onChange={(e) => setCondition(e.target.value)}
          style={{ display: "block", width: "100%", padding: "8px", marginTop: "4px" }}
        >
          <option value="">Select condition</option>
          <option value="New">New</option>
          <option value="Like New">Like New</option>
          <option value="Good">Good</option>
          <option value="Fair">Fair</option>
          <option value="Poor">Poor</option>
        </select>
      </div>

      {error && <p style={{ color: "red" }}>{error}</p>}

      {/* Save button */}
      <button
        onClick={handleSave}
        style={{ backgroundColor: "green", color: "white", padding: "10px 20px", marginRight: "10px", border: "none", borderRadius: "4px", cursor: "pointer" }}
      >
        Save Changes
      </button>

      {/* Delete button */}
      <button
        onClick={() => setShowConfirm(true)}
        style={{ backgroundColor: "red", color: "white", padding: "10px 20px", border: "none", borderRadius: "4px", cursor: "pointer" }}
      >
        Delete Listing
      </button>

      {/* Confirmation dialog */}
      {showConfirm && (
        <div style={{ marginTop: "20px", padding: "16px", border: "1px solid red", borderRadius: "8px" }}>
          <p>Are you sure you want to delete this listing? This cannot be undone.</p>
          <button
            onClick={handleDelete}
            style={{ backgroundColor: "red", color: "white", padding: "8px 16px", marginRight: "10px", border: "none", borderRadius: "4px", cursor: "pointer" }}
          >
            Yes, Delete
          </button>
          <button
            onClick={() => setShowConfirm(false)}
            style={{ padding: "8px 16px", border: "1px solid gray", borderRadius: "4px", cursor: "pointer" }}
          >
            Cancel
          </button>
        </div>
      )}

      {/* Back button */}
      <div style={{ marginTop: "20px" }}>
        <button
          onClick={() => navigate("/listings")}
          style={{ padding: "8px 16px", border: "1px solid gray", borderRadius: "4px", cursor: "pointer" }}
        >
          ← Back to Listings
        </button>
      </div>
    </div>
  );
}

export default EditListing;