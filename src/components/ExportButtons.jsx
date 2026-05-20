import React from "react";

export default function ExportButtons({ onExportCSV, onExportPDF }) {
  const buttonStyle = {
    background: "#4a90d9",
    color: "white",
    border: "none",
    padding: "6px 12px",
    borderRadius: "8px",
    cursor: "pointer",
    fontWeight: "500",
    fontSize: "0.75rem",
  };

  return (
    <div style={{ display: "flex", gap: "8px" }}>
      <button onClick={onExportCSV} style={buttonStyle}>
         CSV
      </button>
      <button onClick={onExportPDF} style={buttonStyle}>
         PDF
      </button>
    </div>
  );
}