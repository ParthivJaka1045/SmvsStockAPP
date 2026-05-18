import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatMetric, hydrateReport } from './reporting';
import notoRegularUrl from './assets/fonts/NotoSansGujarati-Regular.ttf?url';
import notoBoldUrl from './assets/fonts/NotoSansGujarati-Bold.ttf?url';

const FONT = 'NotoGujarati';
const PAGE_MARGIN = 14;
const PAGE_WIDTH = 210;
const CONTENT_WIDTH = PAGE_WIDTH - PAGE_MARGIN * 2;

const arrayBufferToBase64 = (buffer) => {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
};

const registerGujaratiFonts = async (doc) => {
  const [regularRes, boldRes] = await Promise.all([
    fetch(notoRegularUrl),
    fetch(notoBoldUrl),
  ]);
  const regularB64 = arrayBufferToBase64(await regularRes.arrayBuffer());
  const boldB64 = arrayBufferToBase64(await boldRes.arrayBuffer());
  doc.addFileToVFS('NotoGujarati-Regular.ttf', regularB64);
  doc.addFont('NotoGujarati-Regular.ttf', FONT, 'normal');
  doc.addFileToVFS('NotoGujarati-Bold.ttf', boldB64);
  doc.addFont('NotoGujarati-Bold.ttf', FONT, 'bold');
};

