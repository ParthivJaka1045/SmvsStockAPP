import { collection, getDocs } from 'firebase/firestore';

export const STOCK_MONTH_LOCKS_COLLECTION = 'stock_month_locks';

/** @returns {Promise<Set<string>>} YYYY-MM values that are locked */
export async function fetchLockedMonthValues(db, collectionName = STOCK_MONTH_LOCKS_COLLECTION) {
  const snap = await getDocs(collection(db, collectionName));
  const locked = new Set();
  snap.forEach((d) => {
    const data = d.data() || {};
    if (data.is_locked !== true) return;
    const idMonth = (d.id || '').toString().trim();
    if (/^\d{4}-\d{2}$/.test(idMonth)) locked.add(idMonth);
    const m = (data.month || '').toString().trim();
    if (/^\d{4}-\d{2}$/.test(m)) locked.add(m);
  });
  return locked;
}

export const isoDateToMonthValue = (isoDate) => {
  if (!isoDate || typeof isoDate !== 'string') return '';
  const d = isoDate.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d.slice(0, 7);
  if (/^\d{4}-\d{2}$/.test(d)) return d;
  return '';
};

export const isMonthLocked = (monthValue, lockedMonths) =>
  !!(monthValue && lockedMonths instanceof Set && lockedMonths.has(monthValue));
