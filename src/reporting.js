import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import gujaratiFontBoldUrl from './assets/fonts/NotoSansGujarati-Bold.ttf?url';
import gujaratiFontRegularUrl from './assets/fonts/NotoSansGujarati-Regular.ttf?url';

export const REPORT_TITLE = 'SMVS STOCK SUMMARY REPORT';

const REPORT_FONT_FAMILY = 'NotoSansGujarati';
const DEFAULT_PDF_FONT_FAMILY = 'helvetica';

export const createDefaultReportOptions = () => ({
  sections: {
    centerBreakdown: true,
    itemSummary: true,
    detailedEntries: true,
  },
  metrics: {
    totalEntries: true,
    activeCenters: true,
    lineItems: true,
    valueTotal: true,
  },
});

const normalizeReportOptions = (options) => {
  const defaults = createDefaultReportOptions();
  const sections = options?.sections || {};
  const metrics = options?.metrics || {};

  return {
    sections: {
      centerBreakdown: sections.centerBreakdown ?? defaults.sections.centerBreakdown,
      itemSummary: true,
      detailedEntries: sections.detailedEntries ?? defaults.sections.detailedEntries,
    },
    metrics: {
      totalEntries: metrics.totalEntries ?? defaults.metrics.totalEntries,
      activeCenters: metrics.activeCenters ?? defaults.metrics.activeCenters,
      lineItems: metrics.lineItems ?? defaults.metrics.lineItems,
      valueTotal: metrics.valueTotal ?? defaults.metrics.valueTotal,
    },
  };
};

export const getReportValueMetricLabel = (reportKind) => (reportKind === 'send' ? 'KG Total' : 'Qty Total');

let reportFontAssetsPromise = null;

const arrayBufferToBase64 = (buffer) => {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;

  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
};

const loadReportFontAssets = async () => {
  if (!reportFontAssetsPromise) {
    reportFontAssetsPromise = Promise.all([
      { fileName: 'NotoSansGujarati-Regular.ttf', fontUrl: gujaratiFontRegularUrl, style: 'normal' },
      { fileName: 'NotoSansGujarati-Bold.ttf', fontUrl: gujaratiFontBoldUrl, style: 'bold' },
    ].map(async ({ fileName, fontUrl, style }) => {
      const response = await fetch(fontUrl);
      if (!response.ok) throw new Error(`Font download failed for ${fileName}`);
      const buffer = await response.arrayBuffer();
      return {
        fileName,
        style,
        base64: arrayBufferToBase64(buffer),
      };
    }));
  }

  return reportFontAssetsPromise;
};

const ensureReportFont = async (pdf) => {
  try {
    const assets = await loadReportFontAssets();
    assets.forEach(({ fileName, style, base64 }) => {
      if (!pdf.existsFileInVFS(fileName)) {
        pdf.addFileToVFS(fileName, base64);
      }
      pdf.addFont(fileName, REPORT_FONT_FAMILY, style);
    });
    return REPORT_FONT_FAMILY;
  } catch (error) {
    console.warn('Report font load failed, falling back to Helvetica.', error);
    return DEFAULT_PDF_FONT_FAMILY;
  }
};

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
    title: report.title || REPORT_TITLE,
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
    options: normalizeReportOptions(report.options),
    summary: {
      totalRecords: safeNumber(summary.totalRecords),
      totalCenters: safeNumber(summary.totalCenters),
      totalLineItems: safeNumber(summary.totalLineItems),
      totalQuantity: roundMetric(summary.totalQuantity),
      totalKg: roundMetric(summary.totalKg),
    },
  };
};

