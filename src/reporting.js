import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const safeNumber = (value) => {
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const roundMetric = (value) => {
  const rounded = Math.round((safeNumber(value) + Number.EPSILON) * 100) / 100;
  return Number.isInteger(rounded) ? rounded : rounded;
};

const normalizeText = (value) => (value || '').toString().trim().toLowerCase();

const toDateObject = (value) => {
  if (!value) return null;
  if (typeof value?.toDate === 'function') return value.toDate();
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const padValue = (value) => String(value).padStart(2, '0');

export const formatDisplayDate = (value) => {
  if (!value) return '-';
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split('-');
    return `${day}-${month}-${year}`;
  }
  const date = toDateObject(value);
  if (!date) return String(value);
  return `${padValue(date.getDate())}-${padValue(date.getMonth() + 1)}-${date.getFullYear()}`;
};

const getIsoString = (value) => {
  const date = toDateObject(value);
  return date ? date.toISOString() : '';
};

export const formatMetric = (value) => {
  const numeric = safeNumber(value);
  if (Number.isInteger(numeric)) return String(numeric);
  return numeric.toFixed(2).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1');
};

export const formatDateRangeLabel = (fromDate, toDate) => {
  if (fromDate && toDate) {
    return fromDate === toDate
      ? formatDisplayDate(fromDate)
      : `${formatDisplayDate(fromDate)} to ${formatDisplayDate(toDate)}`;
  }
  if (fromDate) return `From ${formatDisplayDate(fromDate)}`;
  if (toDate) return `Up to ${formatDisplayDate(toDate)}`;
  return 'All Dates';
};

export const getReportTheme = (reportKind) => {
  if (reportKind === 'send') {
    return {
      key: 'send',
      title: 'Material Dispatch Summary',
      primary: [37, 99, 235],
      accent: [59, 130, 246],
      surface: [239, 246, 255],
      line: [191, 219, 254],
      text: [30, 64, 175],
      dark: [30, 41, 59],
    };
  }

  return {
    key: 'request',
    title: 'Stock Request Summary',
    primary: [234, 88, 12],
    accent: [249, 115, 22],
    surface: [255, 247, 237],
    line: [254, 215, 170],
    text: [154, 52, 18],
    dark: [41, 37, 36],
  };
};

const sortByDateDesc = (left, right) => {
  const leftValue = left.date || '';
  const rightValue = right.date || '';
  if (leftValue === rightValue) {
    return String(right.chalanNo || '').localeCompare(String(left.chalanNo || ''));
  }
  return rightValue.localeCompare(leftValue);
};

const buildRequestRecord = (order) => {
  const items = Array.isArray(order.items) ? order.items : [];
  const normalizedItems = items.map((item) => ({
    itemName: item.name || '-',
    unit: item.unit || '',
    quantity: roundMetric(item.qty),
  }));
  const totalQuantity = roundMetric(
    normalizedItems.reduce((sum, item) => sum + safeNumber(item.quantity), 0),
  );

  return {
    sourceId: order.id,
    chalanNo: order.chalanNo || '-',
    date: order.date || '',
    center: order.center || '-',
    senderName: order.senderName || order.centerContactName || '-',
    lineItems: normalizedItems.length,
    totalQuantity,
    totalKg: totalQuantity,
    email: order.email || '',
    submittedBy: order.submittedBy || '',
    items: normalizedItems,
  };
};

const buildSendRecord = (order) => {
  const rows = Array.isArray(order.items)
    ? order.items.filter((item) => item.itemName && item.itemName.trim())
    : [];
  const normalizedItems = rows.map((item) => ({
    itemName: item.itemName || '-',
    quantity: roundMetric(item.qty),
    totalKg: roundMetric(item.kg),
  }));
  const totalQuantity = roundMetric(
    normalizedItems.reduce((sum, item) => sum + safeNumber(item.quantity), 0),
  );
  const totalKg = roundMetric(
    normalizedItems.reduce((sum, item) => sum + safeNumber(item.totalKg), 0),
  );

  return {
    sourceId: order.id,
    chalanNo: order.chalanNo || '-',
    date: order.date || '',
    center: order.fromCenter || '-',
    senderName: order.senderName || '-',
    lineItems: normalizedItems.length,
    totalQuantity,
    totalKg,
    email: order.email || '',
    submittedBy: order.submittedBy || '',
    items: normalizedItems,
  };
};

const addCenterAggregation = (centerMap, record) => {
  const key = record.center || 'Unknown';
  const existing = centerMap.get(key) || {
    center: key,
    recordsCount: 0,
    lineItems: 0,
    totalQuantity: 0,
    totalKg: 0,
    lastEntryDate: '',
  };

  existing.recordsCount += 1;
  existing.lineItems += safeNumber(record.lineItems);
  existing.totalQuantity = roundMetric(existing.totalQuantity + safeNumber(record.totalQuantity));
  existing.totalKg = roundMetric(existing.totalKg + safeNumber(record.totalKg));
  existing.lastEntryDate =
    !existing.lastEntryDate || existing.lastEntryDate < record.date ? record.date : existing.lastEntryDate;

  centerMap.set(key, existing);
};

const addRequestItemAggregation = (itemMap, record) => {
  record.items.forEach((item) => {
    const itemKey = `${item.itemName}__${item.unit}`;
    const existing = itemMap.get(itemKey) || {
      itemName: item.itemName,
      unit: item.unit,
      lineItems: 0,
      totalQuantity: 0,
      totalKg: 0,
    };

    existing.lineItems += 1;
    existing.totalQuantity = roundMetric(existing.totalQuantity + safeNumber(item.quantity));
    existing.totalKg = existing.totalQuantity;
    itemMap.set(itemKey, existing);
  });
};

const addSendItemAggregation = (itemMap, record) => {
  record.items.forEach((item) => {
    const itemKey = item.itemName;
    const existing = itemMap.get(itemKey) || {
      itemName: item.itemName,
      unit: '',
      lineItems: 0,
      totalQuantity: 0,
      totalKg: 0,
    };

    existing.lineItems += 1;
    existing.totalQuantity = roundMetric(existing.totalQuantity + safeNumber(item.quantity));
    existing.totalKg = roundMetric(existing.totalKg + safeNumber(item.totalKg));
    itemMap.set(itemKey, existing);
  });
};

export const hydrateReport = (report) => {
  const summary = report.summary || {};
  return {
    ...report,
    title: report.title || 'SMVS Summary Report',
    reportKind: report.reportKind || 'request',
    scope: report.scope || 'full',
    center: report.center || '',
    centerLabel: report.centerLabel || (report.scope === 'center' ? report.center || '-' : 'All Centers'),
    rangeLabel: report.rangeLabel || formatDateRangeLabel(report.fromDate, report.toDate),
    generatedAtIso:
      report.generatedAtIso || getIsoString(report.generatedAt) || getIsoString(report.generatedOn) || new Date().toISOString(),
    createdBy: report.createdBy || 'Admin',
    email: report.email || '',
    records: Array.isArray(report.records) ? report.records : [],
    centerBreakdown: Array.isArray(report.centerBreakdown) ? report.centerBreakdown : [],
    itemBreakdown: Array.isArray(report.itemBreakdown) ? report.itemBreakdown : [],
    summary: {
      totalRecords: safeNumber(summary.totalRecords),
      totalCenters: safeNumber(summary.totalCenters),
      totalLineItems: safeNumber(summary.totalLineItems),
      totalQuantity: roundMetric(summary.totalQuantity),
      totalKg: roundMetric(summary.totalKg),
    },
  };
};

export const buildSummaryReport = ({
  orders = [],
  sendOrders = [],
  reportKind = 'request',
  scope = 'full',
  center = '',
  fromDate = '',
  toDate = '',
  createdBy = 'Admin',
}) => {
  const isSend = reportKind === 'send';
  const sourceRecords = isSend ? sendOrders : orders;
  const targetCenter = normalizeText(center);

  const filteredRecords = sourceRecords
    .filter((record) => {
      const recordDate = record.date || '';
      const recordCenter = normalizeText(isSend ? record.fromCenter : record.center);
      const inRange = (!fromDate || recordDate >= fromDate) && (!toDate || recordDate <= toDate);
      const matchesCenter = scope !== 'center' || recordCenter === targetCenter;
      return inRange && matchesCenter;
    })
    .map((record) => (isSend ? buildSendRecord(record) : buildRequestRecord(record)))
    .sort(sortByDateDesc);

  const centerMap = new Map();
  const itemMap = new Map();

  filteredRecords.forEach((record) => {
    addCenterAggregation(centerMap, record);
    if (isSend) addSendItemAggregation(itemMap, record);
    else addRequestItemAggregation(itemMap, record);
  });

  const centerBreakdown = Array.from(centerMap.values()).sort((left, right) =>
    left.center.localeCompare(right.center),
  );
  const itemBreakdown = Array.from(itemMap.values()).sort((left, right) => {
    if (safeNumber(right.totalQuantity) === safeNumber(left.totalQuantity)) {
      return left.itemName.localeCompare(right.itemName);
    }
    return safeNumber(right.totalQuantity) - safeNumber(left.totalQuantity);
  });

  const summary = {
    totalRecords: filteredRecords.length,
    totalCenters: centerBreakdown.length,
    totalLineItems: filteredRecords.reduce((sum, record) => sum + safeNumber(record.lineItems), 0),
    totalQuantity: roundMetric(filteredRecords.reduce((sum, record) => sum + safeNumber(record.totalQuantity), 0)),
    totalKg: roundMetric(filteredRecords.reduce((sum, record) => sum + safeNumber(record.totalKg), 0)),
  };

  const titleParts = [
    isSend ? 'Dispatch' : 'Request',
    scope === 'center' ? 'Center-wise' : 'Full',
    'Report',
  ];
  if (scope === 'center' && center) titleParts.push(center);

  return hydrateReport({
    type: 'summary-report',
    reportKind,
    scope,
    center,
    centerLabel: scope === 'center' ? center || '-' : 'All Centers',
    fromDate,
    toDate,
    rangeLabel: formatDateRangeLabel(fromDate, toDate),
    title: titleParts.join(' '),
    createdBy,
    generatedAt: new Date(),
    generatedAtIso: new Date().toISOString(),
    summary,
    centerBreakdown,
    itemBreakdown,
    records: filteredRecords,
  });
};

const sanitizeFilePart = (value) =>
  (value || '')
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '') || 'summary';

