import { getFallbackCatalogItems } from './itemCatalog';

const isLegacyStockReportTitle = (title) => /SMVS/i.test(title) || /MONTHLY STOCK REPORT/i.test(title);

export const deriveStockReportTitle = (report) =>
  (report?.reportPeriod === 'yearly' ? 'Yearly Report' : 'Monthly Report');

export const formatYearLabel = (monthValue) => {
  const year = (monthValue || '').toString().slice(0, 4);
  return /^\d{4}$/.test(year) ? year : '-';
};

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

const getRangeStartDate = (fromMonth, monthFallback) => {
  const normalized = getNormalizedMonthValue(fromMonth || monthFallback || new Date());
  return `${normalized}-01`;
};

const getRangeEndDate = (toMonth, monthFallback, selectedDate) => {
  if (selectedDate && /^\d{4}-\d{2}-\d{2}$/.test(selectedDate)) return selectedDate;
  const normalized = getNormalizedMonthValue(toMonth || monthFallback || new Date());
  return getLastDateOfMonth(normalized);
};

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

const indianNumberFormatter = new Intl.NumberFormat('en-IN', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

/** Display numbers with Indian-style grouping (e.g. 1,000 / 10,000 / 1,00,000). */
export const formatMetric = (value) => {
  const numeric = safeNumber(value);
  if (!Number.isFinite(numeric)) return indianNumberFormatter.format(0);
  return indianNumberFormatter.format(numeric);
};

export const formatMonthLabel = (monthValue) => {
  if (!monthValue || !/^\d{4}-\d{2}$/.test(monthValue)) return '-';
  const [year, month] = monthValue.split('-').map(Number);
  const monthName = new Intl.DateTimeFormat('en-US', { month: 'long' }).format(new Date(year, month - 1, 1));
  return `${monthName}_${year}`;
};

export const getRangeLabel = (selectedDate, monthValue, reportPeriod = 'monthly') => {
  if (!selectedDate) return '-';
  if (reportPeriod === 'yearly') {
    const year = (monthValue || '').slice(0, 4);
    if (!year || year.length !== 4) return `Through ${formatDisplayDate(selectedDate)}`;
    return `From 01-01-${year} to ${formatDisplayDate(selectedDate)}`;
  }
  const monthStart = getMonthStartDate(monthValue);
  return `From ${formatDisplayDate(monthStart)} to ${formatDisplayDate(selectedDate)}`;
};

const ensureDateInCalendarYear = (monthValue, selectedDate) => {
  const year = (monthValue || '').slice(0, 4);
  if (!year || year.length !== 4) return selectedDate || getTodayDateValue();
  if (selectedDate && selectedDate.startsWith(year)) return selectedDate;
  const today = getTodayDateValue();
  if (today.startsWith(year)) return today;
  return `${year}-12-31`;
};

const isDateWithinSelectedYear = (value, monthValue, selectedDate) => {
  const year = (monthValue || '').slice(0, 4);
  if (!year || year.length !== 4) return false;
  const dateValue =
    typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
      ? value
      : (() => {
          const date = toDateObject(value);
          return date
            ? `${date.getFullYear()}-${padValue(date.getMonth() + 1)}-${padValue(date.getDate())}`
            : '';
        })();

  if (!dateValue || !dateValue.startsWith(year)) return false;
  return dateValue >= `${year}-01-01` && dateValue <= selectedDate;
};

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

const toComparableIsoDate = (value) => {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = toDateObject(value);
  if (!date) return '';
  return `${date.getFullYear()}-${padValue(date.getMonth() + 1)}-${padValue(date.getDate())}`;
};

/** True iff transaction date is strictly before the report window starts (opening-balance cutoff). */
const isDateStrictlyBeforeRangeStart = (value, rangeStartIso) => {
  const dateValue = toComparableIsoDate(value);
  if (!dateValue || !rangeStartIso) return false;
  return dateValue < rangeStartIso;
};

/** મુખ્ય કોઠાર દર આઇટમની શરૂઆતની સ્ટોક રેન્જ પહેલાં: ખરીદી (બધા) + સેન્ડ (બધા કેન્દ્ર) − રિક્વેસ્ટ (બધા કેન્દ્ર). */
const accumulateGlobalOpeningStockByItem = (orders, sendOrders, purchases, rangeStartIso) => {
  const byKey = new Map();
  const bumpOpening = (itemName, deltaKg, displayFallback) => {
    const trimmed = (itemName || '').toString().trim();
    if (!trimmed) return;
    const nk = normalizeText(trimmed);
    const prev = byKey.get(nk) || { kg: 0, displayName: trimmed };
    const nextKg = roundMetric(prev.kg + safeNumber(deltaKg));
    byKey.set(nk, {
      kg: nextKg,
      displayName: prev.displayName || displayFallback || trimmed,
    });
  };

  purchases
    .filter((p) => !p?.is_deleted)
    .filter((purchase) =>
      isDateStrictlyBeforeRangeStart(purchase.billDate || purchase.date || purchase.entryDate, rangeStartIso),
    )
    .forEach((purchase) => {
      const items = Array.isArray(purchase.items) ? purchase.items : [];
      items.forEach((item) =>
        bumpOpening(item.itemName, getPurchaseItemValue(item), item.itemName),
      );
    });

  sendOrders
    .filter((o) => !o?.is_deleted)
    .filter((order) =>
      isDateStrictlyBeforeRangeStart(order.date, rangeStartIso),
    )
    .forEach((order) => {
      const items = Array.isArray(order.items) ? order.items : [];
      items.forEach((item) =>
        bumpOpening(item.itemName, getSendItemValue(item), item.itemName),
      );
    });

  orders
    .filter((o) => !o?.is_deleted)
    .filter((order) =>
      isDateStrictlyBeforeRangeStart(order.date, rangeStartIso),
    )
    .forEach((order) => {
      const items = Array.isArray(order.items) ? order.items : [];
      items.forEach((item) =>
        bumpOpening(item.name, -getRequestItemValue(item), item.name),
      );
    });

  return byKey;
};

const matchesCenterFilter = (candidateCenter, scope, targetCenter) => {
  if (scope !== 'center') return true;
  return normalizeText(candidateCenter) === normalizeText(targetCenter);
};

/** દુકાન/કોઠાર ખરીદી દરેક સેન્ટર રિપોર્ટમાં આવક તરીકે (ગ્લોબલી ગણવી). */
const purchaseMatchesReportCenterScope = () => true;

const getSendItemValue = (item) => safeNumber(item?.kg);

const getRequestItemValue = (item) => {
  const qty = safeNumber(item?.qty);
  const unit = normalizeText(item?.unit);
  if (unit === normalizeText('ડબ્બા')) return qty * 13;
  if (unit === normalizeText('ગ્રામ')) return qty / 1000;
  return qty;
};

const getPurchaseItemValue = (item) => safeNumber(item?.kg);

const getPreviousMonthValue = (monthValue) => {
  if (!monthValue || !/^\d{4}-\d{2}$/.test(monthValue)) return '';
  const [year, month] = monthValue.split('-').map(Number);
  const prev = new Date(year, month - 2, 1);
  return `${prev.getFullYear()}-${padValue(prev.getMonth() + 1)}`;
};

const monthValueFromIsoDate = (isoDate) => {
  if (typeof isoDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return isoDate.slice(0, 7);
  return getMonthValueFromDate(isoDate);
};

const normalizeTransactionType = (value) => {
  const type = (value || '').toString().trim().toUpperCase();
  return type === 'OUT' ? 'OUT' : 'IN';
};

const normalizeHistoryTransactions = (stockTransactions = []) =>
  stockTransactions
    .map((entry) => {
      const itemName = (entry?.itemName || entry?.item_id || '').toString().trim();
      const centerName = (entry?.centerName || entry?.center_id || '').toString().trim();
      const dateIso = toComparableIsoDate(entry?.transaction_date || entry?.date || entry?.created_at);
      const quantity = safeNumber(entry?.quantity);
      return {
        ...entry,
        itemName,
        centerName,
        dateIso,
        quantity,
        transactionType: normalizeTransactionType(entry?.transaction_type),
      };
    })
    .filter((entry) => !entry?.is_deleted)
    .filter((entry) => entry.itemName && entry.dateIso && safeNumber(entry.quantity) !== 0);

const getSignedTransactionQuantity = (entry) =>
  entry.transactionType === 'OUT' ? -safeNumber(entry.quantity) : safeNumber(entry.quantity);

const buildMonthlyClosingLookup = (monthlyClosingStock = []) => {
  const byKey = new Map();
  monthlyClosingStock.forEach((entry) => {
    if (entry?.is_deleted) return;
    const month = (entry.month || entry.monthValue || '').toString().trim();
    const itemName = (entry.itemName || entry.item_id || '').toString().trim();
    if (!month || !itemName) return;
    const key = `${month}__${normalizeText(itemName)}`;
    byKey.set(key, {
      month,
      itemName,
      closingStock: roundMetric(entry.closingStock ?? entry.closing_qty),
    });
  });
  return byKey;
};

const getOpeningStockByItemFromHistory = ({
  txRows = [],
  monthlyClosingStock = [],
  rangeStartDate = '',
}) => {
  const openingByItem = new Map();
  if (!rangeStartDate) return openingByItem;
  const startMonth = monthValueFromIsoDate(rangeStartDate);
  const previousMonth = getPreviousMonthValue(startMonth);
  const monthlyLookup = buildMonthlyClosingLookup(monthlyClosingStock);

  const itemsInWindow = new Set(
    txRows
      .filter((entry) => entry.dateIso >= rangeStartDate)
      .map((entry) => normalizeText(entry.itemName)),
  );

  const snapshotBackedKeys = new Set();

  itemsInWindow.forEach((itemKey) => {
    const fromSnapshot = monthlyLookup.get(`${previousMonth}__${itemKey}`);
    if (fromSnapshot) {
      openingByItem.set(itemKey, {
        kg: roundMetric(fromSnapshot.closingStock),
        displayName: fromSnapshot.itemName,
      });
      snapshotBackedKeys.add(itemKey);
    }
  });

  txRows
    .filter((entry) => isDateStrictlyBeforeRangeStart(entry.dateIso, rangeStartDate))
    .forEach((entry) => {
      const key = normalizeText(entry.itemName);
      if (!key) return;
      if (snapshotBackedKeys.has(key)) return;
      const prev = openingByItem.get(key) || { kg: 0, displayName: entry.itemName };
      openingByItem.set(key, {
        kg: roundMetric(prev.kg + getSignedTransactionQuantity(entry)),
        displayName: prev.displayName || entry.itemName,
      });
    });

  return openingByItem;
};

export const buildMonthlyClosingSnapshots = ({
  stockTransactions = [],
  throughDate = '',
}) => {
  const txRows = normalizeHistoryTransactions(stockTransactions)
    .filter((entry) => !throughDate || entry.dateIso <= throughDate)
    .sort((a, b) => a.dateIso.localeCompare(b.dateIso));

  const runningByItem = new Map();
  const monthClosingsByKey = new Map();
  txRows.forEach((entry) => {
    const itemKey = normalizeText(entry.itemName);
    const month = monthValueFromIsoDate(entry.dateIso);
    const signedQty = getSignedTransactionQuantity(entry);
    const nextRunning = roundMetric(safeNumber(runningByItem.get(itemKey)) + signedQty);
    runningByItem.set(itemKey, nextRunning);
    monthClosingsByKey.set(`${month}__${itemKey}`, {
      month,
      itemName: entry.itemName,
      item_id: itemKey,
      closing_qty: nextRunning,
      closingStock: nextRunning,
      updatedAt: new Date(),
      is_deleted: false,
    });
  });

  return Array.from(monthClosingsByKey.values());
};

export const getMonthBounds = (monthValue) => ({
  startDate: `${monthValue}-01`,
  endDate: getLastDateOfMonth(monthValue),
});

export const isLockedPastMonth = (monthValue, selectedDate = '') => {
  if (!/^\d{4}-\d{2}$/.test(monthValue || '')) return false;
  const selectedMonth = getMonthValueFromDate(selectedDate || new Date());
  return !!selectedMonth && monthValue < selectedMonth;
};

export const buildSummaryReportFromSnapshots = ({
  snapshots = [],
  month = '',
  selectedDate = '',
  createdBy = 'Admin',
  scope = 'all',
  center = '',
  reportPeriod = 'monthly',
  stockViewMode = 'full_balance',
}) => {
  const normalizedMonth = getNormalizedMonthValue(month || selectedDate || new Date());
  const monthLabel = formatMonthLabel(normalizedMonth);
  const normalizedScope = scope === 'center' ? 'center' : 'all';
  const normalizedCenter = (center || '').toString().trim();
  const isMonthOnly = stockViewMode === 'month_movements_only';
  const rows = snapshots
    .filter((entry) => !entry?.is_deleted)
    .map((entry) => {
      const opening = safeNumber(entry.opening_balance ?? entry.openingBalance);
      const inward = safeNumber(entry.total_inward ?? entry.totalInward);
      const outward = safeNumber(entry.total_outward ?? entry.totalOutward);
      const closing = safeNumber(entry.closing_balance ?? entry.closingBalance ?? entry.closing_qty);
      const itemName = (entry.item_name || entry.itemName || entry.item_id || '-').toString().trim() || '-';
      return {
        itemName,
        monthLabel,
        income: roundMetric(isMonthOnly ? inward : opening + inward),
        outgoing: roundMetric(outward),
        totalStock: roundMetric(closing),
      };
    })
    .sort((left, right) => left.itemName.localeCompare(right.itemName));

  return hydrateReport({
    type: 'monthly-stock-report',
    source: 'monthly_stock_snapshots',
    month: normalizedMonth,
    monthLabel,
    selectedDate: ensureDateInMonth(normalizedMonth, selectedDate),
    scope: normalizedScope,
    center: normalizedCenter,
    centerLabel: normalizedScope === 'center' && normalizedCenter ? normalizedCenter : 'All Centers / Full Report',
    rangeLabel: getRangeLabel(ensureDateInMonth(normalizedMonth, selectedDate), normalizedMonth, reportPeriod),
    reportPeriod: 'monthly',
    title: deriveStockReportTitle({ reportPeriod: 'monthly' }),
    createdBy,
    generatedAt: new Date(),
    generatedAtIso: new Date().toISOString(),
    summary: summarizeRows(rows),
    rows,
    stockViewMode: isMonthOnly ? 'month_movements_only' : 'full_balance',
  });
};

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
  const reportPeriod = report.reportPeriod === 'yearly' ? 'yearly' : 'monthly';
  const selectedDate =
    reportPeriod === 'yearly'
      ? ensureDateInCalendarYear(month, report.selectedDate || report.toDate || report.generatedAtIso || report.generatedAt)
      : ensureDateInMonth(month, report.selectedDate || report.toDate || report.generatedAtIso || report.generatedAt);
  const computedMonthLabel =
    reportPeriod === 'yearly' ? formatYearLabel(month) : formatMonthLabel(month);
  const monthLabel = report.monthLabel || computedMonthLabel;
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

  const rawTitle = (report.title || '').trim();
  const title =
    !rawTitle || isLegacyStockReportTitle(rawTitle)
      ? deriveStockReportTitle({ reportPeriod })
      : rawTitle;

  const storedRange = report.rangeLabel;
  const isLegacyRange = storedRange && /[\u0A80-\u0AFF]/.test(storedRange);
  const rangeLabel =
    !storedRange || isLegacyRange
      ? getRangeLabel(selectedDate, month, reportPeriod)
      : storedRange;

  return {
    ...report,
    title,
    reportPeriod,
    month,
    monthLabel,
    selectedDate,
    scope,
    center,
    centerLabel,
    rangeLabel,
    stockViewMode: report.stockViewMode === 'month_movements_only' ? 'month_movements_only' : 'full_balance',
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
    { key: 'rows', label: 'Items', value: formatMetric(report.summary.totalRows) },
    { key: 'income', label: 'Income (KG)', value: formatMetric(report.summary.totalIncome) },
    { key: 'outgoing', label: 'Outgoing (KG)', value: formatMetric(report.summary.totalOutgoing) },
    { key: 'stock', label: 'Total Stock (KG)', value: formatMetric(report.summary.totalStock) },
  ];
};

export const buildSummaryReport = ({
  orders = [],
  sendOrders = [],
  purchases = [],
  stockTransactions = [],
  monthlyClosingStock = [],
  month = '',
  fromMonth = '',
  toMonth = '',
  selectedDate = '',
  createdBy = 'Admin',
  scope = 'all',
  center = '',
  reportPeriod = 'monthly',
  stockViewMode = 'full_balance',
}) => {
  const normalizedReportPeriod = reportPeriod === 'yearly' ? 'yearly' : 'monthly';
  const normalizedMonth = getNormalizedMonthValue(month || selectedDate || new Date());
  const normalizedFromMonth = getNormalizedMonthValue(fromMonth || normalizedMonth);
  const normalizedToMonth = getNormalizedMonthValue(toMonth || normalizedMonth);
  const useMonthRange = normalizedReportPeriod === 'monthly' && normalizedFromMonth <= normalizedToMonth;
  const normalizedSelectedDate =
    normalizedReportPeriod === 'yearly'
      ? ensureDateInCalendarYear(normalizedMonth, selectedDate)
      : (
          useMonthRange
            ? getRangeEndDate(normalizedToMonth, normalizedMonth, selectedDate)
            : ensureDateInMonth(normalizedMonth, selectedDate)
        );
  const monthLabel =
    normalizedReportPeriod === 'yearly'
      ? formatYearLabel(normalizedMonth)
      : (
          useMonthRange && normalizedFromMonth !== normalizedToMonth
            ? `${formatMonthLabel(normalizedFromMonth)} to ${formatMonthLabel(normalizedToMonth)}`
            : formatMonthLabel(normalizedMonth)
        );
  const normalizedScope = scope === 'center' ? 'center' : 'all';
  const normalizedCenter = (center || '').toString().trim();
  const rowMap = new Map();
  const rangeStartDate = useMonthRange ? getRangeStartDate(normalizedFromMonth, normalizedMonth) : getMonthStartDate(normalizedMonth);
  const rangeEndDate = normalizedSelectedDate;
  const normalizedHistoryTransactions = normalizeHistoryTransactions(stockTransactions);
  const hasHistoryLedger = normalizedHistoryTransactions.length > 0;

  const openingByItem = hasHistoryLedger
    ? getOpeningStockByItemFromHistory({
        txRows: normalizedHistoryTransactions,
        monthlyClosingStock,
        rangeStartDate,
      })
    : accumulateGlobalOpeningStockByItem(
        orders,
        sendOrders,
        purchases,
        rangeStartDate,
      );
  const isMonthMovementsOnly = stockViewMode === 'month_movements_only';
  if (!isMonthMovementsOnly) {
    openingByItem.forEach(({ kg, displayName }, normKey) => {
      void normKey;
      if (safeNumber(kg) === 0) return;
      addMovement(rowMap, displayName, monthLabel, 'income', kg);
    });
  }

  const dateInRange = (value) =>
    normalizedReportPeriod === 'yearly'
      ? isDateWithinSelectedYear(value, normalizedMonth, normalizedSelectedDate)
      : isDateWithinSelectedMonth(value, rangeStartDate.slice(0, 7), rangeEndDate);

  if (hasHistoryLedger) {
    normalizedHistoryTransactions
      .filter((entry) =>
        dateInRange(entry.dateIso)
        && matchesCenterFilter(entry.centerName, normalizedScope, normalizedCenter),
      )
      .forEach((entry) => {
        if (entry.transactionType === 'OUT') {
          addMovement(rowMap, entry.itemName, monthLabel, 'outgoing', entry.quantity);
          return;
        }
        addMovement(rowMap, entry.itemName, monthLabel, 'income', entry.quantity);
      });
  } else {

    orders
      .filter((order) =>
        dateInRange(order.date)
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
        dateInRange(order.date)
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
        dateInRange(purchase.billDate || purchase.date || purchase.entryDate)
        && purchaseMatchesReportCenterScope(purchase, normalizedScope, normalizedCenter),
      )
      .forEach((purchase) => {
        const items = Array.isArray(purchase.items) ? purchase.items : [];
        items.forEach((item) => {
          addMovement(rowMap, item.itemName, monthLabel, 'income', getPurchaseItemValue(item));
        });
      });
  }

  let finalRowMap = rowMap;
  if (isMonthMovementsOnly) {
    const merged = new Map();
    const allKeys = new Set([...rowMap.keys(), ...openingByItem.keys()]);
    allKeys.forEach((key) => {
      const op = openingByItem.get(key);
      const openingKg = op ? roundMetric(safeNumber(op.kg)) : 0;
      const row = rowMap.get(key);
      const displayName = (row?.itemName || op?.displayName || key || '-').toString().trim() || '-';
      const periodIn = row ? safeNumber(row.income) : 0;
      const periodOut = row ? safeNumber(row.outgoing) : 0;
      const totalStock = roundMetric(openingKg + periodIn - periodOut);
      merged.set(key, {
        itemName: displayName,
        monthLabel,
        income: roundMetric(periodIn),
        outgoing: roundMetric(periodOut),
        totalStock,
      });
    });
    finalRowMap = merged;
  }

  const rows = Array.from(finalRowMap.values())
    .filter((row) => safeNumber(row.income) !== 0 || safeNumber(row.outgoing) !== 0 || safeNumber(row.totalStock) !== 0)
    .sort((left, right) => left.itemName.localeCompare(right.itemName));

  return hydrateReport({
    type: 'monthly-stock-report',
    month: normalizedMonth,
    fromMonth: normalizedFromMonth,
    toMonth: normalizedToMonth,
    monthLabel,
    selectedDate: normalizedSelectedDate,
    scope: normalizedScope,
    center: normalizedCenter,
    centerLabel: normalizedScope === 'center' && normalizedCenter ? normalizedCenter : 'All Centers / Full Report',
    rangeLabel:
      normalizedReportPeriod === 'monthly' && useMonthRange
        ? `From ${formatDisplayDate(rangeStartDate)} to ${formatDisplayDate(rangeEndDate)}`
        : getRangeLabel(normalizedSelectedDate, normalizedMonth, normalizedReportPeriod),
    reportPeriod: normalizedReportPeriod,
    title: deriveStockReportTitle({ reportPeriod: normalizedReportPeriod }),
    createdBy,
    generatedAt: new Date(),
    generatedAtIso: new Date().toISOString(),
    summary: summarizeRows(rows),
    rows,
    stockViewMode: isMonthMovementsOnly ? 'month_movements_only' : 'full_balance',
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
  const periodPart = report.reportPeriod === 'yearly' ? 'yearly' : 'monthly';
  return `stock-${periodPart}-${sanitizeFilePart(report.month)}-${sanitizeFilePart(report.selectedDate)}${centerPart}.pdf`;
};

export const getReportTheme = (reportPeriod = 'monthly') => ({
  key: reportPeriod === 'yearly' ? 'yearly' : 'monthly',
  title: reportPeriod === 'yearly' ? 'Yearly Report' : 'Monthly Report',
  primary: [5, 150, 105],
  accent: [16, 185, 129],
  surface: [236, 253, 245],
  line: [167, 243, 208],
  text: [6, 95, 70],
  dark: [20, 83, 45],
});

export const getReportMasterItems = () => (
  getFallbackCatalogItems().map((item) => item.name)
);
