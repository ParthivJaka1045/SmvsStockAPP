import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import gujaratiFontBoldUrl from './assets/fonts/NotoSansGujarati-Bold.ttf?url';
import gujaratiFontRegularUrl from './assets/fonts/NotoSansGujarati-Regular.ttf?url';
import { categories } from './data';

export const REPORT_TITLE = 'SMVS MONTHLY STOCK REPORT';

const REPORT_FONT_FAMILY = 'NotoSansGujarati';
const DEFAULT_PDF_FONT_FAMILY = 'helvetica';

export const createDefaultReportOptions = () => ({});

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

const getTodayDateValue = () => {
  const today = new Date();
  return `${today.getFullYear()}-${padValue(today.getMonth() + 1)}-${padValue(today.getDate())}`;
};

const getMonthValueFromDate = (value) => {
  const date = toDateObject(value);
  if (!date) return '';
  return `${date.getFullYear()}-${padValue(date.getMonth() + 1)}`;
};

const getLastDateOfMonth = (monthValue) => {
  if (!monthValue || !/^\d{4}-\d{2}$/.test(monthValue)) return getTodayDateValue();
  const [year, month] = monthValue.split('-').map(Number);
  const date = new Date(year, month, 0);
  return `${date.getFullYear()}-${padValue(date.getMonth() + 1)}-${padValue(date.getDate())}`;
};

const ensureDateInMonth = (monthValue, selectedDate) => {
  if (!monthValue) return selectedDate || getTodayDateValue();
  if (selectedDate && selectedDate.startsWith(monthValue)) return selectedDate;
  const today = getTodayDateValue();
  if (today.startsWith(monthValue)) return today;
  return getLastDateOfMonth(monthValue);
};

const getMonthStartDate = (monthValue) => `${monthValue}-01`;

const getNormalizedMonthValue = (value) => {
  if (typeof value === 'string' && /^\d{4}-\d{2}$/.test(value)) return value;
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value.slice(0, 7);
  return getMonthValueFromDate(new Date());
};

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

export const formatMonthLabel = (monthValue) => {
  if (!monthValue || !/^\d{4}-\d{2}$/.test(monthValue)) return '-';
  const [year, month] = monthValue.split('-').map(Number);
  const monthName = new Intl.DateTimeFormat('en-US', { month: 'long' }).format(new Date(year, month - 1, 1));
  return `${monthName}_${year}`;
};

const getRangeLabel = (selectedDate) => `તા. 1 થી ${formatDisplayDate(selectedDate)}`;

const buildBaseRow = (itemName, monthLabel) => ({
  itemName: itemName || '-',
  monthLabel,
  income: 0,
  outgoing: 0,
  totalStock: 0,
});

const addMovement = (rowMap, itemName, monthLabel, field, amount) => {
  const normalizedName = (itemName || '').toString().trim();
  if (!normalizedName) return;
  const key = normalizeText(normalizedName);
  const existing = rowMap.get(key) || buildBaseRow(normalizedName, monthLabel);
  existing[field] = roundMetric(existing[field] + safeNumber(amount));
  existing.totalStock = roundMetric(existing.income - existing.outgoing);
  rowMap.set(key, existing);
};

const isDateWithinSelectedMonth = (value, monthValue, selectedDate) => {
  const dateValue = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? value
    : (() => {
        const date = toDateObject(value);
        return date
          ? `${date.getFullYear()}-${padValue(date.getMonth() + 1)}-${padValue(date.getDate())}`
          : '';
      })();

  if (!dateValue) return false;
  return dateValue >= getMonthStartDate(monthValue) && dateValue <= selectedDate;
};

const matchesCenterFilter = (candidateCenter, scope, targetCenter) => {
  if (scope !== 'center') return true;
  return normalizeText(candidateCenter) === normalizeText(targetCenter);
};

const getSendItemValue = (item) => safeNumber(item?.kg);

const getRequestItemValue = (item) => safeNumber(item?.qty);

const getPurchaseItemValue = (item) => safeNumber(item?.kg);

