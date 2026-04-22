import { useCallback } from "react";

/**
 * Custom hook for exporting report data to CSV and PDF.
 * @param {string} title - Report title (used in PDF header and CSV filename)
 * @param {Array} headers - Array of column header strings
 * @param {Array} rows - Array of row objects, each key should match headers
 * @returns {Object} { exportToCSV, exportToPDF }
 */
export default function useExportReport(title, headers, rows) {
  // Safely convert any value to a string, handling null/undefined
  const toSafeString = (value) => {
    if (value === undefined || value === null) return "";
    if (typeof value === "object") return JSON.stringify(value);
    return String(value);
  };

  const escapeCSV = (value) => {
    const str = toSafeString(value);
    if (str.includes(",") || str.includes('"') || str.includes("\n")) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const escapeHtml = (value) => {
    const str = toSafeString(value);
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  };

  const exportToCSV = useCallback(() => {
    if (!rows || rows.length === 0) {
      alert("No data to export.");
      return;
    }

    const csvRows = [
      headers.join(","),
      ...rows.map((row) =>
        headers.map((header) => escapeCSV(row[header])).join(",")
      ),
    ];
    const csvString = csvRows.join("\n");
    const blob = new Blob([csvString], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.href = url;
    link.setAttribute("download", `${title.replace(/\s+/g, "_")}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [title, headers, rows]);

  const exportToPDF = useCallback(() => {
    if (!rows || rows.length === 0) {
      alert("No data to export.");
      return;
    }

    const tableHeaders = `<thead><tr>${headers
      .map((h) => `<th>${escapeHtml(h)}</th>`)
      .join("")}</thead>`;
    const tableRows = rows
      .map(
        (row) =>
          `<tr>${headers
            .map((h) => `<td>${escapeHtml(row[h])}</td>`)
            .join("")}</tr>`
      )
      .join("");

    const printContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>${escapeHtml(title)}</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 20px; }
          h1 { color: #1a1a1a; }
          table { border-collapse: collapse; width: 100%; margin-top: 20px; }
          th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
          th { background-color: #f2f2f2; }
          @media print {
            body { margin: 0; }
            button { display: none; }
          }
        </style>
      </head>
      <body>
        <h1>${escapeHtml(title)}</h1>
        <p>Generated on ${new Date().toLocaleString()}</p>
        <table>
          ${tableHeaders}
          <tbody>${tableRows}</tbody>
        </table>
        <script>
          window.onload = function() { setTimeout(window.print, 100); };
        <\/script>
      </body>
      </html>
    `;

    // Use an iframe to avoid popup blockers
    const iframe = document.createElement("iframe");
    iframe.style.position = "absolute";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "none";
    document.body.appendChild(iframe);
    const doc = iframe.contentWindow.document;
    doc.open();
    doc.write(printContent);
    doc.close();
    // Print after a short delay to allow rendering
    setTimeout(() => {
      iframe.contentWindow.print();
      // Remove iframe after printing (optional – you can keep it)
      setTimeout(() => {
        document.body.removeChild(iframe);
      }, 500);
    }, 200);
  }, [title, headers, rows]);

  return { exportToCSV, exportToPDF };
}