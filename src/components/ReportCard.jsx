import React from "react";
import useExportReport from "../hooks/useExportReport";
import ExportButtons from "./ExportButtons";
import styles from "./Admindashboard.module.css";

export default function ReportCard({ title, headers, data, children }) {
  const { exportToCSV, exportToPDF } = useExportReport(title, headers, data);

  return (
    <div className={styles.card}>
      <div className={styles.cardHeader}>
        <h3 className={styles.cardTitle}>{title}</h3>
        <ExportButtons onExportCSV={exportToCSV} onExportPDF={exportToPDF} />
      </div>
      {children}
    </div>
  );
}