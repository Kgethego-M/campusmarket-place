import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";

const API_URL = import.meta.env.VITE_API_URL;

function EditListingAzure() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [title, setTitle] = useState("");
  const [price, setPrice] = useState("");
  const [description, setDescription] = useState("");
  const [condition, setCondition] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [showConfirm, setShowConfirm] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    const fetchListing = async () => {
      try {
        const response = await fetch(`${API_URL}/listings/${id}`)
;
        
        if (!response.ok) {
          throw new Error("Listing not found");
        }
        
        const found = await response.json();
        
        setTitle(found.title);
        setPrice(found.price);
        setDescription(found.description);
        setCondition(found.condition);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchListing();
  }, [id]);

  async function handleSave() {
    if (!title || !price) {
      setError("Title and price are required.");
      return;
    }

    try {
      const response = await fetch(`${API_URL}/listings/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title,
          price: parseFloat(price),
          description,
          condition
        })
      });

      if (!response.ok) {
        throw new Error("Save failed");
      }

      setSaveSuccess(true);
      setError("");
      setTimeout(() => navigate("/azure/view-listing"), 1500);
    } catch (err) {
      setError("Failed to save: " + err.message);
    }
  }

  async function handleDelete() {
    try {
      const response = await fetch(`${API_URL}/listings/${id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error("Delete failed");
      }

      navigate("/azure/view-listing")
    } catch (err) {
      setError("Failed to delete: " + err.message);
    }
  }

  if (loading) return <p>Loading...</p>;

  return (
    <div style={{
      minHeight: "100vh",
      backgroundColor: "#f0f4f8",
      padding: "40px 20px",
      fontFamily: "'Segoe UI', sans-serif"
    }}>
      <div style={{
        maxWidth: "600px",
        margin: "0 auto",
        backgroundColor: "white",
        borderRadius: "16px",
        boxShadow: "0 4px 20px rgba(0,0,0,0.1)",
        padding: "40px",
        border: "1px solid #dce3ed"
      }}>
        <h1 style={{
          textAlign: "center",
          color: "#4a90d9",
          fontWeight: "800",
          fontSize: "28px",
          marginBottom: "8px",
          fontFamily: "'Impact', 'Arial Black', sans-serif",
          letterSpacing: "1px"
        }}>
          Campus Marketplace
        </h1>
        <h2 style={{
          textAlign: "center",
          color: "#333",
          fontWeight: "600",
          fontSize: "18px",
          marginBottom: "28px"
        }}>
          Edit Listing (Azure)
        </h2>

        {saveSuccess && (
          <div style={{
            backgroundColor: "#e6f4ea",
            border: "1px solid #a8d5b5",
            borderRadius: "8px",
            padding: "12px 16px",
            marginBottom: "20px",
            color: "#2d6a4f",
            fontWeight: "600",
            textAlign: "center"
          }}>
             Listing updated successfully!
          </div>
        )}

        {error && (
          <div style={{
            backgroundColor: "#fdecea",
            border: "1px solid #f5c6c6",
            borderRadius: "8px",
            padding: "12px 16px",
            marginBottom: "20px",
            color: "#c0392b",
            fontWeight: "600",
            textAlign: "center"
          }}>
            ⚠️ {error}
          </div>
        )}

        <div style={{ marginBottom: "18px" }}>
          <label style={{ fontWeight: "600", color: "#444", display: "block", marginBottom: "6px" }}>
            Title
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            style={{
              width: "100%", padding: "10px 14px", borderRadius: "8px",
              border: "1px solid #ccd6e0", fontSize: "14px", outline: "none", boxSizing: "border-box"
            }}
          />
        </div>

        <div style={{ marginBottom: "18px" }}>
          <label style={{ fontWeight: "600", color: "#444", display: "block", marginBottom: "6px" }}>
            Price (R)
          </label>
          <input
            type="number"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            style={{
              width: "100%", padding: "10px 14px", borderRadius: "8px",
              border: "1px solid #ccd6e0", fontSize: "14px", outline: "none", boxSizing: "border-box"
            }}
          />
        </div>

        <div style={{ marginBottom: "18px" }}>
          <label style={{ fontWeight: "600", color: "#444", display: "block", marginBottom: "6px" }}>
            Description
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            style={{
              width: "100%", padding: "10px 14px", borderRadius: "8px",
              border: "1px solid #ccd6e0", fontSize: "14px", outline: "none",
              resize: "vertical", boxSizing: "border-box"
            }}
          />
        </div>

        <div style={{ marginBottom: "28px" }}>
          <label style={{ fontWeight: "600", color: "#444", display: "block", marginBottom: "6px" }}>
            Condition
          </label>
          <select
            value={condition}
            onChange={(e) => setCondition(e.target.value)}
            style={{
              width: "100%", padding: "10px 14px", borderRadius: "8px",
              border: "1px solid #ccd6e0", fontSize: "14px", outline: "none",
              backgroundColor: "white", boxSizing: "border-box"
            }}
          >
            <option value="">Select condition</option>
            <option value="New">New</option>
            <option value="Like New">Like New</option>
            <option value="Good">Good</option>
            <option value="Fair">Fair</option>
            <option value="Poor">Poor</option>
          </select>
        </div>

        <div style={{ display: "flex", gap: "12px", marginBottom: "16px" }}>
          <button
            onClick={handleSave}
            style={{
              flex: 1, padding: "12px", backgroundColor: "#27ae60",
              color: "white", border: "none", borderRadius: "8px",
              fontSize: "15px", fontWeight: "600", cursor: "pointer"
            }}
          >
            Save Changes
          </button>
          <button
            onClick={() => setShowConfirm(true)}
            style={{
              flex: 1, padding: "12px", backgroundColor: "#e74c3c",
              color: "white", border: "none", borderRadius: "8px",
              fontSize: "15px", fontWeight: "600", cursor: "pointer"
            }}
          >
            Delete Listing
          </button>
        </div>

        {showConfirm && (
          <div style={{
            backgroundColor: "#fff5f5",
            border: "1px solid #f5c6c6",
            borderRadius: "10px",
            padding: "20px",
            marginBottom: "16px",
            textAlign: "center"
          }}>
            <p style={{ fontWeight: "600", color: "#333", marginBottom: "14px" }}>
              Are you sure you want to delete this listing? This cannot be undone.
            </p>
            <div style={{ display: "flex", gap: "10px", justifyContent: "center" }}>
              <button
                onClick={handleDelete}
                style={{
                  padding: "10px 24px", backgroundColor: "#e74c3c", color: "white",
                  border: "none", borderRadius: "8px", fontWeight: "600", cursor: "pointer"
                }}
              >
                Yes, Delete
              </button>
              <button
                onClick={() => setShowConfirm(false)}
                style={{
                  padding: "10px 24px", backgroundColor: "white", color: "#333",
                  border: "1px solid #ccc", borderRadius: "8px", fontWeight: "600", cursor: "pointer"
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        <button
          onClick={() => navigate("/azure/view-listing")}
          style={{
            width: "100%", padding: "11px", backgroundColor: "white",
            color: "#4a90d9", border: "2px solid #4a90d9", borderRadius: "8px",
            fontSize: "14px", fontWeight: "600", cursor: "pointer"
          }}
        >
          ← Back to Listings
        </button>

      </div>
    </div>
  );
}

export default EditListingAzure;