import { categories } from './data';

export const REPORT_TITLE = 'SMVS MONTHLY STOCK REPORT';

export const createDefaultReportOptions = () => ({});

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
    { key: 'rows', label: 'વસ્તુઓની સંખ્યા', value: formatMetric(report.summary.totalRows) },
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

export const getReportMasterItems = () => (
  Object.values(categories).flat().map((item) => item.name)
);
