import { normalizeItemName } from './itemCatalog';

export const UNIT_KG = 'કિલો';
export const UNIT_GRM = 'ગ્રામ';
export const UNIT_LITER = 'લીટર';
/** ઘી-તેલ / તેલ — ૧ ડબ્બો = 13 kg */
export const UNIT_DABBO = 'ડબ્બો';
/** @deprecated — જૂના ડેટા; ઉપયોગ UNIT_DABBO */
export const UNIT_TIN = UNIT_DABBO;
export const UNIT_LEGACY_TIN = 'ટીન';
export const UNIT_LEGACY_DABBA_PL = 'ડબ્બા';

export const GHEE_TEL_BULK_KG = 13;
export const GRAMS_PER_KG = 1000;

export const CONVERSION_BASE_UNITS = [UNIT_KG, UNIT_GRM];

export const GHEE_TEL_CATEGORY = normalizeItemName('ઘી-તેલ');
export const COLOR_CATEGORY = normalizeItemName('કલર');

const normalizeCategoryKey = (value) => normalizeItemName(value);

export const isGheeTelCategory = (category) => normalizeCategoryKey(category) === GHEE_TEL_CATEGORY;
export const isColorCategory = (category) => normalizeCategoryKey(category) === COLOR_CATEGORY;

export const isGheeTelBulkUnit = (value) => {
  const n = normalizeItemName(value);
  return (
    n === normalizeItemName(UNIT_DABBO)
    || n === normalizeItemName(UNIT_LEGACY_TIN)
    || n === normalizeItemName(UNIT_LEGACY_DABBA_PL)
  );
};

export const isGramUnit = (value) => normalizeItemName(value) === normalizeItemName(UNIT_GRM);

export const isStandardUnit = (unit) => {
  const n = normalizeItemName(unit);
  return (
    n === normalizeItemName(UNIT_KG)
    || n === normalizeItemName(UNIT_GRM)
    || n === normalizeItemName(UNIT_LITER)
    || n === normalizeItemName(UNIT_DABBO)
    || isGheeTelBulkUnit(unit)
  );
};

/** કેટલોગ/કેટેગરી પરથી ડિફોલ્ટ એકમ. */
export const getDefaultUnitForCategory = (category) => {
  if (isGheeTelCategory(category)) return UNIT_DABBO;
  if (isColorCategory(category)) return UNIT_GRM;
  return UNIT_KG;
};

/** આઇટમ રેકોર્ડ પરથી એકમ (Firebase + static). */
export const resolveCatalogItemUnit = (catalogItem) => {
  const unit = (catalogItem?.unit || '').toString().trim();
  if (unit) {
    if (isGheeTelCategory(catalogItem?.category) && isGheeTelBulkUnit(unit)) return UNIT_DABBO;
    return unit;
  }
  return getDefaultUnitForCategory(catalogItem?.category);
};

export const normalizeQuantityUnit = (value) => {
  if (isGramUnit(value)) return UNIT_GRM;
  if (isGheeTelBulkUnit(value)) return UNIT_DABBO;
  return UNIT_KG;
};

/** Request લાઇન માટે એકમ — કેટલોગ પ્રાથમિક, પછી કેટેગરી નિયમ. */
export const normalizeUnitForLine = (category, unit, catalogItem = null) => {
  const fromCatalog = catalogItem ? resolveCatalogItemUnit(catalogItem) : null;
  const candidate = (unit || fromCatalog || getDefaultUnitForCategory(category) || UNIT_KG).toString().trim();
  if (isGheeTelCategory(category) && isGheeTelBulkUnit(candidate)) return UNIT_DABBO;
  if (isColorCategory(category) && isGramUnit(candidate)) return UNIT_GRM;
  if (isGheeTelCategory(category)) return UNIT_DABBO;
  if (isColorCategory(category)) return UNIT_GRM;
  if (fromCatalog && !isStandardUnit(fromCatalog)) return fromCatalog;
  if (candidate === UNIT_KG || candidate === UNIT_GRM || candidate === UNIT_LITER || candidate === UNIT_DABBO) {
    return candidate;
  }
  return fromCatalog || candidate || UNIT_KG;
};

const parsePositiveFactor = (value) => {
  const n = parseFloat(value);
  return Number.isFinite(n) && n > 0 ? n : null;
};