const buildLegacyRows = (report, monthLabel) => {
  if (!Array.isArray(report.itemBreakdown)) return [];
  return report.itemBreakdown.map((row) => {
    const income = report.reportKind === 'send' ? safeNumber(row.totalKg) : 0;
    const outgoing = report.reportKind === 'request' ? safeNumber(row.totalQuantity) : 0;
    return {
      itemName: row.itemName || '-',
      monthLabel,
      income: roundMetric(income),
      outgoing: roundMetric(outgoing),
      totalStock: roundMetric(income - outgoing),
    };
  });
};

const summarizeRows = (rows) => ({
  totalRows: rows.length,
  totalIncome: roundMetric(rows.reduce((sum, row) => sum + safeNumber(row.income), 0)),
  totalOutgoing: roundMetric(rows.reduce((sum, row) => sum + safeNumber(row.outgoing), 0)),
  totalStock: roundMetric(rows.reduce((sum, row) => sum + safeNumber(row.totalStock), 0)),
});

export const hydrateReport = (report) => {
  const month = getNormalizedMonthValue(report.month || report.monthValue || report.fromDate || report.toDate);
  const selectedDate = ensureDateInMonth(month, report.selectedDate || report.toDate || report.generatedAtIso || report.generatedAt);
  const monthLabel = report.monthLabel || formatMonthLabel(month);
  const scope = report.scope === 'center' ? 'center' : 'all';
  const center = (report.center || '').toString().trim();
  const centerLabel = report.centerLabel || (scope === 'center' && center ? center : 'All Centers / Full Report');

  const rows = Array.isArray(report.rows) && report.rows.length > 0
    ? report.rows.map((row) => ({
        itemName: row.itemName || '-',
        monthLabel: row.monthLabel || monthLabel,
        income: roundMetric(row.income),
        outgoing: roundMetric(row.outgoing),
        totalStock: roundMetric(
          row.totalStock ?? (safeNumber(row.income) - safeNumber(row.outgoing)),
        ),
      }))
    : buildLegacyRows(report, monthLabel);

  const summarySource = report.summary || {};
  const computedSummary = summarizeRows(rows);

  return {
    ...report,
    title: report.title || REPORT_TITLE,
    month,
    monthLabel,
    selectedDate,
    scope,
    center,
    centerLabel,
    rangeLabel: report.rangeLabel || getRangeLabel(selectedDate),
    generatedAtIso:
      report.generatedAtIso || getIsoString(report.generatedAt) || getIsoString(report.generatedOn) || new Date().toISOString(),
    createdBy: report.createdBy || 'Admin',
    email: report.email || '',
    rows,
    summary: {
      totalRows: safeNumber(summarySource.totalRows ?? computedSummary.totalRows),
      totalIncome: roundMetric(summarySource.totalIncome ?? computedSummary.totalIncome),
      totalOutgoing: roundMetric(summarySource.totalOutgoing ?? computedSummary.totalOutgoing),
      totalStock: roundMetric(summarySource.totalStock ?? computedSummary.totalStock),
    },
  };
};

export const getVisibleReportMetrics = (reportInput) => {
  const report = hydrateReport(reportInput);
  return [
    { key: 'rows', label: 'Number of Item', value: formatMetric(report.summary.totalRows) },
    { key: 'income', label: 'આવક KG', value: formatMetric(report.summary.totalIncome) },
    { key: 'outgoing', label: 'જાવક KG', value: formatMetric(report.summary.totalOutgoing) },
    { key: 'stock', label: 'કુલ સ્ટોક KG', value: formatMetric(report.summary.totalStock) },
  ];
};