export const getReportFileName = (reportInput) => {
  const report = hydrateReport(reportInput);
  const parts = [
    'smvs',
    report.reportKind === 'send' ? 'dispatch' : 'request',
    report.scope === 'center' ? sanitizeFilePart(report.center || 'center') : 'all-centers',
    report.fromDate || 'all',
    report.toDate || report.fromDate || 'all',
  ];
  return `${parts.join('-')}.pdf`;
};

const drawMetricCard = (pdf, x, y, width, height, label, value, theme) => {
  pdf.setFillColor(...theme.surface);
  pdf.setDrawColor(...theme.line);
  pdf.roundedRect(x, y, width, height, 4, 4, 'FD');

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(9);
  pdf.setTextColor(...theme.text);
  pdf.text(label.toUpperCase(), x + 4, y + 7);

  pdf.setFontSize(17);
  pdf.setTextColor(17, 24, 39);
  pdf.text(String(value), x + 4, y + 17);
};

const drawFirstPageHeader = (pdf, report, theme) => {
  const pageWidth = pdf.internal.pageSize.getWidth();

  pdf.setFillColor(...theme.primary);
  pdf.roundedRect(14, 12, pageWidth - 28, 24, 5, 5, 'F');

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(19);
  pdf.setTextColor(255, 255, 255);
  pdf.text('SMVS SUMMARY REPORT', 18, 22);

  pdf.setFontSize(10);
  pdf.text(theme.title.toUpperCase(), 18, 29);
  pdf.text(`Generated ${formatDisplayDate(report.generatedAtIso)}`, pageWidth - 18, 29, { align: 'right' });

  pdf.setFillColor(...theme.surface);
  pdf.setDrawColor(...theme.line);
  pdf.roundedRect(14, 42, pageWidth - 28, 20, 4, 4, 'FD');

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9.5);
  pdf.setTextColor(55, 65, 81);
  pdf.text(`Report: ${report.title}`, 18, 49);
  pdf.text(`Scope: ${report.scope === 'center' ? 'Center-wise' : 'Full'}`, 18, 55);
  pdf.text(`Range: ${report.rangeLabel}`, pageWidth - 18, 49, { align: 'right' });
  pdf.text(`Center: ${report.centerLabel}`, pageWidth - 18, 55, { align: 'right' });
};

