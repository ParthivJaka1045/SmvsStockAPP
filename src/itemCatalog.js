import { categories } from './data';

export const ITEM_COLLECTION = 'items';
export const ITEM_CATEGORY_COLLECTION = 'item-categories';

export const DEFAULT_ITEM_UNITS = ['કિલો', 'ગ્રામ', 'લીટર', 'ડબ્બો'];

export const normalizeItemName = (value) => (
  (value || '')
    .toString()
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
);

export const buildItemNameKey = (value) => normalizeItemName(value);

/** itemUnits સાથે circular import ન થાય — એક જ લોજિક અહીં. */
const resolveCatalogItemUnitLocal = (item) => {
  const unit = (item?.unit || '').toString().trim();
  const category = (item?.category || 'અન્ય').toString().trim();
  const catKey = normalizeItemName(category);
  if (unit) {
    const unitKey = normalizeItemName(unit);
    if (
      catKey === normalizeItemName('ઘી-તેલ')
      && (
        unitKey === normalizeItemName('ડબ્બા')
        || unitKey === normalizeItemName('ડબ્બો')
        || unitKey === normalizeItemName('ટીન')
      )
    ) return 'ડબ્બો';
    return unit;
  }
  if (catKey === normalizeItemName('ઘી-તેલ')) return 'ડબ્બો';
  if (catKey === normalizeItemName('કલર')) return 'ગ્રામ';
  return 'કિલો';
};

const gujaratiToLatinMap = {
  'અ': 'a', 'આ': 'aa', 'ઇ': 'i', 'ઈ': 'ii', 'ઉ': 'u', 'ઊ': 'uu', 'ઋ': 'r', 'એ': 'e', 'ઐ': 'ai', 'ઓ': 'o', 'ઔ': 'au',
  'ક': 'k', 'ખ': 'kh', 'ગ': 'g', 'ઘ': 'gh', 'ઙ': 'ng',
  'ચ': 'ch', 'છ': 'chh', 'જ': 'j', 'ઝ': 'zh', 'ઞ': 'ny',
  'ટ': 't', 'ઠ': 'th', 'ડ': 'd', 'ઢ': 'dh', 'ણ': 'n',
  'ત': 't', 'થ': 'th', 'દ': 'd', 'ધ': 'dh', 'ન': 'n',
  'પ': 'p', 'ફ': 'ph', 'બ': 'b', 'ભ': 'bh', 'મ': 'm',
  'ય': 'y', 'ર': 'r', 'લ': 'l', 'વ': 'v', 'શ': 'sh', 'ષ': 'sh', 'સ': 's', 'હ': 'h', 'ળ': 'l',
  'ં': 'n', 'ઁ': 'n', 'ઃ': 'h', '઼': '',
  'ા': 'a', 'િ': 'i', 'ી': 'i', 'ુ': 'u', 'ૂ': 'u', 'ે': 'e', 'ૈ': 'ai', 'ો': 'o', 'ૌ': 'au', '્': '',
  '૦': '0', '૧': '1', '૨': '2', '૩': '3', '૪': '4', '૫': '5', '૬': '6', '૭': '7', '૮': '8', '૯': '9',
};

const transliterateGujarati = (value) => (
  (value || '')
    .toString()
    .split('')
    .map((char) => gujaratiToLatinMap[char] ?? char)
    .join('')
);

const compactSearchText = (value) => normalizeItemName(value).replace(/[^a-z0-9]/g, '');

const compactConsonants = (value) => compactSearchText(value).replace(/[aeiou]/g, '');

export const matchesSearchText = (text, query) => {
  const normalizedQuery = normalizeItemName(query);
  if (!normalizedQuery) return true;

  const q = compactSearchText(normalizedQuery);
  const qConsonants = compactConsonants(normalizedQuery);
  const source = compactSearchText(text);
  const sourceConsonants = compactConsonants(text);
  const transliterated = compactSearchText(transliterateGujarati(text));
  const transliteratedConsonants = compactConsonants(transliterateGujarati(text));

  return (
    source.includes(q)
    || (qConsonants && sourceConsonants.includes(qConsonants))
    || transliterated.includes(q)
    || (qConsonants && transliteratedConsonants.includes(qConsonants))
  );
};

