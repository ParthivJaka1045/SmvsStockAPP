const admin = require('firebase-admin');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { onCall, HttpsError } = require('firebase-functions/v2/https');

admin.initializeApp();
const db = admin.firestore();

const MONTHLY_STOCK_SNAPSHOTS_COLLECTION = 'monthly_stock_snapshots';
const STOCK_TRANSACTIONS_COLLECTION = 'stock-transactions';
const STOCK_UNLOCK_AUDIT_LOGS_COLLECTION = 'stock_unlock_audit_logs';
const STOCK_MONTH_LOCKS_COLLECTION = 'stock_month_locks';

const normalizeDateOnly = (value) => {
  if (!value) return '';
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = value?.toDate ? value.toDate() : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
};

const normalizeMonth = (value) => {
  if (!value) return '';
  if (typeof value === 'string' && /^\d{4}-\d{2}$/.test(value)) return value;
  return normalizeDateOnly(value).slice(0, 7);
};

const monthBounds = (monthValue) => {
  const [year, month] = monthValue.split('-').map(Number);
  const end = new Date(year, month, 0);
  const endIso = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}`;
  return { start: `${monthValue}-01`, end: endIso };
};

const toNumber = (value) => {
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const signedQuantity = (entry) => {
  const quantity = toNumber(entry.quantity);
  return String(entry.transaction_type || '').toUpperCase() === 'OUT' ? -quantity : quantity;
};

const buildSnapshotsForMonth = async (monthValue) => {
  const { start, end } = monthBounds(monthValue);
  const txSnap = await db.collection(STOCK_TRANSACTIONS_COLLECTION).get();
  const rows = txSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }))
    .filter((entry) => !entry.is_deleted);

  const openingByItem = new Map();
  const monthInward = new Map();
  const monthOutward = new Map();

  rows.forEach((entry) => {
    const txDate = normalizeDateOnly(entry.transaction_date || entry.date || entry.created_at);
    const itemKey = String(entry.item_id || entry.itemName || '').trim().toLowerCase();
    const itemName = String(entry.itemName || entry.item_id || '').trim();
    if (!txDate || !itemKey || !itemName) return;
    if (txDate < start) {
      openingByItem.set(itemKey, {
        item_id: itemKey,
        item_name: itemName,
        opening_balance: toNumber(openingByItem.get(itemKey)?.opening_balance) + signedQuantity(entry),
      });
      return;
    }
    if (txDate > end) return;
    const mapRef = String(entry.transaction_type || '').toUpperCase() === 'OUT' ? monthOutward : monthInward;
    mapRef.set(itemKey, {
      item_id: itemKey,
      item_name: itemName,
      quantity: toNumber(mapRef.get(itemKey)?.quantity) + toNumber(entry.quantity),
    });
  });

  const allItemKeys = new Set([...openingByItem.keys(), ...monthInward.keys(), ...monthOutward.keys()]);
  return Array.from(allItemKeys).map((itemKey) => {
    const opening = toNumber(openingByItem.get(itemKey)?.opening_balance);
    const inward = toNumber(monthInward.get(itemKey)?.quantity);
    const outward = toNumber(monthOutward.get(itemKey)?.quantity);
    const itemName = openingByItem.get(itemKey)?.item_name || monthInward.get(itemKey)?.item_name || monthOutward.get(itemKey)?.item_name || itemKey;
    return {
      month: monthValue,
      year: monthValue.slice(0, 4),
      item_id: itemKey,
      item_name: itemName,
      opening_balance: opening,
      total_inward: inward,
      total_outward: outward,
      closing_balance: opening + inward - outward,
      is_locked: true,
      lock_source: 'cloud_scheduler',
      locked_at: admin.firestore.FieldValue.serverTimestamp(),
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
    };
  });
};

exports.monthEndSnapshot = onSchedule(
  {
    schedule: '59 23 L * *',
    timeZone: 'Asia/Kolkata',
  },
  async () => {
    const now = new Date();
    const monthValue = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const snapshots = await buildSnapshotsForMonth(monthValue);
    const batch = db.batch();
    snapshots.forEach((entry) => {
      const id = `${encodeURIComponent(entry.month)}__all__${encodeURIComponent(entry.item_id)}`;
      batch.set(db.collection(MONTHLY_STOCK_SNAPSHOTS_COLLECTION).doc(id), entry, { merge: true });
    });
    await batch.commit();
  },
);

exports.recalculateSnapshotsFromMonth = onCall(async (request) => {
  const monthValue = normalizeMonth(request.data?.month);
  const reason = String(request.data?.reason || '').trim();
  const unlockedBy = String(request.auth?.token?.email || request.auth?.uid || 'admin').trim();
  if (!monthValue) throw new HttpsError('invalid-argument', 'month is required in YYYY-MM format');
  if (!reason) throw new HttpsError('invalid-argument', 'reason is required');

  await db.collection(STOCK_MONTH_LOCKS_COLLECTION).doc(monthValue).set({
    month: monthValue,
    is_locked: false,
    reason,
    unlocked_by: unlockedBy,
    unlocked_at: admin.firestore.FieldValue.serverTimestamp(),
    updated_at: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });

  const auditRef = await db.collection(STOCK_UNLOCK_AUDIT_LOGS_COLLECTION).add({
    month: monthValue,
    reason,
    unlocked_by: unlockedBy,
    unlocked_at: admin.firestore.FieldValue.serverTimestamp(),
    recalc_status: 'running',
  });

  const now = new Date();
  const startYear = Number(monthValue.slice(0, 4));
  const startMonth = Number(monthValue.slice(5, 7));
  const monthsToProcess = [];
  for (let year = startYear; year <= now.getFullYear(); year += 1) {
    const monthStart = year === startYear ? startMonth : 1;
    const monthEnd = year === now.getFullYear() ? now.getMonth() + 1 : 12;
    for (let month = monthStart; month <= monthEnd; month += 1) {
      monthsToProcess.push(`${year}-${String(month).padStart(2, '0')}`);
    }
  }

  for (const currentMonth of monthsToProcess) {
    const snapshots = await buildSnapshotsForMonth(currentMonth);
    const batch = db.batch();
    snapshots.forEach((entry) => {
      const id = `${encodeURIComponent(entry.month)}__all__${encodeURIComponent(entry.item_id)}`;
      batch.set(db.collection(MONTHLY_STOCK_SNAPSHOTS_COLLECTION).doc(id), {
        ...entry,
        recalc_version: admin.firestore.FieldValue.increment(1),
        lock_source: 'ripple_recalculation',
      }, { merge: true });
    });
    await batch.commit();
  }

  await auditRef.set({
    recalc_status: 'success',
    relocked_at: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });

  await db.collection(STOCK_MONTH_LOCKS_COLLECTION).doc(monthValue).set({
    is_locked: true,
    locked_at: admin.firestore.FieldValue.serverTimestamp(),
    updated_at: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });

  return { ok: true, month: monthValue, processedMonths: monthsToProcess.length };
});