const drawContinuationHeader = (pdf, report, theme) => {
  const pageWidth = pdf.internal.pageSize.getWidth();

  pdf.setDrawColor(...theme.line);
  pdf.setFillColor(...theme.surface);
  pdf.roundedRect(14, 10, pageWidth - 28, 12, 3, 3, 'FD');

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(9.5);
  pdf.setTextColor(...theme.text);
  pdf.text('SMVS SUMMARY REPORT', 18, 17);
  pdf.setFont('helvetica', 'normal');
  pdf.text(report.title, pageWidth - 18, 17, { align: 'right' });
};

const drawPageFooter = (pdf, report) => {
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const currentPage = pdf.getCurrentPageInfo().pageNumber;
  const totalPages = pdf.getNumberOfPages();

  pdf.setDrawColor(229, 231, 235);
  pdf.line(14, pageHeight - 12, pageWidth - 14, pageHeight - 12);

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(8);
  pdf.setTextColor(107, 114, 128);
  pdf.text(`Range: ${report.rangeLabel}`, 14, pageHeight - 7);
  pdf.text(`Page ${currentPage} / ${totalPages}`, pageWidth - 14, pageHeight - 7, { align: 'right' });
};

const ensureSectionSpace = (pdf, startY, neededHeight, report, theme) => {
  const pageHeight = pdf.internal.pageSize.getHeight();
  if (startY + neededHeight <= pageHeight - 18) return startY;
  pdf.addPage();
  drawContinuationHeader(pdf, report, theme);
  return 28;
};