export const createCatalogItem = (item, index = 0) => {
  const unit = resolveCatalogItemUnitLocal(item);
  const unitToKgFactor = item.unitToKgFactor != null && item.unitToKgFactor !== ''
    ? parseFloat(item.unitToKgFactor)
    : null;
  return {
    id: item.id || `static-${index}-${buildItemNameKey(item.name) || 'item'}`,
    name: (item.name || '').toString().trim(),
    nameKey: buildItemNameKey(item.name),
    category: (item.category || 'અન્ય').toString().trim(),
    unit,
    globalUnitId: (item.globalUnitId || '').toString().trim() || null,
    unitToKgFactor: Number.isFinite(unitToKgFactor) && unitToKgFactor > 0 ? unitToKgFactor : null,
    isCustomUnit: item.isCustomUnit === true || Boolean((item.globalUnitId || '').toString().trim()),
    is_active: item.is_active !== false,
    source: item.source || 'firebase',
  };
};

export const getStaticCatalogItems = () => (
  Object.entries(categories).flatMap(([category, items]) => (
    items.map((item, index) => createCatalogItem({ ...item, category, source: 'static' }, index))
  ))
);

export const dedupeCatalogItems = (items = []) => {
  const seen = new Set();
  return items.filter((item) => {
    const key = item.nameKey || buildItemNameKey(item.name);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

export const sortCatalogItems = (items = []) => (
  [...items].sort((left, right) => {
    const categoryCompare = (left.category || '').localeCompare(right.category || '', 'gu');
    if (categoryCompare !== 0) return categoryCompare;
    return (left.name || '').localeCompare(right.name || '', 'gu');
  })
);

export const getFallbackCatalogItems = () => sortCatalogItems(dedupeCatalogItems(getStaticCatalogItems()));

export const groupCatalogItemsByCategory = (items = []) => (
  (() => {
    const grouped = items.reduce((acc, item) => {
      const category = item.category || 'અન્ય';
      if (!acc[category]) acc[category] = [];
      acc[category].push(item);
      return acc;
    }, {});

    const OTHER_CATEGORY = 'અન્ય';
    const categories = Object.keys(grouped).sort((left, right) => {
      const lIsOther = left === OTHER_CATEGORY;
      const rIsOther = right === OTHER_CATEGORY;
      if (lIsOther && !rIsOther) return 1;
      if (!lIsOther && rIsOther) return -1;
      return left.localeCompare(right, 'gu');
    });

    return categories.reduce((acc, category) => {
      acc[category] = grouped[category];
      return acc;
    }, {});
  })()
);

export const filterCatalogItems = (items = [], query = '') => {
  const normalizedQuery = normalizeItemName(query);
  if (!normalizedQuery) return items;
  return items.filter((item) => {
    return matchesSearchText(item.name, normalizedQuery) || matchesSearchText(item.category, normalizedQuery);
  });
};

export const filterGroupedCatalogItems = (items = [], query = '') => (
  groupCatalogItemsByCategory(filterCatalogItems(items, query))
);

export const getCatalogCategoryOptions = (items = []) => (
  Array.from(new Set(items.map((item) => item.category).filter(Boolean))).sort((left, right) => left.localeCompare(right, 'gu'))
);

export const ensureCatalogItems = (items = []) => {
  const prepared = items.map((item, index) => createCatalogItem(item, index)).filter((item) => item.name);
  return sortCatalogItems(dedupeCatalogItems(prepared));
};

export const findCatalogItemByName = (catalogItems, name) => {
  const key = buildItemNameKey(name);
  return catalogItems.find((item) => item.nameKey === key)
    || catalogItems.find((item) => item.name.toLowerCase() === (name || '').toString().trim().toLowerCase());
};