const drawReportHeader = (doc, hydrated) => {
  const isMonthOnly = hydrated.stockViewMode === 'month_movements_only';
  const periodLabel = hydrated.reportPeriod === 'yearly' ? 'Year' : 'Month';
  let y = PAGE_MARGIN;

  doc.setFont(FONT, 'bold');
  doc.setFontSize(16);
  doc.setTextColor(15, 23, 42);
  doc.text(String(hydrated.title || 'Monthly Report'), PAGE_MARGIN, y);
  y += 8;

  doc.setFont(FONT, 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(71, 85, 105);
  const subtitle = doc.splitTextToSize(
    'Stock movements for the selected range. All amounts in the table are in kilograms (KG).',
    CONTENT_WIDTH,
  );
  doc.text(subtitle, PAGE_MARGIN, y);
  y += subtitle.length * 4 + 2;

  if (isMonthOnly) {
    doc.setFont(FONT, 'bold');
    doc.setFontSize(8);
    doc.setTextColor(146, 64, 14);
    const modeNote = doc.splitTextToSize(
      'મોડ: ફક્ત આ મહિનાની IN/OUT; Net Stock = પિરિયડ IN − OUT (ગયા મહિનાનું closing સામેલ નથી).',
      CONTENT_WIDTH,
    );
    doc.text(modeNote, PAGE_MARGIN, y);
    y += modeNote.length * 3.8 + 2;
  } else if (hydrated.reportPeriod === 'monthly') {
    doc.setFont(FONT, 'bold');
    doc.setFontSize(8);
    doc.setTextColor(30, 64, 175);
    const modeNote = doc.splitTextToSize(
      'મોડ: પૂર્ણ સ્ટોક — Income = ખુલ્લી + પિરિયડ IN (ગયા મહિનાની ભરતી સહિત).',
      CONTENT_WIDTH,
    );
    doc.text(modeNote, PAGE_MARGIN, y);
    y += modeNote.length * 3.8 + 2;
  }

  const metaY = y + 2;
  const colW = CONTENT_WIDTH / 3;
  const metaRows = [
    { label: periodLabel, value: hydrated.monthLabel || '-' },
    { label: 'Center', value: hydrated.centerLabel || '-' },
    { label: 'Range', value: hydrated.rangeLabel || '-' },
  ];

  metaRows.forEach((item, index) => {
    const x = PAGE_MARGIN + index * colW;
    doc.setFillColor(241, 245, 249);
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(x, metaY, colW - 3, 14, 2, 2, 'FD');
    doc.setFont(FONT, 'bold');
    doc.setFontSize(7);
    doc.setTextColor(100, 116, 139);
    doc.text(item.label.toUpperCase(), x + 3, metaY + 5);
    doc.setFont(FONT, 'bold');
    doc.setFontSize(9);
    doc.setTextColor(15, 23, 42);
    const valueLines = doc.splitTextToSize(String(item.value), colW - 8);
    doc.text(valueLines, x + 3, metaY + 10);
  });

  return metaY + 18;
};

const drawPageFooter = (doc, hydrated, pageNumber, pageCount) => {
  const pageHeight = doc.internal.pageSize.height;
  const footerY = pageHeight - 10;
  doc.setFont(FONT, 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(148, 163, 184);
  if (hydrated.generatedAtIso) {
    doc.text(`Generated: ${hydrated.generatedAtIso}`, PAGE_MARGIN, footerY);
  }
  doc.text(`Page ${pageNumber} / ${pageCount}`, PAGE_WIDTH - PAGE_MARGIN, footerY, { align: 'right' });
};

/**
 * Client-side monthly/yearly stock report PDF — portrait A4, Gujarati font, matches app preview.
 */
export async function generateMonthlyStockReportPdfBlob(reportInput, _catalogItems = []) {
  const hydrated = hydrateReport(reportInput);
  const isMonthOnly = hydrated.stockViewMode === 'month_movements_only';
  const incomeHead = isMonthOnly ? 'Income (IN only)' : 'Income (KG)';
  const stockHead = isMonthOnly ? 'Net Stock (period) KG' : 'Total Stock (KG)';

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  await registerGujaratiFonts(doc);

  const tableStartY = drawReportHeader(doc, hydrated);

  const head = [['Item Name', incomeHead, 'Outgoing (KG)', stockHead]];
  const body = hydrated.rows.map((row) => [
    String(row.itemName || '-'),
    formatMetric(row.income),
    formatMetric(row.outgoing),
    formatMetric(row.totalStock),
  ]);
  const foot = [[
    'TOTAL',
    formatMetric(hydrated.summary.totalIncome),
    formatMetric(hydrated.summary.totalOutgoing),
    formatMetric(hydrated.summary.totalStock),
  ]];

  const itemColWidth = 78;
  const numColWidth = (CONTENT_WIDTH - itemColWidth) / 3;

  autoTable(doc, {
    startY: tableStartY,
    head,
    body: body.length ? body : [['No items found for the selected range.', '', '', '']],
    foot: body.length ? foot : undefined,
    theme: 'grid',
    tableWidth: CONTENT_WIDTH,
    margin: { left: PAGE_MARGIN, right: PAGE_MARGIN },
    styles: {
      font: FONT,
      fontSize: 8.5,
      cellPadding: 2.2,
      overflow: 'linebreak',
      lineColor: [226, 232, 240],
      lineWidth: 0.2,
      textColor: [15, 23, 42],
      valign: 'middle',
    },
    headStyles: {
      font: FONT,
      fontStyle: 'bold',
      fillColor: [15, 23, 42],
      textColor: 255,
      halign: 'center',
      fontSize: 8,
      cellPadding: 2.5,
    },
    bodyStyles: {
      font: FONT,
      fontStyle: 'normal',
    },
    footStyles: {
      font: FONT,
      fontStyle: 'bold',
      fillColor: [241, 245, 249],
      textColor: [15, 23, 42],
      fontSize: 9,
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
    columnStyles: {
      0: { halign: 'left', cellWidth: itemColWidth },
      1: { halign: 'right', cellWidth: numColWidth },
      2: { halign: 'right', cellWidth: numColWidth },
      3: { halign: 'right', cellWidth: numColWidth },
    },
    didParseCell: (data) => {
      if (data.section === 'head' && data.column.index === 0) {
        data.cell.styles.halign = 'left';
      }
      if (data.section === 'foot' && data.column.index === 0) {
        data.cell.styles.halign = 'left';
      }
    },
    didDrawPage: (data) => {
      const pageCount = doc.internal.getNumberOfPages();
      drawPageFooter(doc, hydrated, data.pageNumber, pageCount);
    },
  });

  let summaryY = doc.lastAutoTable.finalY + 8;
  const pageHeight = doc.internal.pageSize.height;
  const summaryBlockHeight = 22;
  if (summaryY + summaryBlockHeight > pageHeight - 16) {
    doc.addPage();
    summaryY = PAGE_MARGIN + 4;
  }

  const summaryCols = [
    { label: 'Items', value: formatMetric(hydrated.summary.totalRows) },
    {
      label: isMonthOnly ? 'Income (IN only)' : 'Income (KG)',
      value: formatMetric(hydrated.summary.totalIncome),
    },
    { label: 'Outgoing (KG)', value: formatMetric(hydrated.summary.totalOutgoing) },
    {
      label: isMonthOnly ? 'Net Stock (period KG)' : 'Total Stock (KG)',
      value: formatMetric(hydrated.summary.totalStock),
    },
  ];

  const summaryColW = CONTENT_WIDTH / 4;
  summaryCols.forEach((item, index) => {
    const x = PAGE_MARGIN + index * summaryColW;
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(203, 213, 225);
    doc.roundedRect(x, summaryY, summaryColW - 2.5, 18, 2, 2, 'FD');
    doc.setFont(FONT, 'bold');
    doc.setFontSize(7);
    doc.setTextColor(100, 116, 139);
    const labelLines = doc.splitTextToSize(item.label.toUpperCase(), summaryColW - 6);
    doc.text(labelLines, x + 3, summaryY + 5);
    doc.setFont(FONT, 'bold');
    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);
    doc.text(String(item.value), x + 3, summaryY + 13);
  });

  const pageCount = doc.internal.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    drawPageFooter(doc, hydrated, page, pageCount);
  }

  return doc.output('blob');
}