const drawSectionLabel = (pdf, y, label, theme) => {
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(11);
  pdf.setTextColor(...theme.text);
  pdf.text(label.toUpperCase(), 14, y);
  return y + 4;
};

const buildCenterTableConfig = (report) => {
  if (report.reportKind === 'send') {
    return {
      head: [['Center', 'Entries', 'Line Items', 'Qty Total', 'KG Total', 'Last Date']],
      body: report.centerBreakdown.map((row) => [
        row.center,
        formatMetric(row.recordsCount),
        formatMetric(row.lineItems),
        formatMetric(row.totalQuantity),
        formatMetric(row.totalKg),
        formatDisplayDate(row.lastEntryDate),
      ]),
    };
  }

  return {
    head: [['Center', 'Entries', 'Line Items', 'Quantity Total', 'Last Date']],
    body: report.centerBreakdown.map((row) => [
      row.center,
      formatMetric(row.recordsCount),
      formatMetric(row.lineItems),
      formatMetric(row.totalQuantity),
      formatDisplayDate(row.lastEntryDate),
    ]),
  };
};

const buildItemTableConfig = (report) => {
  if (report.reportKind === 'send') {
    return {
      head: [['Item Name', 'Line Items', 'Qty Total', 'KG Total']],
      body: report.itemBreakdown.map((row) => [
        row.itemName,
        formatMetric(row.lineItems),
        formatMetric(row.totalQuantity),
        formatMetric(row.totalKg),
      ]),
    };
  }

  return {
    head: [['Item Name', 'Unit', 'Line Items', 'Quantity Total']],
    body: report.itemBreakdown.map((row) => [
      row.itemName,
      row.unit || '-',
      formatMetric(row.lineItems),
      formatMetric(row.totalQuantity),
    ]),
  };
};

