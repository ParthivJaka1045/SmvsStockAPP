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
import { centerData as seedCenterData } from './data';

export const CENTER_COLLECTION = 'centers';

export const buildCenterNameKey = (name) =>
  (name || '')
    .toString()
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');

const normalizeCenterRow = (row, id = null) => ({
  id,
  center: (row.center || '').toString().trim(),
  nameKey: buildCenterNameKey(row.center),
  is_deleted: row.is_deleted === true,
});

export const mergeCenterLists = (seedRows = [], dbRows = []) => {
  const map = new Map();
  seedRows.forEach((row) => {
    const normalized = normalizeCenterRow(row);
    if (!normalized.center || normalized.is_deleted) return;
    map.set(normalized.nameKey, { ...normalized, id: null, fromSeed: true });
  });
  dbRows.forEach((row) => {
    const normalized = normalizeCenterRow(row, row.id);
    if (!normalized.center || normalized.is_deleted) return;
    map.set(normalized.nameKey, { ...normalized, fromSeed: false });
  });
  return Array.from(map.values()).sort((a, b) => a.center.localeCompare(b.center, 'gu'));
};

export const fetchCenters = async () => {
  const snapshot = await getDocs(query(collection(db, CENTER_COLLECTION), orderBy('center', 'asc')));
  const dbRows = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
  return mergeCenterLists(seedCenterData, dbRows);
};

export const saveCenter = async ({ id, center }) => {
  const payload = normalizeCenterRow({ center });
  if (!payload.center) throw new Error('Center name is required.');
  if (id) {
    await updateDoc(doc(db, CENTER_COLLECTION, id), {
      center: payload.center,
      nameKey: payload.nameKey,
      updatedAt: new Date(),
    });
    return id;
  }
  const docRef = await addDoc(collection(db, CENTER_COLLECTION), {
    ...payload,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  return docRef.id;
};

export const softDeleteCenter = async (id) => {
  if (!id) return;
  await updateDoc(doc(db, CENTER_COLLECTION, id), {
    is_deleted: true,
    updatedAt: new Date(),
  });
};

export const findCenterByName = (centers, name) => {
  const key = buildCenterNameKey(name);
  return centers.find((c) => c.nameKey === key)
    || centers.find((c) => c.center.toLowerCase() === (name || '').toString().trim().toLowerCase());
};
