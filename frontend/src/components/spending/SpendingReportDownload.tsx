import React, { useState } from 'react';
import jsPDF from 'jspdf';
import { Download, Loader } from 'lucide-react';
import api from '../../lib/api';
import { useToast } from '../../lib/toast-context';

interface Props { summaryData: any; disabled?: boolean; }

export default function SpendingReportDownload({ summaryData, disabled }: Props) {
  const [loading, setLoading] = useState(false);
  const { showToast } = useToast();

  const handleDownload = async () => {
    setLoading(true);
    try {
      const res  = await api.post('/spending/report', summaryData);
      const plan = res.data;
      buildPdf(plan);
      showToast({ type: 'success', title: 'PDF downloaded!' });
    } catch (err) {
      console.error('Spending PDF error:', err);
      showToast({ type: 'error', title: 'Download failed' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleDownload}
      disabled={disabled || loading}
      className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {loading
        ? <><Loader className="w-4 h-4 animate-spin" />Generating PDF…</>
        : <><Download className="w-4 h-4" />Download Monthly Report (PDF)</>}
    </button>
  );
}

// ── jsPDF builder — matches the exact visual pattern used in UC1's Lab Test
// Plan and UC2's Prescription Plan (violet header band, meta cards, zebra
// table rows, colored total bar, yellow note box, centered footer). ────────
function buildPdf(plan: any) {
  const doc   = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const M     = 15;
  const cW    = pageW - M * 2;

  let y = 0;

  const checkPageBreak = (needed: number) => {
    if (y + needed > pageH - 20) {
      doc.addPage();
      y = 15;
    }
  };

  // ── Header band ─────────────────────────────────────────────────────────────
  doc.setFillColor(109, 40, 217);
  doc.rect(0, 0, pageW, 32, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');   doc.setFontSize(16);
  doc.text('MedNav Spending Report', M, 14);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
  doc.text(`AI Healthcare Cost Navigator · ${plan.month_label}${plan.is_current_month ? ' (so far)' : ''}`, M, 22);
  doc.text(`Generated: ${plan.generated_on}`, pageW - M, 22, { align: 'right' });

  // ── Meta cards ────────────────────────────────────────────────────────────────
  y = 40;
  const drawCard = (label: string, value: string, x: number, cy: number, w: number, valueColor: [number, number, number] = [15, 23, 42]) => {
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(x, cy, w, 16, 2, 2, 'F');
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7);
    doc.setTextColor(148, 163, 184);
    doc.text(label.toUpperCase(), x + 4, cy + 6);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
    doc.setTextColor(...valueColor);
    doc.text(value.length > 32 ? value.slice(0, 30) + '…' : value, x + 4, cy + 13);
  };
  const half = (cW - 4) / 2;
  drawCard('Patient',        plan.patient_name, M,            y, half);
  drawCard('Health Profile', plan.patient_type, M + half + 4, y, half);
  y += 20;
  drawCard('Total Spent', `Rs.${(plan.grand_total || 0).toLocaleString('en-IN')}`, M, y, half, [109, 40, 217]);

  if (plan.change_amount != null) {
    const saved   = plan.change_amount < 0;
    const higher  = plan.change_amount > 0;
    const color: [number, number, number] = saved ? [21, 128, 61] : higher ? [220, 38, 38] : [15, 23, 42];
    const sign    = saved ? 'Saved' : higher ? 'Increased by' : 'Same as';
    const text    = `${sign} Rs.${Math.abs(plan.change_amount)} (${Math.abs(plan.change_pct || 0)}%)`;
    drawCard('vs Last Month', text, M + half + 4, y, half, color);
  } else {
    drawCard('vs Last Month', 'No prior data', M + half + 4, y, half, [148, 163, 184]);
  }
  y += 24;

  // ── Section: Medicines ───────────────────────────────────────────────────────
  const medItems = plan.medicine_items || [];
  if (medItems.length > 0) {
    checkPageBreak(20 + medItems.length * 9);
    y = drawSectionTable(doc, y, M, cW, pageW, {
      title: `Medicine Expenses — Rs.${(plan.total_medicine || 0).toLocaleString('en-IN')}`,
      headers: ['MEDICINE', 'SELECTED', 'PHARMACY', 'SAVING', 'PAID'],
      colWidths: [44, 38, 38, 26, 24],
      rows: medItems.map((i: any) => [
        truncate(i.medicine_name, 20),
        truncate(i.selected_medicine, 18),
        truncate(i.pharmacy_name || '—', 18),
        i.saving > 0 ? `Save Rs.${i.saving}` : '—',
        `Rs.${i.price}`,
      ]),
      totalLabel: 'Medicine Total',
      totalValue: `Rs.${(plan.total_medicine || 0).toLocaleString('en-IN')}`,
    });
  }

  // ── Section: Lab Tests ───────────────────────────────────────────────────────
  const labItems = plan.lab_items || [];
  if (labItems.length > 0) {
    checkPageBreak(20 + labItems.length * 9);
    y = drawSectionTable(doc, y, M, cW, pageW, {
      title: `Lab Test Expenses — Rs.${(plan.total_lab || 0).toLocaleString('en-IN')}`,
      headers: ['TEST', 'LAB', 'DATE', 'AMOUNT'],
      colWidths: [50, 60, 40, 20],
      rows: labItems.map((i: any) => [
        truncate(i.test_name, 24),
        truncate(i.lab_name, 28),
        i.date,
        `Rs.${i.price}`,
      ]),
      totalLabel: 'Lab Total',
      totalValue: `Rs.${(plan.total_lab || 0).toLocaleString('en-IN')}`,
    });
  }

  // ── Section: Doctor Visits ───────────────────────────────────────────────────
  const docItems = plan.doctor_items || [];
  if (docItems.length > 0) {
    checkPageBreak(20 + docItems.length * 9);
    y = drawSectionTable(doc, y, M, cW, pageW, {
      title: `Doctor Visit Expenses — Rs.${(plan.total_doctor || 0).toLocaleString('en-IN')}`,
      headers: ['DOCTOR', 'TYPE', 'DATE', 'AMOUNT'],
      colWidths: [50, 60, 40, 20],
      rows: docItems.map((i: any) => [
        truncate(i.doctor_name, 24),
        truncate(i.is_subscription ? `${i.plan_name} (sub)` : i.visit_type, 28),
        i.date,
        `Rs.${i.amount}`,
      ]),
      totalLabel: 'Doctor Total',
      totalValue: `Rs.${(plan.total_doctor || 0).toLocaleString('en-IN')}`,
    });
  }

  // ── Section: Recurring Patterns ──────────────────────────────────────────────
  const recurring = (plan.patterns || []).filter((p: any) => p.is_recurring);
  if (recurring.length > 0) {
    checkPageBreak(20 + recurring.length * 9);
    y = drawSectionTable(doc, y, M, cW, pageW, {
      title: 'Recurring Expenses',
      headers: ['ITEM', 'CATEGORY', 'FREQUENCY', 'AVG/MONTH'],
      colWidths: [60, 35, 45, 30],
      rows: recurring.map((p: any) => [
        truncate(p.name, 28),
        p.category,
        `${p.months_present}/${p.total_months} months`,
        `Rs.${p.avg_amount}`,
      ]),
    });
  }

  // ── Section: Saving Suggestions ──────────────────────────────────────────────
  const suggestions = plan.suggestions || [];
  if (suggestions.length > 0) {
    checkPageBreak(20 + suggestions.length * 12);
    y = drawSectionTable(doc, y, M, cW, pageW, {
      title: 'Saving Suggestions',
      headers: ['SUGGESTION', 'POTENTIAL SAVING'],
      colWidths: [140, 30],
      rows: suggestions.map((s: any) => [
        truncate(s.action, 70),
        `Rs.${s.potential_saving}`,
      ]),
      rowHeight: 11,
    });
  }

  // ── Monthly summary box ──────────────────────────────────────────────────────
  if (plan.ai_summary) {
    checkPageBreak(30);
    doc.setFillColor(245, 243, 255);
    const lines = doc.splitTextToSize(plan.ai_summary, cW - 8);
    const boxH  = Math.max(20, lines.length * 4.5 + 12);
    doc.roundedRect(M, y, cW, boxH, 2, 2, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7);
    doc.setTextColor(109, 40, 217);
    doc.text('MONTHLY SUMMARY', M + 4, y + 7);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5);
    doc.setTextColor(55, 65, 81);
    doc.text(lines, M + 4, y + 13);
    y += boxH + 6;
  }

  // ── Note box ──────────────────────────────────────────────────────────────────
  checkPageBreak(20);
  doc.setFillColor(254, 249, 195);
  doc.roundedRect(M, y, cW, 16, 2, 2, 'F');
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
  doc.setTextColor(120, 53, 15);
  const noteLines = doc.splitTextToSize(`Note: ${plan.note}`, cW - 8);
  doc.text(noteLines, M + 4, y + 7);
  y += 22;

  // ── Footer ────────────────────────────────────────────────────────────────────
  checkPageBreak(10);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
  doc.setTextColor(148, 163, 184);
  doc.text('Generated by MedNav · AI Healthcare Cost Navigator', pageW / 2, y + 4, { align: 'center' });

  doc.save(`MedNav_Spending_Report_${plan.month}.pdf`);
}

function truncate(str: string, max: number): string {
  if (!str) return '—';
  return str.length > max ? str.slice(0, max - 1) + '…' : str;
}

// ── Reusable section table drawer ──────────────────────────────────────────────
function drawSectionTable(
  doc: jsPDF, startY: number, M: number, cW: number, pageW: number,
  opts: {
    title: string;
    headers: string[];
    colWidths: number[];
    rows: string[][];
    totalLabel?: string;
    totalValue?: string;
    rowHeight?: number;
  }
): number {
  let y = startY;
  const rowH = opts.rowHeight ?? 9;

  // Section title
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10);
  doc.setTextColor(109, 40, 217);
  doc.text(opts.title, M, y + 5);
  y += 9;

  // Table header
  doc.setFillColor(245, 243, 255);
  doc.rect(M, y, cW, 8, 'F');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(7);
  doc.setTextColor(109, 40, 217);
  let x = M + 2;
  opts.headers.forEach((h, i) => {
    doc.text(h, x, y + 5.5);
    x += opts.colWidths[i];
  });
  y += 8;

  // Rows (zebra striped)
  opts.rows.forEach((row, ri) => {
    doc.setFillColor(ri % 2 === 0 ? 255 : 250, ri % 2 === 0 ? 255 : 250, ri % 2 === 0 ? 255 : 255);
    doc.rect(M, y, cW, rowH, 'F');
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
    doc.setTextColor(15, 23, 42);
    let cx = M + 2;
    row.forEach((cell, ci) => {
      const isLastCol = ci === row.length - 1;
      if (isLastCol) {
        doc.setFont('helvetica', 'bold');
        doc.text(cell, M + cW - 2, y + rowH / 2 + 2, { align: 'right' });
        doc.setFont('helvetica', 'normal');
      } else {
        doc.text(cell, cx, y + rowH / 2 + 2);
      }
      cx += opts.colWidths[ci];
    });
    y += rowH;
  });

  // Total row (optional)
  if (opts.totalLabel) {
    doc.setFillColor(245, 243, 255);
    doc.rect(M, y, cW, 9, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5);
    doc.setTextColor(109, 40, 217);
    doc.text(opts.totalLabel, M + 2, y + 6);
    doc.text(opts.totalValue || '', M + cW - 2, y + 6, { align: 'right' });
    y += 9;
  }

  return y + 8; // gap before next section
}