const buildRecordTableConfig = (report) => {
  if (report.reportKind === 'send') {
    return {
      head: [['Date', 'Chalan', 'From Center', 'Sender', 'Items', 'Qty', 'KG']],
      body: report.records.map((row) => [
        formatDisplayDate(row.date),
        `#${row.chalanNo}`,
        row.center,
        row.senderName || '-',
        formatMetric(row.lineItems),
        formatMetric(row.totalQuantity),
        formatMetric(row.totalKg),
      ]),
    };
  }

  return {
    head: [['Date', 'Chalan', 'Center', 'Sender', 'Items', 'Quantity']],
    body: report.records.map((row) => [
      formatDisplayDate(row.date),
      `#${row.chalanNo}`,
      row.center,
      row.senderName || '-',
      formatMetric(row.lineItems),
      formatMetric(row.totalQuantity),
    ]),
  };
};

const applyReportTable = (pdf, report, theme, config) => {
  autoTable(pdf, {
    ...config,
    margin: { top: 28, right: 14, bottom: 16, left: 14 },
    styles: {
      font: 'helvetica',
      fontSize: 8.4,
      cellPadding: 2.2,
      textColor: [31, 41, 55],
      lineColor: [229, 231, 235],
      lineWidth: 0.15,
      overflow: 'linebreak',
    },
    headStyles: {
      fillColor: theme.primary,
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      lineColor: theme.primary,
      lineWidth: 0.15,
    },
    alternateRowStyles: {
      fillColor: [249, 250, 251],
    },
    bodyStyles: {
      valign: 'middle',
    },
    didDrawPage: () => {
      if (pdf.getCurrentPageInfo().pageNumber > 1) {
        drawContinuationHeader(pdf, report, theme);
      }
      drawPageFooter(pdf, report);
    },
  });
};

export const generateSummaryReportPDFBlob = async (reportInput) => {
  const report = hydrateReport(reportInput);
  const theme = getReportTheme(report.reportKind);
  const pdf = new jsPDF('p', 'mm', 'a4');

  drawFirstPageHeader(pdf, report, theme);

  const pageWidth = pdf.internal.pageSize.getWidth();
  const cardWidth = (pageWidth - 32) / 2;
  const metrics = report.reportKind === 'send'
    ? [
        ['Total Entries', formatMetric(report.summary.totalRecords)],
        ['Active Centers', formatMetric(report.summary.totalCenters)],
        ['Line Items', formatMetric(report.summary.totalLineItems)],
        ['KG Total', formatMetric(report.summary.totalKg)],
      ]
    : [
        ['Total Entries', formatMetric(report.summary.totalRecords)],
        ['Active Centers', formatMetric(report.summary.totalCenters)],
        ['Line Items', formatMetric(report.summary.totalLineItems)],
        ['Quantity Total', formatMetric(report.summary.totalQuantity)],
      ];

  drawMetricCard(pdf, 14, 68, cardWidth, 24, metrics[0][0], metrics[0][1], theme);
  drawMetricCard(pdf, 16 + cardWidth, 68, cardWidth, 24, metrics[1][0], metrics[1][1], theme);
  drawMetricCard(pdf, 14, 96, cardWidth, 24, metrics[2][0], metrics[2][1], theme);
  drawMetricCard(pdf, 16 + cardWidth, 96, cardWidth, 24, metrics[3][0], metrics[3][1], theme);

  let cursorY = 130;

  if (report.centerBreakdown.length > 0) {
    cursorY = drawSectionLabel(pdf, cursorY, 'Center Breakdown', theme);
    applyReportTable(pdf, report, theme, {
      startY: cursorY,
      ...buildCenterTableConfig(report),
    });
    cursorY = (pdf.lastAutoTable?.finalY || cursorY) + 10;
  }

  if (report.itemBreakdown.length > 0) {
    cursorY = ensureSectionSpace(pdf, cursorY, 26, report, theme);
    cursorY = drawSectionLabel(pdf, cursorY, 'Item Summary', theme);
    applyReportTable(pdf, report, theme, {
      startY: cursorY,
      ...buildItemTableConfig(report),
    });
    cursorY = (pdf.lastAutoTable?.finalY || cursorY) + 10;
  }

  cursorY = ensureSectionSpace(pdf, cursorY, 26, report, theme);
  cursorY = drawSectionLabel(pdf, cursorY, 'Detailed Entries', theme);
  applyReportTable(pdf, report, theme, {
    startY: cursorY,
    ...buildRecordTableConfig(report),
  });

  return pdf.output('blob');
};