/** ૧ એકમ = કેટલા kg (આઇટમ-વિશિષ્ટ, ગ્લોબલ, કસ્ટમ અથવા સ્ટાન્ડર્ડ). */
export const getUnitToKgFactor = (unit, catalogItem = null, globalUnit = null) => {
  const itemFactor = parsePositiveFactor(catalogItem?.unitToKgFactor);
  if (itemFactor != null && (catalogItem?.globalUnitId || catalogItem?.isCustomUnit)) {
    return itemFactor;
  }
  const globalDefault = parsePositiveFactor(globalUnit?.defaultUnitToKg);
  if (globalDefault != null && catalogItem?.globalUnitId) return globalDefault;
  if (itemFactor != null && !isStandardUnit(unit)) return itemFactor;

  if (isGheeTelBulkUnit(unit)) return GHEE_TEL_BULK_KG;
  if (isGramUnit(unit)) return 1 / GRAMS_PER_KG;
  return 1;
};

export const convertKgToUnitQty = (kg, unit, catalogItem = null, globalUnit = null) => {
  const factor = getUnitToKgFactor(unit, catalogItem, globalUnit);
  if (!factor) return kg;
  return Math.round((safeNumber(kg) / factor + Number.EPSILON) * 100) / 100;
};

const safeNumber = (value) => {
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : 0;
};

export const convertQtyToKg = (qty, unit, catalogItem = null, globalUnit = null) => {
  const numericQty = parseFloat(qty) || 0;
  const resolvedUnit = unit || resolveCatalogItemUnit(catalogItem);
  return numericQty * getUnitToKgFactor(resolvedUnit, { ...catalogItem, unit: resolvedUnit }, globalUnit);
};

export const convertQtyToKgFromLine = (line, catalogItem = null) =>
  convertQtyToKg(line?.qty, line?.unit, catalogItem);

export const formatUnitConversionHint = (unit, catalogItem = null) => {
  const resolved = unit || resolveCatalogItemUnit(catalogItem);
  const factor = getUnitToKgFactor(resolved, catalogItem);
  if (isGramUnit(resolved)) return `૧૦૦૦ ${UNIT_GRM} = ૧ ${UNIT_KG}`;
  if (isGheeTelBulkUnit(resolved)) return `૧ ${resolved} = ${GHEE_TEL_BULK_KG} ${UNIT_KG}`;
  if (!isStandardUnit(resolved) && factor !== 1) {
    return `૧ ${resolved} = ${factor} ${UNIT_KG}`;
  }
  return '';
};

export const getUnitShortLabel = (unit, catalogItem = null) => {
  const resolved = (unit || resolveCatalogItemUnit(catalogItem) || UNIT_KG).toString().trim();
  if (isGramUnit(resolved)) return UNIT_GRM;
  if (isGheeTelBulkUnit(resolved)) return resolved;
  if (resolved === UNIT_KG) return UNIT_KG;
  return resolved;
};

export const clampQtyByCategory = (category, qty) => {
  const numericQty = parseFloat(qty);
  if (!Number.isFinite(numericQty)) return qty;
  if (isGheeTelCategory(category)) return Math.max(0, Math.trunc(numericQty));
  return numericQty;
};

/** Admin ફોર્મ: કન્વર્ઝન બેઝ + મૂલ્ય → Firestore `unitToKgFactor` (kg). */
export const conversionInputToKgFactor = (amount, baseUnit = UNIT_KG) => {
  const n = parsePositiveFactor(amount);
  if (n == null) return null;
  if (normalizeItemName(baseUnit) === normalizeItemName(UNIT_GRM)) return n / GRAMS_PER_KG;
  return n;
};

export const buildCatalogUnitFields = ({
  unit,
  unitToKgFactor = null,
  isCustomUnit = false,
  globalUnitId = null,
}) => {
  const trimmedUnit = (unit || UNIT_KG).toString().trim() || UNIT_KG;
  const factor = parsePositiveFactor(unitToKgFactor);
  const payload = {
    unit: trimmedUnit,
    globalUnitId: (globalUnitId || '').toString().trim() || null,
    isCustomUnit: Boolean(isCustomUnit || globalUnitId),
  };
  if (globalUnitId && factor != null) {
    payload.unitToKgFactor = factor;
    payload.isCustomUnit = true;
  } else if (isCustomUnit && factor != null) {
    payload.unitToKgFactor = factor;
  } else if (isGheeTelBulkUnit(trimmedUnit)) {
    payload.unitToKgFactor = GHEE_TEL_BULK_KG;
    payload.isCustomUnit = false;
    payload.globalUnitId = null;
  } else {
    payload.unitToKgFactor = null;
    payload.isCustomUnit = false;
    payload.globalUnitId = null;
  }
  return payload;
};