export const buildSummaryReport = ({
  orders = [],
  sendOrders = [],
  purchases = [],
  month = '',
  selectedDate = '',
  createdBy = 'Admin',
  scope = 'all',
  center = '',
}) => {
  const normalizedMonth = getNormalizedMonthValue(month || selectedDate || new Date());
  const normalizedSelectedDate = ensureDateInMonth(normalizedMonth, selectedDate);
  const monthLabel = formatMonthLabel(normalizedMonth);
  const normalizedScope = scope === 'center' ? 'center' : 'all';
  const normalizedCenter = (center || '').toString().trim();
  const rowMap = new Map();

  orders
    .filter((order) =>
      isDateWithinSelectedMonth(order.date, normalizedMonth, normalizedSelectedDate)
      && matchesCenterFilter(order.center, normalizedScope, normalizedCenter),
    )
    .forEach((order) => {
      const items = Array.isArray(order.items) ? order.items : [];
      items.forEach((item) => {
        addMovement(rowMap, item.name, monthLabel, 'outgoing', getRequestItemValue(item));
      });
    });

  sendOrders
    .filter((order) =>
      isDateWithinSelectedMonth(order.date, normalizedMonth, normalizedSelectedDate)
      && matchesCenterFilter(order.fromCenter, normalizedScope, normalizedCenter),
    )
    .forEach((order) => {
      const items = Array.isArray(order.items) ? order.items : [];
      items.forEach((item) => {
        addMovement(rowMap, item.itemName, monthLabel, 'income', getSendItemValue(item));
      });
    });

  purchases
    .filter((purchase) =>
      isDateWithinSelectedMonth(purchase.billDate || purchase.date, normalizedMonth, normalizedSelectedDate)
      && matchesCenterFilter(purchase.center, normalizedScope, normalizedCenter),
    )
    .forEach((purchase) => {
      const items = Array.isArray(purchase.items) ? purchase.items : [];
      items.forEach((item) => {
        addMovement(rowMap, item.itemName, monthLabel, 'income', getPurchaseItemValue(item));
      });
    });

  const rows = Array.from(rowMap.values())
    .filter((row) => safeNumber(row.income) !== 0 || safeNumber(row.outgoing) !== 0 || safeNumber(row.totalStock) !== 0)
    .sort((left, right) => left.itemName.localeCompare(right.itemName));

  return hydrateReport({
    type: 'monthly-stock-report',
    month: normalizedMonth,
    monthLabel,
    selectedDate: normalizedSelectedDate,
    scope: normalizedScope,
    center: normalizedCenter,
    centerLabel: normalizedScope === 'center' && normalizedCenter ? normalizedCenter : 'All Centers / Full Report',
    rangeLabel: getRangeLabel(normalizedSelectedDate),
    title: REPORT_TITLE,
    createdBy,
    generatedAt: new Date(),
    generatedAtIso: new Date().toISOString(),
    summary: summarizeRows(rows),
    rows,
  });
};

const sanitizeFilePart = (value) =>
  (value || '')
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '') || 'report';

export const getReportFileName = (reportInput) => {
  const report = hydrateReport(reportInput);
  const centerPart = report.scope === 'center' ? `-${sanitizeFilePart(report.centerLabel)}` : '';
  return `smvs-monthly-stock-${sanitizeFilePart(report.month)}-${sanitizeFilePart(report.selectedDate)}${centerPart}.pdf`;
};

export const getReportTheme = () => ({
  key: 'monthly',
  title: 'Monthly Stock Report',
  primary: [5, 150, 105],
  accent: [16, 185, 129],
  surface: [236, 253, 245],
  line: [167, 243, 208],
  text: [6, 95, 70],
  dark: [20, 83, 45],
});

const drawFirstPageHeader = (pdf, report, fontFamily) => {
  const pageWidth = pdf.internal.pageSize.getWidth();

  pdf.setFillColor(236, 253, 245);
  pdf.roundedRect(14, 10, pageWidth - 28, 32, 4, 4, 'F');

  pdf.setFont(DEFAULT_PDF_FONT_FAMILY, 'bold');
  pdf.setFontSize(16);
  pdf.setTextColor(6, 95, 70);
  pdf.text(REPORT_TITLE, pageWidth / 2, 18, { align: 'center' });

  pdf.setFont(DEFAULT_PDF_FONT_FAMILY, 'bold');
  pdf.setFontSize(8.2);
  pdf.setTextColor(100, 116, 139);
  pdf.text(`Month: ${report.monthLabel}`, 20, 27);
  pdf.text(`Center: ${report.centerLabel}`, pageWidth - 20, 27, { align: 'right' });

  pdf.setFont(fontFamily, 'normal');
  pdf.setFontSize(9.2);
  pdf.setTextColor(31, 41, 55);
  pdf.text(`Range: ${report.rangeLabel}`, 20, 34);

  pdf.setDrawColor(16, 185, 129);
  pdf.setLineWidth(0.7);
  pdf.line(20, 45, pageWidth - 20, 45);
};

