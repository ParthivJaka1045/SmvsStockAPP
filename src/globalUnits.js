import {
  addDoc,
  collection,
  doc,
  getDocs,
  orderBy,
  query,
  updateDoc,
} from 'firebase/firestore';
import { db } from './firebase';
import { buildItemNameKey, normalizeItemName } from './itemCatalog';

export const GLOBAL_UNIT_COLLECTION = 'global-units';

const normalizeGlobalUnitRow = (row, id = null) => {
  const name = (row.name || '').toString().trim();
  const defaultKg = parseFloat(row.defaultUnitToKg);
  return {
    id,
    name,
    nameKey: buildItemNameKey(name),
    defaultUnitToKg: Number.isFinite(defaultKg) && defaultKg > 0 ? defaultKg : null,
    is_deleted: row.is_deleted === true,
  };
};

export const fetchGlobalUnits = async () => {
  const snapshot = await getDocs(
    query(collection(db, GLOBAL_UNIT_COLLECTION), orderBy('name', 'asc')),
  );
  return snapshot.docs
    .map((docSnap) => normalizeGlobalUnitRow({ id: docSnap.id, ...docSnap.data() }, docSnap.id))
    .filter((row) => row.name && !row.is_deleted);
};

export const saveGlobalUnit = async ({ id, name, defaultUnitToKg }) => {
  const payload = normalizeGlobalUnitRow({ name, defaultUnitToKg });
  if (!payload.name) throw new Error('Unit name is required.');
  if (id) {
    await updateDoc(doc(db, GLOBAL_UNIT_COLLECTION, id), {
      name: payload.name,
      nameKey: payload.nameKey,
      defaultUnitToKg: payload.defaultUnitToKg,
      updatedAt: new Date(),
    });
    return id;
  }
  const docRef = await addDoc(collection(db, GLOBAL_UNIT_COLLECTION), {
    ...payload,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  return docRef.id;
};

export const softDeleteGlobalUnit = async (id) => {
  if (!id) return;
  await updateDoc(doc(db, GLOBAL_UNIT_COLLECTION, id), {
    is_deleted: true,
    updatedAt: new Date(),
  });
};

export const findGlobalUnitById = (units, id) =>
  units.find((u) => u.id === id) || null;

export const findGlobalUnitByName = (units, name) => {
  const key = buildItemNameKey(name);
  return units.find((u) => u.nameKey === key)
    || units.find((u) => normalizeItemName(u.name) === normalizeItemName(name));
};

export const STANDARD_UNIT_OPTIONS = ['કિલો', 'ગ્રામ', 'લીટર', 'ડબ્બો'];

export const buildUnitDropdownOptions = (globalUnits = []) => {
  const globalNames = globalUnits.map((u) => u.name).filter(Boolean);
  const merged = [...STANDARD_UNIT_OPTIONS];
  globalNames.forEach((name) => {
    if (!merged.some((entry) => normalizeItemName(entry) === normalizeItemName(name))) {
      merged.push(name);
    }
  });
  return merged;
};

export const encodeItemUnitSelectValue = ({ unitMode, unit, globalUnitId }) => {
  if (unitMode === 'global' && globalUnitId) return `global:${globalUnitId}`;
  if (unitMode === 'custom') return 'custom:';
  return `std:${unit || 'કિલો'}`;
};

export const decodeItemUnitSelectValue = (value) => {
  const raw = (value || '').toString();
  if (raw.startsWith('global:')) return { unitMode: 'global', globalUnitId: raw.slice(7), unit: '' };
  if (raw === 'custom:') return { unitMode: 'custom', globalUnitId: '', unit: '' };
  if (raw.startsWith('std:')) return { unitMode: 'standard', globalUnitId: '', unit: raw.slice(4) };
  return { unitMode: 'standard', globalUnitId: '', unit: raw };
};
