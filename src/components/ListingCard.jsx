import { useNavigate } from "react-router-dom";

export default function ListingCard({ listing }) {
    const navigate = useNavigate();

    return (
        <div style={{
            width: "280px",
            backgroundColor: "white",
            borderRadius: "12px",
            boxShadow: "0 2px 12px rgba(0,0,0,0.08)",
            border: "1px solid #dce3ed",
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
        }}>
            {listing.photos && listing.photos.length > 0 ? (
                <img
                    src={listing.photos[0]}
                    alt={listing.title}
                    style={{ width: "100%", height: "180px", objectFit: "cover" }}
                />
            ) : (
                <div style={{
                    width: "100%", height: "180px", backgroundColor: "#f0f4f8",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    color: "#aaa", fontSize: "14px"
                }}>
                    No Image
                </div>
            )}

            <div style={{ padding: "16px", flex: 1, display: "flex", flexDirection: "column", gap: "6px" }}>
                <h3 style={{ margin: 0, fontSize: "16px", color: "#222", fontWeight: "700" }}>
                    {listing.title}
                </h3>
                <p style={{ margin: 0, fontSize: "13px", color: "#666" }}>
                    {listing.description}
                </p>
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: "8px" }}>
                    <span style={{ fontWeight: "700", color: "#4a90d9", fontSize: "15px" }}>
                        R {listing.price}
                    </span>
                    <span style={{
                        fontSize: "12px", backgroundColor: "#f0f4f8",
                        padding: "2px 8px", borderRadius: "12px", color: "#555"
                    }}>
                        {listing.condition}
                    </span>
                </div>
                <span style={{ fontSize: "12px", color: "#888" }}>{listing.listingType}</span>

                <button
                    onClick={() => navigate(`/edit-listing/${listing.id}`)}
                    style={{
                        marginTop: "12px",
                        padding: "9px",
                        backgroundColor: "#4a90d9",
                        color: "white",
                        border: "none",
                        borderRadius: "8px",
                        fontSize: "14px",
                        fontWeight: "600",
                        cursor: "pointer",
                        width: "100%",
                    }}
                >
                    Edit Listing
                </button>
            </div>
        </div>
    );
}