const drawContinuationHeader = (pdf, report, fontFamily) => {
  const pageWidth = pdf.internal.pageSize.getWidth();

  pdf.setFont(DEFAULT_PDF_FONT_FAMILY, 'bold');
  pdf.setFontSize(9.5);
  pdf.setTextColor(6, 95, 70);
  pdf.text(REPORT_TITLE, 14, 15);

  pdf.setFont(fontFamily, 'normal');
  pdf.text(`${report.monthLabel} | ${report.centerLabel}`, pageWidth - 14, 15, { align: 'right' });

  pdf.setDrawColor(16, 185, 129);
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

const drawSummaryMetricRow = (pdf, y, report, fontFamily) => {
  const metrics = [
    { labelLines: ['Number of', 'Item'], value: formatMetric(report.summary.totalRows), font: DEFAULT_PDF_FONT_FAMILY },
    { labelLines: ['આવક', 'KG'], value: formatMetric(report.summary.totalIncome), font: fontFamily },
    { labelLines: ['જાવક', 'KG'], value: formatMetric(report.summary.totalOutgoing), font: fontFamily },
    { labelLines: ['કુલ સ્ટોક', 'KG'], value: formatMetric(report.summary.totalStock), font: fontFamily },
  ];
  const pageWidth = pdf.internal.pageSize.getWidth();
  const usableWidth = pageWidth - 28;
  const columnWidth = usableWidth / metrics.length;

  metrics.forEach((metric, index) => {
    const cardX = 14 + (columnWidth * index);
    const x = cardX + (columnWidth / 2);
    pdf.setFillColor(236, 253, 245);
    pdf.roundedRect(cardX, y - 2, columnWidth - 1.5, 16, 2, 2, 'F');

    pdf.setFont(metric.font, 'bold');
    pdf.setFontSize(5.4);
    pdf.setTextColor(6, 95, 70);
    pdf.text(metric.labelLines, x, y - 0.5, { align: 'center' });
  });

  metrics.forEach((metric, index) => {
    const x = 14 + (columnWidth * index) + (columnWidth / 2);
    pdf.setFont(DEFAULT_PDF_FONT_FAMILY, 'bold');
    pdf.setFontSize(12);
    pdf.setTextColor(17, 24, 39);
    pdf.text(String(metric.value), x, y + 7.5, { align: 'center' });
  });

  return y + 18;
};

const getTableConfig = (report) => ({
  head: [[
    'વસ્તુનું નામ',
    'મહિનો',
    `${report.rangeLabel} આવક (KG)`,
    `${report.rangeLabel} જાવક (KG)`,
    'કુલ સ્ટોક (KG)',
  ]],
  body: report.rows.map((row) => [
    row.itemName,
    row.monthLabel,
    formatMetric(row.income),
    formatMetric(row.outgoing),
    formatMetric(row.totalStock),
  ]),
});

export const generateSummaryReportPDFBlob = async (reportInput) => {
  const report = hydrateReport(reportInput);
  const pdf = new jsPDF('p', 'mm', 'a4');
  const fontFamily = await ensureReportFont(pdf);

  drawFirstPageHeader(pdf, report, fontFamily);

  autoTable(pdf, {
    startY: 54,
    ...getTableConfig(report),
    margin: { top: 26, right: 14, bottom: 42, left: 14 },
    styles: {
      font: fontFamily,
      fontSize: 8.6,
      cellPadding: 2.4,
      textColor: [31, 41, 55],
      lineColor: [209, 213, 219],
      lineWidth: 0.15,
      overflow: 'linebreak',
    },
    headStyles: {
      fillColor: [236, 253, 245],
      textColor: [6, 95, 70],
      fontStyle: 'bold',
      lineColor: [167, 243, 208],
      lineWidth: 0.18,
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

  if (pdf.lastAutoTable) {
    drawSummaryMetricRow(pdf, pdf.lastAutoTable.finalY + 8, report, fontFamily);
  }

  if (!pdf.lastAutoTable) {
    drawPageFooter(pdf, report, fontFamily);
  }

  return pdf.output('blob');
};

export const getReportMasterItems = () => (
  Object.values(categories).flat().map((item) => item.name)
);