export const getVisibleReportMetrics = (reportInput) => {
  const report = hydrateReport(reportInput);
  const metrics = [
    { key: 'totalEntries', label: 'Total Entries', value: formatMetric(report.summary.totalRecords) },
    { key: 'activeCenters', label: 'Active Centers', value: formatMetric(report.summary.totalCenters) },
    { key: 'lineItems', label: 'Line Items', value: formatMetric(report.summary.totalLineItems) },
    {
      key: 'valueTotal',
      label: getReportValueMetricLabel(report.reportKind),
      value: formatMetric(report.reportKind === 'send' ? report.summary.totalKg : report.summary.totalQuantity),
    },
  ];

  return metrics.filter((metric) => report.options.metrics[metric.key]);
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
  options = createDefaultReportOptions(),
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

  return hydrateReport({
    type: 'summary-report',
    reportKind,
    scope,
    center,
    centerLabel: scope === 'center' ? center || '-' : 'All Centers',
    fromDate,
    toDate,
    rangeLabel: formatDateRangeLabel(fromDate, toDate),
    title: REPORT_TITLE,
    createdBy,
    generatedAt: new Date(),
    generatedAtIso: new Date().toISOString(),
    summary,
    options: normalizeReportOptions(options),
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

const drawFirstPageHeader = (pdf, report, fontFamily) => {
  const pageWidth = pdf.internal.pageSize.getWidth();
  const centeredX = pageWidth / 2;

  pdf.setFont(fontFamily, 'bold');
  pdf.setFontSize(16);
  pdf.setTextColor(17, 24, 39);
  pdf.text(REPORT_TITLE, centeredX, 18, { align: 'center' });

  pdf.setFont(fontFamily, 'normal');
  pdf.setFontSize(10);
  pdf.text(`Center : ${report.centerLabel}`, centeredX, 26, { align: 'center' });
  pdf.text(`Range: ${report.rangeLabel}`, centeredX, 32, { align: 'center' });
  pdf.text(`Scope: ${report.scope === 'center' ? 'Center-wise' : 'Full Report'}`, centeredX, 38, { align: 'center' });

  pdf.setDrawColor(156, 163, 175);
  pdf.line(14, 42, pageWidth - 14, 42);
};

const drawContinuationHeader = (pdf, report, fontFamily) => {
  const pageWidth = pdf.internal.pageSize.getWidth();

  pdf.setFont(fontFamily, 'bold');
  pdf.setFontSize(9.5);
  pdf.setTextColor(17, 24, 39);
  pdf.text(REPORT_TITLE, 14, 15);

  pdf.setFont(fontFamily, 'normal');
  pdf.text(`Center: ${report.centerLabel}`, pageWidth - 14, 15, { align: 'right' });

  pdf.setDrawColor(209, 213, 219);
  pdf.line(14, 18, pageWidth - 14, 18);
};

const drawPageFooter = (pdf, report, fontFamily) => {
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const currentPage = pdf.getCurrentPageInfo().pageNumber;
  const totalPages = pdf.getNumberOfPages();

  pdf.setDrawColor(209, 213, 219);
  pdf.line(14, pageHeight - 12, pageWidth - 14, pageHeight - 12);

  pdf.setFont(fontFamily, 'normal');
  pdf.setFontSize(8);
  pdf.setTextColor(107, 114, 128);
  pdf.text(`Range: ${report.rangeLabel}`, 14, pageHeight - 7);
  pdf.text(`Page ${currentPage} / ${totalPages}`, pageWidth - 14, pageHeight - 7, { align: 'right' });
};

const drawSummaryMetricRow = (pdf, y, metrics, fontFamily) => {
  if (metrics.length === 0) return y;

  const pageWidth = pdf.internal.pageSize.getWidth();
  const usableWidth = pageWidth - 28;
  const columnWidth = usableWidth / metrics.length;
  const labelSize = metrics.length >= 4 ? 8.5 : 9;

  pdf.setFont(fontFamily, 'bold');
  pdf.setFontSize(labelSize);
  pdf.setTextColor(55, 65, 81);
  metrics.forEach((metric, index) => {
    const x = 14 + (columnWidth * index) + (columnWidth / 2);
    pdf.text(metric.label, x, y, { align: 'center' });
  });

  pdf.setFont(fontFamily, 'normal');
  pdf.setFontSize(13);
  pdf.setTextColor(17, 24, 39);
  metrics.forEach((metric, index) => {
    const x = 14 + (columnWidth * index) + (columnWidth / 2);
    pdf.text(String(metric.value), x, y + 8, { align: 'center' });
  });

  pdf.setDrawColor(156, 163, 175);
  pdf.line(14, y + 12, pageWidth - 14, y + 12);

  return y + 18;
};

const ensureSectionSpace = (pdf, startY, neededHeight, report, fontFamily) => {
  const pageHeight = pdf.internal.pageSize.getHeight();
  if (startY + neededHeight <= pageHeight - 18) return startY;
  pdf.addPage();
  drawContinuationHeader(pdf, report, fontFamily);
  return 26;
};

const drawSectionLabel = (pdf, y, label, fontFamily) => {
  const pageWidth = pdf.internal.pageSize.getWidth();

  pdf.setFont(fontFamily, 'bold');
  pdf.setFontSize(11);
  pdf.setTextColor(17, 24, 39);
  pdf.text(label.toUpperCase(), 14, y);

  pdf.setDrawColor(209, 213, 219);
  pdf.line(14, y + 2, pageWidth - 14, y + 2);

  return y + 7;
};

const buildCenterTableConfig = (report) => {
  if (report.reportKind === 'send') {
    return {
      head: [['Center', 'Entries', 'Line Items', 'KG Total', 'Last Date']],
      body: report.centerBreakdown.map((row) => [
        row.center,
        formatMetric(row.recordsCount),
        formatMetric(row.lineItems),
        formatMetric(row.totalKg),
        formatDisplayDate(row.lastEntryDate),
      ]),
    };
  }

  return {
    head: [['Center', 'Entries', 'Line Items', 'Last Date']],
    body: report.centerBreakdown.map((row) => [
      row.center,
      formatMetric(row.recordsCount),
      formatMetric(row.lineItems),
      formatDisplayDate(row.lastEntryDate),
    ]),
  };
};

const buildItemTableConfig = (report) => {
  if (report.reportKind === 'send') {
    return {
      head: [['Item Name', 'Line Items', 'KG Total']],
      body: report.itemBreakdown.map((row) => [
        row.itemName,
        formatMetric(row.lineItems),
        formatMetric(row.totalKg),
      ]),
    };
  }

  return {
    head: [['Item Name', 'Unit', 'Line Items']],
    body: report.itemBreakdown.map((row) => [
      row.itemName,
      row.unit || '-',
      formatMetric(row.lineItems),
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

const applyReportTable = (pdf, report, fontFamily, config) => {
  autoTable(pdf, {
    ...config,
    margin: { top: 26, right: 14, bottom: 16, left: 14 },
    styles: {
      font: fontFamily,
      fontSize: 8.4,
      cellPadding: 2.2,
      textColor: [31, 41, 55],
      lineColor: [209, 213, 219],
      lineWidth: 0.15,
      overflow: 'linebreak',
    },
    headStyles: {
      fillColor: [243, 244, 246],
      textColor: [17, 24, 39],
      fontStyle: 'bold',
      lineColor: [156, 163, 175],
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
        drawContinuationHeader(pdf, report, fontFamily);
      }
      drawPageFooter(pdf, report, fontFamily);
    },
  });
};

export const generateSummaryReportPDFBlob = async (reportInput) => {
  const report = hydrateReport(reportInput);
  const pdf = new jsPDF('p', 'mm', 'a4');
  const fontFamily = await ensureReportFont(pdf);

  drawFirstPageHeader(pdf, report, fontFamily);

  let cursorY = drawSummaryMetricRow(pdf, 52, getVisibleReportMetrics(report), fontFamily);

  if (report.options.sections.centerBreakdown && report.centerBreakdown.length > 0) {
    cursorY = ensureSectionSpace(pdf, cursorY, 26, report, fontFamily);
    cursorY = drawSectionLabel(pdf, cursorY, 'Center Breakdown', fontFamily);
    applyReportTable(pdf, report, fontFamily, {
      startY: cursorY,
      ...buildCenterTableConfig(report),
    });
    cursorY = (pdf.lastAutoTable?.finalY || cursorY) + 10;
  }

  if (report.itemBreakdown.length > 0) {
    cursorY = ensureSectionSpace(pdf, cursorY, 26, report, fontFamily);
    cursorY = drawSectionLabel(pdf, cursorY, 'Item Summary', fontFamily);
    applyReportTable(pdf, report, fontFamily, {
      startY: cursorY,
      ...buildItemTableConfig(report),
    });
    cursorY = (pdf.lastAutoTable?.finalY || cursorY) + 10;
  }

  if (report.options.sections.detailedEntries) {
    cursorY = ensureSectionSpace(pdf, cursorY, 26, report, fontFamily);
    cursorY = drawSectionLabel(pdf, cursorY, 'Detailed Entries', fontFamily);
    applyReportTable(pdf, report, fontFamily, {
      startY: cursorY,
      ...buildRecordTableConfig(report),
    });
  }

  if (!pdf.lastAutoTable) {
    drawPageFooter(pdf, report, fontFamily);
  }

  return pdf.output('blob');
};
