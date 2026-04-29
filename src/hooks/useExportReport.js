import { useCallback } from "react";

export default function useExportReport(title, headers, rows) {
  const toSafeString = (value) => {
    if (value === undefined || value === null) return "";
    if (typeof value === "object") return JSON.stringify(value);
    return String(value);
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

    const escapeCSV = (value) => {
      const str = toSafeString(value);
      if (str.includes(",") || str.includes('"') || str.includes("\n")) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const csvRows = [
      headers.join(","),
      ...rows.map((row) => headers.map((h) => escapeCSV(row[h])).join(",")),
    ];
    const blob = new Blob([csvRows.join("\n")], { type: "text/csv;charset=utf-8;" });
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

    const tableHeaders = `<thead><tr>${headers.map((h) => `<th>${escapeHtml(h)}</th>`).join("")}</thead>`;
    const tableRows = rows
      .map((row) => `<tr>${headers.map((h) => `<td>${escapeHtml(row[h])}</td>`).join("")}</tr>`)
      .join("");

    const printContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>${escapeHtml(title)}</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 20px; }
          table { border-collapse: collapse; width: 100%; margin-top: 20px; }
          th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
          th { background-color: #f2f2f2; }
          @media print { body { margin: 0; } }
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
          // Auto‑print after the page loads
          window.onload = function() {
            window.print();
          };
        <\/script>
      </body>
      </html>
    `;

    // Open a new tab, write the HTML, and let the browser print it.
    const printWindow = window.open();
    if (!printWindow) {
      alert("Please allow pop‑ups to generate the PDF.");
      return;
    }
    printWindow.document.write(printContent);
    printWindow.document.close();
    // No extra timers – the window will close automatically after printing? 
    // Actually the user will close the tab manually. That's fine.
  }, [title, headers, rows]);

  return { exportToCSV, exportToPDF };
}