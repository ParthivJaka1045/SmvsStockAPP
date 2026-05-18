import React, { useCallback, useMemo, useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { db } from './firebase'; 
import {
  collection,
  addDoc,
  getDocs,
  getDoc,
  query,
  orderBy,
  doc,
  where,
  updateDoc,
  deleteDoc,
  limit,
  setDoc,
  serverTimestamp,
} from 'firebase/firestore'; 
import { centerData } from './data';
import {
  fetchCenters,
  findCenterByName,
  mergeCenterLists,
  saveCenter,
  softDeleteCenter,
} from './centers';
import {
  buildUnitDropdownOptions,
  decodeItemUnitSelectValue,
  encodeItemUnitSelectValue,
  fetchGlobalUnits,
  STANDARD_UNIT_OPTIONS,
} from './globalUnits';
import GlobalUnitsPanel from './components/GlobalUnitsPanel';
import PhysicalStockCheckerPanel from './components/PhysicalStockCheckerPanel';
import NonListedCentersPanel from './components/NonListedCentersPanel';
import { entryNeedsCenterResolution } from './components/NonListedCentersPanel';
import {
  buildItemNameKey,
  DEFAULT_ITEM_UNITS,
  ensureCatalogItems,
  filterGroupedCatalogItems,
  getCatalogCategoryOptions,
  getFallbackCatalogItems,
  ITEM_COLLECTION,
  ITEM_CATEGORY_COLLECTION,
  matchesSearchText,
  normalizeItemName,
} from './itemCatalog';
import {
  UNIT_KG,
  UNIT_GRM,
  UNIT_DABBO,
  resolveCatalogItemUnit,
  GHEE_TEL_BULK_KG,
  CONVERSION_BASE_UNITS,
  buildCatalogUnitFields,
  clampQtyByCategory,
  conversionInputToKgFactor,
  convertQtyToKg,
  formatUnitConversionHint,
  getDefaultUnitForCategory,
  getUnitShortLabel,
  getUnitToKgFactor,
  isColorCategory,
  isGheeTelBulkUnit,
  isGheeTelCategory,
  isGramUnit,
  isStandardUnit,
  normalizeQuantityUnit,
  normalizeUnitForLine,
} from './itemUnits';
import emailjs from 'emailjs-com'; 
import {
  buildMonthlyClosingSnapshots,
  buildSummaryReport,
  formatDisplayDate,
  formatMetric,
  formatMonthLabel,
  getMonthBounds,
  isLockedPastMonth,
  resolveReportStockViewMode,
  isCurrentCalendarMonth,
  getRangeLabel,
  getReportFileName,
  hydrateReport,
} from './reporting';
import {
  generateDispatchPDFBlob as generateSendPDFBlobReliable,
  generatePurchasePDFBlob,
  generateRequestPDFBlob as generatePDFBlobReliable,
  generateSummaryReportPDFBlob,
} from './pdfClient';
import { saveBlobFromProducer } from './utils/saveBlob';
import smvsLogo from './assets/1.png';
import { 
  Trash2, Download, LogOut, Loader2, CheckCircle, RefreshCw, 
  ChevronDown, ChevronUp, ArrowLeft, Send, LayoutDashboard, 
  Edit3, Eye, Share2, X, Search, Calendar, MapPin, User, Eraser,
  Package, ShoppingCart, FileText, Sparkles, Box, Plus, Minus,
  Mail, AlertTriangle,
} from 'lucide-react';

void motion;

const REPORT_DEFAULT_EMAILS = [
  'jakasaniyaparthiv@gmail.com',
  'psk.assist@in.smvs.org',
];

const REPORT_MAIL_CONFIG = {
  serviceId: 'service_es31jwq',
  templateId: 'template_t4geyq3',
  publicKey: '_E6nBjN6vCMGEW6I8',
};

const REQUEST_MAIL_CONFIG = {
  serviceId: 'service_1ug481j',
  templateId: 'template_djuyjcq',
  publicKey: '',
};

const SEND_MAIL_CONFIG = {
  serviceId: 'service_es31jwq',
  templateId: 'template_0xnrlbm',
  publicKey: '_E6nBjN6vCMGEW6I8',
};

const DEFAULT_CC_EMAIL = REPORT_DEFAULT_EMAILS[0];
const DEFAULT_BCC_EMAIL = REPORT_DEFAULT_EMAILS[1];

const isValidEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((value || '').trim());

const isDigitsOnly = (value) => /^\d+$/.test((value || '').trim());

const getMonthInputValue = (value = new Date()) => {
  const date = value instanceof Date ? value : new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
};

/** Lock/unlock month picker: current or past only (future months disabled / clamped). */
const clampLockUnlockMonthValue = (monthValue) => {
  const cap = getMonthInputValue();
  if (!monthValue || !/^\d{4}-\d{2}$/.test(monthValue)) return cap;
  return monthValue > cap ? cap : monthValue;
};

const getLastDateForMonth = (monthValue) => {
  if (!monthValue || !/^\d{4}-\d{2}$/.test(monthValue)) return new Date().toISOString().split('T')[0];
  const [year, month] = monthValue.split('-').map(Number);
  const date = new Date(year, month, 0);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

const getDateWithinMonth = (monthValue, dateValue) => {
  if (dateValue && dateValue.startsWith(monthValue)) return dateValue;
  const today = new Date().toISOString().split('T')[0];
  if (today.startsWith(monthValue)) return today;
  return getLastDateForMonth(monthValue);
};

const getLastDateForCalendarYear = (monthValue) => {
  const year = (monthValue || '').slice(0, 4);
  if (!year || year.length !== 4) return new Date().toISOString().split('T')[0];
  return `${year}-12-31`;
};

const getDateWithinYear = (monthValue, dateValue) => {
  const year = (monthValue || '').slice(0, 4);
  if (!year || year.length !== 4) return dateValue;
  if (dateValue && dateValue.startsWith(year)) return dateValue;
  const today = new Date().toISOString().split('T')[0];
  if (today.startsWith(year)) return today;
  return getLastDateForCalendarYear(monthValue);
};

const getPreviousMonthInputValue = (monthValue) => {
  if (!monthValue || !/^\d{4}-\d{2}$/.test(monthValue)) return '';
  const [year, month] = monthValue.split('-').map(Number);
  const date = new Date(year, month - 2, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
};

const monthFromDateValue = (value) => {
  const iso = normalizeDateOnly(value);
  return iso ? iso.slice(0, 7) : '';
};

const sendEmailWithConfig = (config, params) => (
  config.publicKey
    ? emailjs.send(config.serviceId, config.templateId, params, config.publicKey)
    : emailjs.send(config.serviceId, config.templateId, params)
);

// Animation variants
const fadeInUp = {
  initial: { opacity: 0, y: 30 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -20 }
};

const staggerContainer = {
  animate: { transition: { staggerChildren: 0.05 } }
};

const scaleIn = {
  initial: { scale: 0.9, opacity: 0 },
  animate: { scale: 1, opacity: 1 },
  exit: { scale: 0.9, opacity: 0 }
};

const getInitialRouteState = () => {
  const params = new URLSearchParams(window.location.search);
  const orderId = params.get('orderId');
  const sendOrderId = params.get('sendOrderId');
  const reportId = params.get('reportId');
  const purchaseId = params.get('purchaseId');

  if (reportId) {
    return { view: 'single-report', directOrderId: null, directSendOrderId: null, directReportId: reportId, directPurchaseId: null };
  }
  if (purchaseId) {
    return { view: 'single-purchase', directOrderId: null, directSendOrderId: null, directReportId: null, directPurchaseId: purchaseId };
  }
  if (sendOrderId) {
    return { view: 'single-send-order', directOrderId: null, directSendOrderId: sendOrderId, directReportId: null, directPurchaseId: null };
  }
  if (orderId) {
    return { view: 'single-order', directOrderId: orderId, directSendOrderId: null, directReportId: null, directPurchaseId: null };
  }

  return { view: 'login', directOrderId: null, directSendOrderId: null, directReportId: null, directPurchaseId: null };
};

function App() {
  const [initialRoute] = useState(getInitialRouteState);
  const [user, setUser] = useState(null); 
  const [view, setView] = useState(initialRoute.view); 
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [catalogItems, setCatalogItems] = useState(getFallbackCatalogItems);
  const [centersList, setCentersList] = useState(() => mergeCenterLists(centerData, []));
  const directOrderId = initialRoute.directOrderId;
  const directSendOrderId = initialRoute.directSendOrderId;
  const directReportId = initialRoute.directReportId;
  const directPurchaseId = initialRoute.directPurchaseId;

  useEffect(() => {
    emailjs.init("m14CzkMDHuJeLH0VK"); 
  }, []);

  const refreshCatalog = useCallback(async () => {
    try {
      const snapshot = await getDocs(query(collection(db, ITEM_COLLECTION), orderBy('nameKey', 'asc')));
      const firebaseItems = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data(),
        source: 'firebase',
      }));
      const normalizedItems = ensureCatalogItems(firebaseItems.filter((item) => item.is_active !== false));
      setCatalogItems(normalizedItems.length > 0 ? normalizedItems : getFallbackCatalogItems());
    } catch (error) {
      console.warn('Item catalog fetch failed:', error);
      setCatalogItems(getFallbackCatalogItems());
    }
  }, []);

  useEffect(() => {
    refreshCatalog();
  }, []);

  const refreshCenters = useCallback(async () => {
    try {
      setCentersList(await fetchCenters());
    } catch (error) {
      console.warn('Centers fetch failed:', error);
      setCentersList(mergeCenterLists(centerData, []));
    }
  }, []);

  useEffect(() => {
    refreshCenters();
  }, [refreshCenters]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const q = query(collection(db, "users"), where("username", "==", username));
      const querySnapshot = await getDocs(q);
      if (querySnapshot.empty) { setError("User nathi malyo!"); setLoading(false); return; }
      let foundUser = null;
      querySnapshot.forEach((doc) => { if (doc.data().password === password) foundUser = doc.data(); });
      if (foundUser) { setUser(foundUser); setView(foundUser.role === 'admin' ? 'admin' : 'dashboard'); } 
      else { setError("Wrong Password!"); }
    } catch { setError("Login error."); }
    setLoading(false);
  };

  if (view === 'single-order' && directOrderId) {
    return <SingleOrderView orderId={directOrderId} onBack={() => { setView('login'); window.history.replaceState(null, '', '/'); }} />;
  }

  if (view === 'single-send-order' && directSendOrderId) {
    return <SingleSendOrderView orderId={directSendOrderId} onBack={() => { setView('login'); window.history.replaceState(null, '', '/'); }} />;
  }

  if (view === 'single-report' && directReportId) {
    return <SingleReportView reportId={directReportId} onBack={() => { setView('login'); window.history.replaceState(null, '', '/'); }} />;
  }

  if (view === 'single-purchase' && directPurchaseId) {
    return <SinglePurchaseView purchaseId={directPurchaseId} onBack={() => { setView('login'); window.history.replaceState(null, '', '/'); }} />;
  }

  return (
    <div className="min-h-screen font-sans bg-gradient-to-br from-[#0a0a0a] via-[#121212] to-[#0f0f0f] text-[#e0e0e0]">
      {/* Animated Background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-orange-500/10 rounded-full blur-3xl animate-pulse" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-orange-600/5 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
      </div>

      {/* Navigation */}
      <AnimatePresence>
        {user && (
          <motion.nav 
            initial={{ y: -100 }}
            animate={{ y: 0 }}
            exit={{ y: -100 }}
            className="bg-[#1a1a1a]/80 backdrop-blur-xl border-b border-white/5 p-3 sm:p-4 flex justify-between items-center shadow-2xl sticky top-0 z-50"
          >
            <motion.h1 
              whileHover={{ scale: 1.02 }}
              className="text-lg sm:text-xl font-black text-transparent bg-clip-text bg-gradient-to-r from-orange-400 to-orange-600 flex items-center gap-2"
            >
              <motion.div
                animate={{ rotate: [0, 5, -5, 0] }}
                transition={{ duration: 2, repeat: Infinity, repeatDelay: 3 }}
                className="w-8 h-8 rounded-xl bg-transparent border border-white/10 flex items-center justify-center overflow-hidden"
              >
                <img src={smvsLogo} alt="SMVS" className="w-7 h-7 object-contain drop-shadow-[0_2px_8px_rgba(255,255,255,0.15)]" />
              </motion.div>
              <span className="hidden xs:inline">SMVS</span> Portal
            </motion.h1>
            <div className="flex items-center gap-2 sm:gap-4">
              <motion.span 
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                className="text-xs sm:text-sm bg-gradient-to-r from-[#2d2d2d] to-[#252525] px-3 py-1.5 rounded-full hidden sm:inline-flex items-center gap-2 border border-white/10"
              >
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                {user.username}
              </motion.span>
              <motion.button 
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                onClick={() => { setUser(null); setView('login'); }} 
                className="text-red-400 hover:bg-red-500/10 p-2 sm:p-2.5 rounded-xl transition-all border border-transparent hover:border-red-500/20"
              >
                <LogOut size={18} />
              </motion.button>
            </div>
          </motion.nav>
        )}
      </AnimatePresence>

      {/* Login View */}
      <AnimatePresence mode="wait">
        {view === 'login' && (
          <motion.div 
            key="login"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex items-center justify-center min-h-screen p-4 relative"
          >
            <motion.form 
              onSubmit={handleLogin} 
              variants={scaleIn}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={{ type: "spring", damping: 25 }}
              className="bg-gradient-to-b from-[#1e1e1e] to-[#181818] p-6 sm:p-10 rounded-3xl shadow-2xl w-full max-w-md border border-white/5 relative overflow-hidden"
            >
              {/* Glow effect */}
              <div className="absolute -top-20 -right-20 w-40 h-40 bg-orange-500/20 rounded-full blur-3xl" />
              
              <motion.div 
                className="text-center mb-8 relative"
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.2 }}
              >
                <motion.div 
                  className="w-20 h-20 sm:w-24 sm:h-24 bg-gradient-to-br from-orange-500/20 to-orange-700/10 rounded-2xl flex items-center justify-center mx-auto mb-5 shadow-xl shadow-orange-500/20 border border-white/10 overflow-hidden"
                  whileHover={{ rotate: [0, -5, 5, 0] }}
                  transition={{ duration: 0.5 }}
                >
                  <img src={smvsLogo} alt="SMVS" className="w-16 h-16 sm:w-20 sm:h-20 object-contain drop-shadow-[0_4px_14px_rgba(255,255,255,0.18)]" />
                </motion.div>
                <h2 className="text-2xl sm:text-3xl font-black text-white uppercase tracking-tight">SMVS Stock Portal</h2>
                <p className="text-gray-500 text-sm mt-2">SMVS Inventory Management</p>
              </motion.div>

              <motion.div 
                className="space-y-4"
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.3 }}
              >
                <div className="relative group">
                  <User className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 group-focus-within:text-orange-500 transition-colors" size={18} />
                  <input 
                    className="w-full p-4 pl-12 bg-[#252525] border border-white/10 rounded-2xl focus:border-orange-500/50 focus:ring-2 focus:ring-orange-500/20 outline-none transition-all text-white placeholder-gray-500" 
                    placeholder="Username" 
                    value={username} 
                    onChange={e => setUsername(e.target.value)} 
                    required 
                  />
                </div>
                <div className="relative group">
                  <Box className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 group-focus-within:text-orange-500 transition-colors" size={18} />
                  <input 
                    className="w-full p-4 pl-12 bg-[#252525] border border-white/10 rounded-2xl focus:border-orange-500/50 focus:ring-2 focus:ring-orange-500/20 outline-none transition-all text-white placeholder-gray-500" 
                    type="password" 
                    placeholder="Password" 
                    value={password} 
                    onChange={e => setPassword(e.target.value)} 
                    required 
                  />
                </div>
              </motion.div>

              {error && (
                <motion.p 
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="text-red-400 text-sm text-center mt-4 bg-red-500/10 p-3 rounded-xl border border-red-500/20"
                >
                  {error}
                </motion.p>
              )}

              <motion.button 
                disabled={loading} 
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="w-full mt-8 bg-gradient-to-r from-orange-500 to-orange-600 text-white p-4 rounded-2xl font-bold flex justify-center items-center shadow-xl shadow-orange-500/20 hover:shadow-orange-500/30 transition-all disabled:opacity-50"
              >
                {loading ? <Loader2 className="animate-spin" size={24} /> : (
                  <span className="flex items-center gap-2">
                    <Sparkles size={20} /> Access Portal
                  </span>
                )}
              </motion.button>
            </motion.form>
          </motion.div>
        )}
      </AnimatePresence>

      {view === 'dashboard' && <UserHub user={user} catalogItems={catalogItems} centersList={centersList} />}
      {view === 'admin' && (
        <AdminDashboard
          user={user}
          catalogItems={catalogItems}
          refreshCatalog={refreshCatalog}
          centersList={centersList}
          refreshCenters={refreshCenters}
        />
      )}
    </div>
  );
}

// --- SHARED HELPERS ---
const sanitizeFilePart = (value) =>
  (value || '')
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '') || 'record';

const buildPublicRecordLink = (paramName, recordId) =>
  `${window.location.origin}${window.location.pathname}?${paramName}=${encodeURIComponent(recordId)}`;

const getResolvedCenterValue = (selectedCenter, otherCenter = '') =>
  selectedCenter === 'Other' ? otherCenter.trim() : (selectedCenter || '').trim();

/** Maps stored center string to dropdown + optional "Other" text (admin edit). */
const deriveEditableCenterFields = (storedCenter, centers = centerData) => {
  const raw = (storedCenter || '').trim();
  if (!raw) return { select: '', other: '' };
  const exact = centers.find((c) => c.center === raw);
  if (exact) return { select: exact.center, other: '' };
  const ci = centers.find((c) => c.center.toLowerCase() === raw.toLowerCase());
  if (ci) return { select: ci.center, other: '' };
  return { select: 'Other', other: raw };
};

/** Saved center is not on master list (Other / typo) — show admin warning on cards. */
const isNonListedCenterValue = (storedCenter, centers = centerData) => {
  const raw = (storedCenter || '').trim();
  if (!raw) return false;
  if (centers.some((c) => c.center === raw)) return false;
  return !centers.some((c) => c.center.toLowerCase() === raw.toLowerCase());
};

/** Show badge when center came from Other or is still off-list (persists after admin adds center). */
const shouldShowNonListedCenterBadge = (storedCenter, centersList, fromOtherFlag = false) =>
  entryNeedsCenterResolution(storedCenter, centersList, fromOtherFlag);

function NonListedCenterBadge() {
  return (
    <span
      title="આ સેન્ટર માસ્ટર લિસ્ટમાં નથી — Edit માંથી ડ્રોપડાઉનમાંનું સેન્ટર પસંદ કરો."
      className="mt-1.5 inline-flex max-w-full items-center gap-1 rounded-lg border border-amber-500/45 bg-amber-500/15 px-2 py-1 text-[10px] font-bold text-amber-100"
    >
      <AlertTriangle size={12} className="shrink-0 text-amber-400" aria-hidden />
      <span className="truncate uppercase tracking-wide">લિસ્ટ બહારનું સેન્ટર</span>
    </span>
  );
}

const getCenterScopeLabel = (scope, center) =>
  scope === 'center' && center ? center : 'All Centers / Full Report';

const DRYFRUIT_CATEGORY = normalizeItemName('ડ્રાયફ્રુટ');
const MASALA_CATEGORY = normalizeItemName('મસાલા');
const MONTH_CLOSE_GRACE_DAYS = 5;
const ENABLE_INITIAL_STOCK_BACKFILL = true;
const INITIAL_BACKFILL_MONTHS = 4;

const normalizeCategoryKey = (value) => normalizeItemName(value);
const isDryfruitCategory = (category) => normalizeCategoryKey(category) === DRYFRUIT_CATEGORY;
const isMasalaCategory = (category) => normalizeCategoryKey(category) === MASALA_CATEGORY;

const findCatalogItemByName = (catalogItems, name) => (
  catalogItems.find((entry) => entry.nameKey === buildItemNameKey(name))
  || catalogItems.find((entry) => normalizeItemName(entry.name) === normalizeItemName(name))
);

const convertItemQtyToKg = (qty, unit, catalogItems = [], line = null) => {
  const catalogItem = line?.name ? findCatalogItemByName(catalogItems, line.name) : null;
  return convertQtyToKg(qty, unit, catalogItem || line);
};

const buildRequestCartLine = (itemName, category, unit, qty, catalogItems) => {
  const catalogItem = findCatalogItemByName(catalogItems, itemName);
  const normalizedUnit = normalizeUnitForLine(category, unit, catalogItem);
  const normalizedQty = clampQtyByCategory(category, qty);
  const factor = getUnitToKgFactor(normalizedUnit, catalogItem);
  const line = { name: itemName, category, unit: normalizedUnit, qty: normalizedQty };
  if (factor !== 1) line.unitToKgFactor = factor;
  return line;
};

const roundKg2 = (value) => {
  const numeric = parseFloat(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.round((numeric + Number.EPSILON) * 100) / 100;
};

const canSubmitStockEntryDate = (entryDate) => {
  const normalized = normalizeDateOnly(entryDate);
  if (!normalized) return false;
  const today = new Date();
  const currentMonth = getMonthInputValue(today);
  const entryMonth = normalized.slice(0, 7);

  if (entryMonth > currentMonth) return false;
  if (entryMonth === currentMonth) return true;

  if (ENABLE_INITIAL_STOCK_BACKFILL) {
    const [entryYear, entryMon] = entryMonth.split('-').map(Number);
    const diffMonths = ((today.getFullYear() - entryYear) * 12) + ((today.getMonth() + 1) - entryMon);
    return diffMonths >= 1 && diffMonths <= INITIAL_BACKFILL_MONTHS;
  }

  const previousMonth = getPreviousMonthInputValue(currentMonth);
  if (entryMonth !== previousMonth) return false;
  return today.getDate() <= MONTH_CLOSE_GRACE_DAYS;
};

const calculateTotals = (items, catalogItems = []) => {
  let totalQty = 0;
  let totalKg = 0;
  items.forEach((item) => {
    totalQty += parseFloat(item.qty) || 0;
    totalKg += convertItemQtyToKg(item.qty, item.unit, catalogItems, item);
  });
  return {
    totalItems: items.length,
    totalQty: roundKg2(totalQty),
    totalKg: roundKg2(totalKg),
  };
};

const calculateKgTotals = (items) => ({
  totalItems: items.length,
  totalKg: roundKg2(items.reduce((sum, item) => sum + (parseFloat(item.kg) || 0), 0)),
});

const createEmptyItemRow = (id) => ({
  id,
  itemName: '',
  qty: '',
  unit: '',
  kg: '',
});

const getNextRowId = (rows = []) => Math.max(0, ...rows.map((row) => row.id || 0)) + 1;

const syncStockRowQtyKg = (row, catalogItems) => {
  const catalogItem = findCatalogItemByName(catalogItems, row.itemName);
  const unit = (row.unit || resolveCatalogItemUnit(catalogItem || {})).toString().trim();
  const qtyRaw = row.qty !== undefined && row.qty !== '' ? row.qty : row.kg;
  if (qtyRaw === '' || qtyRaw == null) {
    return { ...row, unit: row.itemName?.trim() ? unit : '', qty: '', kg: '' };
  }
  const meta = {
    name: row.itemName,
    unit,
    unitToKgFactor: catalogItem?.unitToKgFactor ?? row.unitToKgFactor,
  };
  const kg = roundKg2(convertItemQtyToKg(qtyRaw, unit, catalogItems, meta));
  return { ...row, unit, qty: String(qtyRaw), kg: String(kg) };
};

const patchStockRow = (rows, id, patch, catalogItems) => rows.map((row) => {
  if (row.id !== id) return row;
  let next = { ...row, ...patch };
  if (patch.itemName !== undefined) {
    const name = patch.itemName.trim();
    if (!name) {
      return { ...row, itemName: '', qty: '', unit: '', kg: '' };
    }
    const catalogItem = findCatalogItemByName(catalogItems, name);
    if (catalogItem) {
      next.unit = resolveCatalogItemUnit(catalogItem);
      next.unitToKgFactor = catalogItem.unitToKgFactor;
    }
  }
  if (patch.itemName !== undefined || patch.qty !== undefined || patch.unit !== undefined) {
    next = syncStockRowQtyKg(next, catalogItems);
  }
  return next;
});

function CatalogStockQtyInput({ row, catalogItems, accent = 'blue', onQtyChange }) {
  const catalogItem = findCatalogItemByName(catalogItems, row.itemName);
  const unit = (row.unit || (row.itemName?.trim() ? resolveCatalogItemUnit(catalogItem || {}) : '')).toString();
  const factor = unit ? getUnitToKgFactor(unit, catalogItem) : 1;
  const showKgHint = factor !== 1 && row.qty;
  const focusBorder = {
    blue: 'focus:border-blue-500/50',
    violet: 'focus:border-violet-500/50',
    fuchsia: 'focus:border-fuchsia-500/50',
  }[accent] || 'focus:border-blue-500/50';

  return (
    <div className="flex flex-col items-stretch gap-0.5 min-w-[5.5rem]">
      <div className="flex items-center gap-1">
        <input
          type="number"
          min="0"
          className={`flex-1 min-w-0 p-2 bg-[#252525] border border-white/5 rounded-lg text-white outline-none ${focusBorder} text-sm text-center transition-all`}
          placeholder="0"
          value={row.qty ?? ''}
          onChange={(e) => onQtyChange(e.target.value)}
        />
        <span
          className="text-[10px] font-bold text-amber-300/90 shrink-0 w-12 text-center select-none"
          title={unit || 'આઇટમ પસંદ કરો'}
        >
          {unit || '—'}
        </span>
      </div>
      {showKgHint && (
        <span className="text-[9px] text-gray-500 text-center leading-tight">
          = {formatMetric(row.kg)} {UNIT_KG}
        </span>
      )}
    </div>
  );
}

const createRowsFromItems = (items = [], minRows = 1, catalogItems = []) => {
  const filledRows = items.map((item, index) => {
    const name = item.itemName || item.name || '';
    const catalogItem = findCatalogItemByName(catalogItems, name);
    const unit = item.unit || resolveCatalogItemUnit(catalogItem || item);
    const kgStored = parseFloat(item.kg);
    let qty = item.qty != null && item.qty !== '' ? item.qty : '';
    if (qty === '' && Number.isFinite(kgStored) && kgStored > 0) {
      const factor = getUnitToKgFactor(unit, catalogItem);
      qty = factor !== 1 ? roundKg2(kgStored / factor) : kgStored;
    } else if (qty === '' && item.qty == null) {
      qty = item.kg || '';
    }
    const base = {
      id: index + 1,
      itemName: name,
      qty: qty !== '' && qty != null ? String(qty) : '',
      unit,
      kg: item.kg != null ? String(item.kg) : '',
    };
    return syncStockRowQtyKg(base, catalogItems);
  });

  const totalRows = Math.max(minRows, filledRows.length || 0);
  const rows = [...filledRows];
  for (let index = rows.length; index < totalRows; index += 1) {
    rows.push(createEmptyItemRow(index + 1));
  }
  return rows;
};

const mergeCatalogItemsWithExisting = (catalogItems = [], existingItems = []) => {
  const extras = existingItems
    .map((item, index) => {
      const name = (item.itemName || item.name || '').trim();
      if (!name) return null;
      return {
        id: item.id || `existing-${index}-${buildItemNameKey(name)}`,
        name,
        category: item.category || 'અન્ય',
        unit: item.unit || 'કિલો',
        is_active: true,
        source: 'existing',
      };
    })
    .filter(Boolean);

  return ensureCatalogItems([...catalogItems, ...extras]);
};

const createCatalogItemPayload = ({
  name,
  category,
  unit,
  unitToKgFactor = null,
  isCustomUnit = false,
  globalUnitId = null,
  is_active = true,
}) => ({
  name: name.trim(),
  nameKey: buildItemNameKey(name),
  category: category.trim(),
  ...buildCatalogUnitFields({ unit, unitToKgFactor, isCustomUnit, globalUnitId }),
  is_active,
  updatedAt: new Date(),
});

const getSmartFileName = (order) => {
  const d = new Date(order.date);
  const day = String(d.getDate()).padStart(2, '0');
  const month = d.toLocaleString('en-US', { month: 'short' });
  const year = d.getFullYear();
  return `${day} ${month}_${year}_${order.center}`;
};

const getSendFileName = (order) =>
  `send-${sanitizeFilePart(order?.fromCenter)}-${sanitizeFilePart(order?.chalanNo)}.pdf`;

const PURCHASE_SOURCE_SHOP = 'shop';
const PURCHASE_SOURCE_KOTHAR_STOCK = 'khothar_stock';
const PURCHASE_SHOP_NAMES_COLLECTION = 'purchase-shop-names';
/** Matches Firebase console collection — દુકાન/કોઠાર સ્ટોક ખરીદી સિંક (availableKg). */
const GLOBAL_STOCK_COLLECTION = 'global-stock';
const STOCK_TRANSACTIONS_COLLECTION = 'stock-transactions';
const MONTHLY_CLOSING_STOCK_COLLECTION = 'monthly-closing-stock';
const MONTHLY_STOCK_SNAPSHOTS_COLLECTION = 'monthly_stock_snapshots';
const STOCK_UNLOCK_AUDIT_LOGS_COLLECTION = 'stock_unlock_audit_logs';
const STOCK_MONTH_LOCKS_COLLECTION = 'stock_month_locks';
const PHYSICAL_ADJUSTMENT_SOURCE_TYPE = 'physical_adjustment';

const globalStockKg = (value) => {
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : 0;
};

const normalizeDateOnly = (value) => {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

const toSafeTxQuantity = (value) => {
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) ? Math.round((parsed + Number.EPSILON) * 100) / 100 : 0;
};

const makeStockTransactionDocId = (sourceType, sourceId, lineIndex, transactionType) =>
  `${sourceType}__${sourceId}__${lineIndex}__${transactionType}`;

const makeMonthlyClosingDocId = (monthValue, itemKey) =>
  `${encodeURIComponent((monthValue || '').toString())}__${encodeURIComponent((itemKey || '').toString())}`;

const makeStockSnapshotDocId = (monthValue, itemKey, centerKey = 'all') =>
  `${encodeURIComponent((monthValue || '').toString())}__${encodeURIComponent((centerKey || 'all').toString())}__${encodeURIComponent((itemKey || '').toString())}`;

const buildStockTransactionsFromDocuments = ({ orders = [], sendOrders = [], purchases = [], catalogItems = [] }) => {
  const transactions = [];

  purchases
    .filter((entry) => !entry?.is_deleted)
    .forEach((purchase) => {
      const txDate = normalizeDateOnly(purchase.billDate || purchase.date || purchase.entryDate);
      const items = Array.isArray(purchase.items) ? purchase.items : [];
      items.forEach((item, lineIndex) => {
        const itemName = (item?.itemName || '').trim();
        const quantity = toSafeTxQuantity(item?.kg);
        if (!itemName || !txDate || !quantity) return;
        transactions.push({
          id: makeStockTransactionDocId('purchase', purchase.id, lineIndex, 'IN'),
          sourceType: 'purchase',
          sourceId: purchase.id,
          lineIndex,
          center_id: 'global',
          centerName: 'All Centers / Full Report',
          item_id: normalizeItemName(itemName),
          itemName,
          transaction_type: 'IN',
          quantity,
          transaction_date: txDate,
          created_at: purchase.timestamp || new Date(),
          is_deleted: false,
          autoSynced: true,
        });
      });
    });

  sendOrders
    .filter((entry) => !entry?.is_deleted)
    .forEach((order) => {
      const txDate = normalizeDateOnly(order.date || order.timestamp);
      const centerName = (order.fromCenter || '').trim();
      const items = Array.isArray(order.items) ? order.items : [];
      items.forEach((item, lineIndex) => {
        const itemName = (item?.itemName || '').trim();
        const quantity = toSafeTxQuantity(item?.kg);
        if (!itemName || !txDate || !quantity) return;
        transactions.push({
          id: makeStockTransactionDocId('send', order.id, lineIndex, 'IN'),
          sourceType: 'send',
          sourceId: order.id,
          lineIndex,
          center_id: normalizeItemName(centerName),
          centerName,
          item_id: normalizeItemName(itemName),
          itemName,
          transaction_type: 'IN',
          quantity,
          transaction_date: txDate,
          created_at: order.timestamp || new Date(),
          is_deleted: false,
          autoSynced: true,
        });
      });
    });

  orders
    .filter((entry) => !entry?.is_deleted)
    .forEach((order) => {
      const txDate = normalizeDateOnly(order.date || order.timestamp);
      const centerName = (order.center || '').trim();
      const items = Array.isArray(order.items) ? order.items : [];
      items.forEach((item, lineIndex) => {
        const itemName = (item?.name || '').trim();
        const quantity = toSafeTxQuantity(convertItemQtyToKg(item?.qty, item?.unit, catalogItems, item));
        if (!itemName || !txDate || !quantity) return;
        transactions.push({
          id: makeStockTransactionDocId('order', order.id, lineIndex, 'OUT'),
          sourceType: 'order',
          sourceId: order.id,
          lineIndex,
          center_id: normalizeItemName(centerName),
          centerName,
          item_id: normalizeItemName(itemName),
          itemName,
          transaction_type: 'OUT',
          quantity,
          transaction_date: txDate,
          created_at: order.timestamp || new Date(),
          is_deleted: false,
          autoSynced: true,
        });
      });
    });

  return transactions;
};

async function syncStockHistoryFromPrimaryCollections(catalogItems = []) {
  const [ordersSnapshot, sendSnapshot, purchaseSnapshot, existingTxSnapshot] = await Promise.all([
    getDocs(collection(db, 'orders')),
    getDocs(collection(db, 'send-orders')),
    getDocs(collection(db, 'purchases')),
    getDocs(collection(db, STOCK_TRANSACTIONS_COLLECTION)),
  ]);

  const allOrders = ordersSnapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
  const allSendOrders = sendSnapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
  const allPurchases = purchaseSnapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
  const nextTransactions = buildStockTransactionsFromDocuments({
    orders: allOrders,
    sendOrders: allSendOrders,
    purchases: allPurchases,
    catalogItems,
  });

  const activeIdSet = new Set(nextTransactions.map((entry) => entry.id));

  await Promise.all(
    nextTransactions.map((entry) =>
      setDoc(doc(db, STOCK_TRANSACTIONS_COLLECTION, entry.id), {
        ...entry,
        updatedAt: new Date(),
      }, { merge: true }),
    ),
  );

  const staleTxUpdates = existingTxSnapshot.docs
    .map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }))
    .filter((entry) => entry.autoSynced)
    .filter((entry) => !activeIdSet.has(entry.id))
    .map((entry) =>
      updateDoc(doc(db, STOCK_TRANSACTIONS_COLLECTION, entry.id), {
        is_deleted: true,
        updatedAt: new Date(),
      }),
    );

  if (staleTxUpdates.length) {
    await Promise.all(staleTxUpdates);
  }

  const stockTxSnapshot = await getDocs(collection(db, STOCK_TRANSACTIONS_COLLECTION));
  return stockTxSnapshot.docs
    .map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }))
    .filter((entry) => !entry.is_deleted);
}

async function setSourceTransactionsDeleted(sourceType, sourceId, isDeleted = true) {
  const sourceQuery = query(
    collection(db, STOCK_TRANSACTIONS_COLLECTION),
    where('sourceType', '==', sourceType),
    where('sourceId', '==', sourceId),
  );
  const snapshot = await getDocs(sourceQuery);
  if (snapshot.empty) return;
  await Promise.all(
    snapshot.docs.map((docSnap) =>
      updateDoc(doc(db, STOCK_TRANSACTIONS_COLLECTION, docSnap.id), {
        is_deleted: isDeleted,
        updatedAt: new Date(),
      }),
    ),
  );
}

async function migrateMonthlyClosingDocIdsToSafeFormat() {
  const snapshot = await getDocs(collection(db, MONTHLY_CLOSING_STOCK_COLLECTION));
  const docs = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
  let migratedCount = 0;
  let skippedCount = 0;

  for (const entry of docs) {
    if (entry?.is_deleted) {
      skippedCount += 1;
      continue;
    }
    const monthValue = (entry.month || entry.monthValue || '').toString().trim();
    const itemKey = (entry.item_id || normalizeItemName(entry.itemName || '')).toString().trim();
    if (!monthValue || !itemKey) {
      skippedCount += 1;
      continue;
    }

    const safeId = makeMonthlyClosingDocId(monthValue, itemKey);
    if (safeId === entry.id) {
      skippedCount += 1;
      continue;
    }

    const safeRef = doc(db, MONTHLY_CLOSING_STOCK_COLLECTION, safeId);
    await setDoc(
      safeRef,
      {
        ...entry,
        month: monthValue,
        monthValue,
        item_id: itemKey,
        migratedFromId: entry.id,
        updatedAt: new Date(),
        is_deleted: false,
      },
      { merge: true },
    );

    await updateDoc(doc(db, MONTHLY_CLOSING_STOCK_COLLECTION, entry.id), {
      is_deleted: true,
      migratedToId: safeId,
      updatedAt: new Date(),
    });
    migratedCount += 1;
  }

  return { migratedCount, skippedCount, totalDocs: docs.length };
}

/** +/- KG dari દરેક purchase લાઈનમને મુજબ global-stock મર્જ કરે. Doc ID = buildItemNameKey(itemName). */
async function applyGlobalStockKgDelta(items = [], deltaMultiplier = 1) {
  for (const item of items) {
    const name = (item.itemName || '').trim();
    if (!name) continue;
    const kgDelta = deltaMultiplier * globalStockKg(item.kg);
    if (!kgDelta) continue;
    const docKey = buildItemNameKey(name);
    if (!docKey) continue;
    const docRef = doc(db, GLOBAL_STOCK_COLLECTION, docKey);
    const snap = await getDoc(docRef);
    const prev = snap.exists() ? globalStockKg(snap.data().availableKg) : 0;
    const next = Math.max(0, Math.round((prev + kgDelta + Number.EPSILON) * 100) / 100);
    await setDoc(
      docRef,
      {
        itemName: name,
        availableKg: next,
        lastUpdated: serverTimestamp(),
      },
      { merge: true },
    );
  }
}

const getPurchaseResolvedSource = (purchase) => {
  if (purchase?.purchaseSource === PURCHASE_SOURCE_KOTHAR_STOCK) return PURCHASE_SOURCE_KOTHAR_STOCK;
  return PURCHASE_SOURCE_SHOP;
};

const getPurchaseFileName = (purchase) => {
  if (getPurchaseResolvedSource(purchase) === PURCHASE_SOURCE_KOTHAR_STOCK) {
    return `purchase-kothar-stock-${sanitizeFilePart(purchase?.date || purchase?.entryDate)}.pdf`;
  }
  return `purchase-${sanitizeFilePart(purchase?.shopName || purchase?.center)}-${sanitizeFilePart(purchase?.billNo)}.pdf`;
};

async function ensurePurchaseShopNameSaved(shopNameTrimmed) {
  const name = (shopNameTrimmed || '').trim();
  if (!name) return;
  const nameKey = normalizeItemName(name);
  try {
    const nameQuery = query(
      collection(db, PURCHASE_SHOP_NAMES_COLLECTION),
      where('nameKey', '==', nameKey),
      limit(1),
    );
    const snap = await getDocs(nameQuery);
    if (!snap.empty) {
      await updateDoc(doc(db, PURCHASE_SHOP_NAMES_COLLECTION, snap.docs[0].id), {
        name,
        updatedAt: new Date(),
      });
      return;
    }
    await addDoc(collection(db, PURCHASE_SHOP_NAMES_COLLECTION), {
      name,
      nameKey,
      createdAt: new Date(),
    });
  } catch (err) {
    console.warn('purchase shop name save skipped:', err);
  }
}

async function fetchPurchaseShopNameList() {
  try {
    const snapshot = await getDocs(collection(db, PURCHASE_SHOP_NAMES_COLLECTION));
    const names = [...new Set(snapshot.docs.map((d) => (d.data().name || '').trim()).filter(Boolean))];
    names.sort((a, b) => a.localeCompare(b, 'gu'));
    return names;
  } catch {
    return [];
  }
}

// Category icons for visual appeal
const categoryIcons = {
  "અનાજ": "🌾",
  "કઠોળ": "🫘",
  "ઘી-તેલ": "🛢️",
  "લોટ": "🥣",
  "ડ્રાયફ્રુટ": "🥜",
  "ફરાળી": "🍚",
  "કલર": "🎨",
  "મસાલા": "🌶️",
  "અન્ય": "📦"
};

const getReportUiTheme = () => ({
  tint: 'from-emerald-500 to-emerald-600',
  soft: 'from-emerald-500/10 to-emerald-600/5',
  border: 'border-emerald-500/20',
  text: 'text-emerald-700',
  muted: 'text-emerald-400',
  chip: 'bg-emerald-500/10 text-emerald-700 border-emerald-200',
});

const createDefaultReportForm = () => {
  const month = getMonthInputValue();
  return {
    month,
    fromMonth: month,
    toMonth: month,
    selectedDate: getDateWithinMonth(month, new Date().toISOString().split('T')[0]),
    reportPeriod: 'monthly',
    reportMode: 'single',
    scope: 'all',
    center: '',
    centerOther: '',
    stockViewMode: resolveReportStockViewMode(month),
  };
};

const patchReportFormMonth = (prev, month) => ({
  ...prev,
  month,
  fromMonth: prev.reportMode === 'range' ? prev.fromMonth : month,
  toMonth: prev.reportMode === 'range' ? prev.toMonth : month,
  stockViewMode:
    prev.reportPeriod === 'monthly' && prev.reportMode === 'single'
      ? resolveReportStockViewMode(month)
      : 'full_balance',
  selectedDate:
    prev.reportPeriod === 'yearly'
      ? getDateWithinYear(month, prev.selectedDate)
      : getDateWithinMonth(month, prev.selectedDate),
});

const createDefaultAdjustmentForm = () => ({
  id: null,
  date: new Date().toISOString().split('T')[0],
  itemName: '',
  qty: '',
  unit: '',
  direction: 'OUT',
  reason: 'Shrinkage',
  remark: '',
});

const mapPhysicalAdjustmentDoc = (docSnap) => {
  const data = docSnap.data();
  return {
    id: docSnap.id,
    ...data,
    transaction_date: data.transaction_date || '',
    itemName: data.itemName || '',
    quantity: parseFloat(data.quantity) || 0,
    entry_qty: data.entry_qty != null ? data.entry_qty : data.quantity,
    entry_unit: data.entry_unit || UNIT_KG,
    transaction_type: data.transaction_type === 'IN' ? 'IN' : 'OUT',
  };
};

function PreviewInfoCard({ label, value, accentClass = 'text-slate-900', className = '' }) {
  return (
    <div className={`rounded-2xl border border-gray-200 bg-white px-4 py-4 shadow-sm min-h-[96px] flex flex-col justify-between ${className}`}>
      <p className="text-gray-400 text-[11px] font-sans font-bold uppercase tracking-[0.14em]">{label}</p>
      <p className={`font-black text-base sm:text-lg leading-snug break-words ${accentClass}`}>{value || '-'}</p>
    </div>
  );
}

function ReportSummaryCard({ labelLines, value, accentClass = 'text-slate-900' }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm min-h-[112px] flex flex-col justify-between">
      <div className="min-h-[2.75rem] space-y-0.5">
        {labelLines.map((label, index) => (
          <p key={`${label}-${index}`} className="text-[12px] sm:text-[13px] font-bold uppercase tracking-wide leading-tight text-slate-400">
            {label}
          </p>
        ))}
      </div>
      <p className={`mt-2 text-sm sm:text-base font-black ${accentClass}`}>{value}</p>
    </div>
  );
}

function ReportPreviewContent({ report }) {
  const preparedReport = hydrateReport(report);
  const uiTheme = getReportUiTheme();
  const periodLabel = preparedReport.reportPeriod === 'yearly' ? 'Year' : 'Month';
  const isMonthOnlyView = preparedReport.stockViewMode === 'month_movements_only';

  return (
    <div className="space-y-6 font-sans">
      <div className={`rounded-3xl border ${uiTheme.border} bg-gradient-to-r ${uiTheme.soft} p-6 sm:p-8`}>
        <div className="flex flex-col gap-4">
          <div>
            <h2 className="mt-0 text-3xl sm:text-4xl font-black text-slate-900 tracking-tight">{preparedReport.title}</h2>
            <p className="mt-2 text-[13px] sm:text-sm text-slate-600">
              Stock movements for the selected range. All amounts in the table are in kilograms (KG), as indicated in the column headers.
            </p>
            {isMonthOnlyView ? (
              <p className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] font-bold text-amber-900">
                મોડ: ફક્ત આ મહિનાની IN/OUT; Net Stock = પિરિયડ IN − OUT (ગયા મહિનાનું closing સામેલ નથી).
              </p>
            ) : preparedReport.reportPeriod === 'monthly' && (
              <p className="mt-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-[12px] font-bold text-blue-900">
                મોડ: પૂર્ણ સ્ટોક — Income = ખુલ્લી + પિરિયડ IN (ગયા મહિનાની ભરતી સહિત).
              </p>
            )}
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <PreviewInfoCard label={periodLabel} value={preparedReport.monthLabel} />
            <PreviewInfoCard label="Center" value={preparedReport.centerLabel} />
            <PreviewInfoCard label="Range" value={preparedReport.rangeLabel} />
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className={`border-b ${uiTheme.border} bg-gradient-to-r ${uiTheme.soft} px-4 py-3`}>
          <h3 className={`text-sm font-black uppercase tracking-widest ${uiTheme.text}`}>Stock table</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-slate-900 text-white">
              <tr>
                <th className="px-4 py-3 text-left">Item Name</th>
                <th className="px-4 py-3 text-center">{isMonthOnlyView ? 'Income (IN only)' : 'Income (KG)'}</th>
                <th className="px-4 py-3 text-center">Outgoing (KG)</th>
                <th className="px-4 py-3 text-center">{isMonthOnlyView ? 'Net Stock (period) KG' : 'Total Stock (KG)'}</th>
              </tr>
            </thead>
            <tbody>
              {preparedReport.rows.map((row, index) => (
                <tr key={`${row.itemName}-${index}`} className="border-t border-slate-200">
                  <td className="px-4 py-3 font-bold text-slate-900">{row.itemName}</td>
                  <td className={`px-4 py-3 text-center font-bold ${uiTheme.text}`}>{formatMetric(row.income)}</td>
                  <td className="px-4 py-3 text-center font-bold text-slate-900">{formatMetric(row.outgoing)}</td>
                  <td className="px-4 py-3 text-center font-black text-slate-900">{formatMetric(row.totalStock)}</td>
                </tr>
              ))}
              {preparedReport.rows.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-10 text-center text-sm font-bold text-slate-400">
                    No items found for the selected month.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <ReportSummaryCard labelLines={['Items']} value={formatMetric(preparedReport.summary.totalRows)} />
        <ReportSummaryCard
          labelLines={isMonthOnlyView ? ['Income', '(IN only)'] : ['Income', '(KG)']}
          value={formatMetric(preparedReport.summary.totalIncome)}
          accentClass={uiTheme.text}
        />
        <ReportSummaryCard labelLines={['Outgoing', '(KG)']} value={formatMetric(preparedReport.summary.totalOutgoing)} />
        <ReportSummaryCard
          labelLines={isMonthOnlyView ? ['Net Stock', '(period KG)'] : ['Total Stock', '(KG)']}
          value={formatMetric(preparedReport.summary.totalStock)}
        />
      </div>
    </div>
  );
}

const ITEM_SEARCH_HINT_GU =
  'આપને જે વસ્તુ મોકલવાની હોય તે Searchમાં લખશો તે વસ્તુ આપને દેખાશે.';

function ItemsListSearchHint() {
  return (
    <div className="border-y border-white/10 bg-[#121212]/90">
      <p className="mx-5 my-5 px-3 py-2 text-center text-[13px] sm:text-sm leading-relaxed text-amber-300">
        {ITEM_SEARCH_HINT_GU}
      </p>
    </div>
  );
}

function ItemNameAutocompleteInput({
  value,
  onChange,
  catalogItems,
  excludedNameKeys = [],
  onSelectItem,
  accent = 'blue',
  placeholder = 'Item name...',
}) {
  const [isOpen, setIsOpen] = useState(false);

  const filteredItems = useMemo(() => {
    const excluded = new Set(excludedNameKeys);
    const normalizedQuery = normalizeItemName(value);
    const baseList = catalogItems.filter(
      (item) => !excluded.has(item.nameKey) || normalizedQuery === item.nameKey,
    );

    if (!normalizedQuery) {
      const sorted = [...baseList].sort((left, right) => {
        const categoryCompare = (left.category || '').localeCompare(right.category || '', 'gu');
        if (categoryCompare !== 0) return categoryCompare;
        return (left.name || '').localeCompare(right.name || '', 'gu');
      });
      const seenCategories = new Set();
      const onePerCategory = [];
      for (const item of sorted) {
        const cat = item.category || 'અન્ય';
        if (seenCategories.has(cat)) continue;
        seenCategories.add(cat);
        onePerCategory.push(item);
      }
      return onePerCategory;
    }

    return baseList
      .filter((item) => matchesSearchText(item.name, value) || matchesSearchText(item.category, value))
      .slice(0, 48);
  }, [catalogItems, excludedNameKeys, value]);

  const focusClasses = {
    blue: 'focus:border-blue-500/50',
    violet: 'focus:border-violet-500/50',
    fuchsia: 'focus:border-fuchsia-500/50',
  }[accent] || 'focus:border-blue-500/50';

  return (
    <div className="relative">
      <input
        className={`w-full p-2 bg-[#252525] border border-white/5 rounded-lg text-white outline-none text-sm transition-all placeholder-gray-600 ${focusClasses}`}
        value={value}
        placeholder={placeholder}
        onFocus={() => setIsOpen(true)}
        onBlur={() => window.setTimeout(() => setIsOpen(false), 120)}
        onChange={(event) => onChange(event.target.value)}
      />
      {isOpen && (
        <div className="absolute z-50 mt-1 w-full max-h-52 overflow-y-auto rounded-xl border border-white/10 bg-[#141414] shadow-2xl">
          {filteredItems.length > 0 ? filteredItems.map((item) => (
            <button
              key={item.id}
              type="button"
              onMouseDown={(event) => {
                event.preventDefault();
                onSelectItem(item);
                setIsOpen(false);
              }}
              className="flex w-full items-center justify-between border-b border-white/5 px-3 py-2 text-left hover:bg-white/5"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-white">{item.name}</p>
                <p className="text-[10px] uppercase tracking-wide text-gray-500">{item.category}</p>
              </div>
              <span className="ml-3 rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[10px] font-bold uppercase text-gray-300">
                {item.unit}
              </span>
            </button>
          )) : (
            <div className="px-3 py-3 text-xs text-gray-500">No matching items.</div>
          )}
        </div>
      )}
    </div>
  );
}

/** Full-screen wait UI for slow PDF API / blob generation; appears only after a short delay. */
function PdfDownloadWaitOverlay({ active, kind }) {
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    if (!active) {
      setRevealed(false);
      return undefined;
    }
    const id = window.setTimeout(() => setRevealed(true), 420);
    return () => window.clearTimeout(id);
  }, [active]);

  const show = active && revealed;
  const palette = (() => {
    switch (kind) {
      case 'send':
        return {
          ring: 'border-blue-500/25 border-t-blue-300',
          icon: 'text-blue-300',
          glow: 'from-blue-500/20',
        };
      case 'request':
        return {
          ring: 'border-orange-500/25 border-t-orange-300',
          icon: 'text-orange-300',
          glow: 'from-orange-500/20',
        };
      case 'purchase':
        return {
          ring: 'border-violet-500/25 border-t-fuchsia-300',
          icon: 'text-fuchsia-300',
          glow: 'from-violet-500/20',
        };
      case 'report':
      default:
        return {
          ring: 'border-emerald-500/25 border-t-emerald-300',
          icon: 'text-emerald-300',
          glow: 'from-emerald-500/20',
        };
    }
  })();

  const title =
    kind === 'report'
      ? 'માસિક સ્ટોક રિપોર્ટ PDF'
      : kind === 'send'
        ? 'સેન્ડ ચલણ PDF'
        : kind === 'purchase'
          ? 'ખરીદી PDF'
          : 'રિક્વેસ્ટ ચલણ PDF';

  const sub =
    'PDF બની રહ્યું છે — ડાઉનલોડ ડાયલોગ થોડી વારમાં આવશે. નેટવર્ક ધીમું હોય અથવા સર્વર દૂર હોય તો વધુ સમય લાગી શકે છે.';

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          key="pdf-wait-root"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          className="fixed inset-0 z-[420] flex items-center justify-center bg-black/80 p-4 backdrop-blur-md"
          role="status"
          aria-live="polite"
          aria-busy="true"
        >
          <motion.div
            initial={{ scale: 0.94, opacity: 0, y: 16 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.96, opacity: 0, y: 10 }}
            transition={{ type: 'spring', damping: 26, stiffness: 280 }}
            className={`relative w-full max-w-md overflow-hidden rounded-[2rem] border border-white/10 bg-gradient-to-b from-[#16161f] to-[#0c0c12] p-10 shadow-2xl sm:max-w-lg`}
          >
            <div
              className={`pointer-events-none absolute inset-0 bg-gradient-to-b ${palette.glow} to-transparent opacity-90`}
            />
            <div className="relative flex flex-col items-center text-center">
              <div className="relative mb-9 flex h-28 w-28 items-center justify-center">
                <div
                  className={`absolute inset-0 rounded-full border-2 ${palette.ring} animate-spin`}
                  style={{ animationDuration: '1.35s' }}
                />
                <div className="absolute inset-3 rounded-full border border-white/10 opacity-50 animate-pulse" />
                <Loader2 className={`relative h-14 w-14 ${palette.icon} animate-pulse`} strokeWidth={2.2} />
              </div>
              <h3 className="text-xl font-black tracking-tight text-white sm:text-2xl">{title}</h3>
              <p className="mt-4 max-w-sm text-sm leading-relaxed text-gray-400">{sub}</p>
              <p className="mt-2 text-xs font-semibold text-gray-500">PDF is being prepared — please wait…</p>
              <div className="mt-8 flex gap-1">
                {[0, 1, 2].map((i) => (
                  <motion.span
                    key={i}
                    className="h-1.5 w-8 rounded-full bg-white/20"
                    animate={{ opacity: [0.35, 1, 0.35], scaleX: [0.85, 1, 0.85] }}
                    transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.15 }}
                  />
                ))}
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function CenterAdminPanel({ centersList, refreshCenters }) {
  const [form, setForm] = useState({ id: null, center: '' });
  const [saving, setSaving] = useState(false);

  const resetForm = () => setForm({ id: null, center: '' });

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.center.trim()) {
      alert('Center name લખો.');
      return;
    }
    setSaving(true);
    try {
      await saveCenter(form);
      await refreshCenters();
      resetForm();
      alert(form.id ? 'Center updated.' : 'Center added.');
    } catch (err) {
      alert(err.message || 'Center save failed.');
    }
    setSaving(false);
  };

  const handleEdit = (row) => {
    setForm({
      id: row.id || null,
      center: row.center || '',
    });
  };

  const handleDelete = async (row) => {
    if (!row.id) {
      alert('આ સેન્ટર બિલ્ટ-ઇન લિસ્ટમાં છે — ફક્ત તમે ઉમેરેલા સેન્ટર દૂર થઈ શકે.');
      return;
    }
    if (!window.confirm(`"${row.center}" દૂર કરવું?`)) return;
    setSaving(true);
    try {
      await softDeleteCenter(row.id);
      await refreshCenters();
      if (form.id === row.id) resetForm();
    } catch (err) {
      alert(err.message || 'Delete failed.');
    }
    setSaving(false);
  };

  return (
    <div className="mt-6 rounded-2xl border border-cyan-500/20 bg-cyan-500/5 p-4 sm:p-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-widest text-cyan-300">Center Manager</p>
          <p className="mt-1 text-sm text-gray-300">સેન્ટર ઉમેરો — બધા ડ્રોપડાઉનમાં ગ્લોબલી દેખાશે.</p>
        </div>
        {form.id && (
          <button type="button" onClick={resetForm} className="text-xs font-bold text-gray-400 hover:text-white">
            નવું સેન્ટર
          </button>
        )}
      </div>

      <form onSubmit={handleSubmit} className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto]">
        <input
          className="p-3 bg-[#252525] border border-white/10 rounded-xl text-white text-sm outline-none focus:border-cyan-500/50"
          placeholder="Center name *"
          value={form.center}
          onChange={(e) => setForm((prev) => ({ ...prev, center: e.target.value }))}
          required
        />
        <button
          type="submit"
          disabled={saving}
          className="p-3 rounded-xl bg-gradient-to-r from-cyan-500 to-cyan-600 text-white text-sm font-bold disabled:opacity-50 whitespace-nowrap px-6"
        >
          {saving ? 'Saving…' : (form.id ? 'Update Center' : 'Add Center')}
        </button>
      </form>

      <div className="mt-4 max-h-48 overflow-y-auto rounded-xl border border-white/10 custom-scroll">
        <table className="w-full text-xs">
          <thead className="bg-[#252525] text-gray-400 sticky top-0">
            <tr>
              <th className="p-2 text-left">Center</th>
              <th className="p-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {centersList.map((row) => (
              <tr key={`${row.nameKey}-${row.id || 'seed'}`} className="border-t border-white/5">
                <td className="p-2 font-bold text-white">{row.center}</td>
                <td className="p-2 text-right space-x-1">
                  <button type="button" onClick={() => handleEdit(row)} className="text-[10px] font-bold text-cyan-300 hover:text-white">Edit</button>
                  {row.id && (
                    <button type="button" onClick={() => handleDelete(row)} className="text-[10px] font-bold text-red-400 hover:text-red-200">Delete</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// --- ADMIN DASHBOARD ---
function AdminDashboard({ user, catalogItems, refreshCatalog, centersList, refreshCenters }) {
  const [activeTab, setActiveTab] = useState('requests');
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editOrder, setEditOrder] = useState(null);
  const [previewOrder, setPreviewOrder] = useState(null);
  const [pdfLoading, setPdfLoading] = useState(null);
  const [filters, setFilters] = useState({ date: '', center: '', name: '' });
  const [sendOrders, setSendOrders] = useState([]);
  const [sendLoading, setSendLoading] = useState(true);
  const [previewSendOrder, setPreviewSendOrder] = useState(null);
  const [sendPdfLoading, setSendPdfLoading] = useState(null);
  const [sendMailLoading, setSendMailLoading] = useState(null);
  const [sendFilters, setSendFilters] = useState({ date: '', center: '', name: '' });
  const [editSendOrder, setEditSendOrder] = useState(null);
  const [reports, setReports] = useState([]);
  const [reportLoading, setReportLoading] = useState(true);
  const [reportPdfLoading, setReportPdfLoading] = useState(null);
  const [reportDeleting, setReportDeleting] = useState(null);
  const [reportGenerating, setReportGenerating] = useState(false);
  const [previewReport, setPreviewReport] = useState(null);
  const [reportForm, setReportForm] = useState(createDefaultReportForm);
  const [mailModal, setMailModal] = useState(null); // { order, type: 'request'|'send'|'report' }
  const [customEmail, setCustomEmail] = useState('');
  const [customEmailError, setCustomEmailError] = useState('');
  const [mailSending, setMailSending] = useState(false);
  const [selectedReportEmail, setSelectedReportEmail] = useState(REPORT_DEFAULT_EMAILS[0]);
  const [closingMigrationLoading, setClosingMigrationLoading] = useState(false);
  const [unlockReason, setUnlockReason] = useState('');
  const [unlockReasonStepVisible, setUnlockReasonStepVisible] = useState(false);
  const [monthLockSubmitting, setMonthLockSubmitting] = useState(false);
  const [monthLockMonth, setMonthLockMonth] = useState(() => clampLockUnlockMonthValue(createDefaultReportForm().month));
  const [reportMonthLock, setReportMonthLock] = useState({ loading: true, is_locked: false });
  const [lockPanelMonthLock, setLockPanelMonthLock] = useState({ loading: true, is_locked: false });
  const [lockPanelClosingKg, setLockPanelClosingKg] = useState(0);
  const [unlockAuditLogs, setUnlockAuditLogs] = useState([]);
  const [adjustmentForm, setAdjustmentForm] = useState(createDefaultAdjustmentForm);
  const [adjustmentSubmitting, setAdjustmentSubmitting] = useState(false);
  const [adjustmentEntries, setAdjustmentEntries] = useState([]);
  const [adjustmentListLoading, setAdjustmentListLoading] = useState(false);
  const [adjustmentDeletingId, setAdjustmentDeletingId] = useState(null);
  const [globalUnits, setGlobalUnits] = useState([]);

  useEffect(() => {
    fetchGlobalUnits()
      .then(setGlobalUnits)
      .catch(() => setGlobalUnits([]));
  }, []);

  const [previousMonthClosingInfo, setPreviousMonthClosingInfo] = useState({
    month: '',
    currentMonth: '',
    previousIncomingKg: 0,
    previousOutgoingKg: 0,
    totalClosingKg: 0,
    currentIncomingKg: 0,
    currentOutgoingKg: 0,
    currentNetKg: 0,
    currentMonthClosedStockKg: 0,
    itemCount: 0,
    loading: false,
    error: '',
  });

  const adjustmentCatalogNameKeys = useMemo(
    () => new Set(catalogItems.map((item) => item.nameKey)),
    [catalogItems],
  );

  const adjustmentKgPreview = useMemo(() => {
    if (!adjustmentForm.itemName?.trim() || adjustmentForm.qty === '') return '';
    const catalogItem = findCatalogItemByName(catalogItems, adjustmentForm.itemName);
    return roundKg2(convertItemQtyToKg(adjustmentForm.qty, adjustmentForm.unit, catalogItems, {
      name: adjustmentForm.itemName,
      unit: adjustmentForm.unit,
      unitToKgFactor: catalogItem?.unitToKgFactor,
    }));
  }, [adjustmentForm.itemName, adjustmentForm.qty, adjustmentForm.unit, catalogItems]);

  const fetchPhysicalAdjustments = useCallback(async () => {
    setAdjustmentListLoading(true);
    try {
      const snapshot = await getDocs(collection(db, STOCK_TRANSACTIONS_COLLECTION));
      const entries = snapshot.docs
        .map(mapPhysicalAdjustmentDoc)
        .filter((entry) => entry.sourceType === PHYSICAL_ADJUSTMENT_SOURCE_TYPE && !entry.is_deleted)
        .sort((left, right) => {
          const leftTime = left.updatedAt?.toDate?.() || left.created_at?.toDate?.() || 0;
          const rightTime = right.updatedAt?.toDate?.() || right.created_at?.toDate?.() || 0;
          return rightTime - leftTime;
        });
      setAdjustmentEntries(entries);
    } catch (err) {
      console.warn('Physical adjustments fetch failed:', err);
      setAdjustmentEntries([]);
    }
    setAdjustmentListLoading(false);
  }, []);

  const [ledgerDataNonce, setLedgerDataNonce] = useState(0);
  const bumpLedgerData = () => setLedgerDataNonce((n) => n + 1);

  const fetchOrders = async () => {
    setLoading(true);
    const q = query(collection(db, "orders"), orderBy("timestamp", "desc"));
    const snapshot = await getDocs(q);
    setOrders(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })).filter(o => !o.is_deleted));
    setLoading(false);
  };

  const fetchSendOrders = async () => {
    setSendLoading(true);
    const q = query(collection(db, "send-orders"), orderBy("timestamp", "desc"));
    const snapshot = await getDocs(q);
    setSendOrders(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })).filter(o => !o.is_deleted));
    setSendLoading(false);
  };

  const fetchReports = async () => {
    setReportLoading(true);
    try {
      const q = query(collection(db, "reports"), orderBy("generatedAt", "desc"));
      const snapshot = await getDocs(q);
      setReports(snapshot.docs.map(doc => hydrateReport({ id: doc.id, ...doc.data() })));
    } catch (err) {
      console.warn('Report fetch failed:', err);
      setReports([]);
    }
    setReportLoading(false);
  };

  const fetchUnlockAuditLogs = async () => {
    try {
      const snapshot = await getDocs(
        query(collection(db, STOCK_UNLOCK_AUDIT_LOGS_COLLECTION), orderBy('unlocked_at', 'desc'), limit(20)),
      );
      setUnlockAuditLogs(snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() })));
    } catch (err) {
      console.warn('unlock audit fetch failed:', err);
      setUnlockAuditLogs([]);
    }
  };

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { fetchOrders(); fetchSendOrders(); fetchReports(); fetchUnlockAuditLogs(); }, []);

  useEffect(() => {
    setReportMonthLock((prev) => ({ ...prev, loading: true }));
    const month = reportForm.month;
    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      setReportMonthLock({ loading: false, is_locked: false });
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const snap = await getDoc(doc(db, STOCK_MONTH_LOCKS_COLLECTION, month));
        const data = snap.exists() ? snap.data() : {};
        const locked = data.is_locked === true;
        if (!cancelled) setReportMonthLock({ loading: false, is_locked: locked });
      } catch (err) {
        console.warn('report month lock fetch failed:', err);
        if (!cancelled) setReportMonthLock({ loading: false, is_locked: false });
      }
    })();
    return () => { cancelled = true; };
  }, [reportForm.month]);

  useEffect(() => {
    setUnlockReasonStepVisible(false);
    setUnlockReason('');
    setLockPanelMonthLock((prev) => ({ ...prev, loading: true }));
    const month = monthLockMonth;
    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      setLockPanelMonthLock({ loading: false, is_locked: false });
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const snap = await getDoc(doc(db, STOCK_MONTH_LOCKS_COLLECTION, month));
        const data = snap.exists() ? snap.data() : {};
        const locked = data.is_locked === true;
        if (!cancelled) setLockPanelMonthLock({ loading: false, is_locked: locked });
      } catch (err) {
        console.warn('lock panel month fetch failed:', err);
        if (!cancelled) setLockPanelMonthLock({ loading: false, is_locked: false });
      }
    })();
    return () => { cancelled = true; };
  }, [monthLockMonth]);

  const handleUnlockMonth = async () => {
    const month = clampLockUnlockMonthValue(monthLockMonth);
    if (month !== monthLockMonth) setMonthLockMonth(month);
    if (!month || !/^\d{4}-\d{2}$/.test(month)) return alert('લૉક માટે મહિનો પસંદ કરો.');
    if (!unlockReason.trim()) return alert('Unlock reason is required.');
    if (monthLockSubmitting) return;

    setMonthLockSubmitting(true);
    try {
      await setDoc(
        doc(db, STOCK_MONTH_LOCKS_COLLECTION, month),
        {
          month,
          year: month.slice(0, 4),
          is_locked: false,
          unlocked_at: new Date(),
          unlocked_by: user?.username || 'Admin',
          reason: unlockReason.trim(),
          updatedAt: new Date(),
        },
        { merge: true },
      );

      await addDoc(collection(db, STOCK_UNLOCK_AUDIT_LOGS_COLLECTION), {
        month,
        year: month.slice(0, 4),
        reason: unlockReason.trim(),
        unlocked_by: user?.username || 'Admin',
        unlocked_at: new Date(),
        recalc_status: 'queued',
      });

      setUnlockReason('');
      setUnlockReasonStepVisible(false);
      setLockPanelMonthLock({ loading: false, is_locked: false });
      if (month === reportForm.month) {
        setReportMonthLock({ loading: false, is_locked: false });
      }
      await fetchUnlockAuditLogs();
      alert(`Month ${month} unlocked successfully.`);
    } catch (err) {
      alert(`Unlock Error: ${err.message}`);
    }
    setMonthLockSubmitting(false);
  };

  const handleLockMonth = async () => {
    const month = clampLockUnlockMonthValue(monthLockMonth);
    if (month !== monthLockMonth) setMonthLockMonth(month);
    if (!month || !/^\d{4}-\d{2}$/.test(month)) return alert('લૉક માટે મહિનો પસંદ કરો.');
    if (monthLockSubmitting) return;

    setMonthLockSubmitting(true);
    try {
      await setDoc(
        doc(db, STOCK_MONTH_LOCKS_COLLECTION, month),
        {
          month,
          year: month.slice(0, 4),
          is_locked: true,
          locked_at: new Date(),
          locked_by: user?.username || 'Admin',
          updatedAt: new Date(),
        },
        { merge: true },
      );
      setLockPanelMonthLock({ loading: false, is_locked: true });
      if (month === reportForm.month) {
        setReportMonthLock({ loading: false, is_locked: true });
      }
      setUnlockReasonStepVisible(false);
      alert(`Month ${month} locked successfully.`);
    } catch (err) {
      alert(`Lock Error: ${err.message}`);
    }
    setMonthLockSubmitting(false);
  };

  const handleAdjustmentSelectItem = (item) => {
    setAdjustmentForm((prev) => ({
      ...prev,
      itemName: item.name,
      unit: resolveCatalogItemUnit(item),
      qty: normalizeItemName(prev.itemName) === item.nameKey ? prev.qty : '',
    }));
  };

  const handleEditPhysicalAdjustment = (entry) => {
    setAdjustmentForm({
      id: entry.id,
      date: entry.transaction_date || new Date().toISOString().split('T')[0],
      itemName: entry.itemName || '',
      qty: entry.entry_qty != null ? String(entry.entry_qty) : String(entry.quantity || ''),
      unit: entry.entry_unit || UNIT_KG,
      direction: entry.transaction_type === 'IN' ? 'IN' : 'OUT',
      reason: entry.adjustment_reason || 'Shrinkage',
      remark: entry.remark || '',
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDeletePhysicalAdjustment = async (entry) => {
    if (!window.confirm(`આ adjustment એન્ટ્રી કાઢી નાખવી? (${entry.itemName})`)) return;
    setAdjustmentDeletingId(entry.id);
    try {
      await updateDoc(doc(db, STOCK_TRANSACTIONS_COLLECTION, entry.id), {
        is_deleted: true,
        updatedAt: new Date(),
      });
      if (adjustmentForm.id === entry.id) setAdjustmentForm(createDefaultAdjustmentForm());
      await fetchPhysicalAdjustments();
      bumpLedgerData();
    } catch (err) {
      alert(`Delete Error: ${err.message}`);
    }
    setAdjustmentDeletingId(null);
  };

  const handlePhysicalAdjustmentSubmit = async () => {
    const normalizedDate = normalizeDateOnly(adjustmentForm.date);
    const itemName = (adjustmentForm.itemName || '').trim();
    const catalogItem = findCatalogItemByName(catalogItems, itemName);
    const unit = (adjustmentForm.unit || resolveCatalogItemUnit(catalogItem || {})).toString().trim();
    const quantityKg = toSafeTxQuantity(adjustmentKgPreview);
    const entryQty = parseFloat(adjustmentForm.qty);
    const direction = adjustmentForm.direction === 'IN' ? 'IN' : 'OUT';
    if (!normalizedDate) return alert('Adjustment date is required.');
    if (!itemName) return alert('Item name is required.');
    if (!Number.isFinite(entryQty) || entryQty <= 0) return alert('માત્રા ૦ કરતાં વધારે લખો.');
    if (!quantityKg || quantityKg <= 0) return alert('કિલો માત્રા માન્ય નથી.');
    if (!adjustmentForm.reason.trim()) return alert('Reason is required.');
    if (adjustmentSubmitting) return;

    if (!adjustmentCatalogNameKeys.has(normalizeItemName(itemName))) {
      return alert(`Invalid item name: "${itemName}". Please select an item from the master list.`);
    }

    const payload = {
      sourceType: PHYSICAL_ADJUSTMENT_SOURCE_TYPE,
      lineIndex: 0,
      center_id: 'global',
      centerName: 'All Centers / Full Report',
      item_id: normalizeItemName(itemName),
      itemName,
      transaction_type: direction,
      quantity: quantityKg,
      entry_qty: entryQty,
      entry_unit: unit,
      transaction_date: normalizedDate,
      adjustment_reason: adjustmentForm.reason.trim(),
      remark: adjustmentForm.remark.trim(),
      autoSynced: false,
      is_deleted: false,
      updatedAt: new Date(),
    };

    setAdjustmentSubmitting(true);
    try {
      if (adjustmentForm.id) {
        await updateDoc(doc(db, STOCK_TRANSACTIONS_COLLECTION, adjustmentForm.id), payload);
        alert('Physical adjustment updated successfully.');
      } else {
        const adjustmentRef = await addDoc(collection(db, STOCK_TRANSACTIONS_COLLECTION), {
          ...payload,
          sourceId: '',
          created_by: user?.username || 'Admin',
          created_at: new Date(),
        });
        await updateDoc(doc(db, STOCK_TRANSACTIONS_COLLECTION, adjustmentRef.id), { sourceId: adjustmentRef.id });
        alert('Physical adjustment saved successfully.');
      }
      setAdjustmentForm(createDefaultAdjustmentForm());
      await fetchPhysicalAdjustments();
      bumpLedgerData();
    } catch (err) {
      alert(`Adjustment Error: ${err.message}`);
    }
    setAdjustmentSubmitting(false);
  };

  useEffect(() => {
    fetchPhysicalAdjustments();
  }, [fetchPhysicalAdjustments, ledgerDataNonce]);

  useEffect(() => {
    let cancelled = false;
    const targetMonth = getPreviousMonthInputValue(reportForm.month);

    (async () => {
      setPreviousMonthClosingInfo((prev) => ({
        ...prev,
        month: targetMonth || '',
        currentMonth: reportForm.month,
        loading: true,
        error: '',
      }));
      try {
        let snapshot = await getDocs(collection(db, STOCK_TRANSACTIONS_COLLECTION));
        let rows = snapshot.docs
          .map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }))
          .filter((entry) => !entry?.is_deleted);

        if (rows.length === 0) {
          try {
            rows = await syncStockHistoryFromPrimaryCollections(catalogItems);
          } catch (syncErr) {
            console.warn('stock-transactions sync skipped in closing widget:', syncErr);
          }
        }

        let lockPanelClosedKg = 0;
        if (monthLockMonth && /^\d{4}-\d{2}$/.test(monthLockMonth)) {
          const lockMonthEnd = getLastDateForMonth(monthLockMonth);
          lockPanelClosedKg = rows
            .filter((entry) => {
              const txDate = normalizeDateOnly(entry.transaction_date || entry.date || entry.created_at);
              return txDate && txDate <= lockMonthEnd;
            })
            .reduce((sum, entry) => sum + (
              (entry.transaction_type || '').toString().toUpperCase() === 'OUT'
                ? -globalStockKg(entry.quantity)
                : globalStockKg(entry.quantity)
            ), 0);
        }
        if (!cancelled) setLockPanelClosingKg(lockPanelClosedKg);

        if (!targetMonth) {
          if (!cancelled) {
            setPreviousMonthClosingInfo({
              month: '',
              currentMonth: reportForm.month || '',
              previousIncomingKg: 0,
              previousOutgoingKg: 0,
              totalClosingKg: 0,
              currentIncomingKg: 0,
              currentOutgoingKg: 0,
              currentNetKg: 0,
              currentMonthClosedStockKg: 0,
              itemCount: 0,
              loading: false,
              error: '',
            });
          }
          return;
        }

        const previousMonthRows = rows.filter(
          (entry) => monthFromDateValue(entry.transaction_date || entry.date || entry.created_at) === targetMonth,
        );
        const currentMonthRows = rows.filter(
          (entry) => monthFromDateValue(entry.transaction_date || entry.date || entry.created_at) === reportForm.month,
        );

        const previousIncomingKg = previousMonthRows
          .filter((entry) => (entry.transaction_type || '').toString().toUpperCase() === 'IN')
          .reduce((sum, entry) => sum + globalStockKg(entry.quantity), 0);
        const previousOutgoingKg = previousMonthRows
          .filter((entry) => (entry.transaction_type || '').toString().toUpperCase() === 'OUT')
          .reduce((sum, entry) => sum + globalStockKg(entry.quantity), 0);
        const currentIncomingKg = currentMonthRows
          .filter((entry) => (entry.transaction_type || '').toString().toUpperCase() === 'IN')
          .reduce((sum, entry) => sum + globalStockKg(entry.quantity), 0);
        const currentOutgoingKg = currentMonthRows
          .filter((entry) => (entry.transaction_type || '').toString().toUpperCase() === 'OUT')
          .reduce((sum, entry) => sum + globalStockKg(entry.quantity), 0);

        const previousMonthEnd = getLastDateForMonth(targetMonth);
        const totalClosingKg = rows
          .filter((entry) => {
            const txDate = normalizeDateOnly(entry.transaction_date || entry.date || entry.created_at);
            return txDate && txDate <= previousMonthEnd;
          })
          .reduce((sum, entry) => sum + (
            (entry.transaction_type || '').toString().toUpperCase() === 'OUT'
              ? -globalStockKg(entry.quantity)
              : globalStockKg(entry.quantity)
          ), 0);

        const currentMonthEnd = getLastDateForMonth(reportForm.month);
        const currentMonthClosedStockKg = rows
          .filter((entry) => {
            const txDate = normalizeDateOnly(entry.transaction_date || entry.date || entry.created_at);
            return txDate && txDate <= currentMonthEnd;
          })
          .reduce((sum, entry) => sum + (
            (entry.transaction_type || '').toString().toUpperCase() === 'OUT'
              ? -globalStockKg(entry.quantity)
              : globalStockKg(entry.quantity)
          ), 0);
        const itemCount = new Set(
          previousMonthRows.map((entry) => normalizeItemName(entry.itemName || entry.item_id || '')),
        ).size;
        const currentNetKg = currentIncomingKg - currentOutgoingKg;

        if (!cancelled) {
          setPreviousMonthClosingInfo({
            month: targetMonth,
            currentMonth: reportForm.month,
            previousIncomingKg,
            previousOutgoingKg,
            totalClosingKg,
            currentIncomingKg,
            currentOutgoingKg,
            currentNetKg,
            currentMonthClosedStockKg,
            itemCount,
            loading: false,
            error: '',
          });
        }
      } catch (err) {
        if (!cancelled) {
          setPreviousMonthClosingInfo({
            month: targetMonth || '',
            currentMonth: reportForm.month,
            previousIncomingKg: 0,
            previousOutgoingKg: 0,
            totalClosingKg: 0,
            currentIncomingKg: 0,
            currentOutgoingKg: 0,
            currentNetKg: 0,
            currentMonthClosedStockKg: 0,
            itemCount: 0,
            loading: false,
            error: err?.message || 'Failed to load previous month closing.',
          });
          setLockPanelClosingKg(0);
        }
      }
    })();

    return () => { cancelled = true; };
  }, [reportForm.month, monthLockMonth, ledgerDataNonce, orders.length, sendOrders.length]);

  const clearFilters = () => setFilters({ date: '', center: '', name: '' });
  const clearSendFilters = () => setSendFilters({ date: '', center: '', name: '' });

  const filteredOrders = orders.filter(o => {
    const dateMatch = filters.date ? o.date === filters.date : true;
    const centerMatch = filters.center ? matchesSearchText(o.center, filters.center) : true;
    const nameMatch = filters.name ? matchesSearchText(o.senderName, filters.name) : true;
    return dateMatch && centerMatch && nameMatch;
  });

  const filteredSendOrders = sendOrders.filter(o => {
    const dateMatch = sendFilters.date ? o.date === sendFilters.date : true;
    const centerMatch = sendFilters.center ? matchesSearchText(o.fromCenter, sendFilters.center) : true;
    const nameMatch = sendFilters.name ? matchesSearchText(o.senderName, sendFilters.name) : true;
    return dateMatch && centerMatch && nameMatch;
  });

  const handleDownload = async (order) => {
    setPdfLoading(order.id);
    try {
      await saveBlobFromProducer(() => generatePDFBlobReliable(order), `${getSmartFileName(order)}.pdf`);
    } catch (err) { alert("Download Error: " + err.message); }
    setPdfLoading(null);
  };

  const handleShare = async (order) => {
    setPdfLoading(order.id);
    try {
      const blob = await generatePDFBlobReliable(order);
      const file = new File([blob], `${getSmartFileName(order)}.pdf`, { type: 'application/pdf' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: 'Request Stock Report', text: `Stock Request - ${order.center} #${order.chalanNo}` });
      } else {
        // Fallback: download the file instead
        await saveBlobFromProducer(() => Promise.resolve(blob), `${getSmartFileName(order)}.pdf`);
        alert("Share not supported on this device. File downloaded instead.");
      }
    } catch (err) { alert("Share Error: " + err.message); }
    setPdfLoading(null);
  };

  const openMailModal = (order, type) => {
    setMailModal({ order, type });
    const savedEmail = isValidEmail(order?.email) ? order.email.trim() : '';
    if (type === 'report') {
      const report = hydrateReport(order);
      const preferredEmail = savedEmail;
      if (REPORT_DEFAULT_EMAILS.includes(preferredEmail)) {
        setSelectedReportEmail(preferredEmail);
        setCustomEmail('');
      } else if (isValidEmail(preferredEmail)) {
        setSelectedReportEmail('custom');
        setCustomEmail(preferredEmail);
      } else {
        setSelectedReportEmail(REPORT_DEFAULT_EMAILS[0]);
        setCustomEmail('');
      }
    } else {
      const preferredEmail = savedEmail;
      setCustomEmail(preferredEmail);
      setSelectedReportEmail(REPORT_DEFAULT_EMAILS[0]);
    }
    setCustomEmailError('');
  };

  const closeMailModal = () => {
    setMailModal(null);
    setCustomEmail('');
    setCustomEmailError('');
    setMailSending(false);
    setSelectedReportEmail(REPORT_DEFAULT_EMAILS[0]);
    setSendMailLoading(null);
  };

  const handleMailSend = async () => {
    if (!mailModal) return;
    const { order, type } = mailModal;
    const emailToUse = type === 'report'
      ? (selectedReportEmail === 'custom' ? customEmail.trim() : selectedReportEmail)
      : customEmail.trim();

    if (!isValidEmail(emailToUse)) {
      setCustomEmailError('Please enter a valid email address.');
      return;
    }

    setMailSending(true);
    if (type === 'send') setSendMailLoading(order.id);
    try {
      const formattedDate = formatDisplayDate(order.date);
      if (type === 'request') {
        await sendEmailWithConfig(REQUEST_MAIL_CONFIG, {
          email: emailToUse,
          cc_email: DEFAULT_CC_EMAIL,
          bcc_email: DEFAULT_BCC_EMAIL,
          from_name: order.center,
          chalan_no: order.chalanNo,
          date: formattedDate,
          receiver: order.senderName || '',
          sender: order.senderName || '',
          global_id: order.globalId || '',
          pdf_link: buildPublicRecordLink('orderId', order.id),
        });
      } else if (type === 'send') {
        await sendEmailWithConfig(SEND_MAIL_CONFIG, {
          email: emailToUse,
          cc_email: DEFAULT_CC_EMAIL,
          bcc_email: DEFAULT_BCC_EMAIL,
          to_name: order.fromCenter,
          chalan_no: order.chalanNo,
          date: formattedDate,
          sender: order.senderName || '',
          receiver: order.senderName || '',
          global_id: order.globalId || '',
          order_id: order.chalanNo,
          pdf_link: buildPublicRecordLink('sendOrderId', order.id),
        });
      } else {
        const report = hydrateReport(order);
        await sendEmailWithConfig(REPORT_MAIL_CONFIG, {
          email: emailToUse,
          cc_email: DEFAULT_CC_EMAIL,
          bcc_email: DEFAULT_BCC_EMAIL,
          from_name: report.title,
          report_title: report.title,
          month: report.monthLabel,
          chalan_no: report.monthLabel,
          date: report.rangeLabel,
          range: report.rangeLabel,
          receiver: `Generated ${formatDisplayDate(report.generatedAtIso)}`,
          generated_on: formatDisplayDate(report.generatedAtIso),
          total_rows: formatMetric(report.summary.totalRows),
          total_stock: formatMetric(report.summary.totalStock),
          pdf_link: buildPublicRecordLink('reportId', report.id),
        });
        if (report.id) {
          await updateDoc(doc(db, "reports", report.id), { email: emailToUse });
          setReports(prev => prev.map(item => item.id === report.id ? { ...item, email: emailToUse } : item));
          setPreviewReport(prev => (prev && prev.id === report.id ? { ...prev, email: emailToUse } : prev));
        }
      }
      closeMailModal();
      alert('Email Sent! ✅');
    } catch (err) {
      alert('Mail Error: ' + err.message);
      setMailSending(false);
    }
  };

  const handleSendMail = (order) => openMailModal(order, 'request');
  const handleSendMailDispatch = (order) => openMailModal(order, 'send');
  const handleSendMailReport = (report) => openMailModal(report, 'report');

  const handleDelete = async (order) => {
    if (!window.confirm(`Delete order #${order.chalanNo} from ${order.center}?`)) return;
    try {
      await updateDoc(doc(db, "orders", order.id), { is_deleted: true });
      await setSourceTransactionsDeleted('order', order.id, true);
      setOrders(orders.filter(o => o.id !== order.id));
      bumpLedgerData();
    } catch (err) { alert("Delete Error: " + err.message); }
  };

  const handleDownloadSend = async (order) => {
    setSendPdfLoading(order.id);
    try {
      await saveBlobFromProducer(() => generateSendPDFBlobReliable(order), getSendFileName(order));
    } catch (err) { alert("Download Error: " + err.message); }
    setSendPdfLoading(null);
  };

  const handleShareSend = async (order) => {
    setSendPdfLoading(order.id);
    try {
      const blob = await generateSendPDFBlobReliable(order);
      const file = new File([blob], getSendFileName(order), { type: 'application/pdf' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: 'Send Stock Report', text: `Dispatch - ${order.fromCenter} #${order.chalanNo}` });
      } else {
        await saveBlobFromProducer(() => Promise.resolve(blob), getSendFileName(order));
        alert("Share not supported on this device. File downloaded instead.");
      }
    } catch (err) { alert("Share Error: " + err.message); }
    setSendPdfLoading(null);
  };

  const handleCreateReport = async () => {
    if (loading || sendLoading) {
      alert('Entries are still loading. Please wait.');
      return;
    }
    const isRangeMode = reportForm.reportPeriod === 'monthly' && reportForm.reportMode === 'range';
    if (!reportForm.month || !reportForm.selectedDate) {
      alert('Select month and selected date first.');
      return;
    }
    if (isRangeMode && (!reportForm.fromMonth || !reportForm.toMonth)) {
      alert('Select from month and to month first.');
      return;
    }
    if (isRangeMode && reportForm.fromMonth > reportForm.toMonth) {
      alert('From month cannot be after To month.');
      return;
    }
    const reportYear = reportForm.month.slice(0, 4);
    if (reportForm.reportPeriod === 'yearly') {
      if (!reportForm.selectedDate.startsWith(reportYear)) {
        alert('Selected date must fall in the chosen calendar year.');
        return;
      }
    } else if (!isRangeMode && !reportForm.selectedDate.startsWith(reportForm.month)) {
      alert('Selected date must be inside the selected month.');
      return;
    } else if (isRangeMode && reportForm.selectedDate < `${reportForm.fromMonth}-01`) {
      alert('Selected date must be inside selected month range.');
      return;
    }
    if (reportForm.scope === 'center' && !reportForm.center) {
      alert('Select center for centewise report.');
      return;
    }
    if (reportForm.scope === 'center' && reportForm.center === 'Other' && !reportForm.centerOther.trim()) {
      alert('Enter center name for centewise report.');
      return;
    }

    setReportGenerating(true);
    try {
      const effectiveCenter = getResolvedCenterValue(reportForm.center, reportForm.centerOther);
      const [stockTransactions, monthlySnapshot, snapshotSnapshot] = await Promise.all([
        syncStockHistoryFromPrimaryCollections(catalogItems),
        getDocs(collection(db, MONTHLY_CLOSING_STOCK_COLLECTION)),
        getDocs(collection(db, MONTHLY_STOCK_SNAPSHOTS_COLLECTION)),
      ]);
      const monthlyClosings = monthlySnapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
      const monthlyStockSnapshots = snapshotSnapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
      const closingSnapshots = buildMonthlyClosingSnapshots({
        stockTransactions,
        throughDate: reportForm.selectedDate,
      });
      await Promise.all(
        closingSnapshots.map((entry) =>
          setDoc(
            doc(db, MONTHLY_CLOSING_STOCK_COLLECTION, makeMonthlyClosingDocId(entry.month, entry.item_id)),
            {
              ...entry,
              monthValue: entry.month,
            },
            { merge: true },
          ),
        ),
      );

      const effectiveStockViewMode =
        reportForm.reportPeriod === 'monthly' && reportForm.reportMode === 'single'
          ? reportForm.stockViewMode
          : 'full_balance';

      // Always build from live ledger so backdated stock (past month) appears in the report.
      const draft = buildSummaryReport({
            orders,
            sendOrders,
            stockTransactions,
            monthlyClosingStock: monthlyClosings,
            month: reportForm.month,
            fromMonth: isRangeMode ? reportForm.fromMonth : reportForm.month,
            toMonth: isRangeMode ? reportForm.toMonth : reportForm.month,
            selectedDate: reportForm.selectedDate,
            createdBy: user?.username || 'Admin',
            scope: reportForm.scope,
            center: effectiveCenter,
            reportPeriod: reportForm.reportPeriod,
            stockViewMode: effectiveStockViewMode,
          });

      if (reportForm.reportPeriod === 'monthly' && reportForm.reportMode === 'single') {
        const { startDate, endDate } = getMonthBounds(reportForm.month);
        const monthTxRows = stockTransactions.filter((entry) => {
          const txDate = normalizeDateOnly(entry.transaction_date || entry.date || entry.created_at);
          return txDate >= startDate && txDate <= endDate && !entry?.is_deleted;
        });
        const rowMap = new Map();
        monthTxRows.forEach((entry) => {
          const key = normalizeItemName(entry.itemName || entry.item_id || '');
          if (!key) return;
          const prev = rowMap.get(key) || {
            item_id: key,
            item_name: (entry.itemName || entry.item_id || '').toString().trim(),
            total_inward: 0,
            total_outward: 0,
          };
          if ((entry.transaction_type || '').toString().toUpperCase() === 'OUT') {
            prev.total_outward = roundKg2(prev.total_outward + globalStockKg(entry.quantity));
          } else {
            prev.total_inward = roundKg2(prev.total_inward + globalStockKg(entry.quantity));
          }
          rowMap.set(key, prev);
        });

        await Promise.all(
          draft.rows.map((row) => {
            const itemKey = normalizeItemName(row.itemName);
            const monthAgg = rowMap.get(itemKey) || { total_inward: 0, total_outward: 0 };
            const periodIn = roundKg2(monthAgg.total_inward || 0);
            const periodOut = roundKg2(monthAgg.total_outward || 0);
            const closing = roundKg2(row.totalStock || 0);
            const openingBalance = effectiveStockViewMode === 'month_movements_only'
              ? roundKg2(closing - periodIn + periodOut)
              : roundKg2((parseFloat(row.income) || 0) - periodIn);
            return setDoc(
              doc(db, MONTHLY_STOCK_SNAPSHOTS_COLLECTION, makeStockSnapshotDocId(reportForm.month, itemKey, 'all')),
              {
                month: reportForm.month,
                year: reportForm.month.slice(0, 4),
                item_id: itemKey,
                item_name: row.itemName,
                opening_balance: openingBalance,
                total_inward: roundKg2(monthAgg.total_inward || 0),
                total_outward: roundKg2(monthAgg.total_outward || 0),
                closing_balance: roundKg2(row.totalStock || 0),
                is_locked: true,
                locked_at: new Date(),
                lock_source: 'manual_report_generation',
                updatedAt: new Date(),
              },
              { merge: true },
            );
          }),
        );
      }

      if (draft.rows.length === 0) {
        alert(`No entries found for ${draft.centerLabel}.`);
        setReportGenerating(false);
        return;
      }

      const unitByKey = new Map(
        catalogItems.map((c) => [c.nameKey, (c.unit || 'કિલો').toString().trim()]),
      );
      const rowsWithUnits = draft.rows.map((row) => ({
        ...row,
        displayUnit: unitByKey.get(normalizeItemName(row.itemName)) || 'કિલો',
      }));

      const payload = {
        ...draft,
        rows: rowsWithUnits,
        generatedAt: new Date(),
        generatedAtIso: new Date().toISOString(),
      };
      const docRef = await addDoc(collection(db, 'reports'), payload);
      const savedReport = hydrateReport({ id: docRef.id, ...payload });
      setReports(prev => [savedReport, ...prev]);
      setPreviewReport(savedReport);
      bumpLedgerData();
      alert('Monthly report created! ✅');
    } catch (err) {
      alert('Report Error: ' + err.message);
    }
    setReportGenerating(false);
  };

  const handleDownloadReport = async (report) => {
    setReportPdfLoading(report.id);
    try {
      const hydrated = hydrateReport(report);
      await saveBlobFromProducer(() => generateSummaryReportPDFBlob(hydrated, { catalogItems }), getReportFileName(hydrated));
    } catch (err) {
      alert('Download Error: ' + err.message);
    }
    setReportPdfLoading(null);
  };

  const handleShareReport = async (report) => {
    setReportPdfLoading(report.id);
    try {
      const hydrated = hydrateReport(report);
      const blob = await generateSummaryReportPDFBlob(hydrated, { catalogItems });
      const file = new File([blob], getReportFileName(hydrated), { type: 'application/pdf' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: hydrated.title,
          text: `${hydrated.title} - ${hydrated.monthLabel}`,
        });
      } else {
        await saveBlobFromProducer(() => Promise.resolve(blob), getReportFileName(hydrated));
        alert("Share not supported on this device. File downloaded instead.");
      }
    } catch (err) {
      alert('Share Error: ' + err.message);
    }
    setReportPdfLoading(null);
  };

  const handleDeleteReport = async (report) => {
    const hydrated = hydrateReport(report);
    if (!hydrated.id) return;
    if (!window.confirm(`Delete report for ${hydrated.monthLabel} (${hydrated.rangeLabel})?`)) return;

    setReportDeleting(hydrated.id);
    try {
      await deleteDoc(doc(db, 'reports', hydrated.id));
      setReports(prev => prev.filter(item => item.id !== hydrated.id));
      setPreviewReport(prev => (prev && prev.id === hydrated.id ? null : prev));
    } catch (err) {
      alert('Delete Error: ' + err.message);
    }
    setReportDeleting(null);
  };

  const handleDeleteSend = async (order) => {
    if (!window.confirm(`Delete send chalan #${order.chalanNo} from ${order.fromCenter}?`)) return;
    try {
      await updateDoc(doc(db, "send-orders", order.id), { is_deleted: true });
      await setSourceTransactionsDeleted('send', order.id, true);
      setSendOrders(sendOrders.filter(o => o.id !== order.id));
      bumpLedgerData();
    } catch (err) { alert("Delete Error: " + err.message); }
  };

  const handleMigrateClosingSnapshots = async () => {
    if (closingMigrationLoading) return;
    setClosingMigrationLoading(true);
    try {
      const result = await migrateMonthlyClosingDocIdsToSafeFormat();
      alert(
        `Monthly closing migration done ✅\nMigrated: ${result.migratedCount}\nSkipped: ${result.skippedCount}\nTotal scanned: ${result.totalDocs}`,
      );
    } catch (err) {
      alert(`Migration Error: ${err.message}`);
    }
    setClosingMigrationLoading(false);
  };

  if (editOrder) {
    return (
      <EditOrderScreen
        key={editOrder.id}
        order={editOrder}
        onBack={() => { setEditOrder(null); fetchOrders(); }}
        catalogItems={catalogItems}
        centersList={centersList}
      />
    );
  }
  if (editSendOrder) {
    return (
      <EditSendOrderScreen
        key={editSendOrder.id}
        order={editSendOrder}
        onBack={() => { setEditSendOrder(null); fetchSendOrders(); }}
        catalogItems={catalogItems}
        centersList={centersList}
      />
    );
  }

  const isRequests = activeTab === 'requests';
  const isSends = activeTab === 'sends';
  const isReports = activeTab === 'reports';
  const isPurchases = activeTab === 'purchases';
  const isItems = activeTab === 'items';
  const pdfOverlayKind = reportPdfLoading ? 'report' : sendPdfLoading ? 'send' : pdfLoading ? 'request' : null;
  const pdfOverlayActive = pdfOverlayKind !== null;

  return (
    <>
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="p-3 sm:p-6 max-w-7xl mx-auto pb-20"
    >
      {/* Tab Switcher */}
      <div className="grid grid-cols-1 gap-2 mb-6 sm:grid-cols-2 lg:grid-cols-6">
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={() => setActiveTab('requests')}
          className={`py-3 rounded-2xl font-bold text-sm uppercase tracking-wide flex items-center justify-center gap-2 transition-all border lg:col-span-2 ${isRequests ? 'bg-gradient-to-r from-orange-500 to-orange-600 text-white border-transparent shadow-lg shadow-orange-500/20' : 'bg-[#1e1e1e] text-gray-400 border-white/10 hover:border-orange-500/30'}`}
        >
          <ShoppingCart size={16} /> કોઠારમાંથી વસ્તુ મંગાવેલ હોય
          <span className={`text-[10px] px-2 py-0.5 rounded-full font-black ${isRequests ? 'bg-white/20' : 'bg-white/10'}`}>{orders.length}</span>
        </motion.button>
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={() => setActiveTab('sends')}
          className={`py-3 rounded-2xl font-bold text-sm uppercase tracking-wide flex items-center justify-center gap-2 transition-all border lg:col-span-2 ${isSends ? 'bg-gradient-to-r from-blue-500 to-blue-600 text-white border-transparent shadow-lg shadow-blue-500/20' : 'bg-[#1e1e1e] text-gray-400 border-white/10 hover:border-blue-500/30'}`}
        >
          <Send size={16} /> વસ્તુ મોકલેલ હોય
          <span className={`text-[10px] px-2 py-0.5 rounded-full font-black ${isSends ? 'bg-white/20' : 'bg-white/10'}`}>{sendOrders.length}</span>
        </motion.button>
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={() => setActiveTab('reports')}
          className={`py-3 rounded-2xl font-bold text-sm uppercase tracking-wide flex items-center justify-center gap-2 transition-all border lg:col-span-2 ${isReports ? 'bg-gradient-to-r from-emerald-500 to-emerald-600 text-white border-transparent shadow-lg shadow-emerald-500/20' : 'bg-[#1e1e1e] text-gray-400 border-white/10 hover:border-emerald-500/30'}`}
        >
          <FileText size={16} /> Reports
          <span className={`text-[10px] px-2 py-0.5 rounded-full font-black ${isReports ? 'bg-white/20' : 'bg-white/10'}`}>{reports.length}</span>
        </motion.button>
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={() => setActiveTab('purchases')}
          className={`py-3 rounded-2xl font-bold text-sm uppercase tracking-wide flex items-center justify-center gap-2 transition-all border lg:col-span-3 ${isPurchases ? 'bg-gradient-to-r from-violet-500 to-fuchsia-600 text-white border-transparent shadow-lg shadow-violet-500/20' : 'bg-[#1e1e1e] text-gray-400 border-white/10 hover:border-violet-500/30'}`}
        >
          <Box size={16} /> Purchases
        </motion.button>
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={() => setActiveTab('items')}
          className={`py-3 rounded-2xl font-bold text-sm uppercase tracking-wide flex items-center justify-center gap-2 transition-all border lg:col-span-3 ${isItems ? 'bg-gradient-to-r from-amber-500 to-yellow-600 text-white border-transparent shadow-lg shadow-amber-500/20' : 'bg-[#1e1e1e] text-gray-400 border-white/10 hover:border-amber-500/30'}`}
        >
          <Package size={16} /> Items
          <span className={`text-[10px] px-2 py-0.5 rounded-full font-black ${isItems ? 'bg-white/20' : 'bg-white/10'}`}>{catalogItems.length}</span>
        </motion.button>
      </div>

      {/* ===== REQUEST ENTRIES SECTION ===== */}
      {isRequests && (
        <>
          {/* Filter Section */}
          <motion.div
            initial={{ y: -20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="bg-gradient-to-b from-[#1e1e1e] to-[#181818] p-4 sm:p-6 rounded-2xl sm:rounded-3xl border border-white/5 mb-6 sm:mb-8 shadow-xl"
          >
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4">
              <div className="flex items-center gap-2 text-orange-500 font-bold uppercase text-xs tracking-widest">
                <Search size={16} /> Filters
              </div>
              <div className="flex items-center gap-2 sm:gap-3 w-full sm:w-auto">
                <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={fetchOrders}
                  className="flex-1 sm:flex-none text-gray-400 hover:text-orange-500 flex items-center justify-center gap-1.5 text-xs font-bold uppercase transition-all bg-white/5 hover:bg-orange-500/10 px-3 py-2 rounded-xl border border-white/10">
                  <RefreshCw size={14} /> Refresh
                </motion.button>
                <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={clearFilters}
                  className="flex-1 sm:flex-none text-gray-400 hover:text-white flex items-center justify-center gap-1.5 text-xs font-bold uppercase transition-all bg-white/5 hover:bg-white/10 px-3 py-2 rounded-xl border border-white/10">
                  <Eraser size={14} /> Clear
                </motion.button>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
              <div className="relative group">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 group-focus-within:text-orange-500 transition-colors" size={18} />
                <input type="date" className="w-full p-3 pl-10 bg-[#252525] border border-white/10 rounded-xl text-white outline-none focus:border-orange-500/50 transition-all text-sm"
                  value={filters.date} onChange={e => setFilters({...filters, date: e.target.value})} />
              </div>
              <div className="relative group">
                <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 group-focus-within:text-orange-500 transition-colors" size={18} />
                <input placeholder="Center Name..." className="w-full p-3 pl-10 bg-[#252525] border border-white/10 rounded-xl text-white outline-none focus:border-orange-500/50 transition-all text-sm placeholder-gray-500"
                  value={filters.center} onChange={e => setFilters({...filters, center: e.target.value})} />
              </div>
              <div className="relative group">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 group-focus-within:text-orange-500 transition-colors" size={18} />
                <input placeholder="Requester Name..." className="w-full p-3 pl-10 bg-[#252525] border border-white/10 rounded-xl text-white outline-none focus:border-orange-500/50 transition-all text-sm placeholder-gray-500"
                  value={filters.name} onChange={e => setFilters({...filters, name: e.target.value})} />
              </div>
            </div>
          </motion.div>

          {loading && (
            <div className="flex justify-center py-20">
              <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }}>
                <Loader2 size={48} className="text-orange-500" />
              </motion.div>
            </div>
          )}

          {!loading && (
            <motion.div variants={staggerContainer} initial="initial" animate="animate"
              className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-6">
              <AnimatePresence>
                {filteredOrders.map((order, index) => (
                  <motion.div key={order.id} variants={fadeInUp} initial="initial" animate="animate" exit="exit"
                    transition={{ delay: index * 0.05 }} whileHover={{ y: -5, transition: { duration: 0.2 } }}
                    className="bg-gradient-to-b from-[#1e1e1e] to-[#181818] rounded-2xl sm:rounded-3xl border border-white/5 shadow-xl overflow-hidden hover:border-orange-500/30 transition-colors group">
                    <div className="p-4 sm:p-5 border-b border-white/5 bg-gradient-to-r from-[#252525] to-[#1e1e1e]">
                      <div className="flex justify-between items-start gap-2">
                        <div className="min-w-0 flex-1">
                          <h3 className="font-bold text-white uppercase text-sm sm:text-base group-hover:text-orange-400 transition-colors">{order.center}</h3>
                          <span className="text-xs text-orange-500 font-bold">#CHALAN: {order.chalanNo}</span>
                          {shouldShowNonListedCenterBadge(order.center, centersList, order.centerFromOther) && <NonListedCenterBadge />}
                        </div>
                        <div className="shrink-0 text-xs text-gray-500 font-medium bg-white/5 px-2 py-1 rounded-lg">{order.date.split('-').reverse().join('-')}</div>
                      </div>
                    </div>
                    <div className="p-4 sm:p-5">
                      <div className="grid grid-cols-2 gap-2 mb-4">
                        <div className="bg-[#252525] p-2 sm:p-3 rounded-xl border border-white/5 text-center">
                          <p className="text-[10px] text-gray-500 uppercase font-bold">Items</p>
                          <p className="font-black text-white text-sm sm:text-base">{order.items.length}</p>
                        </div>
                        <div className="bg-gradient-to-br from-orange-500/10 to-orange-600/5 p-2 sm:p-3 rounded-xl border border-orange-500/20 text-center">
                          <p className="text-[10px] text-orange-400 uppercase font-bold">Total KG</p>
                          <p className="font-black text-orange-400 text-sm sm:text-base">{formatMetric(calculateTotals(order.items).totalKg)}</p>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={() => setPreviewOrder(order)}
                          className="bg-[#252525] hover:bg-[#2d2d2d] text-white p-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all border border-white/5">
                          <Eye size={14} /> Preview
                        </motion.button>
                        <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={() => setEditOrder(order)}
                          className="bg-[#252525] hover:bg-[#2d2d2d] text-white p-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all border border-white/5">
                          <Edit3 size={14} /> Edit
                        </motion.button>
                        <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} disabled={pdfLoading === order.id} onClick={() => handleShare(order)}
                          className="bg-[#252525] hover:bg-[#2d2d2d] text-white p-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all border border-white/5 disabled:opacity-50">
                          {pdfLoading === order.id ? <Loader2 size={14} className="animate-spin" /> : <Share2 size={14} />} Share
                        </motion.button>
                        <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={() => handleSendMail(order)}
                          className="bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 p-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all border border-blue-500/20">
                          <Send size={14} /> Mail
                        </motion.button>
                        <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} disabled={pdfLoading === order.id} onClick={() => handleDownload(order)}
                          className="bg-gradient-to-r from-orange-500 to-orange-600 text-white p-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all shadow-lg shadow-orange-500/20 disabled:opacity-50">
                          {pdfLoading === order.id ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />} Download
                        </motion.button>
                        <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={() => handleDelete(order)}
                          className="bg-red-500/10 hover:bg-red-500/20 text-red-400 p-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all border border-red-500/20">
                          <Trash2 size={14} /> Delete
                        </motion.button>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </motion.div>
          )}

          {!loading && filteredOrders.length === 0 && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center py-20">
              <Package size={64} className="text-gray-600 mx-auto mb-4" />
              <p className="text-gray-500 text-lg">No request entries found</p>
            </motion.div>
          )}
        </>
      )}

      {/* ===== SEND ENTRIES SECTION ===== */}
      {isSends && (
        <>
          {/* Send Filter Section */}
          <motion.div
            initial={{ y: -20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="bg-gradient-to-b from-[#1e1e1e] to-[#181818] p-4 sm:p-6 rounded-2xl sm:rounded-3xl border border-white/5 mb-6 sm:mb-8 shadow-xl"
          >
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4">
              <div className="flex items-center gap-2 text-blue-500 font-bold uppercase text-xs tracking-widest">
                <Search size={16} /> Filters
              </div>
              <div className="flex items-center gap-2 sm:gap-3 w-full sm:w-auto">
                <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={fetchSendOrders}
                  className="flex-1 sm:flex-none text-gray-400 hover:text-blue-500 flex items-center justify-center gap-1.5 text-xs font-bold uppercase transition-all bg-white/5 hover:bg-blue-500/10 px-3 py-2 rounded-xl border border-white/10">
                  <RefreshCw size={14} /> Refresh
                </motion.button>
                <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={clearSendFilters}
                  className="flex-1 sm:flex-none text-gray-400 hover:text-white flex items-center justify-center gap-1.5 text-xs font-bold uppercase transition-all bg-white/5 hover:bg-white/10 px-3 py-2 rounded-xl border border-white/10">
                  <Eraser size={14} /> Clear
                </motion.button>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
              <div className="relative group">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 group-focus-within:text-blue-500 transition-colors" size={18} />
                <input type="date" className="w-full p-3 pl-10 bg-[#252525] border border-white/10 rounded-xl text-white outline-none focus:border-blue-500/50 transition-all text-sm"
                  value={sendFilters.date} onChange={e => setSendFilters({...sendFilters, date: e.target.value})} />
              </div>
              <div className="relative group">
                <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 group-focus-within:text-blue-500 transition-colors" size={18} />
                <input placeholder="From Center..." className="w-full p-3 pl-10 bg-[#252525] border border-white/10 rounded-xl text-white outline-none focus:border-blue-500/50 transition-all text-sm placeholder-gray-500"
                  value={sendFilters.center} onChange={e => setSendFilters({...sendFilters, center: e.target.value})} />
              </div>
              <div className="relative group">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 group-focus-within:text-blue-500 transition-colors" size={18} />
                <input placeholder="Sender Name..." className="w-full p-3 pl-10 bg-[#252525] border border-white/10 rounded-xl text-white outline-none focus:border-blue-500/50 transition-all text-sm placeholder-gray-500"
                  value={sendFilters.name} onChange={e => setSendFilters({...sendFilters, name: e.target.value})} />
              </div>
            </div>
          </motion.div>

          {sendLoading && (
            <div className="flex justify-center py-20">
              <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }}>
                <Loader2 size={48} className="text-blue-500" />
              </motion.div>
            </div>
          )}

          {!sendLoading && (
            <motion.div variants={staggerContainer} initial="initial" animate="animate"
              className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-6">
              <AnimatePresence>
                {filteredSendOrders.map((order, index) => {
                  const filledItems = (order.items || []).filter(r => r.itemName && r.itemName.trim());
                  const totalKg = roundKg2(filledItems.reduce((sum, r) => sum + (parseFloat(r.kg) || 0), 0));
                  return (
                    <motion.div key={order.id} variants={fadeInUp} initial="initial" animate="animate" exit="exit"
                      transition={{ delay: index * 0.05 }} whileHover={{ y: -5, transition: { duration: 0.2 } }}
                      className="bg-gradient-to-b from-[#1e1e1e] to-[#181818] rounded-2xl sm:rounded-3xl border border-white/5 shadow-xl overflow-hidden hover:border-blue-500/30 transition-colors group">
                      <div className="p-4 sm:p-5 border-b border-white/5 bg-gradient-to-r from-[#252525] to-[#1e1e1e]">
                        <div className="flex justify-between items-start gap-2">
                          <div className="min-w-0 flex-1">
                            <h3 className="font-bold text-white uppercase text-sm sm:text-base group-hover:text-blue-400 transition-colors">{order.fromCenter}</h3>
                            <span className="text-xs text-blue-500 font-bold">#CHALAN: {order.chalanNo}</span>
                            {shouldShowNonListedCenterBadge(order.fromCenter, centersList, order.fromCenterFromOther) && <NonListedCenterBadge />}
                          </div>
                          <div className="shrink-0 text-xs text-gray-500 font-medium bg-white/5 px-2 py-1 rounded-lg">{(order.date || '').split('-').reverse().join('-')}</div>
                        </div>
                      </div>
                      <div className="p-4 sm:p-5">
                        <div className="grid grid-cols-2 gap-2 mb-4">
                          <div className="bg-[#252525] p-2 sm:p-3 rounded-xl border border-white/5 text-center">
                            <p className="text-[10px] text-gray-500 uppercase font-bold">Items</p>
                            <p className="font-black text-white text-sm sm:text-base">{filledItems.length}</p>
                          </div>
                          <div className="bg-gradient-to-br from-blue-500/10 to-blue-600/5 p-2 sm:p-3 rounded-xl border border-blue-500/20 text-center">
                            <p className="text-[10px] text-blue-400 uppercase font-bold">Total KG</p>
                            <p className="font-black text-blue-400 text-sm sm:text-base">{formatMetric(totalKg)}</p>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={() => setPreviewSendOrder(order)}
                            className="bg-[#252525] hover:bg-[#2d2d2d] text-white p-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all border border-white/5">
                            <Eye size={14} /> Preview
                          </motion.button>
                          <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={() => setEditSendOrder(order)}
                            className="bg-[#252525] hover:bg-[#2d2d2d] text-white p-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all border border-white/5">
                            <Edit3 size={14} /> Edit
                          </motion.button>
                          <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} disabled={sendPdfLoading === order.id} onClick={() => handleShareSend(order)}
                            className="bg-[#252525] hover:bg-[#2d2d2d] text-white p-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all border border-white/5 disabled:opacity-50">
                            {sendPdfLoading === order.id ? <Loader2 size={14} className="animate-spin" /> : <Share2 size={14} />} Share
                          </motion.button>
                          <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} disabled={sendMailLoading === order.id} onClick={() => handleSendMailDispatch(order)}
                            className="bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 p-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all border border-blue-500/20 disabled:opacity-50">
                            {sendMailLoading === order.id ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Mail
                          </motion.button>
                          <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} disabled={sendPdfLoading === order.id} onClick={() => handleDownloadSend(order)}
                            className="bg-gradient-to-r from-blue-500 to-blue-600 text-white p-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all shadow-lg shadow-blue-500/20 disabled:opacity-50 col-span-2">
                            {sendPdfLoading === order.id ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />} Download
                          </motion.button>
                          <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={() => handleDeleteSend(order)}
                            className="bg-red-500/10 hover:bg-red-500/20 text-red-400 p-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all border border-red-500/20 col-span-2">
                            <Trash2 size={14} /> Delete
                          </motion.button>
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </motion.div>
          )}

          {!sendLoading && filteredSendOrders.length === 0 && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center py-20">
              <Send size={64} className="text-gray-600 mx-auto mb-4" />
              <p className="text-gray-500 text-lg">No send entries found</p>
            </motion.div>
          )}
        </>
      )}

      {isReports && (
        <>
          <motion.div
            initial={{ y: -20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="bg-gradient-to-b from-[#1e1e1e] to-[#181818] p-4 sm:p-6 rounded-2xl sm:rounded-3xl border border-white/5 mb-6 sm:mb-8 shadow-xl"
          >
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <div className="flex items-center gap-2 text-emerald-400 font-bold uppercase text-xs tracking-widest">
                  <FileText size={16} /> Monthly Reports
                </div>
                <h2 className="mt-2 text-xl sm:text-2xl font-black text-white">Create fixed monthly stock report</h2>
                <p className="mt-2 text-sm text-gray-400 max-w-2xl">
                  One monthly table per run. Income column = opening mug (all entries before period start globally) plus period sends (filtered) plus shop/khothar-stock purchases in the chosen date range—so May ભરતી Aprilનો રિપોર્ટ બનાવો તો પણ ફક્ત April તારીખની ટ્રાન્ઝેક્શન દેખાશે. Outgoing = requests filtered by centre.
                </p>
              </div>
              <div className="flex gap-2 sm:gap-3">
                <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={fetchReports}
                  className="text-gray-400 hover:text-emerald-400 flex items-center justify-center gap-1.5 text-xs font-bold uppercase transition-all bg-white/5 hover:bg-emerald-500/10 px-3 py-2 rounded-xl border border-white/10">
                  <RefreshCw size={14} /> Refresh
                </motion.button>
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={handleMigrateClosingSnapshots}
                  disabled={closingMigrationLoading}
                  title="monthly-closing-stock દરેક document નું ID month+item મુજબ safe format માં લાવે છે. જુના / ખોટા ID હોય તો એક વાર ચલાવો; નવા ડેટા પર જરૂર નથી."
                  className="text-gray-400 hover:text-blue-300 disabled:opacity-50 flex items-center justify-center gap-1.5 text-xs font-bold uppercase transition-all bg-white/5 hover:bg-blue-500/10 px-3 py-2 rounded-xl border border-white/10"
                >
                  {closingMigrationLoading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                  Fix Closing IDs
                </motion.button>
                <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={() => setReportForm(createDefaultReportForm())}
                  className="text-gray-400 hover:text-white flex items-center justify-center gap-1.5 text-xs font-bold uppercase transition-all bg-white/5 hover:bg-white/10 px-3 py-2 rounded-xl border border-white/10">
                  <Eraser size={14} /> Clear
                </motion.button>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 mt-6">
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-widest text-gray-500 mb-2">Report Scope</label>
                <select
                  className="w-full p-3 bg-[#252525] border border-white/10 rounded-xl text-white outline-none focus:border-emerald-500/50 transition-all text-sm"
                  value={reportForm.scope}
                  onChange={e => setReportForm(prev => ({ ...prev, scope: e.target.value, center: '', centerOther: '' }))}
                >
                  <option value="all">All Centers / Full Report</option>
                  <option value="center">Centewise</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase tracking-widest text-gray-500 mb-2">Report period</label>
                <select
                  className="w-full p-3 bg-[#252525] border border-white/10 rounded-xl text-white outline-none focus:border-emerald-500/50 transition-all text-sm"
                  value={reportForm.reportPeriod}
                  onChange={(e) => {
                    const next = e.target.value;
                    setReportForm((prev) => ({
                      ...prev,
                      reportPeriod: next,
                      reportMode: next === 'yearly' ? 'single' : prev.reportMode,
                      selectedDate:
                        next === 'yearly'
                          ? getDateWithinYear(prev.month, prev.selectedDate)
                          : getDateWithinMonth(prev.month, prev.selectedDate),
                    }));
                  }}
                >
                  <option value="monthly">Monthly (within selected month)</option>
                  <option value="yearly">Yearly (Jan 1 through selected date)</option>
                </select>
              </div>

              {reportForm.reportPeriod === 'monthly' && (
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-widest text-gray-500 mb-2">Monthly Mode</label>
                  <select
                    className="w-full p-3 bg-[#252525] border border-white/10 rounded-xl text-white outline-none focus:border-emerald-500/50 transition-all text-sm"
                    value={reportForm.reportMode}
                    onChange={(e) => {
                      const nextMode = e.target.value;
                      setReportForm((prev) => ({
                        ...prev,
                        reportMode: nextMode,
                        fromMonth: nextMode === 'range' ? (prev.fromMonth || prev.month) : prev.month,
                        toMonth: nextMode === 'range' ? (prev.toMonth || prev.month) : prev.month,
                        stockViewMode:
                          nextMode === 'single'
                            ? resolveReportStockViewMode(prev.month)
                            : 'full_balance',
                        selectedDate:
                          nextMode === 'range'
                            ? getLastDateForMonth(prev.toMonth || prev.month)
                            : getDateWithinMonth(prev.month, prev.selectedDate),
                      }));
                    }}
                  >
                    <option value="single">Single month</option>
                    <option value="range">Multiple months range</option>
                  </select>
                </div>
              )}

              {reportForm.reportPeriod === 'monthly' && reportForm.reportMode === 'single' && (
              <div className="sm:col-span-2 lg:col-span-4">
                <label className="block text-[11px] font-bold uppercase tracking-widest text-gray-500 mb-2">
                  Stock columns (Income)
                </label>
                <p className="mb-2 text-[11px] text-violet-200/90">
                  ડિફોલ્ટ ઓટો: {isCurrentCalendarMonth(reportForm.month) ? 'ચાલુ મહિનો → Month IN only' : 'ગયા મહિનો → Full balance'} — નીચેથી બદલી શકાય.
                </p>
                <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                  <label className="flex cursor-pointer items-start gap-2 rounded-xl border border-white/10 bg-[#252525] px-3 py-2.5 text-sm text-white hover:border-emerald-500/40 sm:flex-1 sm:min-w-[200px]">
                    <input
                      type="radio"
                      name="stockViewMode"
                      className="mt-1"
                      checked={reportForm.stockViewMode === 'full_balance'}
                      onChange={() => setReportForm((prev) => ({ ...prev, stockViewMode: 'full_balance' }))}
                    />
                    <span>
                      <span className="font-bold">Full balance</span>
                      <span className="mt-0.5 block text-[11px] font-normal text-gray-400">
                        Income = ખુલ્લી + પિરિયડ IN; Total Stock = પૂર્ણ સ્ટોક (ગયા મહિના માટે)
                      </span>
                    </span>
                  </label>
                  <label className="flex cursor-pointer items-start gap-2 rounded-xl border border-white/10 bg-[#252525] px-3 py-2.5 text-sm text-white hover:border-emerald-500/40 sm:flex-1 sm:min-w-[200px]">
                    <input
                      type="radio"
                      name="stockViewMode"
                      className="mt-1"
                      checked={reportForm.stockViewMode === 'month_movements_only'}
                      onChange={() => setReportForm((prev) => ({ ...prev, stockViewMode: 'month_movements_only' }))}
                    />
                    <span>
                      <span className="font-bold">Month IN only</span>
                      <span className="mt-0.5 block text-[11px] font-normal text-gray-400">
                        Income = ફક્ત IN; Net Stock = IN − OUT (ગયા મહિનાનું closing નહીં)
                      </span>
                    </span>
                  </label>
                </div>
              </div>
              )}

              {reportForm.scope === 'center' && (
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-widest text-gray-500 mb-2">Center</label>
                  <select
                    className="w-full p-3 bg-[#252525] border border-white/10 rounded-xl text-white outline-none focus:border-emerald-500/50 transition-all text-sm"
                    value={reportForm.center}
                    onChange={e => setReportForm(prev => ({ ...prev, center: e.target.value, centerOther: e.target.value === 'Other' ? prev.centerOther : '' }))}
                  >
                    <option value="">- Center Select Karo -</option>
                    {centersList.map((center) => (
                      <option key={center.center} value={center.center}>{center.center}</option>
                    ))}
                  </select>
                </div>
              )}

              {reportForm.scope === 'center' && reportForm.center === 'Other' && (
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-widest text-gray-500 mb-2">Center Name</label>
                  <input
                    className="w-full p-3 bg-[#252525] border border-white/10 rounded-xl text-white outline-none focus:border-emerald-500/50 transition-all text-sm"
                    placeholder="Center name..."
                    value={reportForm.centerOther}
                    onChange={e => setReportForm(prev => ({ ...prev, centerOther: e.target.value }))}
                  />
                </div>
              )}

              <div>
                <label className="block text-[11px] font-bold uppercase tracking-widest text-gray-500 mb-2">
                  {reportForm.reportPeriod === 'monthly' && reportForm.reportMode === 'range' ? 'Anchor Month' : 'Month'}
                </label>
                <input
                  type="month"
                  className="w-full p-3 bg-[#252525] border border-white/10 rounded-xl text-white outline-none focus:border-emerald-500/50 transition-all text-sm"
                  value={reportForm.month}
                  onChange={e => setReportForm((prev) => patchReportFormMonth(prev, e.target.value))}
                />
              </div>

              {reportForm.reportPeriod === 'monthly' && reportForm.reportMode === 'range' && (
                <>
                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-widest text-gray-500 mb-2">From Month</label>
                    <input
                      type="month"
                      className="w-full p-3 bg-[#252525] border border-white/10 rounded-xl text-white outline-none focus:border-emerald-500/50 transition-all text-sm"
                      value={reportForm.fromMonth}
                      onChange={e => setReportForm(prev => ({ ...prev, fromMonth: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-widest text-gray-500 mb-2">To Month</label>
                    <input
                      type="month"
                      min={reportForm.fromMonth}
                      className="w-full p-3 bg-[#252525] border border-white/10 rounded-xl text-white outline-none focus:border-emerald-500/50 transition-all text-sm"
                      value={reportForm.toMonth}
                      onChange={e => setReportForm(prev => ({
                        ...prev,
                        toMonth: e.target.value,
                        selectedDate: getLastDateForMonth(e.target.value),
                      }))}
                    />
                  </div>
                </>
              )}

              <div>
                <label className="block text-[11px] font-bold uppercase tracking-widest text-gray-500 mb-2">Selected Date</label>
                <input
                  type="date"
                  min={
                    reportForm.reportPeriod === 'yearly'
                      ? `${reportForm.month.slice(0, 4)}-01-01`
                      : (reportForm.reportMode === 'range' ? `${reportForm.fromMonth}-01` : `${reportForm.month}-01`)
                  }
                  max={
                    reportForm.reportPeriod === 'yearly'
                      ? getLastDateForCalendarYear(reportForm.month)
                      : (reportForm.reportMode === 'range' ? getLastDateForMonth(reportForm.toMonth) : getLastDateForMonth(reportForm.month))
                  }
                  className="w-full p-3 bg-[#252525] border border-white/10 rounded-xl text-white outline-none focus:border-emerald-500/50 transition-all text-sm"
                  value={reportForm.selectedDate}
                  onChange={e => setReportForm(prev => ({ ...prev, selectedDate: e.target.value }))}
                />
              </div>
            </div>

            <div className="mt-4 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-4">
              <p className="text-[11px] font-bold uppercase tracking-widest text-emerald-300">Dynamic range</p>
              <p className="mt-2 text-lg font-black text-white">
                {reportForm.reportPeriod === 'monthly' && reportForm.reportMode === 'range'
                  ? `From ${formatDisplayDate(`${reportForm.fromMonth}-01`)} to ${formatDisplayDate(reportForm.selectedDate)}`
                  : getRangeLabel(reportForm.selectedDate, reportForm.month, reportForm.reportPeriod)}
              </p>
              <p className="mt-2 text-sm font-bold text-emerald-100">{getCenterScopeLabel(reportForm.scope, getResolvedCenterValue(reportForm.center, reportForm.centerOther))}</p>
              <p className="mt-2 text-xs text-emerald-100/70">
                PDF title switches between Monthly Report and Yearly Report automatically from this setting. Preview, PDF, share, and mail all use the same range.
              </p>
            </div>

            {reportForm.reportPeriod === 'monthly' && reportForm.reportMode === 'single' && (
            <div className="mt-3 rounded-2xl border border-blue-500/20 bg-blue-500/10 p-4">
              <p className="text-[11px] font-bold uppercase tracking-widest text-blue-300">Month summary (ledger)</p>
              {previousMonthClosingInfo.error && (
                <p className="mt-2 text-xs text-red-300">{previousMonthClosingInfo.error}</p>
              )}

              {/* Previous month — month name + 3 boxes */}
              <div className="mt-3">
                <p className="text-center text-sm font-black text-white">
                  {previousMonthClosingInfo.month ? formatMonthLabel(previousMonthClosingInfo.month) : '-'}
                </p>
                <div className="mt-2 grid grid-cols-3 gap-2">
                  <div className="rounded-xl border border-white/10 bg-[#252525]/90 p-3 text-center">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Income</p>
                    <p className="mt-1 text-base font-black text-emerald-300 sm:text-lg">
                      {previousMonthClosingInfo.loading ? '…' : `${formatMetric(previousMonthClosingInfo.previousIncomingKg)}`}
                    </p>
                    <p className="text-[10px] text-gray-500">KG</p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-[#252525]/90 p-3 text-center">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Outgoing</p>
                    <p className="mt-1 text-base font-black text-orange-300 sm:text-lg">
                      {previousMonthClosingInfo.loading ? '…' : `${formatMetric(previousMonthClosingInfo.previousOutgoingKg)}`}
                    </p>
                    <p className="text-[10px] text-gray-500">KG</p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-[#252525]/90 p-3 text-center">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Stock closed</p>
                    <p className="mt-1 text-base font-black text-white sm:text-lg">
                      {previousMonthClosingInfo.loading ? '…' : `${formatMetric(previousMonthClosingInfo.totalClosingKg)}`}
                    </p>
                    <p className="text-[10px] text-gray-500">KG</p>
                  </div>
                </div>
              </div>

              {/* Current report month — same 3 boxes; stock closed blank until locked */}
              <div className="mt-5 border-t border-blue-500/20 pt-4">
                <p className="text-center text-sm font-black text-white">
                  {previousMonthClosingInfo.currentMonth ? formatMonthLabel(previousMonthClosingInfo.currentMonth) : '-'}
                </p>
                <div className="mt-2 grid grid-cols-3 gap-2">
                  <div className="rounded-xl border border-white/10 bg-[#252525]/90 p-3 text-center">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Income</p>
                    <p className="mt-1 text-base font-black text-emerald-300 sm:text-lg">
                      {previousMonthClosingInfo.loading ? '…' : `${formatMetric(previousMonthClosingInfo.currentIncomingKg)}`}
                    </p>
                    <p className="text-[10px] text-gray-500">KG</p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-[#252525]/90 p-3 text-center">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Outgoing</p>
                    <p className="mt-1 text-base font-black text-orange-300 sm:text-lg">
                      {previousMonthClosingInfo.loading ? '…' : `${formatMetric(previousMonthClosingInfo.currentOutgoingKg)}`}
                    </p>
                    <p className="text-[10px] text-gray-500">KG</p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-[#252525]/90 p-3 text-center">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Stock closed</p>
                    <p className="mt-1 text-base font-black text-white sm:text-lg">
                      {previousMonthClosingInfo.loading
                        ? '…'
                        : (reportMonthLock.is_locked ? formatMetric(previousMonthClosingInfo.currentMonthClosedStockKg) : '—')}
                    </p>
                    <p className="text-[10px] text-gray-500">KG</p>
                  </div>
                </div>
              </div>
            </div>
            )}

            <div className="mt-3 rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4">
              <p className="text-[11px] font-bold uppercase tracking-widest text-amber-300">Month lock / unlock</p>
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-2 block text-[11px] font-bold uppercase tracking-widest text-amber-100/80">લૉક / અનલૉક મહિનો *</label>
                  <input
                    type="month"
                    max={getMonthInputValue()}
                    className="w-full p-3 bg-[#252525] border border-white/10 rounded-xl text-white outline-none focus:border-amber-500/50 transition-all text-sm"
                    value={monthLockMonth}
                    onChange={(e) => setMonthLockMonth(clampLockUnlockMonthValue(e.target.value))}
                  />
                  <p className="mt-1.5 text-[10px] text-amber-100/70">
                    ભવિષ્યના મહિનો અહીં પસંદ થઈ શકતા નથી (મહત્તમ: {formatMonthLabel(getMonthInputValue())}). ખરીદી/રિક્વેસ્ટ/સેન્ડ માટે તારીખ પર ભવિષ્યની એન્ટ્રી યથાવત રહેશે.
                  </p>
                  <p className="mt-1.5 text-[10px] text-amber-100/70">
                    રિપોર્ટ મહિનો: <span className="font-bold text-white">{reportForm.month ? formatMonthLabel(reportForm.month) : '-'}</span>
                    {' · '}
                    <button
                      type="button"
                      className="font-bold text-amber-200 underline-offset-2 hover:underline"
                      onClick={() => setMonthLockMonth(clampLockUnlockMonthValue(reportForm.month || monthLockMonth))}
                    >
                      Report month પર સેટ કરો
                    </button>
                  </p>
                </div>
                <div className="flex items-end">
                  <p className="rounded-xl border border-white/10 bg-[#252525]/80 px-3 py-2 text-xs text-amber-100/90">
                    સ્ટેટસ: <span className="font-black text-white">{formatMonthLabel(monthLockMonth)}</span>
                    {lockPanelMonthLock.loading ? ' — લોડ થઈ રહ્યું છે' : (lockPanelMonthLock.is_locked ? ' — બંધ (locked)' : ' — ખુલ્લો')}
                  </p>
                </div>
              </div>

              {lockPanelMonthLock.loading ? (
                <p className="mt-3 text-sm text-amber-100/80">Loading lock status…</p>
              ) : lockPanelMonthLock.is_locked ? (
                <div className="mt-3 space-y-3">
                  <div className="rounded-xl border border-amber-500/30 bg-[#252525]/80 px-4 py-3">
                    <p className="text-sm font-black text-amber-200">This month is closed</p>
                    <p className="mt-1 text-xs text-gray-400">
                      <span className="font-bold text-white">{formatMonthLabel(monthLockMonth)}</span>
                      {' — '}closed stock (month end):{' '}
                      <span className="font-bold text-white">
                        {previousMonthClosingInfo.loading ? '…' : `${formatMetric(lockPanelClosingKg)} KG`}
                      </span>
                    </p>
                  </div>
                  {!unlockReasonStepVisible ? (
                    <motion.button
                      type="button"
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => setUnlockReasonStepVisible(true)}
                      disabled={monthLockSubmitting}
                      className="w-full bg-gradient-to-r from-amber-500 to-orange-500 text-white p-3 rounded-xl font-bold text-sm uppercase tracking-wide disabled:opacity-50"
                    >
                      Unlock month
                    </motion.button>
                  ) : (
                    <div className="space-y-2">
                      <label className="block text-[11px] font-bold uppercase tracking-widest text-amber-100/80">Unlock reason (required)</label>
                      <input
                        className="w-full p-3 bg-[#252525] border border-white/10 rounded-xl text-white outline-none focus:border-amber-500/50 transition-all text-sm"
                        value={unlockReason}
                        onChange={(e) => setUnlockReason(e.target.value)}
                        placeholder="Backdated entry / correction reason..."
                      />
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        <motion.button
                          type="button"
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                          onClick={handleUnlockMonth}
                          disabled={monthLockSubmitting}
                          className="bg-gradient-to-r from-amber-500 to-orange-500 text-white p-3 rounded-xl font-bold text-sm uppercase tracking-wide disabled:opacity-50"
                        >
                          {monthLockSubmitting ? 'Processing…' : 'Confirm unlock'}
                        </motion.button>
                        <motion.button
                          type="button"
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                          onClick={() => { setUnlockReasonStepVisible(false); setUnlockReason(''); }}
                          disabled={monthLockSubmitting}
                          className="bg-[#252525] border border-white/10 text-white p-3 rounded-xl font-bold text-sm uppercase tracking-wide disabled:opacity-50"
                        >
                          Cancel
                        </motion.button>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="mt-3 space-y-2">
                  <p className="text-xs text-amber-100/80">
                    <span className="font-bold text-white">{formatMonthLabel(monthLockMonth)}</span> હાલ ખુલ્લો છે — જરૂર હોય તો lock લગાવો.
                  </p>
                  <motion.button
                    type="button"
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={handleLockMonth}
                    disabled={monthLockSubmitting}
                    className="w-full bg-[#252525] border border-white/10 text-white p-3 rounded-xl font-bold text-sm uppercase tracking-wide disabled:opacity-50"
                  >
                    {monthLockSubmitting ? 'Processing…' : 'Lock month'}
                  </motion.button>
                </div>
              )}

              <div className="mt-4">
                <p className="text-[11px] font-bold uppercase tracking-widest text-amber-300">Recent unlock audit</p>
                <div className="mt-2 space-y-1 text-xs text-amber-100/90">
                  {unlockAuditLogs.length === 0 && <p className="text-amber-100/70">No unlock logs found.</p>}
                  {unlockAuditLogs.map((entry) => (
                    <p key={entry.id}>
                      {entry.month || '-'} | {entry.unlocked_by || '-'} | {formatDisplayDate(entry.unlocked_at)} | {entry.reason || '-'}
                    </p>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-3 rounded-2xl border border-fuchsia-500/20 bg-fuchsia-500/10 p-4">
              <p className="text-[11px] font-bold uppercase tracking-widest text-fuchsia-200">Physical stock adjustment</p>
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <input
                  type="date"
                  className="w-full p-3 bg-[#252525] border border-white/10 rounded-xl text-white outline-none focus:border-fuchsia-500/50 transition-all text-sm"
                  value={adjustmentForm.date}
                  onChange={(e) => setAdjustmentForm((prev) => ({ ...prev, date: e.target.value }))}
                />
                <div className="sm:col-span-2">
                  <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-widest text-gray-500">Item name *</label>
                  <ItemNameAutocompleteInput
                    accent="fuchsia"
                    catalogItems={catalogItems}
                    placeholder="માસ્ટર લિસ્ટમાંથી શોધો / પસંદ કરો…"
                    value={adjustmentForm.itemName}
                    excludedNameKeys={[]}
                    onChange={(nextValue) => setAdjustmentForm((prev) => ({
                      ...prev,
                      itemName: nextValue,
                      unit: nextValue.trim() ? prev.unit : '',
                      qty: '',
                    }))}
                    onSelectItem={handleAdjustmentSelectItem}
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-widest text-gray-500">માત્રા *</label>
                  <CatalogStockQtyInput
                    row={{
                      itemName: adjustmentForm.itemName,
                      qty: adjustmentForm.qty,
                      unit: adjustmentForm.unit,
                      kg: adjustmentKgPreview !== '' ? String(adjustmentKgPreview) : '',
                    }}
                    catalogItems={catalogItems}
                    accent="fuchsia"
                    onQtyChange={(value) => setAdjustmentForm((prev) => ({ ...prev, qty: value }))}
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-widest text-gray-500">કિલો (સ્ટોક — લૉક)</label>
                  <input
                    readOnly
                    tabIndex={-1}
                    className="w-full p-3 bg-[#1a1a1a] border border-white/10 rounded-xl text-white font-black text-sm text-center outline-none cursor-not-allowed"
                    placeholder="—"
                    value={adjustmentKgPreview !== '' ? formatMetric(adjustmentKgPreview) : ''}
                  />
                  <p className="mt-1 text-[9px] text-gray-500 text-center">રિપોર્ટમાં હમેશા કિલો જાય</p>
                </div>
                <select
                  className="w-full p-3 bg-[#252525] border border-white/10 rounded-xl text-white outline-none focus:border-fuchsia-500/50 transition-all text-sm"
                  value={adjustmentForm.direction}
                  onChange={(e) => setAdjustmentForm((prev) => ({ ...prev, direction: e.target.value }))}
                >
                  <option value="OUT">Minus (OUT)</option>
                  <option value="IN">Plus (IN)</option>
                </select>
                <select
                  className="w-full p-3 bg-[#252525] border border-white/10 rounded-xl text-white outline-none focus:border-fuchsia-500/50 transition-all text-sm"
                  value={adjustmentForm.reason}
                  onChange={(e) => setAdjustmentForm((prev) => ({ ...prev, reason: e.target.value }))}
                >
                  <option value="Shrinkage">Shrinkage</option>
                  <option value="Damage">Damage</option>
                  <option value="Missing">Missing</option>
                  <option value="Found / Correction">Found / Correction</option>
                </select>
                <input
                  className="w-full p-3 bg-[#252525] border border-white/10 rounded-xl text-white outline-none focus:border-fuchsia-500/50 transition-all text-sm sm:col-span-2 lg:col-span-3"
                  placeholder="Remark"
                  value={adjustmentForm.remark}
                  onChange={(e) => setAdjustmentForm((prev) => ({ ...prev, remark: e.target.value }))}
                />
              </div>
              <ItemsListSearchHint />
              <div className="mt-3 flex flex-wrap gap-2">
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={handlePhysicalAdjustmentSubmit}
                  disabled={adjustmentSubmitting}
                  className="bg-gradient-to-r from-fuchsia-500 to-violet-600 text-white px-5 py-3 rounded-xl font-bold text-sm uppercase tracking-wide shadow-lg shadow-fuchsia-500/20 disabled:opacity-50"
                >
                  {adjustmentSubmitting ? 'Saving...' : (adjustmentForm.id ? 'Update entry' : 'Save adjustment entry')}
                </motion.button>
                {adjustmentForm.id && (
                  <button
                    type="button"
                    onClick={() => setAdjustmentForm(createDefaultAdjustmentForm())}
                    className="rounded-xl border border-white/10 bg-white/5 px-5 py-3 text-sm font-bold uppercase text-gray-300 hover:bg-white/10"
                  >
                    Cancel edit
                  </button>
                )}
                <button
                  type="button"
                  onClick={fetchPhysicalAdjustments}
                  disabled={adjustmentListLoading}
                  className="rounded-xl border border-fuchsia-500/20 bg-fuchsia-500/10 px-4 py-3 text-xs font-bold uppercase text-fuchsia-200 hover:bg-fuchsia-500/20 disabled:opacity-50 inline-flex items-center gap-1"
                >
                  <RefreshCw size={14} className={adjustmentListLoading ? 'animate-spin' : ''} />
                  Refresh
                </button>
              </div>

              <div className="mt-4 rounded-xl border border-white/10 bg-[#151515] overflow-hidden">
                <div className="px-3 py-2 border-b border-white/10 flex justify-between items-center">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Adjustment entries</p>
                  <span className="text-[10px] text-fuchsia-300 font-bold">{adjustmentEntries.length}</span>
                </div>
                {adjustmentListLoading ? (
                  <p className="p-4 text-center text-sm text-gray-500">Loading…</p>
                ) : adjustmentEntries.length === 0 ? (
                  <p className="p-4 text-center text-sm text-gray-500">કોઈ એન્ટ્રી નથી.</p>
                ) : (
                  <div className="max-h-52 overflow-y-auto custom-scroll">
                    <table className="w-full text-xs">
                      <thead className="bg-[#252525] sticky top-0">
                        <tr>
                          <th className="p-2 text-left text-gray-500 font-bold uppercase">Date</th>
                          <th className="p-2 text-left text-gray-500 font-bold uppercase">Item</th>
                          <th className="p-2 text-center text-gray-500 font-bold uppercase">Qty</th>
                          <th className="p-2 text-center text-gray-500 font-bold uppercase">KG</th>
                          <th className="p-2 text-center text-gray-500 font-bold uppercase">±</th>
                          <th className="p-2 w-16" />
                        </tr>
                      </thead>
                      <tbody>
                        {adjustmentEntries.map((entry) => (
                          <tr key={entry.id} className={`border-t border-white/5 ${adjustmentForm.id === entry.id ? 'bg-fuchsia-500/10' : ''}`}>
                            <td className="p-2 text-gray-400 whitespace-nowrap">{formatDisplayDate(entry.transaction_date)}</td>
                            <td className="p-2 font-medium text-white">{entry.itemName}</td>
                            <td className="p-2 text-center text-gray-300">
                              {formatMetric(entry.entry_qty)} <span className="text-[9px] text-gray-500">{entry.entry_unit}</span>
                            </td>
                            <td className="p-2 text-center font-bold text-fuchsia-300">{formatMetric(entry.quantity)}</td>
                            <td className="p-2 text-center">
                              <span className={entry.transaction_type === 'IN' ? 'text-green-400 font-bold' : 'text-red-400 font-bold'}>
                                {entry.transaction_type}
                              </span>
                            </td>
                            <td className="p-2">
                              <div className="flex justify-end gap-1">
                                <button type="button" onClick={() => handleEditPhysicalAdjustment(entry)} className="p-1.5 rounded-lg text-blue-400 hover:bg-blue-500/10" title="Edit">
                                  <Edit3 size={14} />
                                </button>
                                <button type="button" onClick={() => handleDeletePhysicalAdjustment(entry)} disabled={adjustmentDeletingId === entry.id} className="p-1.5 rounded-lg text-red-400 hover:bg-red-500/10 disabled:opacity-50" title="Delete">
                                  {adjustmentDeletingId === entry.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>

            <CenterAdminPanel centersList={centersList} refreshCenters={refreshCenters} />

            <div className="mt-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <p className="text-xs text-gray-500">
                Columns: income also embeds મુખ્ય કોઠારની ખુલવાની સ્ટોક — પહેલાં ગ્લોબલ રીતે થઈ ચુકેલી ટ્રાન્ઝેક્શન. દરેક સેન્ટર રિપોર્ટમાં પિરીયડ ખરીદી દેખાશે; રિક્વેસ્ટ/સેન્ડ સેન્ટર મુજબ ફિલ્ટર.
              </p>
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleCreateReport}
                disabled={reportGenerating}
                className="bg-gradient-to-r from-emerald-500 to-emerald-600 text-white px-5 py-3 rounded-xl font-bold text-sm uppercase tracking-wide shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {reportGenerating ? <Loader2 size={16} className="animate-spin" /> : <FileText size={16} />}
                {reportGenerating ? 'Generating...' : 'Generate Report'}
              </motion.button>
            </div>
          </motion.div>

          <NonListedCentersPanel
            centersList={centersList}
            orders={orders}
            sendOrders={sendOrders}
            onEditRequest={(order) => {
              setActiveTab('requests');
              setEditOrder(order);
            }}
            onEditSend={(order) => {
              setActiveTab('sends');
              setEditSendOrder(order);
            }}
          />

          <PhysicalStockCheckerPanel
            catalogItems={catalogItems}
            globalUnits={globalUnits}
            ItemNameAutocompleteInput={ItemNameAutocompleteInput}
          />

          {!reportLoading && reports.length > 0 && (
            <div className="mt-12 mb-4 flex items-center gap-4">
              <div className="h-px flex-1 bg-white/10" />
              <p className="shrink-0 text-[11px] font-bold uppercase tracking-widest text-gray-500">
                સાચવેલા રિપોર્ટ
              </p>
              <div className="h-px flex-1 bg-white/10" />
            </div>
          )}

          {reportLoading && (
            <div className="flex justify-center py-20">
              <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }}>
                <Loader2 size={48} className="text-emerald-500" />
              </motion.div>
            </div>
          )}

          {!reportLoading && reports.length > 0 && (
            <motion.div variants={staggerContainer} initial="initial" animate="animate"
              className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-6">
              <AnimatePresence>
                {reports.map((report, index) => {
                  const preparedReport = hydrateReport(report);
                  const uiTheme = getReportUiTheme();
                  const isMonthOnlyCard = preparedReport.stockViewMode === 'month_movements_only';
                  return (
                    <motion.div key={preparedReport.id} variants={fadeInUp} initial="initial" animate="animate" exit="exit"
                      transition={{ delay: index * 0.05 }} whileHover={{ y: -5, transition: { duration: 0.2 } }}
                      className="bg-gradient-to-b from-[#1e1e1e] to-[#181818] rounded-2xl sm:rounded-3xl border border-white/5 shadow-xl overflow-hidden hover:border-emerald-500/30 transition-colors group">
                      <div className={`p-4 sm:p-5 border-b border-white/5 bg-gradient-to-r ${uiTheme.soft}`}>
                        <div className="flex justify-between items-start gap-3">
                          <div>
                            <p className={`text-[10px] font-black uppercase tracking-[0.2em] ${uiTheme.muted}`}>{preparedReport.title}</p>
                            <h3 className="font-black text-white text-sm sm:text-base mt-1">{preparedReport.monthLabel}</h3>
                            <p className="text-xs text-gray-300 mt-1">{preparedReport.rangeLabel}</p>
                            <p className={`text-[11px] font-bold mt-2 ${uiTheme.muted}`}>{preparedReport.centerLabel}</p>
                          </div>
                          <div className="text-right flex flex-col items-end gap-2">
                            <div className="text-xs text-gray-300 font-medium bg-white/5 px-2 py-1 rounded-lg">{formatDisplayDate(preparedReport.generatedAtIso)}</div>
                            <motion.button
                              whileHover={{ scale: 1.05 }}
                              whileTap={{ scale: 0.95 }}
                              disabled={reportDeleting === preparedReport.id}
                              onClick={() => handleDeleteReport(preparedReport)}
                              className="text-red-300 hover:text-red-200 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 rounded-lg px-2 py-1 text-[11px] font-bold flex items-center gap-1 disabled:opacity-50"
                            >
                              {reportDeleting === preparedReport.id ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                              Delete
                            </motion.button>
                          </div>
                        </div>
                      </div>
                      <div className="p-4 sm:p-5">
                        <div className="grid grid-cols-3 gap-2 mb-4">
                          <div className="bg-[#252525] p-3 rounded-xl border border-white/5 text-center">
                            <p className="text-[10px] text-gray-500 uppercase font-bold">Items</p>
                            <p className="font-black text-white text-base">{formatMetric(preparedReport.summary.totalRows)}</p>
                          </div>
                          <div className={`bg-gradient-to-br ${uiTheme.soft} p-3 rounded-xl border ${uiTheme.border} text-center`}>
                            <p className={`text-[10px] uppercase font-bold ${uiTheme.muted}`}>
                              {isMonthOnlyCard ? 'Income (IN)' : 'Income (KG)'}
                            </p>
                            <p className={`font-black text-base ${uiTheme.text}`}>{formatMetric(preparedReport.summary.totalIncome)}</p>
                          </div>
                          <div className="bg-[#252525] p-3 rounded-xl border border-white/5 text-center">
                            <p className="text-[10px] text-gray-500 uppercase font-bold">Outgoing (KG)</p>
                            <p className="font-black text-white text-base">{formatMetric(preparedReport.summary.totalOutgoing)}</p>
                          </div>
                        </div>
                        <div className="mb-4 space-y-1 text-xs text-gray-400">
                          <p><span className="font-bold text-gray-200">Scope:</span> {preparedReport.scope === 'center' ? 'Centewise' : 'All Centers'}</p>
                          <p><span className="font-bold text-gray-200">Total stock (KG):</span> {formatMetric(preparedReport.summary.totalStock)}</p>
                          <p><span className="font-bold text-gray-200">Saved Email:</span> {preparedReport.email || '-'}</p>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={() => setPreviewReport(preparedReport)}
                            className="bg-[#252525] hover:bg-[#2d2d2d] text-white p-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all border border-white/5">
                            <Eye size={14} /> Preview
                          </motion.button>
                          <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} disabled={reportPdfLoading === preparedReport.id} onClick={() => handleShareReport(preparedReport)}
                            className="bg-[#252525] hover:bg-[#2d2d2d] text-white p-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all border border-white/5 disabled:opacity-50">
                            {reportPdfLoading === preparedReport.id ? <Loader2 size={14} className="animate-spin" /> : <Share2 size={14} />} Share
                          </motion.button>
                          <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={() => handleSendMailReport(preparedReport)}
                            className="bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 p-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all border border-blue-500/20">
                            <Send size={14} /> Mail
                          </motion.button>
                          <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} disabled={reportPdfLoading === preparedReport.id} onClick={() => handleDownloadReport(preparedReport)}
                            className="bg-gradient-to-r from-emerald-500 to-emerald-600 text-white p-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-500/20 disabled:opacity-50">
                            {reportPdfLoading === preparedReport.id ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />} Download
                          </motion.button>
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </motion.div>
          )}

          {!reportLoading && reports.length === 0 && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center py-20">
              <FileText size={64} className="text-gray-600 mx-auto mb-4" />
              <p className="text-gray-400 text-lg font-bold">No monthly reports generated yet</p>
              <p className="text-gray-500 text-sm mt-2">Select month and selected date above to create the first report.</p>
            </motion.div>
          )}
        </>
      )}

      {isItems && (
        <ItemAdminPanel user={user} catalogItems={catalogItems} refreshCatalog={refreshCatalog} />
      )}

      {isPurchases && (
        <PurchaseAdminPanel user={user} catalogItems={catalogItems} onLedgerChanged={bumpLedgerData} />
      )}

      {/* Request Preview Modal */}
      <AnimatePresence>
        {previewOrder && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/90 backdrop-blur-sm z-[200] flex items-center justify-center p-2 sm:p-4"
            onClick={() => setPreviewOrder(null)}>
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
              onClick={e => e.stopPropagation()}
              className="bg-white text-black w-full max-w-4xl max-h-[95vh] overflow-y-auto rounded-xl sm:rounded-2xl p-6 sm:p-10 relative shadow-2xl font-serif custom-scroll">
              <motion.button whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} onClick={() => setPreviewOrder(null)}
                className="absolute top-3 right-3 sm:top-4 sm:right-4 bg-gray-100 p-2 rounded-full text-black hover:bg-gray-200 transition-colors">
                <X size={20} />
              </motion.button>
              <div className="text-center mb-6 sm:mb-8 pb-4">
                <h1 className="text-3xl sm:text-4xl font-black text-orange-600 uppercase mb-1 tracking-tighter">Request Stock Report</h1>
                <div className="mt-3 h-1 w-full rounded-full bg-orange-600" />
              </div>
              <div className="mb-6 sm:mb-8 rounded-[1.8rem] border border-gray-200 bg-gray-50 p-4 sm:p-6">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <PreviewInfoCard label="Center Name" value={previewOrder.center} />
                  <PreviewInfoCard label="Challan No." value={`#${previewOrder.chalanNo}`} />
                  <PreviewInfoCard label="Order Date" value={formatDisplayDate(previewOrder.date)} />
                  <PreviewInfoCard label="Requester" value={previewOrder.senderName || '-'} />
                  <PreviewInfoCard label="Post" value={previewOrder.post || '-'} />
                  <PreviewInfoCard label="Mobile Number" value={previewOrder.mobileNumber || '-'} />
                  <PreviewInfoCard label="Global ID" value={previewOrder.globalId || '-'} />
                  <PreviewInfoCard label="Email" value={previewOrder.email || '-'} className="sm:col-span-2 lg:col-span-2" />
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs sm:text-[13px] border-collapse border border-black">
                  <thead className="bg-black text-white">
                    <tr>
                      <th className="border p-2 w-10 sm:w-12 text-center">No</th>
                      <th className="border p-2 text-left">Item Name</th>
                      <th className="border p-2 w-16 sm:w-20 text-center">Qty</th>
                      <th className="border p-2 w-16 sm:w-20 text-center">KG</th>
                      <th className="border p-2 w-16 sm:w-20 text-center">Unit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewOrder.items.map((it, i) => (
                      <tr key={i} className="border border-gray-300">
                        <td className="border p-2 text-center text-gray-500 font-sans">{i+1}</td>
                        <td className="border p-2 font-bold">{it.name}</td>
                        <td className="border p-2 text-center font-bold">{it.qty}</td>
                        <td className="border p-2 text-center font-bold text-orange-700">{formatMetric(convertItemQtyToKg(it.qty, it.unit))}</td>
                        <td className="border p-2 text-center text-gray-400 text-[10px] uppercase font-sans font-bold">{it.unit}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {(() => {
                const totals = calculateTotals(previewOrder.items);
                return (
                  <div className="mt-6 sm:mt-10 grid grid-cols-3 border-4 border-black p-3 sm:p-5 font-black text-center uppercase text-xs sm:text-sm tracking-tighter">
                    <div className="border-r border-gray-200">ITEMS: {previewOrder.items.length}</div>
                    <div className="border-r border-gray-200">TOTAL QTY: {formatMetric(totals.totalQty)}</div>
                    <div>TOTAL KG: {formatMetric(totals.totalKg)}</div>
                  </div>
                );
              })()}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Send Preview Modal */}
      <AnimatePresence>
        {previewSendOrder && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/90 backdrop-blur-sm z-[200] flex items-center justify-center p-2 sm:p-4"
            onClick={() => setPreviewSendOrder(null)}>
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
              onClick={e => e.stopPropagation()}
              className="bg-white text-black w-full max-w-4xl max-h-[95vh] overflow-y-auto rounded-xl sm:rounded-2xl p-6 sm:p-10 relative shadow-2xl font-serif custom-scroll">
              <motion.button whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} onClick={() => setPreviewSendOrder(null)}
                className="absolute top-3 right-3 sm:top-4 sm:right-4 bg-gray-100 p-2 rounded-full text-black hover:bg-gray-200 transition-colors">
                <X size={20} />
              </motion.button>
              <div className="text-center mb-6 sm:mb-8 border-b-4 border-blue-600 pb-4">
                <h1 className="text-2xl sm:text-4xl font-black text-blue-600 uppercase mb-0 tracking-tighter">Send Stock Report</h1>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:gap-4 text-sm mb-6 sm:mb-8 bg-gray-50 p-4 sm:p-6 rounded-2xl border border-gray-100">
                <div><p className="text-gray-400 text-[10px] font-sans font-bold uppercase mb-0.5">From Center</p><p className="font-bold text-base sm:text-lg">{previewSendOrder.fromCenter}</p></div>
                <div className="text-right"><p className="text-gray-400 text-[10px] font-sans font-bold uppercase mb-0.5">Challan No.</p><p className="font-bold text-base sm:text-lg">#{previewSendOrder.chalanNo}</p></div>
                <div><p className="text-gray-400 text-[10px] font-sans font-bold uppercase mb-0.5">Date</p><p className="font-bold text-sm">{formatDisplayDate(previewSendOrder.date)}</p></div>
                <div className="text-right"><p className="text-gray-400 text-[10px] font-sans font-bold uppercase mb-0.5">To</p><p className="font-bold text-sm text-blue-600">Swaminarayan Dham</p></div>
                {previewSendOrder.senderName && <div><p className="text-gray-400 text-[10px] font-sans font-bold uppercase mb-0.5">Sender</p><p className="font-bold text-sm">{previewSendOrder.senderName}</p></div>}
                {previewSendOrder.mobileNumber && <div className="text-right"><p className="text-gray-400 text-[10px] font-sans font-bold uppercase mb-0.5">Mobile</p><p className="font-bold text-sm">{previewSendOrder.mobileNumber}</p></div>}
                {previewSendOrder.globalId && <div><p className="text-gray-400 text-[10px] font-sans font-bold uppercase mb-0.5">Global ID</p><p className="font-bold text-sm">{previewSendOrder.globalId}</p></div>}
                {previewSendOrder.email && <div className="text-right"><p className="text-gray-400 text-[10px] font-sans font-bold uppercase mb-0.5">Email</p><p className="font-bold text-sm break-all">{previewSendOrder.email}</p></div>}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs sm:text-[13px] border-collapse border border-black">
                  <thead className="bg-black text-white">
                    <tr>
                      <th className="border p-2 w-10 sm:w-12 text-center">No</th>
                      <th className="border p-2 text-left">Item Name</th>
                      <th className="border p-2 w-16 sm:w-20 text-center">Qty</th>
                      <th className="border p-2 w-16 sm:w-20 text-center">KG</th>
                      <th className="border p-2 w-16 sm:w-20 text-center">Unit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(previewSendOrder.items || []).filter(r => r.itemName && r.itemName.trim()).map((it, i) => {
                      const qtyVal = it.qty != null && it.qty !== '' ? it.qty : it.kg;
                      const unitVal = it.unit || 'કિલો';
                      const kgVal = convertItemQtyToKg(qtyVal, unitVal);
                      return (
                        <tr key={i} className="border border-gray-300">
                          <td className="border p-2 text-center text-gray-500 font-sans">{i + 1}</td>
                          <td className="border p-2 font-bold">{it.itemName}</td>
                          <td className="border p-2 text-center font-bold">{formatMetric(qtyVal)}</td>
                          <td className="border p-2 text-center font-bold text-orange-700">{formatMetric(kgVal)}</td>
                          <td className="border p-2 text-center text-gray-400 text-[10px] uppercase font-sans font-bold">{unitVal}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {(() => {
                const filledItems = (previewSendOrder.items || []).filter(r => r.itemName && r.itemName.trim());
                const mapped = filledItems.map((it) => ({
                  name: it.itemName,
                  qty: it.qty != null && it.qty !== '' ? it.qty : it.kg,
                  unit: it.unit || 'કિલો',
                }));
                const totals = calculateTotals(mapped);
                return (
                  <div className="mt-6 sm:mt-10 grid grid-cols-3 border-4 border-black p-3 sm:p-5 font-black text-center uppercase text-xs sm:text-sm tracking-tighter">
                    <div className="border-r border-gray-200">ITEMS: {filledItems.length}</div>
                    <div className="border-r border-gray-200">TOTAL QTY: {formatMetric(totals.totalQty)}</div>
                    <div>TOTAL KG: {formatMetric(totals.totalKg)}</div>
                  </div>
                );
              })()}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {previewReport && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/90 backdrop-blur-sm z-[220] flex items-center justify-center p-2 sm:p-4"
            onClick={() => setPreviewReport(null)}
          >
            <motion.div
              initial={{ scale: 0.96, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.96, opacity: 0 }}
              onClick={e => e.stopPropagation()}
              className="bg-white text-black w-full max-w-6xl max-h-[95vh] overflow-y-auto rounded-xl sm:rounded-2xl p-6 sm:p-8 relative shadow-2xl custom-scroll"
            >
              <motion.button whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} onClick={() => setPreviewReport(null)}
                className="absolute top-3 right-3 sm:top-4 sm:right-4 bg-gray-100 p-2 rounded-full text-black hover:bg-gray-200 transition-colors z-10">
                <X size={20} />
              </motion.button>
              <ReportPreviewContent report={previewReport} />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>

      {/* ===== MAIL MODAL ===== */}
      <AnimatePresence>
        {mailModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[300] flex items-center justify-center p-4"
            onClick={closeMailModal}>
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
              onClick={e => e.stopPropagation()}
              className="bg-gradient-to-b from-[#1e1e1e] to-[#181818] border border-white/10 rounded-2xl sm:rounded-3xl w-full max-w-sm shadow-2xl overflow-hidden">
              {/* Modal Header */}
              <div className="p-5 border-b border-white/5 flex items-center justify-between bg-gradient-to-r from-[#252525] to-[#1e1e1e]">
                <div className="flex items-center gap-2 text-blue-400 font-bold text-sm uppercase tracking-widest">
                  <Send size={16} /> Send Mail
                </div>
                <motion.button whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} onClick={closeMailModal}
                  className="bg-white/5 hover:bg-white/10 p-1.5 rounded-lg text-gray-400 hover:text-white transition-colors">
                  <X size={16} />
                </motion.button>
              </div>

              <div className="p-5">
                {(() => {
                  const { order, type } = mailModal;
                  const reportHydrated = type === 'report' ? hydrateReport(order) : null;
                  const targetLabel = type === 'request'
                    ? order.center
                    : type === 'send'
                      ? order.fromCenter
                      : reportHydrated?.monthLabel;

                  return (
                    <div className="space-y-4">
                      <p className="text-gray-300 text-sm">
                        Send email for <span className="font-bold text-white">{targetLabel}</span>
                        {type === 'report' ? (
                          <span className="text-blue-400 font-bold"> — {reportHydrated?.rangeLabel}</span>
                        ) : (
                          <span> — Chalan <span className="text-blue-400 font-bold">#{order.chalanNo}</span></span>
                        )}
                      </p>

                      {type === 'report' ? (
                        <>
                          <div>
                            <label className="block text-[11px] font-bold uppercase tracking-widest text-gray-500 mb-2">Email</label>
                            <select
                              className="w-full p-3 bg-[#252525] border border-white/10 rounded-xl text-white outline-none focus:border-blue-500/70 transition-all text-sm"
                              value={selectedReportEmail}
                              onChange={e => {
                                setSelectedReportEmail(e.target.value);
                                setCustomEmailError('');
                              }}
                            >
                              {REPORT_DEFAULT_EMAILS.map((email) => (
                                <option key={email} value={email}>{email}</option>
                              ))}
                              <option value="custom">Custom Email</option>
                            </select>
                          </div>
                          {selectedReportEmail === 'custom' && (
                            <div>
                              <div className="relative">
                                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={16} />
                                <input
                                  type="email"
                                  placeholder="example@email.com"
                                  className={`w-full p-3 pl-9 bg-[#252525] border rounded-xl text-white outline-none focus:border-blue-500/70 transition-all text-sm placeholder-gray-500 ${customEmailError ? 'border-red-500/60' : 'border-white/10'}`}
                                  value={customEmail}
                                  onChange={e => { setCustomEmail(e.target.value); setCustomEmailError(''); }}
                                  autoFocus
                                />
                              </div>
                              {customEmailError && <p className="text-red-400 text-xs mt-1.5 pl-1">{customEmailError}</p>}
                            </div>
                          )}
                        </>
                      ) : (
                        <div>
                          <div className="relative">
                            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={16} />
                            <input
                              type="email"
                              placeholder="example@email.com"
                              className={`w-full p-3 pl-9 bg-[#252525] border rounded-xl text-white outline-none focus:border-blue-500/70 transition-all text-sm placeholder-gray-500 ${customEmailError ? 'border-red-500/60' : 'border-white/10'}`}
                              value={customEmail}
                              onChange={e => { setCustomEmail(e.target.value); setCustomEmailError(''); }}
                              autoFocus
                            />
                          </div>
                          {customEmailError && <p className="text-red-400 text-xs mt-1.5 pl-1">{customEmailError}</p>}
                        </div>
                      )}

                      <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-xs text-gray-400">
                        CC: {DEFAULT_CC_EMAIL}<br />
                        BCC: {DEFAULT_BCC_EMAIL}
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                          onClick={closeMailModal}
                          className="bg-white/5 hover:bg-white/10 text-gray-300 py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2 border border-white/10">
                          <X size={16} /> Cancel
                        </motion.button>
                        <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                          disabled={mailSending}
                          onClick={handleMailSend}
                          className="bg-gradient-to-r from-blue-500 to-blue-600 text-white py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2 shadow-lg shadow-blue-500/20 disabled:opacity-50">
                          {mailSending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />} Send Mail
                        </motion.button>
                      </div>
                    </div>
                  );
                })()}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      <PdfDownloadWaitOverlay active={pdfOverlayActive} kind={pdfOverlayKind ?? 'report'} />
    </>
  );
}

const createDefaultItemForm = () => ({
  name: '',
  category: '',
  unitMode: 'standard',
  unit: UNIT_KG,
  globalUnitId: '',
  customUnitName: '',
  conversionAmount: '',
  conversionBase: UNIT_KG,
});

function ItemAdminPanel({ user, catalogItems, refreshCatalog }) {
  const [itemForm, setItemForm] = useState(createDefaultItemForm);
  const [globalUnits, setGlobalUnits] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [importingDefaults, setImportingDefaults] = useState(false);
  const [customCategories, setCustomCategories] = useState([]);
  const [newCategory, setNewCategory] = useState('');
  const [inactiveItems, setInactiveItems] = useState([]);
  const [showInactiveModal, setShowInactiveModal] = useState(false);
  const [inactiveSearch, setInactiveSearch] = useState('');
  const [reactivatingId, setReactivatingId] = useState(null);

  const categoryOptions = Array.from(new Set([
    ...getCatalogCategoryOptions(catalogItems),
    ...customCategories,
  ])).sort((left, right) => left.localeCompare(right, 'gu'));
  const hasFirebaseItems = catalogItems.some((item) => item.source === 'firebase');
  const visibleItems = searchQuery
    ? catalogItems.filter((item) => (
        matchesSearchText(item.name, searchQuery) || matchesSearchText(item.category, searchQuery)
      ))
    : catalogItems;
  const visibleInactiveItems = inactiveSearch
    ? inactiveItems.filter((item) => (
        matchesSearchText(item.name, inactiveSearch) || matchesSearchText(item.category, inactiveSearch)
      ))
    : inactiveItems;

  const fetchInactiveItems = useCallback(async () => {
    try {
      const snapshot = await getDocs(collection(db, ITEM_COLLECTION));
      const docs = snapshot.docs
        .map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }))
        .filter((item) => item.is_active === false);
      setInactiveItems(ensureCatalogItems(docs));
    } catch (error) {
      console.warn('Inactive items fetch failed:', error);
      setInactiveItems([]);
    }
  }, []);

  const fetchCategoryOptions = useCallback(async () => {
    try {
      const snapshot = await getDocs(collection(db, ITEM_CATEGORY_COLLECTION));
      const values = snapshot.docs
        .map((docSnap) => (docSnap.data()?.name || '').toString().trim())
        .filter(Boolean);
      setCustomCategories(Array.from(new Set(values)));
    } catch (error) {
      console.warn('Category fetch failed:', error);
      setCustomCategories([]);
    }
  }, []);

  const refreshGlobalUnits = useCallback(async () => {
    try {
      setGlobalUnits(await fetchGlobalUnits());
    } catch {
      setGlobalUnits([]);
    }
  }, []);

  useEffect(() => {
    fetchInactiveItems();
    fetchCategoryOptions();
    refreshGlobalUnits();
  }, [fetchCategoryOptions, fetchInactiveItems, refreshGlobalUnits]);

  const unitDropdownOptions = useMemo(
    () => buildUnitDropdownOptions(globalUnits),
    [globalUnits],
  );

  const unitSelectValue = useMemo(
    () => encodeItemUnitSelectValue(itemForm),
    [itemForm],
  );

  const needsPerItemKgOverride = itemForm.unitMode === 'global' || itemForm.unitMode === 'custom';

  const handleUnitSelectChange = (rawValue) => {
    const decoded = decodeItemUnitSelectValue(rawValue);
    if (decoded.unitMode === 'global') {
      const gu = globalUnits.find((row) => row.id === decoded.globalUnitId);
      setItemForm((prev) => ({
        ...prev,
        unitMode: 'global',
        globalUnitId: decoded.globalUnitId,
        unit: gu?.name || prev.unit,
        conversionAmount: gu?.defaultUnitToKg != null ? String(gu.defaultUnitToKg) : prev.conversionAmount,
        conversionBase: UNIT_KG,
      }));
      return;
    }
    if (decoded.unitMode === 'custom') {
      setItemForm((prev) => ({
        ...prev,
        unitMode: 'custom',
        globalUnitId: '',
        customUnitName: prev.customUnitName || '',
        conversionAmount: prev.conversionAmount || '',
      }));
      return;
    }
    setItemForm((prev) => ({
      ...prev,
      unitMode: 'standard',
      globalUnitId: '',
      unit: decoded.unit || getDefaultUnitForCategory(prev.category),
      conversionAmount: '',
      customUnitName: '',
    }));
  };

  const resetForm = () => {
    setItemForm(createDefaultItemForm());
    setEditingId(null);
  };

  const handleSubmit = async () => {
    let unit = UNIT_KG;
    let unitToKgFactor = null;
    let isCustomUnit = false;
    let globalUnitId = null;

    if (itemForm.unitMode === 'global') {
      const selectedGlobal = globalUnits.find((row) => row.id === itemForm.globalUnitId);
      if (!selectedGlobal) return alert('ગ્લોબલ એકમ પસંદ કરો.');
      unit = selectedGlobal.name;
      unitToKgFactor = conversionInputToKgFactor(itemForm.conversionAmount, itemForm.conversionBase);
      if (unitToKgFactor == null) return alert('આ આઇટમ માટે ૧ એકમ = કેટલા kg લખો (ઉદા. ૧૩ અથવા ૧૫).');
      isCustomUnit = true;
      globalUnitId = selectedGlobal.id;
    } else if (itemForm.unitMode === 'custom') {
      unit = itemForm.customUnitName.trim();
      if (!unit) return alert('કસ્ટમ એકમનું નામ લખો.');
      unitToKgFactor = conversionInputToKgFactor(itemForm.conversionAmount, itemForm.conversionBase);
      if (unitToKgFactor == null) return alert('૧ એકમ = કેટલા kg/g માં રૂપાંતર લખો.');
      isCustomUnit = true;
    } else {
      unit = (itemForm.unit || getDefaultUnitForCategory(itemForm.category)).trim();
    }

    const payload = createCatalogItemPayload({
      name: itemForm.name,
      category: itemForm.category,
      unit,
      unitToKgFactor,
      isCustomUnit,
      globalUnitId,
    });
    if (!payload.name) return alert('Item name is required.');
    if (!payload.category) return alert('Category is required.');

    const duplicate = catalogItems.find((item) => item.nameKey === payload.nameKey && item.id !== editingId);
    if (duplicate) return alert('This item already exists in the master list.');

    setSubmitting(true);
    try {
      if (editingId && !editingId.startsWith('static-')) {
        await updateDoc(doc(db, ITEM_COLLECTION, editingId), payload);
      } else {
        await addDoc(collection(db, ITEM_COLLECTION), {
          ...payload,
          createdAt: new Date(),
        });
      }
      await refreshCatalog();
      await fetchInactiveItems();
      resetForm();
    } catch (error) {
      alert(`Item save error: ${error.message}`);
    }
    setSubmitting(false);
  };

  const handleEdit = (item) => {
    setEditingId(item.id);
    const hasGlobal = Boolean(item.globalUnitId);
    const isFreeformCustom = item.isCustomUnit === true && !hasGlobal
      && (!isStandardUnit(item.unit) && item.unitToKgFactor);
    setItemForm({
      name: item.name,
      category: item.category,
      unitMode: hasGlobal ? 'global' : (isFreeformCustom ? 'custom' : 'standard'),
      unit: hasGlobal || isFreeformCustom ? UNIT_KG : resolveCatalogItemUnit(item),
      globalUnitId: item.globalUnitId || '',
      customUnitName: isFreeformCustom ? item.unit : '',
      conversionAmount: item.unitToKgFactor ? String(item.unitToKgFactor) : '',
      conversionBase: UNIT_KG,
    });
  };

  const handleDelete = async (item) => {
    if (!window.confirm(`Deactivate item "${item.name}"?`)) return;
    setDeletingId(item.id);
    try {
      await updateDoc(doc(db, ITEM_COLLECTION, item.id), {
        is_active: false,
        updatedAt: new Date(),
      });
      await refreshCatalog();
      await fetchInactiveItems();
      if (editingId === item.id) resetForm();
    } catch (error) {
      alert(`Item delete error: ${error.message}`);
    }
    setDeletingId(null);
  };

  const handleImportDefaults = async () => {
    setImportingDefaults(true);
    try {
      const fallbackItems = getFallbackCatalogItems();
      // Seed the static catalog into Firestore once so every screen uses the same shared source.
      await Promise.all(fallbackItems.map((item) => addDoc(collection(db, ITEM_COLLECTION), {
        ...createCatalogItemPayload(item),
        createdAt: new Date(),
      })));
      await refreshCatalog();
      await fetchInactiveItems();
    } catch (error) {
      alert(`Default import error: ${error.message}`);
    }
    setImportingDefaults(false);
  };

  const handleAddCategory = async () => {
    const value = newCategory.trim();
    if (!value) return;
    const exists = categoryOptions.some((item) => normalizeItemName(item) === normalizeItemName(value));
    if (exists) {
      setNewCategory('');
      return;
    }
    try {
      await addDoc(collection(db, ITEM_CATEGORY_COLLECTION), {
        name: value,
        createdAt: new Date(),
      });
      await fetchCategoryOptions();
      setItemForm((prev) => ({ ...prev, category: value }));
      setNewCategory('');
    } catch (error) {
      alert(`Category save error: ${error.message}`);
    }
  };

  const handleReactivate = async (item) => {
    setReactivatingId(item.id);
    try {
      await updateDoc(doc(db, ITEM_COLLECTION, item.id), {
        is_active: true,
        updatedAt: new Date(),
      });
      await refreshCatalog();
      await fetchInactiveItems();
    } catch (error) {
      alert(`Item activate error: ${error.message}`);
    }
    setReactivatingId(null);
  };

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[380px_minmax(0,1fr)]">
      <motion.div initial={{ y: -20, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
        className="bg-gradient-to-b from-[#1e1e1e] to-[#181818] p-4 sm:p-6 rounded-2xl sm:rounded-3xl border border-white/5 shadow-xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-amber-400 font-bold uppercase text-xs tracking-widest">
              <Package size={16} /> Item Master
            </div>
            <h2 className="mt-2 text-xl sm:text-2xl font-black text-white">Shared Item Catalog</h2>
            <p className="mt-2 text-sm text-gray-400">Admin can manage canonical items here so request, send, and purchase all use the same stock names.</p>
          </div>
          <button
            type="button"
            onClick={resetForm}
            className="text-gray-400 hover:text-white flex items-center justify-center gap-1.5 text-xs font-bold uppercase transition-all bg-white/5 hover:bg-white/10 px-3 py-2 rounded-xl border border-white/10"
          >
            <Eraser size={14} /> Clear
          </button>
        </div>
        <button
          type="button"
          onClick={() => {
            setShowInactiveModal(true);
            fetchInactiveItems();
          }}
          className="mt-3 inline-flex items-center gap-2 rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs font-bold uppercase text-red-300 hover:bg-red-500/20"
        >
          <Trash2 size={14} /> Deactive List
        </button>

        <div className="mt-6 space-y-4">
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-widest text-gray-500 mb-2">Item Name *</label>
            <input
              value={itemForm.name}
              onChange={(e) => setItemForm((prev) => ({ ...prev, name: e.target.value }))}
              placeholder="ઉદાહરણ: મગ"
              className="w-full p-3 bg-[#252525] border border-white/10 rounded-xl text-white outline-none focus:border-amber-500/50 transition-all text-sm"
            />
          </div>
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-widest text-gray-500 mb-2">Category *</label>
            <input
              list="item-category-options"
              value={itemForm.category}
              onChange={(e) => setItemForm((prev) => ({
                ...prev,
                category: e.target.value,
                unit: prev.unitMode === 'standard' ? getDefaultUnitForCategory(e.target.value) : prev.unit,
              }))}
              placeholder="અનાજ / કઠોળ / મસાલા..."
              className="w-full p-3 bg-[#252525] border border-white/10 rounded-xl text-white outline-none focus:border-amber-500/50 transition-all text-sm"
            />
            <datalist id="item-category-options">
              {categoryOptions.map((category) => <option key={category} value={category} />)}
            </datalist>
            <div className="mt-2 flex gap-2">
              <input
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                placeholder="New category add..."
                className="flex-1 p-2.5 bg-[#252525] border border-white/10 rounded-xl text-white outline-none focus:border-amber-500/50 text-xs"
              />
              <button
                type="button"
                onClick={handleAddCategory}
                className="rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs font-bold uppercase text-amber-300 hover:bg-amber-500/20"
              >
                Add
              </button>
            </div>
          </div>
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-widest text-gray-500 mb-2">Unit</label>
            <select
              value={unitSelectValue}
              onChange={(e) => handleUnitSelectChange(e.target.value)}
              className="w-full p-3 bg-[#252525] border border-white/10 rounded-xl text-white outline-none focus:border-amber-500/50 text-sm"
            >
              <optgroup label="સ્ટાન્ડર્ડ એકમ">
                {STANDARD_UNIT_OPTIONS.map((u) => (
                  <option key={`std-${u}`} value={`std:${u}`}>{u}</option>
                ))}
              </optgroup>
              {globalUnits.length > 0 && (
                <optgroup label="ગ્લોબલ કસ્ટમ એકમ">
                  {globalUnits.map((row) => (
                    <option key={row.id} value={`global:${row.id}`}>
                      {row.name}{row.defaultUnitToKg != null ? ` (default ${row.defaultUnitToKg} kg)` : ''}
                    </option>
                  ))}
                </optgroup>
              )}
              <option value="custom:">— ફક્ત આ આઇટમ માટે નવું નામ —</option>
            </select>
            {needsPerItemKgOverride && (
              <motion.div className="mt-2 space-y-2 rounded-xl border border-amber-500/25 bg-[#202020] p-3">
                {itemForm.unitMode === 'custom' && (
                  <input
                    value={itemForm.customUnitName}
                    onChange={(e) => setItemForm((prev) => ({ ...prev, customUnitName: e.target.value }))}
                    placeholder="એકમનું નામ (ઉદા. ડબ્બો)"
                    className="w-full p-2.5 bg-[#252525] border border-white/10 rounded-lg text-white text-sm outline-none focus:border-amber-500/50"
                  />
                )}
                <div className="flex flex-wrap items-center gap-2 text-xs text-gray-400">
                  <span className="font-bold text-amber-300">આ આઇટમ માટે ૧</span>
                  <span>
                    {itemForm.unitMode === 'global'
                      ? (globalUnits.find((r) => r.id === itemForm.globalUnitId)?.name || 'એકમ')
                      : (itemForm.customUnitName || 'એકમ')}
                  </span>
                  <span>=</span>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={itemForm.conversionAmount}
                    onChange={(e) => setItemForm((prev) => ({ ...prev, conversionAmount: e.target.value }))}
                    placeholder="13"
                    className="w-20 p-2 bg-[#252525] border border-white/10 rounded-lg text-white text-sm outline-none focus:border-amber-500/50"
                  />
                  <span>{UNIT_KG}</span>
                </div>
                <p className="text-[10px] text-gray-500">
                  ગ્લોબલ એકમ નીચે ઉમેરો · આઇટમ દીઠ kg બદલી શકાય (ઉદા. સૂર્યફૂલ તેલ ૧૩, ઘી ૧૫)
                </p>
              </motion.div>
            )}
            {itemForm.category && itemForm.unitMode === 'standard' && formatUnitConversionHint(itemForm.unit, { category: itemForm.category, unit: itemForm.unit }) && (
              <p className="mt-1 text-[10px] text-amber-400/80">
                {formatUnitConversionHint(itemForm.unit, { category: itemForm.category, unit: itemForm.unit })}
              </p>
            )}
          </div>
        </div>

        <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={handleSubmit}
          disabled={submitting}
          className="mt-5 w-full bg-gradient-to-r from-amber-500 to-yellow-600 text-white p-4 rounded-xl font-bold shadow-xl shadow-amber-500/20 flex items-center justify-center gap-2 text-sm sm:text-base disabled:opacity-50">
          {submitting ? <Loader2 size={18} className="animate-spin" /> : <CheckCircle size={18} />}
          {editingId ? 'Update Item' : 'Save Item'}
        </motion.button>
        {!hasFirebaseItems && (
          <button
            type="button"
            onClick={handleImportDefaults}
            disabled={importingDefaults}
            className="mt-3 w-full rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm font-bold text-amber-300 transition-all hover:bg-amber-500/20 disabled:opacity-50"
          >
            {importingDefaults ? 'Importing Default Items...' : 'Import Default Item List To Firebase'}
          </button>
        )}
        <p className="mt-3 text-xs text-gray-500">Logged in as {user?.username || 'Admin'}</p>
        <GlobalUnitsPanel onUnitsChange={refreshGlobalUnits} />
      </motion.div>

      <motion.div initial={{ y: 10, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
        className="bg-gradient-to-b from-[#1e1e1e] to-[#181818] p-4 sm:p-6 rounded-2xl sm:rounded-3xl border border-white/5 shadow-xl">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 text-amber-400 font-bold uppercase text-xs tracking-widest">
            <Search size={16} /> Catalog Items
          </div>
          <button
            type="button"
            onClick={refreshCatalog}
            className="text-gray-400 hover:text-amber-400 flex items-center justify-center gap-1.5 text-xs font-bold uppercase transition-all bg-white/5 hover:bg-amber-500/10 px-3 py-2 rounded-xl border border-white/10"
          >
            <RefreshCw size={14} /> Refresh
          </button>
        </div>
        <div className="relative mt-5">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={16} />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by item or category..."
            className="w-full rounded-xl border border-white/10 bg-[#252525] py-3 pl-10 pr-3 text-sm text-white outline-none transition-all focus:border-amber-500/50"
          />
        </div>

        <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-2">
          {visibleItems.map((item) => (
            <div key={item.id} className="rounded-2xl border border-white/5 bg-[#181818] p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-base font-black text-white">{item.name}</p>
                  <p className="mt-1 text-xs uppercase tracking-wide text-gray-500">{item.category}</p>
                </div>
                <span className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-2 py-1 text-[10px] font-bold uppercase text-amber-300">
                  {item.unit}
                  {item.unitToKgFactor ? ` · ૧=${item.unitToKgFactor}kg` : ''}
                </span>
              </div>
              <div className="mt-4 flex gap-2">
                <button
                  type="button"
                  onClick={() => handleEdit(item)}
                  className="flex-1 rounded-xl border border-blue-500/20 bg-blue-500/10 px-3 py-2 text-xs font-bold uppercase text-blue-400 transition-all hover:bg-blue-500/20"
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(item)}
                  disabled={deletingId === item.id || item.source === 'static'}
                  className="flex-1 rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs font-bold uppercase text-red-400 transition-all hover:bg-red-500/20 disabled:opacity-50"
                >
                  {deletingId === item.id ? 'Removing...' : 'Deactivate'}
                </button>
              </div>
            </div>
          ))}
          {visibleItems.length === 0 && (
            <div className="md:col-span-2 rounded-2xl border border-dashed border-white/10 bg-[#181818] px-4 py-10 text-center text-sm text-gray-500">
              No items found in the catalog.
            </div>
          )}
        </div>
      </motion.div>

      <AnimatePresence>
        {showInactiveModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[220] bg-black/80 p-3 sm:p-6"
            onClick={() => setShowInactiveModal(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(event) => event.stopPropagation()}
              className="mx-auto max-w-3xl rounded-3xl border border-white/10 bg-[#141414] p-4 sm:p-6"
            >
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-lg font-black text-white">Deactive Items</h3>
                <button
                  type="button"
                  onClick={() => setShowInactiveModal(false)}
                  className="rounded-xl border border-white/10 bg-white/5 p-2 text-gray-300 hover:text-white"
                >
                  <X size={16} />
                </button>
              </div>
              <div className="relative mt-4">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={16} />
                <input
                  value={inactiveSearch}
                  onChange={(e) => setInactiveSearch(e.target.value)}
                  placeholder="Search deactive items..."
                  className="w-full rounded-xl border border-white/10 bg-[#252525] py-3 pl-10 pr-3 text-sm text-white outline-none focus:border-red-500/40"
                />
              </div>
              <div className="mt-4 max-h-[55vh] space-y-2 overflow-y-auto pr-1">
                {visibleInactiveItems.length > 0 ? visibleInactiveItems.map((item) => (
                  <div key={item.id} className="flex items-center justify-between rounded-xl border border-white/10 bg-[#1a1a1a] px-3 py-3">
                    <div className="min-w-0">
                      <p className="truncate font-bold text-white">{item.name}</p>
                      <p className="text-xs text-gray-500">{item.category}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleReactivate(item)}
                      disabled={reactivatingId === item.id}
                      className="rounded-xl border border-green-500/20 bg-green-500/10 px-3 py-2 text-xs font-bold uppercase text-green-300 hover:bg-green-500/20 disabled:opacity-50"
                    >
                      {reactivatingId === item.id ? 'Activating...' : 'Activate'}
                    </button>
                  </div>
                )) : (
                  <div className="rounded-xl border border-dashed border-white/10 bg-[#1a1a1a] px-3 py-8 text-center text-sm text-gray-500">
                    No deactive items.
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

const createDefaultPurchaseForm = () => ({
  purchaseSource: '',
  shopName: '',
  billNo: '',
  billDate: new Date().toISOString().split('T')[0],
  entryDate: new Date().toISOString().split('T')[0],
  rows: createRowsFromItems([], 5),
});

function PurchaseAdminPanel({ user, catalogItems, onLedgerChanged }) {
  const [purchaseForm, setPurchaseForm] = useState(createDefaultPurchaseForm);
  const [purchases, setPurchases] = useState([]);
  const [purchaseLoading, setPurchaseLoading] = useState(true);
  const [purchaseSubmitting, setPurchaseSubmitting] = useState(false);
  const [purchaseDeleting, setPurchaseDeleting] = useState(null);
  const [purchaseFilters, setPurchaseFilters] = useState({ date: '', source: '', shop: '' });
  const [savedShopNames, setSavedShopNames] = useState([]);
  const [previewPurchase, setPreviewPurchase] = useState(null);
  const [editPurchase, setEditPurchase] = useState(null);
  const [purchasePdfLoading, setPurchasePdfLoading] = useState(null);

  const fetchPurchases = async () => {
    setPurchaseLoading(true);
    try {
      const snapshot = await getDocs(query(collection(db, 'purchases'), orderBy('timestamp', 'desc')));
      setPurchases(snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() })).filter((item) => !item.is_deleted));
    } catch (error) {
      console.warn('Purchase fetch failed:', error);
      setPurchases([]);
    }
    setPurchaseLoading(false);
  };

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      fetchPurchases();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, []);

  const refreshSavedShopNames = useCallback(async () => {
    const names = await fetchPurchaseShopNameList();
    setSavedShopNames(names);
  }, []);

  useEffect(() => {
    refreshSavedShopNames();
  }, [refreshSavedShopNames]);

  const updatePurchaseRow = (id, field, value) => {
    const patch = field === 'kg' ? { qty: value } : { [field]: value };
    setPurchaseForm((prev) => ({
      ...prev,
      rows: patchStockRow(prev.rows, id, patch, catalogItems),
    }));
  };

  const selectPurchaseRowItem = (id, item) => {
    setPurchaseForm((prev) => ({
      ...prev,
      rows: patchStockRow(prev.rows, id, { itemName: item.name }, catalogItems),
    }));
  };

  const addPurchaseRow = () => {
    setPurchaseForm((prev) => ({
      ...prev,
      rows: [
        ...prev.rows,
        createEmptyItemRow(getNextRowId(prev.rows)),
      ],
    }));
  };

  const removePurchaseRow = (id) => {
    setPurchaseForm((prev) => ({
      ...prev,
      rows: prev.rows.length > 1 ? prev.rows.filter((row) => row.id !== id) : prev.rows,
    }));
  };

  const filledRows = purchaseForm.rows.filter((row) => row.itemName.trim());
  const catalogNameKeys = new Set(catalogItems.map((item) => item.nameKey));

  const clearPurchaseFilters = () => setPurchaseFilters({ date: '', source: '', shop: '' });

  const handlePurchaseSubmit = async () => {
    if (!purchaseForm.purchaseSource) return alert('પ્રકાર પસંદ કરો (દુકાન અથવા કોઠાર સ્ટોક).');
    if (purchaseForm.purchaseSource === PURCHASE_SOURCE_SHOP) {
      if (!purchaseForm.shopName.trim()) return alert('દુકાનનું નામ લખો.');
      if (!purchaseForm.billNo.trim()) return alert('બિલ નંબર લખો.');
      if (!purchaseForm.billDate) return alert('બિલ તારીખ પસંદ કરો.');
    } else if (purchaseForm.purchaseSource === PURCHASE_SOURCE_KOTHAR_STOCK) {
      if (!purchaseForm.entryDate) return alert('તારીખ પસંદ કરો.');
    }
    if (filledRows.length === 0) return alert('Add at least one purchased item.');
    const invalidItem = filledRows.find((row) => !catalogNameKeys.has(normalizeItemName(row.itemName)));
    if (invalidItem) {
      return alert(`Invalid item name: "${invalidItem.itemName}". Please select an item from the master list.`);
    }

    setPurchaseSubmitting(true);
    try {
      const isShop = purchaseForm.purchaseSource === PURCHASE_SOURCE_SHOP;
      const primaryDate = isShop ? purchaseForm.billDate : purchaseForm.entryDate;
      if (!canSubmitStockEntryDate(primaryDate)) {
        const backfillNote = ENABLE_INITIAL_STOCK_BACKFILL
          ? ` (initial mode: last ${INITIAL_BACKFILL_MONTHS} months allowed)`
          : ` (previous month only till day ${MONTH_CLOSE_GRACE_DAYS})`;
        alert(`This month is closed for stock entry${backfillNote}.`);
        setPurchaseSubmitting(false);
        return;
      }
      const payload = {
        type: 'purchase',
        purchaseSource: purchaseForm.purchaseSource,
        center: '',
        shopName: isShop ? purchaseForm.shopName.trim() : '',
        billNo: isShop ? purchaseForm.billNo.trim() : '',
        billDate: isShop ? purchaseForm.billDate : '',
        entryDate: isShop ? '' : purchaseForm.entryDate,
        date: primaryDate,
        items: filledRows.map((row) => ({
          itemName: row.itemName.trim(),
          qty: row.qty,
          unit: row.unit,
          kg: row.kg,
        })),
        totalKg: roundKg2(filledRows.reduce((sum, row) => sum + (parseFloat(row.kg) || 0), 0)),
        timestamp: new Date(),
        submittedBy: user.username,
        globalStockSynced: false,
      };

      const docRef = await addDoc(collection(db, 'purchases'), payload);
      await Promise.all(
        payload.items.map((item, lineIndex) =>
          setDoc(
            doc(db, STOCK_TRANSACTIONS_COLLECTION, makeStockTransactionDocId('purchase', docRef.id, lineIndex, 'IN')),
            {
              sourceType: 'purchase',
              sourceId: docRef.id,
              lineIndex,
              center_id: 'global',
              centerName: 'All Centers / Full Report',
              item_id: normalizeItemName(item.itemName),
              itemName: item.itemName,
              transaction_type: 'IN',
              quantity: toSafeTxQuantity(item.kg),
              transaction_date: normalizeDateOnly(payload.date),
              created_at: payload.timestamp,
              autoSynced: true,
              is_deleted: false,
              updatedAt: new Date(),
            },
            { merge: true },
          ),
        ),
      );
      if (isShop) await ensurePurchaseShopNameSaved(purchaseForm.shopName.trim());
      let stockSyncWarning = '';
      let globalStockSyncedOk = false;
      try {
        await applyGlobalStockKgDelta(payload.items, 1);
        await updateDoc(doc(db, 'purchases', docRef.id), { globalStockSynced: true });
        globalStockSyncedOk = true;
      } catch (stockErr) {
        console.error('global-stock sync:', stockErr);
        stockSyncWarning = `\n\n⚠ "${GLOBAL_STOCK_COLLECTION}" અપડેટ નિષ્ફળ — rules / નેટવર્ક તપાસો.\n${stockErr.message}`;
      }
      setPurchases((prev) => [
        { id: docRef.id, ...payload, globalStockSynced: globalStockSyncedOk },
        ...prev,
      ]);
      setPurchaseForm(createDefaultPurchaseForm());
      if (isShop) refreshSavedShopNames();
      onLedgerChanged?.();
      alert(`Purchase entry saved! ✅${stockSyncWarning}`);
    } catch (error) {
      alert(`Purchase Error: ${error.message}`);
    }
    setPurchaseSubmitting(false);
  };

  const handleDeletePurchase = async (purchase) => {
    const delLabel = getPurchaseResolvedSource(purchase) === PURCHASE_SOURCE_KOTHAR_STOCK
      ? `કોઠાર સ્ટોક એન્ટ્રી (${formatDisplayDate(purchase.date || purchase.entryDate)})`
      : `બિલ ${purchase.billNo} — ${purchase.shopName}`;
    if (!window.confirm(`Delete ${delLabel}?`)) return;
    setPurchaseDeleting(purchase.id);
    try {
      if (purchase.globalStockSynced === true) {
        try {
          await applyGlobalStockKgDelta(purchase.items || [], -1);
        } catch (stockErr) {
          console.error('global-stock revert:', stockErr);
          alert(`સ્ટોકમાંથી KG ઘટાડવામાં ભૂલ — એન્ટ્રી ડિલીટ રોકાઈ.\n${stockErr.message}`);
          setPurchaseDeleting(null);
          return;
        }
      }
      await updateDoc(doc(db, 'purchases', purchase.id), { is_deleted: true });
      await setSourceTransactionsDeleted('purchase', purchase.id, true);
      setPurchases((prev) => prev.filter((item) => item.id !== purchase.id));
      onLedgerChanged?.();
    } catch (error) {
      alert(`Delete Error: ${error.message}`);
    }
    setPurchaseDeleting(null);
  };

  const handleDownloadPurchase = async (purchase) => {
    setPurchasePdfLoading(purchase.id);
    try {
      await saveBlobFromProducer(() => generatePurchasePDFBlob(purchase), getPurchaseFileName(purchase));
    } catch (error) {
      alert(`Download Error: ${error.message}`);
    }
    setPurchasePdfLoading(null);
  };

  const handleSharePurchase = async (purchase) => {
    setPurchasePdfLoading(purchase.id);
    try {
      const blob = await generatePurchasePDFBlob(purchase);
      const file = new File([blob], getPurchaseFileName(purchase), { type: 'application/pdf' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: 'Purchase Report',
          text: getPurchaseResolvedSource(purchase) === PURCHASE_SOURCE_KOTHAR_STOCK
            ? `મુખ્ય કોઠાર સ્ટોક — ${formatDisplayDate(purchase.date)}`
            : `${purchase.shopName} - Bill ${purchase.billNo}`,
        });
      } else {
        await saveBlobFromProducer(() => Promise.resolve(blob), getPurchaseFileName(purchase));
        alert('Share not supported on this device. File downloaded instead.');
      }
    } catch (error) {
      alert(`Share Error: ${error.message}`);
    }
    setPurchasePdfLoading(null);
  };

  const filteredPurchases = purchases.filter((purchase) => {
    const displayDate = purchase.date || purchase.billDate || purchase.entryDate;
    const dateMatch = purchaseFilters.date ? displayDate === purchaseFilters.date : true;
    const resolvedSrc = getPurchaseResolvedSource(purchase);
    const sourceMatch = purchaseFilters.source ? resolvedSrc === purchaseFilters.source : true;
    const shopMatch = purchaseFilters.shop ? matchesSearchText(purchase.shopName, purchaseFilters.shop) : true;
    return dateMatch && sourceMatch && shopMatch;
  });

  if (editPurchase) {
    return (
      <EditPurchaseScreen
        purchase={editPurchase}
        catalogItems={catalogItems}
        savedShopNames={savedShopNames}
        onBack={() => {
          setEditPurchase(null);
          fetchPurchases();
        }}
        onUpdated={(updated) => {
          setPurchases((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
          setEditPurchase(null);
          onLedgerChanged?.();
        }}
      />
    );
  }

  return (
    <>
      <motion.div
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="bg-gradient-to-b from-[#1e1e1e] to-[#181818] p-4 sm:p-6 rounded-2xl sm:rounded-3xl border border-white/5 mb-6 sm:mb-8 shadow-xl"
      >
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-violet-400 font-bold uppercase text-xs tracking-widest">
              <Box size={16} /> Purchased Material
            </div>
            <h2 className="mt-2 text-xl sm:text-2xl font-black text-white">ખરીદી / મુખ્ય કોઠાર સ્ટોક</h2>
            <p className="mt-2 text-sm text-gray-400 max-w-2xl">
              દુકાનની ખરીદી અથવા મુખ્ય કોઠાર સ્ટોક એન્ટ્રી. ઓલ-સેન્ટર્સ રિપોર્ટમાં નવી ખરીદી ગ્લોબલ આવક તરીકે ગણાશે; જુની એન્ટ્રીઓમાં Center હોય તો સેન્ટરવાઇઝ રિપોર્ટ મુજબ જ દેખાશે.
            </p>
          </div>
          <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={() => setPurchaseForm(createDefaultPurchaseForm())}
            className="text-gray-400 hover:text-white flex items-center justify-center gap-1.5 text-xs font-bold uppercase transition-all bg-white/5 hover:bg-white/10 px-3 py-2 rounded-xl border border-white/10">
            <Eraser size={14} /> Clear
          </motion.button>
        </div>

        <div className="grid grid-cols-1 gap-3 mt-6">
          <div className="sm:max-w-xl">
            <label className="block text-[11px] font-bold uppercase tracking-widest text-gray-500 mb-2">પ્રકાર *</label>
            <select
              className="w-full p-3 bg-[#252525] border border-white/10 rounded-xl text-white outline-none focus:border-violet-500/50 transition-all text-sm appearance-none cursor-pointer"
              value={purchaseForm.purchaseSource}
              onChange={(e) => setPurchaseForm((prev) => ({ ...prev, purchaseSource: e.target.value }))}
            >
              <option value="">- પ્રકાર પસંદ કરો -</option>
              <option value={PURCHASE_SOURCE_SHOP}>દુકાન માંથી ખરીદેલ માલ</option>
              <option value={PURCHASE_SOURCE_KOTHAR_STOCK}>સ્વામિનારાયણ ધામ મુખ્ય કોઠાર સ્ટોક</option>
            </select>
          </div>

          {purchaseForm.purchaseSource === PURCHASE_SOURCE_SHOP && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="sm:col-span-2 lg:col-span-2">
                <label className="block text-[11px] font-bold uppercase tracking-widest text-gray-500 mb-2">Shop Name *</label>
                <input
                  list="purchase-shop-datalist"
                  autoComplete="off"
                  className="w-full p-3 bg-[#252525] border border-white/10 rounded-xl text-white outline-none focus:border-violet-500/50 transition-all text-sm"
                  value={purchaseForm.shopName}
                  onChange={(e) => setPurchaseForm((prev) => ({ ...prev, shopName: e.target.value }))}
                  placeholder="દુકાનનું નામ — લિસ્ટમાંથી અથવા નવું લખો"
                />
                <datalist id="purchase-shop-datalist">
                  {savedShopNames.map((name) => (
                    <option key={name} value={name} />
                  ))}
                </datalist>
              </div>
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-widest text-gray-500 mb-2">Bill Number *</label>
                <input
                  className="w-full p-3 bg-[#252525] border border-white/10 rounded-xl text-white outline-none focus:border-violet-500/50 transition-all text-sm"
                  value={purchaseForm.billNo}
                  onChange={(e) => setPurchaseForm((prev) => ({ ...prev, billNo: e.target.value }))}
                  placeholder="બિલ નંબર"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-widest text-gray-500 mb-2">Bill Date *</label>
                <input
                  type="date"
                  className="w-full p-3 bg-[#252525] border border-white/10 rounded-xl text-white outline-none focus:border-violet-500/50 transition-all text-sm"
                  value={purchaseForm.billDate}
                  onChange={(e) => setPurchaseForm((prev) => ({ ...prev, billDate: e.target.value }))}
                />
              </div>
            </div>
          )}

          {purchaseForm.purchaseSource === PURCHASE_SOURCE_KOTHAR_STOCK && (
            <div className="grid grid-cols-1 gap-3 sm:max-w-xs">
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-widest text-gray-500 mb-2">તારીખ *</label>
                <input
                  type="date"
                  className="w-full p-3 bg-[#252525] border border-white/10 rounded-xl text-white outline-none focus:border-violet-500/50 transition-all text-sm"
                  value={purchaseForm.entryDate}
                  onChange={(e) => setPurchaseForm((prev) => ({ ...prev, entryDate: e.target.value }))}
                />
              </div>
            </div>
          )}
        </div>

        <div className="mt-5 space-y-4">
          <div className="rounded-2xl border border-white/10 bg-white/5 overflow-hidden">
          <div className="p-4 border-b border-white/10 flex items-center justify-between">
            <p className="text-[11px] font-bold uppercase tracking-widest text-gray-500">Purchased Items</p>
            <span className="text-xs text-violet-300 font-bold">{filledRows.length} rows filled</span>
          </div>
          <ItemsListSearchHint />
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[#151515]">
                <tr>
                  <th className="p-3 text-left text-gray-500 font-bold text-xs uppercase w-10">No</th>
                  <th className="p-3 text-left text-gray-500 font-bold text-xs uppercase">Item Name</th>
                  <th className="p-3 text-center text-gray-500 font-bold text-xs uppercase w-32">માત્રા</th>
                  <th className="p-3 w-10" />
                </tr>
              </thead>
              <tbody>
                {purchaseForm.rows.map((row, index) => (
                  <tr key={row.id} className={`border-t border-white/5 ${row.itemName ? 'bg-violet-500/5' : ''}`}>
                    <td className="p-2 text-gray-500 text-center text-xs font-mono">{index + 1}</td>
                    <td className="p-2">
                      <ItemNameAutocompleteInput
                        accent="violet"
                        catalogItems={catalogItems}
                        placeholder={`Item ${index + 1}...`}
                        value={row.itemName}
                        excludedNameKeys={purchaseForm.rows
                          .filter((entry) => entry.id !== row.id)
                          .map((entry) => normalizeItemName(entry.itemName))
                          .filter(Boolean)}
                        onChange={(nextValue) => updatePurchaseRow(row.id, 'itemName', nextValue)}
                        onSelectItem={(item) => selectPurchaseRowItem(row.id, item)}
                      />
                    </td>
                    <td className="p-2">
                      <CatalogStockQtyInput
                        row={row}
                        catalogItems={catalogItems}
                        accent="violet"
                        onQtyChange={(value) => updatePurchaseRow(row.id, 'qty', value)}
                      />
                    </td>
                    <td className="p-2 text-center">
                      <motion.button whileTap={{ scale: 0.9 }} onClick={() => removePurchaseRow(row.id)}
                        className="text-red-400/40 hover:text-red-400 transition-colors p-1 rounded">
                        <X size={14} />
                      </motion.button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="p-3 border-t border-white/5">
            <motion.button whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.98 }} onClick={addPurchaseRow}
              className="w-full p-3 bg-[#252525] hover:bg-[#2d2d2d] border border-dashed border-white/10 hover:border-violet-500/30 rounded-xl text-gray-400 hover:text-violet-400 font-bold text-sm flex items-center justify-center gap-2 transition-all">
              <Plus size={16} /> Blank Row Umero
            </motion.button>
          </div>
          </div>
        </div>

        <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={handlePurchaseSubmit}
          disabled={purchaseSubmitting}
          className="mt-5 w-full bg-gradient-to-r from-violet-500 to-fuchsia-600 text-white p-4 rounded-xl font-bold shadow-xl shadow-violet-500/20 flex items-center justify-center gap-2 text-sm sm:text-base disabled:opacity-50">
          {purchaseSubmitting ? <Loader2 size={18} className="animate-spin" /> : <CheckCircle size={18} />} Save Purchase Entry
        </motion.button>
      </motion.div>

      <motion.div
        initial={{ y: 10, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="bg-gradient-to-b from-[#1e1e1e] to-[#181818] p-4 sm:p-6 rounded-2xl sm:rounded-3xl border border-white/5 shadow-xl"
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 text-violet-400 font-bold uppercase text-xs tracking-widest">
            <Search size={16} /> Purchase Log
          </div>
          <div className="flex gap-2 sm:gap-3">
            <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={fetchPurchases}
              className="text-gray-400 hover:text-violet-400 flex items-center justify-center gap-1.5 text-xs font-bold uppercase transition-all bg-white/5 hover:bg-violet-500/10 px-3 py-2 rounded-xl border border-white/10">
              <RefreshCw size={14} /> Refresh
            </motion.button>
            <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={clearPurchaseFilters}
              className="text-gray-400 hover:text-white flex items-center justify-center gap-1.5 text-xs font-bold uppercase transition-all bg-white/5 hover:bg-white/10 px-3 py-2 rounded-xl border border-white/10">
              <Eraser size={14} /> Clear
            </motion.button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-5">
          <input
            type="date"
            className="w-full p-3 bg-[#252525] border border-white/10 rounded-xl text-white outline-none focus:border-violet-500/50 transition-all text-sm"
            value={purchaseFilters.date}
            onChange={(e) => setPurchaseFilters((prev) => ({ ...prev, date: e.target.value }))}
          />
          <select
            className="w-full p-3 bg-[#252525] border border-white/10 rounded-xl text-white outline-none focus:border-violet-500/50 transition-all text-sm appearance-none cursor-pointer"
            value={purchaseFilters.source}
            onChange={(e) => setPurchaseFilters((prev) => ({ ...prev, source: e.target.value }))}
          >
            <option value="">બધા પ્રકાર</option>
            <option value={PURCHASE_SOURCE_SHOP}>દુકાન ખરીદી</option>
            <option value={PURCHASE_SOURCE_KOTHAR_STOCK}>મુખ્ય કોઠાર સ્ટોક</option>
          </select>
          <input
            placeholder="Shop name..."
            className="w-full p-3 bg-[#252525] border border-white/10 rounded-xl text-white outline-none focus:border-violet-500/50 transition-all text-sm placeholder-gray-500"
            value={purchaseFilters.shop}
            onChange={(e) => setPurchaseFilters((prev) => ({ ...prev, shop: e.target.value }))}
          />
        </div>

        {purchaseLoading ? (
          <div className="flex justify-center py-20">
            <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }}>
              <Loader2 size={48} className="text-violet-500" />
            </motion.div>
          </div>
        ) : filteredPurchases.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 mt-6">
            {filteredPurchases.map((purchase) => (
              <div key={purchase.id} className="bg-[#181818] rounded-2xl border border-white/5 overflow-hidden">
                <div className="p-4 border-b border-white/5 bg-gradient-to-r from-violet-500/10 to-fuchsia-500/5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[10px] font-black uppercase tracking-[0.15em] text-fuchsia-300/90 mb-1">
                        {getPurchaseResolvedSource(purchase) === PURCHASE_SOURCE_KOTHAR_STOCK
                          ? 'મુખ્ય કોઠાર સ્ટોક'
                          : 'દુકાન ખરીદી'}
                      </p>
                      <p className="font-black text-white text-sm truncate">
                        {getPurchaseResolvedSource(purchase) === PURCHASE_SOURCE_KOTHAR_STOCK
                          ? 'સ્વામિનારાયણ ધામ મુખ્ય કોઠાર'
                          : (purchase.shopName || '-')}
                      </p>
                      {getPurchaseResolvedSource(purchase) === PURCHASE_SOURCE_SHOP && (
                        <p className="text-xs text-violet-300 mt-1">Bill #{purchase.billNo || '-'}</p>
                      )}
                      {(purchase.center || '').trim() !== '' && (
                        <p className="text-[10px] text-amber-400/90 mt-1 font-bold uppercase tracking-wide">જુનો Center: {purchase.center}</p>
                      )}
                    </div>
                    <p className="text-xs text-gray-400 shrink-0">{formatDisplayDate(purchase.date || purchase.billDate || purchase.entryDate)}</p>
                  </div>
                </div>
                <div className="p-4 space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="bg-[#252525] p-3 rounded-xl text-center border border-white/5">
                      <p className="text-[10px] text-gray-500 uppercase font-bold">Items</p>
                      <p className="font-black text-white">{(purchase.items || []).length}</p>
                    </div>
                    <div className="bg-violet-500/10 p-3 rounded-xl text-center border border-violet-500/20">
                      <p className="text-[10px] text-violet-300 uppercase font-bold">Total KG</p>
                      <p className="font-black text-violet-200">{formatMetric(purchase.totalKg)}</p>
                    </div>
                  </div>
                  <div className="rounded-xl border border-white/5 bg-[#252525] p-3 text-xs text-gray-400 space-y-1">
                    {(purchase.items || []).slice(0, 3).map((item, index) => (
                      <p key={`${purchase.id}-${index}`} className="truncate">
                        <span className="font-bold text-white">{item.itemName}</span> - {formatMetric(item.kg || 0)} KG
                      </p>
                    ))}
                    {(purchase.items || []).length > 3 && (
                      <p className="text-violet-300 font-bold">+ {(purchase.items || []).length - 3} more items</p>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={() => setPreviewPurchase(purchase)}
                      className="bg-[#252525] hover:bg-[#2d2d2d] text-white p-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all border border-white/5">
                      <Eye size={14} /> Preview
                    </motion.button>
                    <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={() => setEditPurchase(purchase)}
                      className="bg-[#252525] hover:bg-[#2d2d2d] text-white p-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all border border-white/5">
                      <Edit3 size={14} /> Edit
                    </motion.button>
                    <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} disabled={purchasePdfLoading === purchase.id} onClick={() => handleSharePurchase(purchase)}
                      className="bg-[#252525] hover:bg-[#2d2d2d] text-white p-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all border border-white/5 disabled:opacity-50">
                      {purchasePdfLoading === purchase.id ? <Loader2 size={14} className="animate-spin" /> : <Share2 size={14} />} Share
                    </motion.button>
                    <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} disabled={purchasePdfLoading === purchase.id} onClick={() => handleDownloadPurchase(purchase)}
                      className="bg-gradient-to-r from-violet-500 to-fuchsia-600 text-white p-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all shadow-lg shadow-violet-500/20 disabled:opacity-50">
                      {purchasePdfLoading === purchase.id ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />} Download
                    </motion.button>
                    <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={() => handleDeletePurchase(purchase)}
                      disabled={purchaseDeleting === purchase.id}
                      className="col-span-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 p-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all border border-red-500/20 disabled:opacity-50">
                      {purchaseDeleting === purchase.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />} Delete
                    </motion.button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center py-20">
            <Box size={64} className="text-gray-600 mx-auto mb-4" />
            <p className="text-gray-400 text-lg font-bold">No purchase entries found</p>
            <p className="text-gray-500 text-sm mt-2">Saved purchase entries appear here and feed into report income.</p>
          </motion.div>
        )}
      </motion.div>

      <AnimatePresence>
        {previewPurchase && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/90 backdrop-blur-sm z-[200] flex items-center justify-center p-2 sm:p-4"
            onClick={() => setPreviewPurchase(null)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white text-black w-full max-w-4xl max-h-[95vh] overflow-y-auto rounded-xl sm:rounded-2xl p-6 sm:p-8 relative shadow-2xl font-serif"
            >
              <motion.button whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} onClick={() => setPreviewPurchase(null)}
                className="absolute top-3 right-3 sm:top-4 sm:right-4 bg-gray-100 p-2 rounded-full text-black hover:bg-gray-200 transition-colors z-10">
                <X size={20} />
              </motion.button>

              <div className="border-b-4 border-violet-600 pb-4 mb-6">
                <h1 className="text-2xl sm:text-3xl font-black text-violet-700 uppercase">Purchase Report</h1>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 text-sm mb-6 bg-gray-50 p-4 sm:p-5 rounded-2xl border border-gray-100">
                {getPurchaseResolvedSource(previewPurchase) === PURCHASE_SOURCE_KOTHAR_STOCK ? (
                  <>
                    <div className="sm:col-span-2"><p className="text-gray-400 text-[10px] font-bold uppercase mb-1">પ્રકાર</p><p className="font-bold">સ્વામિનારાયણ ધામ મુખ્ય કોઠાર સ્ટોક</p></div>
                    <div><p className="text-gray-400 text-[10px] font-bold uppercase mb-1">તારીખ</p><p className="font-bold">{formatDisplayDate(previewPurchase.date || previewPurchase.entryDate)}</p></div>
                  </>
                ) : (
                  <>
                    <div><p className="text-gray-400 text-[10px] font-bold uppercase mb-1">Shop Name</p><p className="font-bold">{previewPurchase.shopName}</p></div>
                    <div><p className="text-gray-400 text-[10px] font-bold uppercase mb-1">Bill Number</p><p className="font-bold">#{previewPurchase.billNo}</p></div>
                    <div><p className="text-gray-400 text-[10px] font-bold uppercase mb-1">Bill Date</p><p className="font-bold">{formatDisplayDate(previewPurchase.billDate || previewPurchase.date)}</p></div>
                  </>
                )}
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-xs sm:text-[13px] border-collapse border border-black">
                  <thead className="bg-black text-white">
                    <tr>
                      <th className="border p-2 w-12 text-center">No</th>
                      <th className="border p-2 text-left">Item Name</th>
                      <th className="border p-2 w-20 text-center">Qty</th>
                      <th className="border p-2 w-20 text-center">KG</th>
                      <th className="border p-2 w-20 text-center">Unit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(previewPurchase.items || []).map((item, index) => {
                      const qtyVal = item.qty != null && item.qty !== '' ? item.qty : item.kg;
                      const unitVal = item.unit || 'કિલો';
                      const kgVal = convertItemQtyToKg(qtyVal, unitVal);
                      return (
                        <tr key={`${previewPurchase.id}-${index}`} className="even:bg-gray-50">
                          <td className="border p-2 text-center text-gray-500">{index + 1}</td>
                          <td className="border p-2 font-bold">{item.itemName}</td>
                          <td className="border p-2 text-center font-bold">{formatMetric(qtyVal)}</td>
                          <td className="border p-2 text-center font-bold text-violet-700">{formatMetric(kgVal)}</td>
                          <td className="border p-2 text-center text-gray-400 text-[10px] uppercase font-sans font-bold">{unitVal}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {(() => {
                const mapped = (previewPurchase.items || []).map((it) => ({
                  name: it.itemName,
                  qty: it.qty != null && it.qty !== '' ? it.qty : it.kg,
                  unit: it.unit || 'કિલો',
                }));
                const t = calculateTotals(mapped);
                return (
              <div className="mt-6 sm:mt-10 grid grid-cols-3 border-4 border-black p-3 sm:p-5 font-black text-center uppercase text-xs sm:text-sm tracking-tighter">
                <div className="border-r border-gray-200">NUMBER OF ITEMS: {(previewPurchase.items || []).length}</div>
                <div className="border-r border-gray-200">TOTAL QTY: {formatMetric(t.totalQty)}</div>
                <div>TOTAL KG: {formatMetric(t.totalKg)}</div>
              </div>
                );
              })()}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      <PdfDownloadWaitOverlay active={purchasePdfLoading !== null} kind="purchase" />
    </>
  );
}

// --- EDIT PURCHASE SCREEN ---
const buildPurchaseFormFromRecord = (purchase, catalogItems) => ({
  purchaseSource: getPurchaseResolvedSource(purchase),
  shopName: purchase.shopName || '',
  billNo: purchase.billNo || '',
  billDate: purchase.billDate || purchase.date || new Date().toISOString().split('T')[0],
  entryDate: purchase.entryDate || purchase.date || new Date().toISOString().split('T')[0],
  rows: createRowsFromItems(
    (purchase.items || []).map((item) => ({
      itemName: item.itemName,
      qty: item.qty,
      unit: item.unit,
      kg: item.kg,
    })),
    Math.max((purchase.items || []).length, 5),
    catalogItems,
  ),
});

function EditPurchaseScreen({ purchase, onBack, catalogItems, savedShopNames, onUpdated }) {
  const [form, setForm] = useState(() => buildPurchaseFormFromRecord(purchase, catalogItems));
  const [loading, setLoading] = useState(false);
  const catalogNameKeys = new Set(catalogItems.map((item) => item.nameKey));
  const filledRows = form.rows.filter((row) => row.itemName.trim());

  const updateRow = (id, field, value) => {
    const patch = field === 'kg' ? { qty: value } : { [field]: value };
    setForm((prev) => ({
      ...prev,
      rows: patchStockRow(prev.rows, id, patch, catalogItems),
    }));
  };

  const selectRowItem = (id, item) => {
    setForm((prev) => ({
      ...prev,
      rows: patchStockRow(prev.rows, id, { itemName: item.name }, catalogItems),
    }));
  };

  const addRow = () => {
    setForm((prev) => ({
      ...prev,
      rows: [...prev.rows, createEmptyItemRow(getNextRowId(prev.rows))],
    }));
  };

  const removeRow = (id) => {
    setForm((prev) => ({
      ...prev,
      rows: prev.rows.length > 1 ? prev.rows.filter((row) => row.id !== id) : prev.rows,
    }));
  };

  const handleUpdate = async () => {
    if (!form.purchaseSource) return alert('પ્રકાર પસંદ કરો (દુકાન અથવા કોઠાર સ્ટોક).');
    if (form.purchaseSource === PURCHASE_SOURCE_SHOP) {
      if (!form.shopName.trim()) return alert('દુકાનનું નામ લખો.');
      if (!form.billNo.trim()) return alert('બિલ નંબર લખો.');
      if (!form.billDate) return alert('બિલ તારીખ પસંદ કરો.');
    } else if (form.purchaseSource === PURCHASE_SOURCE_KOTHAR_STOCK) {
      if (!form.entryDate) return alert('તારીખ પસંદ કરો.');
    }
    if (filledRows.length === 0) return alert('Add at least one purchased item.');
    const invalidItem = filledRows.find((row) => !catalogNameKeys.has(normalizeItemName(row.itemName)));
    if (invalidItem) {
      return alert(`Invalid item name: "${invalidItem.itemName}". Please select an item from the master list.`);
    }

    const isShop = form.purchaseSource === PURCHASE_SOURCE_SHOP;
    const primaryDate = isShop ? form.billDate : form.entryDate;
    if (!canSubmitStockEntryDate(primaryDate)) {
      const backfillNote = ENABLE_INITIAL_STOCK_BACKFILL
        ? ` (initial mode: last ${INITIAL_BACKFILL_MONTHS} months allowed)`
        : ` (previous month only till day ${MONTH_CLOSE_GRACE_DAYS})`;
      alert(`This month is closed for stock entry${backfillNote}.`);
      return;
    }

    setLoading(true);
    try {
      if (purchase.globalStockSynced === true) {
        try {
          await applyGlobalStockKgDelta(purchase.items || [], -1);
        } catch (stockErr) {
          console.error('global-stock revert:', stockErr);
          alert(`સ્ટોકમાંથી KG ઘટાડવામાં ભૂલ — એન્ટ્રી અપડેટ રોકાઈ.\n${stockErr.message}`);
          setLoading(false);
          return;
        }
      }

      await setSourceTransactionsDeleted('purchase', purchase.id, true);

      const payload = {
        purchaseSource: form.purchaseSource,
        center: purchase.center || '',
        shopName: isShop ? form.shopName.trim() : '',
        billNo: isShop ? form.billNo.trim() : '',
        billDate: isShop ? form.billDate : '',
        entryDate: isShop ? '' : form.entryDate,
        date: primaryDate,
        items: filledRows.map((row) => ({
          itemName: row.itemName.trim(),
          qty: row.qty,
          unit: row.unit,
          kg: row.kg,
        })),
        totalKg: roundKg2(filledRows.reduce((sum, row) => sum + (parseFloat(row.kg) || 0), 0)),
        updatedAt: new Date(),
      };

      await updateDoc(doc(db, 'purchases', purchase.id), payload);

      await Promise.all(
        payload.items.map((item, lineIndex) =>
          setDoc(
            doc(db, STOCK_TRANSACTIONS_COLLECTION, makeStockTransactionDocId('purchase', purchase.id, lineIndex, 'IN')),
            {
              sourceType: 'purchase',
              sourceId: purchase.id,
              lineIndex,
              center_id: 'global',
              centerName: 'All Centers / Full Report',
              item_id: normalizeItemName(item.itemName),
              itemName: item.itemName,
              transaction_type: 'IN',
              quantity: toSafeTxQuantity(item.kg),
              transaction_date: normalizeDateOnly(payload.date),
              created_at: purchase.timestamp || new Date(),
              autoSynced: true,
              is_deleted: false,
              updatedAt: new Date(),
            },
            { merge: true },
          ),
        ),
      );

      if (isShop) await ensurePurchaseShopNameSaved(form.shopName.trim());

      let globalStockSyncedOk = false;
      try {
        await applyGlobalStockKgDelta(payload.items, 1);
        await updateDoc(doc(db, 'purchases', purchase.id), { globalStockSynced: true });
        globalStockSyncedOk = true;
      } catch (stockErr) {
        console.error('global-stock sync:', stockErr);
        await updateDoc(doc(db, 'purchases', purchase.id), { globalStockSynced: false });
        alert(`Purchase updated but stock sync failed: ${stockErr.message}`);
      }

      onUpdated({ ...purchase, ...payload, globalStockSynced: globalStockSyncedOk });
      alert('Purchase updated! ✅');
    } catch (error) {
      alert(`Update Error: ${error.message}`);
    }
    setLoading(false);
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: 50 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -50 }}
      className="max-w-3xl mx-auto p-3 sm:p-4 pb-8"
    >
      <motion.button whileHover={{ x: -5 }} onClick={onBack}
        className="mb-4 flex items-center gap-2 text-violet-400 font-bold text-sm">
        <ArrowLeft size={20} /> Cancel Edit
      </motion.button>

      <motion.div initial={{ y: -20, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
        className="bg-gradient-to-b from-[#1e1e1e] to-[#181818] p-4 sm:p-6 rounded-2xl sm:rounded-3xl border border-white/5 mb-4 shadow-xl">
        <h2 className="text-lg sm:text-xl font-bold mb-4 text-transparent bg-clip-text bg-gradient-to-r from-violet-400 to-fuchsia-500 flex items-center gap-2">
          <Edit3 size={22} /> Edit Purchase Entry
        </h2>

        <div className="grid grid-cols-1 gap-3">
          <div className="sm:max-w-xl">
            <label className="block text-[11px] font-bold uppercase tracking-widest text-gray-500 mb-2">પ્રકાર *</label>
            <select
              className="w-full p-3 bg-[#252525] border border-white/10 rounded-xl text-white outline-none focus:border-violet-500/50 transition-all text-sm appearance-none cursor-pointer"
              value={form.purchaseSource}
              onChange={(e) => setForm((prev) => ({ ...prev, purchaseSource: e.target.value }))}
            >
              <option value="">- પ્રકાર પસંદ કરો -</option>
              <option value={PURCHASE_SOURCE_SHOP}>દુકાન માંથી ખરીદેલ માલ</option>
              <option value={PURCHASE_SOURCE_KOTHAR_STOCK}>સ્વામિનારાયણ ધામ મુખ્ય કોઠાર સ્ટોક</option>
            </select>
          </div>

          {form.purchaseSource === PURCHASE_SOURCE_SHOP && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="sm:col-span-2 lg:col-span-2">
                <label className="block text-[11px] font-bold uppercase tracking-widest text-gray-500 mb-2">Shop Name *</label>
                <input
                  list="edit-purchase-shop-datalist"
                  autoComplete="off"
                  className="w-full p-3 bg-[#252525] border border-white/10 rounded-xl text-white outline-none focus:border-violet-500/50 transition-all text-sm"
                  value={form.shopName}
                  onChange={(e) => setForm((prev) => ({ ...prev, shopName: e.target.value }))}
                  placeholder="દુકાનનું નામ"
                />
                <datalist id="edit-purchase-shop-datalist">
                  {savedShopNames.map((name) => (
                    <option key={name} value={name} />
                  ))}
                </datalist>
              </div>
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-widest text-gray-500 mb-2">Bill Number *</label>
                <input
                  className="w-full p-3 bg-[#252525] border border-white/10 rounded-xl text-white outline-none focus:border-violet-500/50 transition-all text-sm"
                  value={form.billNo}
                  onChange={(e) => setForm((prev) => ({ ...prev, billNo: e.target.value }))}
                  placeholder="બિલ નંબર"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-widest text-gray-500 mb-2">Bill Date *</label>
                <input
                  type="date"
                  className="w-full p-3 bg-[#252525] border border-white/10 rounded-xl text-white outline-none focus:border-violet-500/50 transition-all text-sm"
                  value={form.billDate}
                  onChange={(e) => setForm((prev) => ({ ...prev, billDate: e.target.value }))}
                />
              </div>
            </div>
          )}

          {form.purchaseSource === PURCHASE_SOURCE_KOTHAR_STOCK && (
            <div className="grid grid-cols-1 gap-3 sm:max-w-xs">
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-widest text-gray-500 mb-2">તારીખ *</label>
                <input
                  type="date"
                  className="w-full p-3 bg-[#252525] border border-white/10 rounded-xl text-white outline-none focus:border-violet-500/50 transition-all text-sm"
                  value={form.entryDate}
                  onChange={(e) => setForm((prev) => ({ ...prev, entryDate: e.target.value }))}
                />
              </div>
            </div>
          )}
        </div>

        <div className="mt-5 rounded-2xl border border-white/10 bg-white/5 overflow-hidden">
          <div className="p-4 border-b border-white/10 flex items-center justify-between">
            <p className="text-[11px] font-bold uppercase tracking-widest text-gray-500">Purchased Items</p>
            <span className="text-xs text-violet-300 font-bold">{filledRows.length} rows filled</span>
          </div>
          <ItemsListSearchHint />
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[#151515]">
                <tr>
                  <th className="p-3 text-left text-gray-500 font-bold text-xs uppercase w-10">No</th>
                  <th className="p-3 text-left text-gray-500 font-bold text-xs uppercase">Item Name</th>
                  <th className="p-3 text-center text-gray-500 font-bold text-xs uppercase w-32">માત્રા</th>
                  <th className="p-3 w-10" />
                </tr>
              </thead>
              <tbody>
                {form.rows.map((row, index) => (
                  <tr key={row.id} className={`border-t border-white/5 ${row.itemName ? 'bg-violet-500/5' : ''}`}>
                    <td className="p-2 text-gray-500 text-center text-xs font-mono">{index + 1}</td>
                    <td className="p-2">
                      <ItemNameAutocompleteInput
                        accent="violet"
                        catalogItems={catalogItems}
                        placeholder={`Item ${index + 1}...`}
                        value={row.itemName}
                        excludedNameKeys={form.rows
                          .filter((entry) => entry.id !== row.id)
                          .map((entry) => normalizeItemName(entry.itemName))
                          .filter(Boolean)}
                        onChange={(nextValue) => updateRow(row.id, 'itemName', nextValue)}
                        onSelectItem={(item) => selectRowItem(row.id, item)}
                      />
                    </td>
                    <td className="p-2">
                      <CatalogStockQtyInput
                        row={row}
                        catalogItems={catalogItems}
                        accent="violet"
                        onQtyChange={(value) => updateRow(row.id, 'qty', value)}
                      />
                    </td>
                    <td className="p-2 text-center">
                      <motion.button whileTap={{ scale: 0.9 }} onClick={() => removeRow(row.id)}
                        className="text-red-400/40 hover:text-red-400 transition-colors p-1 rounded">
                        <X size={14} />
                      </motion.button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="p-3 border-t border-white/5">
            <motion.button whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.98 }} onClick={addRow}
              className="w-full p-3 bg-[#252525] hover:bg-[#2d2d2d] border border-dashed border-white/10 hover:border-violet-500/30 rounded-xl text-gray-400 hover:text-violet-400 font-bold text-sm flex items-center justify-center gap-2 transition-all">
              <Plus size={16} /> Blank Row Umero
            </motion.button>
          </div>
        </div>

        <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={handleUpdate}
          disabled={loading}
          className="mt-5 w-full bg-gradient-to-r from-violet-500 to-fuchsia-600 text-white p-4 rounded-xl font-bold shadow-xl shadow-violet-500/20 flex items-center justify-center gap-2 text-sm sm:text-base disabled:opacity-50">
          {loading ? <Loader2 size={18} className="animate-spin" /> : <CheckCircle size={18} />} Update Purchase Entry
        </motion.button>
      </motion.div>
    </motion.div>
  );
}

// --- EDIT ORDER SCREEN ---
function EditOrderScreen({ order, onBack, catalogItems, centersList = centerData }) {
  const centerInitial = useMemo(() => deriveEditableCenterFields(order.center, centersList), [order.center, centersList]);
  const [centerSelect, setCenterSelect] = useState(centerInitial.select);
  const [centerOther, setCenterOther] = useState(centerInitial.other);
  const [cart, setCart] = useState(order.items || []);
  const [loading, setLoading] = useState(false);
  const [openCategory, setOpenCategory] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const mergedCatalogItems = mergeCatalogItemsWithExisting(catalogItems, order.items || []);
  const groupedCatalogItems = filterGroupedCatalogItems(mergedCatalogItems, searchQuery);
  const resolvedCenter = getResolvedCenterValue(centerSelect, centerOther);

  const updateQuantity = (itemName, category, unit, qty) => {
    const existing = cart.find(i => normalizeItemName(i.name) === normalizeItemName(itemName));
    const line = buildRequestCartLine(itemName, category, unit, qty, mergedCatalogItems);
    if (line.qty > 0) {
      if (existing) {
        setCart(cart.map((i) => (
          normalizeItemName(i.name) === normalizeItemName(itemName) ? { ...i, ...line } : i
        )));
      } else {
        setCart([...cart, line]);
      }
    } else { setCart(cart.filter(i => normalizeItemName(i.name) !== normalizeItemName(itemName))); }
  };

  const handleUpdate = async () => {
    if (!centerSelect) return alert('Center select karo!');
    if (centerSelect === 'Other' && !centerOther.trim()) return alert('Center name likho!');
    if (cart.length === 0) return alert("Add at least one item!");
    const effectiveCenter = getResolvedCenterValue(centerSelect, centerOther);
    setLoading(true);
    try {
      const { totalKg } = calculateTotals(cart, mergedCatalogItems);
      await updateDoc(doc(db, "orders", order.id), {
        center: effectiveCenter,
        centerFromOther: centerSelect === 'Other',
        items: cart,
        totalKg,
      });
      alert("Updated Successfully! ✅");
      onBack();
    } catch (e) { alert("Error: " + e.message); }
    setLoading(false);
  };

  return (
    <motion.div 
      initial={{ opacity: 0, x: 50 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -50 }}
      className="max-w-2xl mx-auto p-3 sm:p-4 pb-32 sm:pb-36"
    >
      {/* Header */}
      <motion.button 
        whileHover={{ x: -5 }}
        onClick={onBack} 
        className="mb-4 flex items-center gap-2 text-orange-500 font-bold text-sm"
      >
        <ArrowLeft size={20} /> Cancel Edit
      </motion.button>

      {/* Order Info Card */}
      <motion.div 
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="bg-gradient-to-b from-[#1e1e1e] to-[#181818] p-4 sm:p-5 rounded-2xl border border-white/5 mb-4 shadow-xl"
      >
        <h2 className="text-lg sm:text-xl font-bold mb-3 text-transparent bg-clip-text bg-gradient-to-r from-orange-400 to-orange-600 flex items-center gap-2">
          <Edit3 size={22} /> Edit request
        </h2>
        <div className="mb-4">
          <label className="block text-[10px] text-gray-500 font-bold uppercase mb-1.5">Center *</label>
          <select
            className="w-full p-3 bg-[#252525] border border-white/10 rounded-xl text-white outline-none focus:border-orange-500/50 transition-all text-sm appearance-none cursor-pointer"
            value={centerSelect}
            onChange={(e) => {
              const next = e.target.value;
              setCenterSelect(next);
              if (next !== 'Other') setCenterOther('');
            }}
          >
            <option value="">- Center Select Karo -</option>
            {centersList.map((c) => (
              <option key={c.center} value={c.center}>{c.center}</option>
            ))}
          </select>
          {centerSelect === 'Other' && (
            <input
              className="mt-2 w-full p-3 bg-[#252525] border border-white/10 rounded-xl text-white outline-none focus:border-orange-500/50 transition-all text-sm"
              placeholder="Center name..."
              value={centerOther}
              onChange={(e) => setCenterOther(e.target.value)}
            />
          )}
          {resolvedCenter && (
            <p className="mt-2 text-[11px] text-gray-500">
              Saved as: <span className="font-bold text-orange-300">{resolvedCenter}</span>
            </p>
          )}
        </div>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="bg-[#252525] p-2 rounded-xl border border-white/5">
            <p className="text-[10px] text-gray-500 font-bold uppercase">Chalan</p>
            <p className="font-bold text-orange-400 text-sm">#{order.chalanNo}</p>
          </div>
          <div className="bg-[#252525] p-2 rounded-xl border border-white/5">
            <p className="text-[10px] text-gray-500 font-bold uppercase">Date</p>
            <p className="font-bold text-white text-sm">{order.date?.split('-').reverse().join('-')}</p>
          </div>
          <div className="bg-[#252525] p-2 rounded-xl border border-white/5">
            <p className="text-[10px] text-gray-500 font-bold uppercase">Items</p>
            <p className="font-bold text-green-400 text-sm">{cart.length}</p>
          </div>
        </div>
      </motion.div>

      {/* Search Bar */}
      <motion.div 
        initial={{ y: -10, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.1 }}
        className="mb-4 relative"
      >
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
        <input 
          type="text"
          placeholder="Search items..." 
          className="w-full p-3 sm:p-3.5 pl-11 bg-[#1e1e1e] border border-white/10 rounded-xl sm:rounded-2xl text-white outline-none focus:border-orange-500/50 transition-all text-sm placeholder-gray-500" 
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
        />
      </motion.div>

      {/* Categories with all items */}
      <motion.div 
        variants={staggerContainer}
        initial="initial"
        animate="animate"
        className="space-y-3"
      >
        {Object.entries(groupedCatalogItems).map(([category, items]) => {
          const categoryCartCount = items.filter(item => cart.find(c => normalizeItemName(c.name) === item.nameKey)).length;
          return (
            <motion.div 
              key={category}
              variants={fadeInUp}
              className="bg-gradient-to-b from-[#1e1e1e] to-[#181818] rounded-2xl border border-white/5 overflow-hidden"
            >
              <motion.button 
                whileTap={{ scale: 0.99 }}
                onClick={() => setOpenCategory(openCategory === category ? null : category)} 
                className="w-full p-4 flex justify-between items-center font-bold text-white text-sm hover:bg-white/5 transition-colors"
              >
                <span className="flex items-center gap-3">
                  <span className="text-xl">{categoryIcons[category] || "📦"}</span>
                  <span className="uppercase tracking-wide">{category}</span>
                  <span className="text-xs text-gray-500 font-normal">({items.length})</span>
                  {categoryCartCount > 0 && (
                    <span className="bg-orange-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">{categoryCartCount} selected</span>
                  )}
                </span>
                <motion.div
                  animate={{ rotate: openCategory === category ? 180 : 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <ChevronDown size={20} className="text-gray-500" />
                </motion.div>
              </motion.button>
              <AnimatePresence>
                {openCategory === category && (
                  <motion.div 
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.3 }}
                    className="overflow-hidden"
                  >
                    <div className="p-3 bg-[#151515] grid gap-2">
                      {isGheeTelCategory(category) && (
                        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] font-bold text-amber-100">
                          ૧ ડબ્બો = ૧૩ કિલો થશે, માટે નીચેના બોક્સમાં ડબ્બાની સંખ્યા લખવી.
                        </div>
                      )}
                      {isColorCategory(category) && (
                        <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-[11px] font-bold text-emerald-100">
                          કલર માટે બધી જ માત્રા ગ્રામમાં જ દાખલ કરવી. કિલોમાં મંગાવવું હોય તો પહેલા ગ્રામમાં ફેરવીને લખો.
                        </div>
                      )}
                      {items.map((item, itemIndex) => {
                        const inCart = cart.find(c => normalizeItemName(c.name) === item.nameKey);
                        const lineUnit = inCart?.unit || resolveCatalogItemUnit(item);
                        const unitLabel = getUnitShortLabel(lineUnit, item);
                        const showSteppers = isColorCategory(category) || isGheeTelCategory(category)
                          || isGramUnit(lineUnit) || isGheeTelBulkUnit(lineUnit)
                          || (item.unitToKgFactor && item.unitToKgFactor !== 1);
                        const showKgPreview = isGheeTelBulkUnit(lineUnit)
                          || (item.unitToKgFactor && item.unitToKgFactor !== 1)
                          || (inCart?.unitToKgFactor && inCart.unitToKgFactor !== 1);
                        const secondaryKg = convertItemQtyToKg(inCart?.qty, lineUnit, mergedCatalogItems, { name: item.name, ...inCart });
                        return (
                          <motion.div 
                            key={item.name}
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: itemIndex * 0.02 }}
                            className={`flex items-center justify-between p-3 sm:p-4 rounded-xl transition-all border ${inCart ? 'bg-orange-500/10 border-orange-500/30' : 'bg-[#1a1a1a] border-white/5 hover:border-white/10'}`}
                          >
                            <span className="text-sm text-gray-300 font-medium flex-1">{item.name}</span>
                            <div className="flex items-center gap-2 sm:gap-3">
                              {showSteppers && inCart && (
                                <motion.button
                                  initial={{ scale: 0 }}
                                  animate={{ scale: 1 }}
                                  whileTap={{ scale: 0.9 }}
                                  onClick={() => updateQuantity(item.name, category, inCart.unit || item.unit, Math.max(0, (parseFloat(inCart.qty) || 0) - 1))}
                                  className="w-8 h-8 flex items-center justify-center bg-[#252525] rounded-lg text-orange-500 hover:bg-[#2d2d2d] transition-colors"
                                >
                                  <Minus size={14} />
                                </motion.button>
                              )}
                              <input 
                                type="number" 
                                className="w-14 sm:w-16 p-2 bg-[#252525] border border-white/10 rounded-lg text-center text-white font-bold text-sm outline-none focus:border-orange-500/50 transition-all" 
                                value={inCart ? inCart.qty : ''} 
                                placeholder="0"
                                onChange={(e) => updateQuantity(item.name, category, inCart?.unit || item.unit, e.target.value)} 
                              />
                              <span className="text-[10px] text-gray-500 font-bold w-9 text-center uppercase">
                                {unitLabel}
                              </span>
                              {showSteppers && (
                                <motion.button
                                  whileTap={{ scale: 0.9 }}
                                  onClick={() => updateQuantity(item.name, category, inCart?.unit || item.unit, (parseFloat(inCart?.qty) || 0) + 1)}
                                  className="w-8 h-8 flex items-center justify-center bg-orange-500/20 rounded-lg text-orange-500 hover:bg-orange-500/30 transition-colors"
                                >
                                  <Plus size={14} />
                                </motion.button>
                              )}
                              {showKgPreview && (
                                <div className="hidden sm:flex items-center gap-2">
                                  <input
                                    readOnly
                                    tabIndex={-1}
                                    value={inCart ? String(roundKg2(secondaryKg)) : ''}
                                    placeholder="0"
                                    className="w-20 p-2 bg-[#1f1f1f] border border-white/10 rounded-lg text-center text-white font-black text-sm outline-none"
                                  />
                                  <span className="text-[10px] text-gray-500 font-bold">{UNIT_KG}</span>
                                </div>
                              )}
                            </div>
                          </motion.div>
                        );
                      })}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          );
        })}
      </motion.div>

      {/* Bottom Bar */}
      <motion.div 
        initial={{ y: 100 }}
        animate={{ y: 0 }}
        className="fixed bottom-0 left-0 right-0 bg-gradient-to-t from-[#1a1a1a] to-[#1a1a1a]/95 backdrop-blur-xl p-4 sm:p-5 shadow-2xl border-t border-white/5 flex justify-between items-center z-40"
      >
        <div>
          <p className="text-[10px] text-gray-500 font-bold uppercase">Items in Order</p>
          <p className="text-2xl sm:text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-orange-400 to-orange-600">{cart.length}</p>
        </div>
        <motion.button 
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={handleUpdate}
          disabled={loading}
          className="bg-gradient-to-r from-green-500 to-green-600 text-white px-6 sm:px-10 py-3 sm:py-4 rounded-xl sm:rounded-2xl font-bold shadow-xl shadow-green-500/30 flex items-center gap-2 text-sm sm:text-base disabled:opacity-50"
        >
          {loading ? <Loader2 size={20} className="animate-spin" /> : <><CheckCircle size={20} /> Save Changes</>}
        </motion.button>
      </motion.div>
    </motion.div>
  );
}

// --- EDIT SEND ORDER SCREEN ---
function EditSendOrderScreen({ order, onBack, catalogItems, centersList = centerData }) {
  const fromCenterInitial = useMemo(() => deriveEditableCenterFields(order.fromCenter, centersList), [order.fromCenter, centersList]);
  const [fromCenterSelect, setFromCenterSelect] = useState(fromCenterInitial.select);
  const [fromCenterOther, setFromCenterOther] = useState(fromCenterInitial.other);
  const mergedCatalogItems = mergeCatalogItemsWithExisting(catalogItems, order.items || []);
  const [rows, setRows] = useState(() => createRowsFromItems(order.items || [], 5, mergedCatalogItems));
  const [loading, setLoading] = useState(false);
  const catalogNameKeys = new Set(mergedCatalogItems.map((item) => item.nameKey));
  const resolvedFromCenter = getResolvedCenterValue(fromCenterSelect, fromCenterOther);

  const updateRow = (id, field, value) => {
    const patch = field === 'kg' ? { qty: value } : { [field]: value };
    setRows((prev) => patchStockRow(prev, id, patch, mergedCatalogItems));
  };
  const selectRowItem = (id, item) => {
    setRows((prev) => patchStockRow(prev, id, { itemName: item.name }, mergedCatalogItems));
  };
  const addRow = () => {
    setRows(prev => [...prev, createEmptyItemRow(getNextRowId(prev))]);
  };
  const removeRow = (id) => { if (rows.length > 1) setRows(prev => prev.filter(r => r.id !== id)); };

  const handleUpdate = async () => {
    if (!fromCenterSelect) return alert('Center select karo!');
    if (fromCenterSelect === 'Other' && !fromCenterOther.trim()) return alert('Center name likho!');
    const filledRows = rows.filter(r => r.itemName && r.itemName.trim());
    if (filledRows.length === 0) return alert('Add at least one item!');
    const invalidItem = filledRows.find((row) => !catalogNameKeys.has(normalizeItemName(row.itemName)));
    if (invalidItem) return alert(`Invalid item name: "${invalidItem.itemName}". Please select from item list.`);
    const effectiveFromCenter = getResolvedCenterValue(fromCenterSelect, fromCenterOther);
    setLoading(true);
    try {
      const totalKg = roundKg2(filledRows.reduce((sum, r) => sum + (parseFloat(r.kg) || 0), 0));
      await updateDoc(doc(db, 'send-orders', order.id), {
        fromCenter: effectiveFromCenter,
        fromCenterFromOther: fromCenterSelect === 'Other',
        items: filledRows.map((row) => ({
          itemName: row.itemName.trim(),
          qty: row.qty,
          unit: row.unit,
          kg: row.kg,
        })),
        totalKg,
      });
      alert('Updated Successfully! ✅');
      onBack();
    } catch (e) { alert('Error: ' + e.message); }
    setLoading(false);
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: 50 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -50 }}
      className="max-w-2xl mx-auto p-3 sm:p-4 pb-32 sm:pb-36"
    >
      <motion.button whileHover={{ x: -5 }} onClick={onBack}
        className="mb-4 flex items-center gap-2 text-blue-500 font-bold text-sm">
        <ArrowLeft size={20} /> Cancel Edit
      </motion.button>

      <motion.div initial={{ y: -20, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
        className="bg-gradient-to-b from-[#1e1e1e] to-[#181818] p-4 sm:p-5 rounded-2xl border border-white/5 mb-4 shadow-xl">
        <h2 className="text-lg sm:text-xl font-bold mb-3 text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-blue-600 flex items-center gap-2">
          <Edit3 size={22} /> Edit dispatch
        </h2>
        <div className="mb-4">
          <label className="block text-[10px] text-gray-500 font-bold uppercase mb-1.5">From center *</label>
          <select
            className="w-full p-3 bg-[#252525] border border-white/10 rounded-xl text-white outline-none focus:border-blue-500/50 transition-all text-sm appearance-none cursor-pointer"
            value={fromCenterSelect}
            onChange={(e) => {
              const next = e.target.value;
              setFromCenterSelect(next);
              if (next !== 'Other') setFromCenterOther('');
            }}
          >
            <option value="">- Center Select Karo -</option>
            {centersList.map((c) => (
              <option key={c.center} value={c.center}>{c.center}</option>
            ))}
          </select>
          {fromCenterSelect === 'Other' && (
            <input
              className="mt-2 w-full p-3 bg-[#252525] border border-white/10 rounded-xl text-white outline-none focus:border-blue-500/50 transition-all text-sm"
              placeholder="Center name..."
              value={fromCenterOther}
              onChange={(e) => setFromCenterOther(e.target.value)}
            />
          )}
          {resolvedFromCenter && (
            <p className="mt-2 text-[11px] text-gray-500">
              Saved as: <span className="font-bold text-blue-300">{resolvedFromCenter}</span>
            </p>
          )}
        </div>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="bg-[#252525] p-2 rounded-xl border border-white/5">
            <p className="text-[10px] text-gray-500 font-bold uppercase">Chalan</p>
            <p className="font-bold text-blue-400 text-sm">#{order.chalanNo}</p>
          </div>
          <div className="bg-[#252525] p-2 rounded-xl border border-white/5">
            <p className="text-[10px] text-gray-500 font-bold uppercase">Date</p>
            <p className="font-bold text-white text-sm">{(order.date || '').split('-').reverse().join('-')}</p>
          </div>
          <div className="bg-[#252525] p-2 rounded-xl border border-white/5">
            <p className="text-[10px] text-gray-500 font-bold uppercase">Items</p>
            <p className="font-bold text-green-400 text-sm">{rows.filter(r => r.itemName.trim()).length}</p>
          </div>
        </div>
      </motion.div>

      {/* Items Table */}
      <motion.div initial={{ y: -10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.1 }}
        className="bg-gradient-to-b from-[#1e1e1e] to-[#181818] rounded-2xl border border-white/5 overflow-hidden shadow-xl mb-4">
        <div className="p-4 border-b border-white/5 bg-gradient-to-r from-[#252525] to-[#1e1e1e] flex items-center gap-2">
          <Box size={16} className="text-blue-400" />
          <span className="text-white font-bold text-sm uppercase tracking-wide">Items</span>
        </div>
        <div className="p-3 space-y-2">
          {rows.map((row, index) => (
            <div key={row.id} className="grid grid-cols-[auto_1fr_80px_auto] gap-2 items-center">
              <span className="text-gray-500 text-xs font-bold w-6 text-center">{index + 1}</span>
              <ItemNameAutocompleteInput
                accent="blue"
                catalogItems={mergedCatalogItems}
                placeholder="Item Name"
                value={row.itemName}
                excludedNameKeys={rows
                  .filter((entry) => entry.id !== row.id)
                  .map((entry) => normalizeItemName(entry.itemName))
                  .filter(Boolean)}
                onChange={(nextValue) => updateRow(row.id, 'itemName', nextValue)}
                onSelectItem={(item) => selectRowItem(row.id, item)}
              />
              <CatalogStockQtyInput
                row={row}
                catalogItems={mergedCatalogItems}
                accent="blue"
                onQtyChange={(value) => updateRow(row.id, 'qty', value)}
              />
              <motion.button whileTap={{ scale: 0.9 }} onClick={() => removeRow(row.id)}
                className="p-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-xl transition-all border border-red-500/20">
                <Minus size={14} />
              </motion.button>
            </div>
          ))}
        </div>
        <div className="p-3 pt-0">
          <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={addRow}
            className="w-full py-2.5 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 rounded-xl text-sm font-bold flex items-center justify-center gap-2 border border-blue-500/20 transition-all">
            <Plus size={16} /> Add Blank Row
          </motion.button>
        </div>
      </motion.div>

      {/* Save Button - fixed bottom bar */}
      <motion.div
        initial={{ y: 100 }} animate={{ y: 0 }}
        className="fixed bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-[#111] to-transparent flex justify-center z-50">
        <motion.button
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
          onClick={handleUpdate}
          disabled={loading}
          className="bg-gradient-to-r from-blue-500 to-blue-600 text-white px-6 sm:px-10 py-3 sm:py-4 rounded-xl sm:rounded-2xl font-bold shadow-xl shadow-blue-500/30 flex items-center gap-2 text-sm sm:text-base disabled:opacity-50"
        >
          {loading ? <Loader2 size={20} className="animate-spin" /> : <><CheckCircle size={20} /> Save Changes</>}
        </motion.button>
      </motion.div>
    </motion.div>
  );
}

// --- USER HUB ---
function UserHub({ user, catalogItems, centersList = centerData }) {
  const [section, setSection] = useState(null);

  if (section === 'request') return <UserDashboard user={user} onBack={() => setSection(null)} catalogItems={catalogItems} centersList={centersList} />;
  if (section === 'send') return <SendDashboard user={user} onBack={() => setSection(null)} catalogItems={catalogItems} centersList={centersList} />;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="min-h-[85vh] flex flex-col items-center justify-center p-4 sm:p-8"
    >
      <motion.div
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="text-center mb-10 sm:mb-14"
      >
        <h2 className="text-2xl sm:text-3xl md:text-4xl font-black text-white uppercase tracking-tight mb-3">
          Jay Swaminarayan,{' '}
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-400 to-orange-600">{user.username}</span>
        </h2>
        <p className="text-gray-500 text-sm sm:text-base">Shu karavu chhe? Niche thi option select karo.</p>
      </motion.div>

      <motion.div
        variants={staggerContainer}
        initial="initial"
        animate="animate"
        className="grid grid-cols-1 sm:grid-cols-2 gap-5 sm:gap-8 w-full max-w-3xl"
      >
        {/* Option 1: Request from Kothar */}
        <motion.button
          variants={fadeInUp}
          whileHover={{ y: -8, scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => setSection('request')}
          className="group bg-gradient-to-b from-[#1e1e1e] to-[#181818] border border-white/5 hover:border-orange-500/40 rounded-2xl sm:rounded-3xl p-7 sm:p-10 text-left transition-all shadow-xl hover:shadow-orange-500/10 relative overflow-hidden"
        >
          <div className="absolute inset-0 bg-gradient-to-br from-orange-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
          <div className="relative">
            <div className="w-14 h-14 sm:w-16 sm:h-16 bg-gradient-to-br from-orange-500 to-orange-700 rounded-2xl flex items-center justify-center mb-5 shadow-lg shadow-orange-500/30">
              <ShoppingCart size={28} className="text-white" />
            </div>
            <h3 className="text-lg sm:text-xl font-black text-white tracking-tight mb-2 group-hover:text-orange-400 transition-colors">
              કોઠારમાંથી વસ્તુ મંગાવવા માટે
            </h3>
            <p className="text-[11px] sm:text-sm text-gray-500 leading-relaxed mb-5">
              કોઠારમાંથી વસ્તુ મંગાવવા માટે અહીં ક્લિક કરો
            </p>
            <div className="inline-flex items-center gap-2 text-orange-500 font-bold text-xs sm:text-sm tracking-wider bg-orange-500/10 px-4 py-2 rounded-xl border border-orange-500/20">
              અહીં ક્લિક કરો <ArrowLeft size={14} className="rotate-180" />
            </div>
          </div>
        </motion.button>

        {/* Option 2: Send to Kothar */}
        <motion.button
          variants={fadeInUp}
          whileHover={{ y: -8, scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => setSection('send')}
          className="group bg-gradient-to-b from-[#1e1e1e] to-[#181818] border border-white/5 hover:border-blue-500/40 rounded-2xl sm:rounded-3xl p-7 sm:p-10 text-left transition-all shadow-xl hover:shadow-blue-500/10 relative overflow-hidden"
        >
          <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
          <div className="relative">
            <div className="w-14 h-14 sm:w-16 sm:h-16 bg-gradient-to-br from-blue-500 to-blue-700 rounded-2xl flex items-center justify-center mb-5 shadow-lg shadow-blue-500/30">
              <Send size={28} className="text-white" />
            </div>
            <h3 className="text-lg sm:text-xl font-black text-white tracking-tight mb-2 group-hover:text-blue-400 transition-colors">
              સેન્ટરમાંથી વસ્તુ મુખ્ય કોઠારમાં મોકલવા માટે
            </h3>
            <p className="text-[11px] sm:text-sm text-gray-500 leading-relaxed mb-5">
              આપના સેન્ટરમાંથી વસ્તુ મુખ્ય કોઠારમાં મોકલવા માટે અહીં ક્લિક કરો.
            </p>
            <div className="inline-flex items-center gap-2 text-blue-500 font-bold text-xs sm:text-sm tracking-wider bg-blue-500/10 px-4 py-2 rounded-xl border border-blue-500/20">
              અહીં ક્લિક કરો <ArrowLeft size={14} className="rotate-180" />
            </div>
          </div>
        </motion.button>
      </motion.div>
    </motion.div>
  );
}

// --- SEND DASHBOARD ---
function SendDashboard({ user, onBack, catalogItems, centersList = centerData }) {
  const INITIAL_ROWS = 15;
  const [step, setStep] = useState('form');
  const [chalanLoading, setChalanLoading] = useState(true);
  const [formData, setFormData] = useState({
    chalanNo: '',
    date: new Date().toISOString().split('T')[0],
    fromCenter: '',
    fromCenterOther: '',
    senderName: '',
    mobileNumber: '',
    post: '',
    globalId: '',
    email: '',
  });
  const [rows, setRows] = useState(() => createRowsFromItems([], INITIAL_ROWS, catalogItems));
  const [loading, setLoading] = useState(false);
  const catalogNameKeys = new Set(catalogItems.map((item) => item.nameKey));

  const fetchNextSendChalanNo = async () => {
    try {
      const snapshot = await getDocs(collection(db, 'send-orders'));
      let maxNo = 0;
      snapshot.forEach(docSnap => {
        const no = parseInt(docSnap.data().chalanNo) || 0;
        if (no > maxNo) maxNo = no;
      });
      return String(maxNo + 1);
    } catch { return '1'; }
  };

  useEffect(() => {
    fetchNextSendChalanNo().then(no => {
      setFormData(prev => ({ ...prev, chalanNo: no }));
      setChalanLoading(false);
    });
  }, []);

  const updateRow = (id, field, value) => {
    const patch = field === 'kg' ? { qty: value } : { [field]: value };
    setRows((prev) => patchStockRow(prev, id, patch, catalogItems));
  };
  const selectRowItem = (id, item) => {
    setRows((prev) => patchStockRow(prev, id, { itemName: item.name }, catalogItems));
  };
  const addRow = () => {
    setRows(prev => [...prev, createEmptyItemRow(getNextRowId(prev))]);
  };
  const removeRow = (id) => { if (rows.length > 1) setRows(prev => prev.filter(r => r.id !== id)); };

  const filledRows = rows.filter(r => r.itemName.trim());
  const effectiveCenter = formData.fromCenter === 'Other' ? formData.fromCenterOther.trim() : formData.fromCenter;

  const handleSubmit = async () => {
    if (filledRows.length === 0) return alert('Ochha me ek item add karo!');
    if (!canSubmitStockEntryDate(formData.date)) {
      const backfillNote = ENABLE_INITIAL_STOCK_BACKFILL
        ? ` (initial mode: last ${INITIAL_BACKFILL_MONTHS} months allowed)`
        : ` (previous month only till day ${MONTH_CLOSE_GRACE_DAYS})`;
      return alert(`This month is closed for stock add${backfillNote}.`);
    }
    const invalidSubmitItem = filledRows.find((row) => !catalogNameKeys.has(normalizeItemName(row.itemName)));
    if (invalidSubmitItem) {
      return alert(`Invalid item name: "${invalidSubmitItem.itemName}". Master list mathi select karo.`);
    }

    setLoading(true);
    try {
      const payload = {
        type: 'send',
        chalanNo: formData.chalanNo,
        date: formData.date,
        fromCenter: effectiveCenter,
        fromCenterFromOther: formData.fromCenter === 'Other',
        toCenter: 'Swaminarayan Dham Center',
        senderName: formData.senderName.trim(),
        mobileNumber: formData.mobileNumber.trim(),
        post: formData.post.trim(),
        globalId: formData.globalId.trim(),
        email: formData.email.trim(),
        items: filledRows.map((row) => ({
          itemName: row.itemName.trim(),
          qty: row.qty,
          unit: row.unit,
          kg: row.kg,
        })),
        totalKg: roundKg2(filledRows.reduce((sum, row) => sum + (parseFloat(row.kg) || 0), 0)),
        timestamp: new Date(),
        submittedBy: user.username,
      };
      const docRef = await addDoc(collection(db, 'send-orders'), payload);
      await Promise.all(
        payload.items.map((item, lineIndex) =>
          setDoc(
            doc(db, STOCK_TRANSACTIONS_COLLECTION, makeStockTransactionDocId('send', docRef.id, lineIndex, 'IN')),
            {
              sourceType: 'send',
              sourceId: docRef.id,
              lineIndex,
              center_id: normalizeItemName(payload.fromCenter),
              centerName: payload.fromCenter,
              item_id: normalizeItemName(item.itemName),
              itemName: item.itemName,
              transaction_type: 'IN',
              quantity: toSafeTxQuantity(item.kg),
              transaction_date: normalizeDateOnly(payload.date),
              created_at: payload.timestamp,
              autoSynced: true,
              is_deleted: false,
              updatedAt: new Date(),
            },
            { merge: true },
          ),
        ),
      );
      setStep('done');
      sendEmailWithConfig(SEND_MAIL_CONFIG, {
        email: formData.email.trim(),
        cc_email: DEFAULT_CC_EMAIL,
        bcc_email: DEFAULT_BCC_EMAIL,
        to_name: effectiveCenter,
        chalan_no: formData.chalanNo,
        date: formatDisplayDate(formData.date),
        sender: formData.senderName.trim(),
        receiver: formData.senderName.trim(),
        global_id: formData.globalId.trim(),
        order_id: formData.chalanNo,
        pdf_link: buildPublicRecordLink('sendOrderId', docRef.id),
      }).catch(err => console.warn('Email send failed:', err));
    } catch (e) { alert('Error: ' + e.message); }
    setLoading(false);
  };

  const validateAndReview = () => {
    if (!formData.fromCenter) return alert('Center select karo!');
    if (formData.fromCenter === 'Other' && !formData.fromCenterOther.trim()) return alert('Center name likho!');
    if (!formData.senderName.trim() || !formData.mobileNumber.trim()) return alert('Sender Name ane Mobile fill karo!');
    if (!isDigitsOnly(formData.globalId)) return alert('Global ID ma only number allowed.');
    if (!isValidEmail(formData.email)) return alert('Valid email fill karo!');
    if (filledRows.length === 0) return alert('Ochha me ek item add karo!');
    const invalidItem = filledRows.find((row) => !catalogNameKeys.has(normalizeItemName(row.itemName)));
    if (invalidItem) return alert(`Invalid item name: "${invalidItem.itemName}". Master list mathi select karo.`);
    setStep('review');
  };

  if (step === 'done') {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center justify-center min-h-[80vh] p-4">
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', damping: 20 }}
          className="bg-gradient-to-b from-[#1e1e1e] to-[#181818] p-8 sm:p-12 rounded-2xl sm:rounded-[3rem] shadow-2xl text-center max-w-md w-full border border-white/5"
        >
          <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.2, type: 'spring' }}
            className="w-20 h-20 sm:w-24 sm:h-24 bg-gradient-to-br from-blue-500 to-blue-600 rounded-full flex items-center justify-center mx-auto mb-6 shadow-xl shadow-blue-500/30">
            <CheckCircle size={48} className="text-white" />
          </motion.div>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-white mb-3 uppercase">Send Chalan Saved!</h2>
          <p className="text-gray-500 mb-8 text-sm sm:text-base">
            Chalan No: <span className="text-blue-400 font-bold">#{formData.chalanNo}</span><br />
            From: <span className="text-white font-bold">{effectiveCenter}</span><br />
            Email: <span className="text-green-400 font-bold">{formData.email}</span>
          </p>
          <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={onBack}
            className="w-full bg-gradient-to-r from-blue-500 to-blue-600 text-white py-4 rounded-xl font-bold flex justify-center items-center gap-2 shadow-xl shadow-blue-500/20">
            <ArrowLeft size={20} /> Dashboard par pachi jao
          </motion.button>
        </motion.div>
      </motion.div>
    );
  }

  if (step === 'review') {
    return (
      <motion.div initial={{ opacity: 0, x: 50 }} animate={{ opacity: 1, x: 0 }} className="max-w-3xl mx-auto p-3 sm:p-4 pt-6">
        <motion.button whileHover={{ x: -5 }} onClick={() => setStep('form')} className="mb-4 sm:mb-6 text-blue-400 font-bold flex items-center gap-2 text-sm">
          <ArrowLeft size={20} /> Form par pachi jao
        </motion.button>
        <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
          className="bg-gradient-to-b from-[#1e1e1e] to-[#181818] p-6 sm:p-8 rounded-2xl sm:rounded-[2.5rem] border border-white/5 shadow-2xl">
          <h2 className="text-xl sm:text-2xl font-bold text-center mb-6 flex items-center justify-center gap-3 text-white uppercase">
            <CheckCircle className="text-green-500" size={28} /> Send Chalan Review
          </h2>
          <div className="grid grid-cols-2 gap-3 bg-[#252525] p-4 rounded-2xl mb-6 border border-white/5 text-sm">
            <div><p className="text-[10px] text-gray-500 font-bold uppercase mb-0.5">From Center</p><p className="font-bold text-white">{effectiveCenter}</p></div>
            <div className="text-right"><p className="text-[10px] text-gray-500 font-bold uppercase mb-0.5">To</p><p className="font-bold text-blue-400">Swaminarayan Dham</p></div>
            <div><p className="text-[10px] text-gray-500 font-bold uppercase mb-0.5">Chalan No</p><p className="font-bold text-blue-400">#{formData.chalanNo}</p></div>
            <div className="text-right"><p className="text-[10px] text-gray-500 font-bold uppercase mb-0.5">Date</p><p className="font-bold text-white">{formatDisplayDate(formData.date)}</p></div>
            <div><p className="text-[10px] text-gray-500 font-bold uppercase mb-0.5">Sender</p><p className="font-bold text-white">{formData.senderName}</p></div>
            <div className="text-right"><p className="text-[10px] text-gray-500 font-bold uppercase mb-0.5">Global ID</p><p className="font-bold text-green-400">{formData.globalId}</p></div>
            <div className="col-span-2"><p className="text-[10px] text-gray-500 font-bold uppercase mb-0.5">Email</p><p className="font-bold text-white break-all">{formData.email}</p></div>
          </div>
          <div className="overflow-x-auto mb-6 max-h-60 overflow-y-auto rounded-xl border border-white/5 bg-[#151515] custom-scroll">
            <table className="w-full text-sm">
              <thead className="bg-[#252525] sticky top-0">
                <tr>
                  <th className="p-3 text-left text-gray-400 font-bold text-xs uppercase w-10">No</th>
                  <th className="p-3 text-left text-gray-400 font-bold text-xs uppercase">Item Name</th>
                            <th className="p-3 text-center text-gray-400 font-bold text-xs uppercase w-32">માત્રા</th>
                </tr>
              </thead>
              <tbody>
                {filledRows.map((row, i) => (
                  <tr key={row.id} className="border-t border-white/5">
                    <td className="p-3 text-gray-500 text-center text-xs">{i + 1}</td>
                    <td className="p-3 font-medium text-white">{row.itemName}</td>
                    <td className="p-3 text-center font-bold text-blue-400">
                      {row.qty || '-'} <span className="text-[10px] text-gray-500 font-bold">{row.unit}</span>
                      {getUnitToKgFactor(row.unit, row) !== 1 && row.kg && (
                        <span className="block text-[10px] text-gray-500">= {formatMetric(row.kg)} {UNIT_KG}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={handleSubmit} disabled={loading}
            className="w-full bg-gradient-to-r from-blue-500 to-blue-600 text-white py-4 sm:py-5 rounded-xl sm:rounded-2xl font-bold text-lg flex justify-center items-center gap-3 shadow-2xl shadow-blue-500/20 disabled:opacity-50">
            {loading ? <Loader2 className="animate-spin" size={28} /> : <><CheckCircle size={20} /> Confirm & Submit</>}
          </motion.button>
        </motion.div>
      </motion.div>
    );
  }

  // step === 'form'
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="max-w-3xl mx-auto p-3 sm:p-4 pb-8">
      <motion.button whileHover={{ x: -5 }} onClick={onBack} className="mb-4 flex items-center gap-2 text-blue-400 font-bold text-sm">
        <ArrowLeft size={20} /> Dashboard par pachi jao
      </motion.button>

      {/* Header Card */}
      <motion.div initial={{ y: -20, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
        className="bg-gradient-to-b from-[#1e1e1e] to-[#181818] p-4 sm:p-6 rounded-2xl sm:rounded-3xl border border-white/5 mb-4 shadow-xl">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-[10px] text-gray-500 font-bold uppercase block mb-1">Chalan No (Auto)</label>
            <div className="w-full p-3 bg-[#1a1a1a] border border-blue-500/30 rounded-xl text-blue-400 font-black text-sm flex items-center gap-2">
              {chalanLoading ? <Loader2 size={14} className="animate-spin" /> : `#${formData.chalanNo}`}
            </div>
          </div>
          <div>
            <label className="text-[10px] text-gray-500 font-bold uppercase block mb-1">Date *</label>
            <input type="date" required className="w-full p-3 bg-[#252525] border border-white/10 rounded-xl text-white outline-none text-sm"
              value={formData.date} onChange={e => setFormData(p => ({ ...p, date: e.target.value }))} />
          </div>
          <div className="col-span-1 sm:col-span-2">
            <label className="text-[10px] text-gray-500 font-bold uppercase block mb-1">To (Fixed)</label>
            <div className="w-full p-3 bg-[#1a1a1a] border border-blue-500/20 rounded-xl text-blue-300 font-bold text-sm">🏛 Swaminarayan Dham Center</div>
          </div>
          <div className="col-span-1 sm:col-span-2">
            <label className="text-[10px] text-gray-500 font-bold uppercase block mb-1">From Center *</label>
            <select required className="w-full p-3 bg-[#252525] border border-white/10 rounded-xl text-white outline-none text-sm appearance-none cursor-pointer"
              value={formData.fromCenter} onChange={e => setFormData(p => ({ ...p, fromCenter: e.target.value }))}>
              <option value="">- Center Select Karo -</option>
              {centersList.map(c => <option key={c.center} value={c.center}>{c.center}</option>)}
            </select>
          </div>
          {formData.fromCenter === 'Other' && (
            <div className="col-span-1 sm:col-span-2">
              <label className="text-[10px] text-gray-500 font-bold uppercase block mb-1">Center Name *</label>
              <input className="w-full p-3 bg-[#252525] border border-white/10 rounded-xl text-white outline-none text-sm focus:border-blue-500/50 transition-all"
                placeholder="Center name..." value={formData.fromCenterOther} onChange={e => setFormData(p => ({ ...p, fromCenterOther: e.target.value }))} />
            </div>
          )}
          <div className="col-span-1 sm:col-span-2">
            <label className="text-[10px] text-gray-500 font-bold uppercase block mb-1">Sender Name *</label>
            <input className="w-full p-3 bg-[#252525] border border-white/10 rounded-xl text-white outline-none text-sm focus:border-blue-500/50 transition-all"
              placeholder="મોકલનારનું નામ" value={formData.senderName} onChange={e => setFormData(p => ({ ...p, senderName: e.target.value }))} />
          </div>
          <div>
            <label className="text-[10px] text-gray-500 font-bold uppercase block mb-1">Mobile Number *</label>
            <input className="w-full p-3 bg-[#252525] border border-white/10 rounded-xl text-white outline-none text-sm focus:border-blue-500/50 transition-all"
              placeholder="મોબાઇલ નંબર" value={formData.mobileNumber} onChange={e => setFormData(p => ({ ...p, mobileNumber: e.target.value }))} />
          </div>
          <div>
            <label className="text-[10px] text-gray-500 font-bold uppercase block mb-1">Post</label>
            <input className="w-full p-3 bg-[#252525] border border-white/10 rounded-xl text-white outline-none text-sm focus:border-blue-500/50 transition-all"
              placeholder="પદ (optional)" value={formData.post} onChange={e => setFormData(p => ({ ...p, post: e.target.value }))} />
          </div>
          <div>
            <label className="text-[10px] text-gray-500 font-bold uppercase block mb-1">Global ID *</label>
            <input inputMode="numeric" className="w-full p-3 bg-[#252525] border border-white/10 rounded-xl text-white outline-none text-sm focus:border-blue-500/50 transition-all"
              placeholder="Number only" value={formData.globalId} onChange={e => setFormData(p => ({ ...p, globalId: e.target.value.replace(/\D/g, '') }))} />
          </div>
          <div>
            <label className="text-[10px] text-gray-500 font-bold uppercase block mb-1">Email *</label>
            <input
              type="email"
              className="w-full p-3 bg-[#252525] border border-white/10 rounded-xl text-white outline-none text-sm focus:border-blue-500/50 transition-all"
              placeholder="you@example.com"
              value={formData.email}
              onChange={e => setFormData(p => ({ ...p, email: e.target.value }))}
            />
          </div>
        </div>
      </motion.div>

      {/* Items Table */}
      <motion.div initial={{ y: 10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.1 }}
        className="bg-gradient-to-b from-[#1e1e1e] to-[#181818] rounded-2xl sm:rounded-3xl border border-white/5 overflow-hidden mb-4 shadow-xl">
        <div className="p-4 border-b border-white/5 flex items-center justify-between">
          <h3 className="font-bold text-white text-sm flex items-center gap-2 uppercase">
            <Package size={16} className="text-blue-400" /> Items List
          </h3>
          <span className="text-xs text-blue-400 font-bold bg-blue-500/10 px-3 py-1 rounded-lg border border-blue-500/20">{filledRows.length} items filled</span>
        </div>
        <ItemsListSearchHint />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-[#151515]">
              <tr>
                <th className="p-3 text-left text-gray-500 font-bold text-xs uppercase w-10">No</th>
                <th className="p-3 text-left text-gray-500 font-bold text-xs uppercase">Item Name</th>
                <th className="p-3 text-center text-gray-500 font-bold text-xs uppercase w-32">માત્રા</th>
                <th className="p-3 w-10"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => (
                <tr key={row.id} className={`border-t border-white/5 transition-colors ${row.itemName ? 'bg-blue-500/5' : ''}`}>
                  <td className="p-2 text-gray-500 text-center text-xs font-mono">{idx + 1}</td>
                  <td className="p-2">
                    <ItemNameAutocompleteInput
                      accent="blue"
                      catalogItems={catalogItems}
                      placeholder={`Item ${idx + 1}...`}
                      value={row.itemName}
                      excludedNameKeys={rows
                        .filter((entry) => entry.id !== row.id)
                        .map((entry) => normalizeItemName(entry.itemName))
                        .filter(Boolean)}
                      onChange={(nextValue) => updateRow(row.id, 'itemName', nextValue)}
                      onSelectItem={(item) => selectRowItem(row.id, item)}
                    />
                  </td>
                  <td className="p-2">
                    <CatalogStockQtyInput
                      row={row}
                      catalogItems={catalogItems}
                      accent="blue"
                      onQtyChange={(value) => updateRow(row.id, 'qty', value)}
                    />
                  </td>
                  <td className="p-2 text-center">
                    <motion.button whileTap={{ scale: 0.9 }} onClick={() => removeRow(row.id)}
                      className="text-red-400/40 hover:text-red-400 transition-colors p-1 rounded">
                      <X size={14} />
                    </motion.button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="p-3 border-t border-white/5">
          <motion.button whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.98 }} onClick={addRow}
            className="w-full p-3 bg-[#252525] hover:bg-[#2d2d2d] border border-dashed border-white/10 hover:border-blue-500/30 rounded-xl text-gray-400 hover:text-blue-400 font-bold text-sm flex items-center justify-center gap-2 transition-all">
            <Plus size={16} /> Blank Row Umero
          </motion.button>
        </div>
      </motion.div>

      {/* Submit */}
      <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={validateAndReview}
        className="w-full bg-gradient-to-r from-blue-500 to-blue-600 text-white p-4 rounded-xl sm:rounded-2xl font-bold shadow-xl shadow-blue-500/20 flex items-center justify-center gap-2 text-sm sm:text-base">
        <Eye size={20} /> Review & Submit
      </motion.button>
    </motion.div>
  );
}

// --- USER DASHBOARD ---
function UserDashboard({ user, onBack = null, catalogItems, centersList = centerData }) {
  const [formData, setFormData] = useState({
    chalanNo: '',
    date: new Date().toISOString().split('T')[0],
    center: '',
    centerOther: '',
    senderName: '',
    mobileNumber: '',
    post: '',
    globalId: '',
    email: '',
  });
  const [cart, setCart] = useState([]);
  const [openCategory, setOpenCategory] = useState(null);
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState('form');
  const [searchQuery, setSearchQuery] = useState('');
  const [chalanLoading, setChalanLoading] = useState(true);
  const groupedCatalogItems = filterGroupedCatalogItems(catalogItems, searchQuery);

  const fetchNextChalanNo = async () => {
    try {
      const snapshot = await getDocs(collection(db, "orders"));
      let maxNo = 0;
      snapshot.forEach(docSnap => {
        const no = parseInt(docSnap.data().chalanNo) || 0;
        if (no > maxNo) maxNo = no;
      });
      return String(maxNo + 1);
    } catch { return '1'; }
  };

  useEffect(() => {
    fetchNextChalanNo().then(no => {
      setFormData(prev => ({ ...prev, chalanNo: no }));
      setChalanLoading(false);
    });
  }, []);

  const handleCenterChange = (center) => {
    setFormData((prev) => ({ ...prev, center }));
  };

  const updateQuantity = (itemName, category, unit, qty) => {
    const existing = cart.find(i => normalizeItemName(i.name) === normalizeItemName(itemName));
    const line = buildRequestCartLine(itemName, category, unit, qty, catalogItems);
    if (line.qty > 0) {
      if (existing) {
        setCart(cart.map((i) => (
          normalizeItemName(i.name) === normalizeItemName(itemName) ? { ...i, ...line } : i
        )));
      } else {
        setCart([...cart, line]);
      }
    } else { setCart(cart.filter(i => normalizeItemName(i.name) !== normalizeItemName(itemName))); }
  };

  const handleConfirmSubmit = async () => {
    setLoading(true);
    try {
      const { totalKg } = calculateTotals(cart, catalogItems);
      const payload = {
        ...formData,
        center: formData.center === 'Other' ? formData.centerOther.trim() : formData.center,
        centerFromOther: formData.center === 'Other',
        senderName: formData.senderName.trim(),
        mobileNumber: formData.mobileNumber.trim(),
        post: formData.post.trim(),
        globalId: formData.globalId.trim(),
        email: formData.email.trim(),
        items: cart,
        totalKg,
        timestamp: new Date(),
        submittedBy: user.username,
      };
      const docRef = await addDoc(collection(db, "orders"), payload);
      await Promise.all(
        payload.items.map((item, lineIndex) =>
          setDoc(
            doc(db, STOCK_TRANSACTIONS_COLLECTION, makeStockTransactionDocId('order', docRef.id, lineIndex, 'OUT')),
            {
              sourceType: 'order',
              sourceId: docRef.id,
              lineIndex,
              center_id: normalizeItemName(payload.center),
              centerName: payload.center,
              item_id: normalizeItemName(item.name),
              itemName: item.name,
              transaction_type: 'OUT',
              quantity: toSafeTxQuantity(convertItemQtyToKg(item.qty, item.unit, catalogItems, item)),
              transaction_date: normalizeDateOnly(payload.date),
              created_at: payload.timestamp,
              autoSynced: true,
              is_deleted: false,
              updatedAt: new Date(),
            },
            { merge: true },
          ),
        ),
      );
      setStep('download');
      sendEmailWithConfig(REQUEST_MAIL_CONFIG, {
        email: formData.email.trim(),
        cc_email: DEFAULT_CC_EMAIL,
        bcc_email: DEFAULT_BCC_EMAIL,
        from_name: payload.center,
        chalan_no: formData.chalanNo,
        date: formatDisplayDate(formData.date),
        receiver: formData.senderName.trim(),
        sender: formData.senderName.trim(),
        global_id: formData.globalId.trim(),
        pdf_link: buildPublicRecordLink('orderId', docRef.id),
      }).catch(err => console.warn('Email send failed:', err));
    } catch (error) { alert(`❌ Error: ${error.message}`); setLoading(false); }
    setLoading(false);
  };

  if (step === 'form') {
    return (
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="max-w-2xl mx-auto p-3 sm:p-4 pb-32 sm:pb-36"
      >
        {onBack && (
          <motion.button whileHover={{ x: -5 }} onClick={onBack} className="mb-4 flex items-center gap-2 text-orange-500 font-bold text-sm">
            <ArrowLeft size={20} /> Dashboard par pachi jao
          </motion.button>
        )}
        {/* Form Header */}
        <motion.div 
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="bg-gradient-to-b from-[#1e1e1e] to-[#181818] p-4 sm:p-6 rounded-2xl sm:rounded-3xl border border-white/5 mb-4 sm:mb-6 shadow-xl"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            {/* Chalan No - Auto Generated */}
            <div>
              <label className="text-[10px] text-gray-500 font-bold uppercase block mb-1">Chalan No (Auto)</label>
              <div className="w-full p-3 sm:p-3.5 bg-[#1a1a1a] border border-orange-500/30 rounded-xl sm:rounded-2xl text-orange-400 font-black text-sm flex items-center gap-2">
                {chalanLoading ? <Loader2 size={14} className="animate-spin text-orange-400" /> : `#${formData.chalanNo}`}
              </div>
            </div>
            {/* Date */}
            <div>
              <label className="text-[10px] text-gray-500 font-bold uppercase block mb-1">Date *</label>
              <input
                type="date"
                className="w-full p-3 sm:p-3.5 bg-[#252525] border border-white/10 rounded-xl sm:rounded-2xl text-white outline-none transition-all text-sm"
                value={formData.date}
                onChange={e => setFormData({...formData, date: e.target.value})}
                required
              />
            </div>
            {/* Center Dropdown */}
            <div className="col-span-1 sm:col-span-2">
              <label className="text-[10px] text-gray-500 font-bold uppercase block mb-1">Center *</label>
              <select
                className="w-full p-3 sm:p-3.5 bg-[#252525] border border-white/10 rounded-xl sm:rounded-2xl text-white outline-none transition-all text-sm appearance-none cursor-pointer"
                value={formData.center}
                onChange={e => handleCenterChange(e.target.value)}
                required
              >
                <option value="">- Center Select Karo -</option>
                {centersList.map(c => <option key={c.center} value={c.center}>{c.center}</option>)}
              </select>
            </div>
            {formData.center === 'Other' && (
              <div className="col-span-1 sm:col-span-2">
                <label className="text-[10px] text-gray-500 font-bold uppercase block mb-1">Center Name *</label>
                <input
                  className="w-full p-3 sm:p-3.5 bg-[#252525] border border-white/10 rounded-xl sm:rounded-2xl text-white outline-none focus:border-orange-500/50 transition-all text-sm"
                  placeholder="Center Name"
                  value={formData.centerOther}
                  onChange={e => setFormData({ ...formData, centerOther: e.target.value })}
                />
              </div>
            )}
            <div className="col-span-1 sm:col-span-2">
              <label className="text-[10px] text-gray-500 font-bold uppercase block mb-1">Requester Name *</label>
              <input
                className="w-full p-3 sm:p-3.5 bg-[#252525] border border-white/10 rounded-xl sm:rounded-2xl text-white outline-none focus:border-orange-500/50 transition-all text-sm"
                placeholder="માલ મંગાવનારનું નામ"
                value={formData.senderName}
                onChange={e => setFormData({ ...formData, senderName: e.target.value })}
                required
              />
            </div>
            <div>
              <label className="text-[10px] text-gray-500 font-bold uppercase block mb-1">Mobile Number *</label>
              <input
                className="w-full p-3 sm:p-3.5 bg-[#252525] border border-white/10 rounded-xl sm:rounded-2xl text-white outline-none focus:border-orange-500/50 transition-all text-sm"
                placeholder="મોબાઇલ નંબર"
                value={formData.mobileNumber}
                onChange={e => setFormData({ ...formData, mobileNumber: e.target.value })}
                required
              />
            </div>
            {/* Post */}
            <div>
              <label className="text-[10px] text-gray-500 font-bold uppercase block mb-1">Post</label>
              <input
                className="w-full p-3 sm:p-3.5 bg-[#252525] border border-white/10 rounded-xl sm:rounded-2xl text-white outline-none focus:border-orange-500/50 transition-all text-sm"
                placeholder="Designation / Post (optional)"
                value={formData.post}
                onChange={e => setFormData({...formData, post: e.target.value})}
              />
            </div>
            <div>
              <label className="text-[10px] text-gray-500 font-bold uppercase block mb-1">Global ID *</label>
              <input
                inputMode="numeric"
                className="w-full p-3 sm:p-3.5 bg-[#252525] border border-white/10 rounded-xl sm:rounded-2xl text-white outline-none focus:border-orange-500/50 transition-all text-sm"
                placeholder="Number only"
                value={formData.globalId}
                onChange={e => setFormData({ ...formData, globalId: e.target.value.replace(/\D/g, '') })}
              />
            </div>
            <div className="col-span-1 sm:col-span-2">
              <label className="text-[10px] text-gray-500 font-bold uppercase block mb-1">Email *</label>
              <input
                type="email"
                className="w-full p-3 sm:p-3.5 bg-[#252525] border border-white/10 rounded-xl sm:rounded-2xl text-white outline-none focus:border-orange-500/50 transition-all text-sm"
                placeholder="you@example.com"
                value={formData.email}
                onChange={e => setFormData({ ...formData, email: e.target.value })}
              />
            </div>
          </div>
        </motion.div>

        {/* Search Bar */}
        <motion.div
          initial={{ y: -10, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.1 }}
          className="mb-4 relative"
        >
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
          <input
            type="text"
            placeholder="Items search karo..."
            className="w-full p-3 sm:p-3.5 pl-11 bg-[#1e1e1e] border border-white/10 rounded-xl sm:rounded-2xl text-white outline-none focus:border-orange-500/50 transition-all text-sm placeholder-gray-500"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
        </motion.div>

        {/* Categories */}
        <motion.div 
          variants={staggerContainer}
          initial="initial"
          animate="animate"
          className="space-y-3 sm:space-y-4"
        >
          {Object.entries(groupedCatalogItems).map(([category, items]) => (
            <motion.div 
              key={category}
              variants={fadeInUp}
              className="bg-gradient-to-b from-[#1e1e1e] to-[#181818] rounded-2xl sm:rounded-3xl border border-white/5 overflow-hidden"
            >
              <motion.button 
                whileTap={{ scale: 0.99 }}
                onClick={() => setOpenCategory(openCategory === category ? null : category)} 
                className="w-full p-4 sm:p-5 flex justify-between items-center font-bold text-white text-sm hover:bg-white/5 transition-colors"
              >
                <span className="flex items-center gap-3">
                  <span className="text-xl">{categoryIcons[category] || "📦"}</span>
                  <span className="uppercase tracking-wide">{category}</span>
                  <span className="text-xs text-gray-500 font-normal">({items.length})</span>
                </span>
                <motion.div
                  animate={{ rotate: openCategory === category ? 180 : 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <ChevronDown size={20} className="text-gray-500" />
                </motion.div>
              </motion.button>
              <AnimatePresence>
                {openCategory === category && (
                  <motion.div 
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.3 }}
                    className="overflow-hidden"
                  >
                    <div className="p-3 sm:p-4 bg-[#151515] grid gap-2 sm:gap-3">
                      {isGheeTelCategory(category) && (
                        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] font-bold text-amber-100">
                          ૧ ડબ્બો = ૧૩ કિલો થશે, માટે નીચેના બોક્સમાં ડબ્બાની સંખ્યા લખવી.
                        </div>
                      )}
                      {isColorCategory(category) && (
                        <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-[11px] font-bold text-emerald-100">
                          કલર માટે બધી જ માત્રા ગ્રામમાં જ દાખલ કરવી. કિલોમાં મંગાવવું હોય તો પહેલા ગ્રામમાં ફેરવીને લખો.
                        </div>
                      )}
                      {items.map((item, itemIndex) => {
                        const inCart = cart.find(c => normalizeItemName(c.name) === item.nameKey);
                        const lineUnit = inCart?.unit || resolveCatalogItemUnit(item);
                        const unitLabel = getUnitShortLabel(lineUnit, item);
                        const showSteppers = isColorCategory(category) || isGheeTelCategory(category)
                          || isGramUnit(lineUnit) || isGheeTelBulkUnit(lineUnit)
                          || (item.unitToKgFactor && item.unitToKgFactor !== 1);
                        const showKgPreview = isGheeTelBulkUnit(lineUnit)
                          || (item.unitToKgFactor && item.unitToKgFactor !== 1)
                          || (inCart?.unitToKgFactor && inCart.unitToKgFactor !== 1);
                        const secondaryKg = convertItemQtyToKg(inCart?.qty, lineUnit, catalogItems, { name: item.name, ...inCart });
                        return (
                          <motion.div 
                            key={item.name}
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: itemIndex * 0.02 }}
                            className={`flex items-center justify-between p-3 sm:p-4 rounded-xl sm:rounded-2xl transition-all border ${inCart ? 'bg-orange-500/10 border-orange-500/30' : 'bg-[#1a1a1a] border-white/5 hover:border-white/10'}`}
                          >
                            <span className="text-sm text-gray-300 font-medium flex-1">{item.name}</span>
                            <div className="flex items-center gap-2 sm:gap-3">
                              {showSteppers && inCart && (
                                <motion.button
                                  initial={{ scale: 0 }}
                                  animate={{ scale: 1 }}
                                  whileTap={{ scale: 0.9 }}
                                  onClick={() => updateQuantity(item.name, category, inCart.unit || item.unit, Math.max(0, (parseFloat(inCart.qty) || 0) - 1))}
                                  className="w-8 h-8 flex items-center justify-center bg-[#252525] rounded-lg text-orange-500 hover:bg-[#2d2d2d] transition-colors"
                                >
                                  <Minus size={14} />
                                </motion.button>
                              )}
                              <input 
                                type="number" 
                                className="w-14 sm:w-16 p-2 sm:p-2.5 bg-[#252525] border border-white/10 rounded-lg sm:rounded-xl text-center text-white font-bold text-sm outline-none focus:border-orange-500/50 transition-all" 
                                value={inCart ? inCart.qty : ''} 
                                placeholder="0"
                                onChange={(e) => updateQuantity(item.name, category, inCart?.unit || item.unit, e.target.value)} 
                              />
                              <span className="text-[10px] text-gray-500 font-bold w-9 text-center uppercase">
                                {unitLabel}
                              </span>
                              {showSteppers && (
                                <motion.button
                                  whileTap={{ scale: 0.9 }}
                                  onClick={() => updateQuantity(item.name, category, inCart?.unit || item.unit, (parseFloat(inCart?.qty) || 0) + 1)}
                                  className="w-8 h-8 flex items-center justify-center bg-orange-500/20 rounded-lg text-orange-500 hover:bg-orange-500/30 transition-colors"
                                >
                                  <Plus size={14} />
                                </motion.button>
                              )}
                              {showKgPreview && (
                                <div className="hidden sm:flex items-center gap-2">
                                  <input
                                    readOnly
                                    tabIndex={-1}
                                    value={inCart ? String(roundKg2(secondaryKg)) : ''}
                                    placeholder="0"
                                    className="w-20 p-2 bg-[#1f1f1f] border border-white/10 rounded-lg text-center text-white font-black text-sm outline-none"
                                  />
                                  <span className="text-[10px] text-gray-500 font-bold">{UNIT_KG}</span>
                                </div>
                              )}
                            </div>
                          </motion.div>
                        );
                      })}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          ))}
        </motion.div>

        {/* Bottom Bar */}
        <motion.div 
          initial={{ y: 100 }}
          animate={{ y: 0 }}
          className="fixed bottom-0 left-0 right-0 bg-gradient-to-t from-[#1a1a1a] to-[#1a1a1a]/95 backdrop-blur-xl p-4 sm:p-5 shadow-2xl border-t border-white/5 flex justify-between items-center z-40"
        >
          <div>
            <p className="text-[10px] text-gray-500 font-bold uppercase">Items Selected</p>
            <p className="text-2xl sm:text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-orange-400 to-orange-600">{cart.length}</p>
          </div>
          <motion.button 
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => {
              if (!formData.center) return alert("Center select karo!");
              if (formData.center === 'Other' && !formData.centerOther.trim()) return alert("Center name likho!");
              if (!formData.senderName || !formData.mobileNumber) return alert("Requester Name ane Mobile Number fill karo!");
              if (!isDigitsOnly(formData.globalId)) return alert("Global ID ma only number allowed.");
              if (!isValidEmail(formData.email)) return alert("Valid email fill karo!");
              if (cart.length === 0) return alert("Add at least one item!");
              setStep('review');
            }} 
            className="bg-gradient-to-r from-orange-500 to-orange-600 text-white px-6 sm:px-10 py-3 sm:py-4 rounded-xl sm:rounded-2xl font-bold shadow-xl shadow-orange-500/30 flex items-center gap-2 text-sm sm:text-base"
          >
            <ShoppingCart size={20} /> Review Order
          </motion.button>
        </motion.div>
      </motion.div>
    );
  }

  if (step === 'review') {
    const totals = calculateTotals(cart, catalogItems);
    return (
      <motion.div 
        initial={{ opacity: 0, x: 50 }}
        animate={{ opacity: 1, x: 0 }}
        className="max-w-2xl mx-auto p-3 sm:p-4 pt-6 sm:pt-10"
      >
        <motion.button 
          whileHover={{ x: -5 }}
          onClick={() => setStep('form')} 
          className="mb-4 sm:mb-6 text-orange-500 font-bold flex items-center gap-2 text-sm"
        >
          <ArrowLeft size={20} /> Back to Form
        </motion.button>
        <motion.div 
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="bg-gradient-to-b from-[#1e1e1e] to-[#181818] p-6 sm:p-8 rounded-2xl sm:rounded-[2.5rem] border border-white/5 shadow-2xl"
        >
          <h2 className="text-xl sm:text-2xl font-bold text-center mb-6 sm:mb-8 flex items-center justify-center gap-3 text-white uppercase">
            <CheckCircle className="text-green-500" size={28} /> Order Summary
          </h2>
          <div className="grid grid-cols-2 gap-3 sm:gap-4 bg-[#252525] p-4 sm:p-5 rounded-2xl sm:rounded-3xl mb-6 sm:mb-8 border border-white/5 text-center">
            <div>
              <p className="text-[10px] text-gray-500 font-bold uppercase">Center</p>
              <p className="font-black text-white text-base sm:text-lg">{formData.center === 'Other' ? formData.centerOther : formData.center}</p>
            </div>
            <div>
          <p className="text-[10px] text-orange-400 font-bold uppercase">Total KG</p>
              <p className="font-black text-orange-400 text-xl sm:text-2xl">{formatMetric(totals.totalKg)}</p>
            </div>
            <div>
              <p className="text-[10px] text-gray-500 font-bold uppercase">Global ID</p>
              <p className="font-black text-white text-base">{formData.globalId}</p>
            </div>
            <div>
              <p className="text-[10px] text-gray-500 font-bold uppercase">Email</p>
              <p className="font-bold text-white text-xs break-all">{formData.email}</p>
            </div>
          </div>
          <div className="max-h-60 sm:max-h-72 overflow-y-auto mb-6 sm:mb-10 border border-white/5 rounded-2xl sm:rounded-3xl p-2 bg-[#151515] custom-scroll">
            <table className="w-full text-left">
              <tbody>
                {cart.map((item, i) => (
                  <motion.tr 
                    key={i}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: i * 0.03 }}
                    className="border-b border-white/5 last:border-0 hover:bg-white/5 transition-colors"
                  >
                    <td className="p-3 sm:p-4 text-sm font-medium">{item.name}</td>
                    <td className="p-3 sm:p-4 text-right font-black text-white">
                      {item.qty}{' '}
                      <span className="text-[10px] text-gray-500 uppercase font-bold">{item.unit}</span>
                      {getUnitToKgFactor(item.unit, item) !== 1 && (
                        <span className="ml-2 text-[10px] text-gray-400 font-bold">
                          (= {formatMetric(convertItemQtyToKg(item.qty, item.unit, catalogItems, item))} {UNIT_KG})
                        </span>
                      )}
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
          <motion.button 
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={handleConfirmSubmit} 
            disabled={loading} 
            className="w-full bg-gradient-to-r from-green-500 to-green-600 text-white py-4 sm:py-5 rounded-xl sm:rounded-2xl font-bold text-lg sm:text-xl flex justify-center items-center gap-3 shadow-2xl shadow-green-500/20 disabled:opacity-50"
          >
            {loading ? <Loader2 className="animate-spin" size={28} /> : (
              <>Finalize & Submit <Send size={24} /></>
            )}
          </motion.button>
        </motion.div>
      </motion.div>
    );
  }

  if (step === 'download') {
    return (
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="flex flex-col items-center justify-center min-h-[80vh] p-4"
      >
        <motion.div 
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", damping: 20 }}
          className="bg-gradient-to-b from-[#1e1e1e] to-[#181818] p-8 sm:p-12 rounded-2xl sm:rounded-[3rem] shadow-2xl text-center max-w-md w-full border border-white/5"
        >
          <motion.div 
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.2, type: "spring" }}
            className="w-20 h-20 sm:w-24 sm:h-24 bg-gradient-to-br from-green-500 to-green-600 rounded-full flex items-center justify-center mx-auto mb-6 sm:mb-8 shadow-xl shadow-green-500/30"
          >
            <CheckCircle size={48} className="text-white" />
          </motion.div>
          <motion.h2 
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="text-2xl sm:text-3xl font-extrabold text-white mb-3 uppercase"
          >
            Your order has been saved!
          </motion.h2>
          <motion.p 
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.4 }}
            className="text-gray-500 mb-8 sm:mb-10 text-base sm:text-lg"
          >
            Chalan No: <span className="text-orange-500 font-bold">#{formData.chalanNo}</span>
            <br />Center: <span className="text-white font-bold">{formData.center === 'Other' ? formData.centerOther : formData.center}</span>
            <br />Email: <span className="text-white font-bold">{formData.email}</span>
          </motion.p>
          <motion.button 
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.5 }}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={async () => {
              const nextNo = await fetchNextChalanNo();
              setFormData({ chalanNo: nextNo, date: new Date().toISOString().split('T')[0], center: '', centerOther: '', senderName: '', mobileNumber: '', post: '', globalId: '', email: '' });
              setCart([]);
              setStep('form');
            }} 
            className="w-full bg-gradient-to-r from-orange-500 to-orange-600 text-white py-4 rounded-xl sm:rounded-2xl font-bold text-lg flex justify-center items-center gap-2 shadow-xl shadow-orange-500/20"
          >
            <RefreshCw size={24} /> Return (New Form)
          </motion.button>
          {onBack && (
            <motion.button
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.55 }}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={onBack}
              className="w-full mt-3 bg-[#252525] hover:bg-[#2d2d2d] text-gray-300 py-4 rounded-xl sm:rounded-2xl font-bold text-base flex justify-center items-center gap-2 border border-white/10"
            >
              <ArrowLeft size={20} /> Dashboard par pachi jao
            </motion.button>
          )}
        </motion.div>
      </motion.div>
    );
  }
}

// --- SINGLE ORDER VIEW ---
function SingleOrderView({ orderId, onBack }) {
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [pdfLoading, setPdfLoading] = useState(false);

  useEffect(() => {
    const fetchOrder = async () => {
      try {
        const docRef = doc(db, "orders", orderId);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) { setOrder({ id: docSnap.id, ...docSnap.data() }); } 
        else { setError("Order not found."); }
      } catch { setError("Load Error."); }
      setLoading(false);
    };
    fetchOrder();
  }, [orderId]);

  const handleDownload = async () => {
    setPdfLoading(true);
    try {
      await saveBlobFromProducer(() => generatePDFBlobReliable(order), `${getSmartFileName(order)}.pdf`);
    } catch (err) { alert("Download Error: " + err.message); }
    setPdfLoading(false);
  };

  if (loading) {
    return (
      <div className="h-screen flex justify-center items-center bg-gradient-to-br from-[#0a0a0a] via-[#121212] to-[#0f0f0f]">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
        >
          <Loader2 className="text-orange-500" size={48} />
        </motion.div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-screen flex justify-center items-center flex-col text-white bg-gradient-to-br from-[#0a0a0a] via-[#121212] to-[#0f0f0f]">
        <p className="font-bold mb-4">{error}</p>
        <button onClick={onBack} className="bg-[#2d2d2d] px-4 py-2 rounded">Home</button>
      </div>
    );
  }

  return (
    <>
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="min-h-screen bg-gradient-to-br from-[#0a0a0a] via-[#121212] to-[#0f0f0f] p-4 flex items-center justify-center"
    >
      <motion.div 
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="max-w-xl w-full bg-gradient-to-b from-[#1e1e1e] to-[#181818] rounded-2xl sm:rounded-[2.5rem] shadow-2xl border border-white/5 overflow-hidden"
      >
        <div className="bg-gradient-to-r from-orange-500 to-orange-600 p-5 sm:p-6 text-white flex justify-between items-center">
          <h2 className="text-lg sm:text-xl font-extrabold uppercase tracking-tight">Stock Details</h2>
          <motion.button 
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={onBack} 
            className="bg-black/20 p-2 rounded-xl hover:bg-black/40"
          >
            <ArrowLeft />
          </motion.button>
        </div>
        <div className="p-6 sm:p-10">
          <div className="grid grid-cols-2 gap-4 sm:gap-6 mb-8 sm:mb-10">
            <div className="bg-[#252525] p-4 sm:p-5 rounded-2xl sm:rounded-3xl border border-white/5">
              <p className="text-[10px] text-gray-500 font-bold uppercase mb-1">Center</p>
              <p className="font-black text-white uppercase text-base sm:text-lg">{order.center}</p>
            </div>
            <div className="bg-[#252525] p-4 sm:p-5 rounded-2xl sm:rounded-3xl border border-white/5">
              <p className="text-[10px] text-gray-500 font-bold uppercase mb-1">Challan No.</p>
              <p className="font-black text-orange-500 text-base sm:text-lg">#{order.chalanNo}</p>
            </div>
          </div>
          <motion.button 
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            disabled={pdfLoading}
            onClick={handleDownload} 
            className="w-full bg-gradient-to-r from-orange-500 to-orange-600 text-white py-4 sm:py-5 rounded-xl sm:rounded-2xl font-black text-base sm:text-lg shadow-xl flex justify-center items-center gap-3 uppercase disabled:opacity-50"
          >
            {pdfLoading ? <Loader2 size={28} className="animate-spin" /> : <Download size={28} />} {pdfLoading ? 'Generating PDF...' : 'Download Official PDF'}
          </motion.button>
        </div>
      </motion.div>
    </motion.div>
    <PdfDownloadWaitOverlay active={pdfLoading} kind="request" />
    </>
  );
}

function SingleSendOrderView({ orderId, onBack }) {
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [pdfLoading, setPdfLoading] = useState(false);

  useEffect(() => {
    const fetchOrder = async () => {
      try {
        const docRef = doc(db, "send-orders", orderId);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) { setOrder({ id: docSnap.id, ...docSnap.data() }); }
        else { setError("Dispatch chalan not found."); }
      } catch { setError("Load Error."); }
      setLoading(false);
    };
    fetchOrder();
  }, [orderId]);

  const handleDownload = async () => {
    setPdfLoading(true);
    try {
      await saveBlobFromProducer(() => generateSendPDFBlobReliable(order), getSendFileName(order));
    } catch (err) { alert("Download Error: " + err.message); }
    setPdfLoading(false);
  };

  if (loading) {
    return (
      <div className="h-screen flex justify-center items-center bg-gradient-to-br from-[#0a0a0a] via-[#121212] to-[#0f0f0f]">
        <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }}>
          <Loader2 className="text-blue-500" size={48} />
        </motion.div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-screen flex justify-center items-center flex-col text-white bg-gradient-to-br from-[#0a0a0a] via-[#121212] to-[#0f0f0f]">
        <p className="font-bold mb-4">{error}</p>
        <button onClick={onBack} className="bg-[#2d2d2d] px-4 py-2 rounded">Home</button>
      </div>
    );
  }

  return (
    <>
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="min-h-screen bg-gradient-to-br from-[#0a0a0a] via-[#121212] to-[#0f0f0f] p-4 flex items-center justify-center"
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="max-w-xl w-full bg-gradient-to-b from-[#1e1e1e] to-[#181818] rounded-2xl sm:rounded-[2.5rem] shadow-2xl border border-white/5 overflow-hidden"
      >
        <div className="bg-gradient-to-r from-blue-500 to-blue-600 p-5 sm:p-6 text-white flex justify-between items-center">
          <div>
            <h2 className="text-lg sm:text-xl font-extrabold uppercase tracking-tight">Material Dispatch</h2>
            <p className="text-blue-100 text-xs mt-0.5">Material dispatch record</p>
          </div>
          <motion.button
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={onBack}
            className="bg-black/20 p-2 rounded-xl hover:bg-black/40"
          >
            <ArrowLeft />
          </motion.button>
        </div>
        <div className="p-6 sm:p-10">
          <div className="grid grid-cols-2 gap-4 sm:gap-6 mb-4">
            <div className="bg-[#252525] p-4 sm:p-5 rounded-2xl sm:rounded-3xl border border-white/5">
              <p className="text-[10px] text-gray-500 font-bold uppercase mb-1">From Center</p>
              <p className="font-black text-white uppercase text-base sm:text-lg">{order.fromCenter}</p>
            </div>
            <div className="bg-[#252525] p-4 sm:p-5 rounded-2xl sm:rounded-3xl border border-white/5">
              <p className="text-[10px] text-gray-500 font-bold uppercase mb-1">Challan No.</p>
              <p className="font-black text-blue-400 text-base sm:text-lg">#{order.chalanNo}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4 sm:gap-6 mb-8">
            <div className="bg-[#252525] p-4 sm:p-5 rounded-2xl sm:rounded-3xl border border-white/5">
              <p className="text-[10px] text-gray-500 font-bold uppercase mb-1">Date</p>
              <p className="font-bold text-white text-sm">{(order.date || '').split('-').reverse().join('-')}</p>
            </div>
            <div className="bg-[#252525] p-4 sm:p-5 rounded-2xl sm:rounded-3xl border border-white/5">
              <p className="text-[10px] text-gray-500 font-bold uppercase mb-1">Requester</p>
              <p className="font-bold text-white text-sm">{order.senderName || '-'}</p>
            </div>
          </div>
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            disabled={pdfLoading}
            onClick={handleDownload}
            className="w-full bg-gradient-to-r from-blue-500 to-blue-600 text-white py-4 sm:py-5 rounded-xl sm:rounded-2xl font-black text-base sm:text-lg shadow-xl flex justify-center items-center gap-3 uppercase disabled:opacity-50"
          >
            {pdfLoading ? <Loader2 size={28} className="animate-spin" /> : <Download size={28} />}
            {pdfLoading ? 'Generating PDF...' : 'Download Delivery Chalan'}
          </motion.button>
        </div>
      </motion.div>
    </motion.div>
    <PdfDownloadWaitOverlay active={pdfLoading} kind="send" />
    </>
  );
}

function SinglePurchaseView({ purchaseId, onBack }) {
  const [purchase, setPurchase] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [pdfLoading, setPdfLoading] = useState(false);

  useEffect(() => {
    const fetchPurchase = async () => {
      try {
        const docRef = doc(db, 'purchases', purchaseId);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          setPurchase({ id: docSnap.id, ...docSnap.data() });
        } else {
          setError('Purchase report not found.');
        }
      } catch {
        setError('Load Error.');
      }
      setLoading(false);
    };
    fetchPurchase();
  }, [purchaseId]);

  const handleDownload = async () => {
    if (!purchase) return;
    setPdfLoading(true);
    try {
      await saveBlobFromProducer(() => generatePurchasePDFBlob(purchase), getPurchaseFileName(purchase));
    } catch (err) {
      alert(`Download Error: ${err.message}`);
    }
    setPdfLoading(false);
  };

  if (loading) {
    return (
      <div className="h-screen flex justify-center items-center bg-gradient-to-br from-[#0a0a0a] via-[#121212] to-[#0f0f0f]">
        <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }}>
          <Loader2 className="text-violet-500" size={48} />
        </motion.div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-screen flex justify-center items-center flex-col text-white bg-gradient-to-br from-[#0a0a0a] via-[#121212] to-[#0f0f0f]">
        <p className="font-bold mb-4">{error}</p>
        <button onClick={onBack} className="bg-[#2d2d2d] px-4 py-2 rounded">Home</button>
      </div>
    );
  }

  return (
    <>
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="min-h-screen bg-gradient-to-br from-[#0a0a0a] via-[#121212] to-[#0f0f0f] p-4 flex items-center justify-center"
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="max-w-xl w-full bg-gradient-to-b from-[#1e1e1e] to-[#181818] rounded-2xl sm:rounded-[2.5rem] shadow-2xl border border-white/5 overflow-hidden"
      >
        <div className="bg-gradient-to-r from-violet-500 to-fuchsia-600 p-5 sm:p-6 text-white flex justify-between items-center">
          <div>
            <h2 className="text-lg sm:text-xl font-extrabold uppercase tracking-tight">Purchase Report</h2>
            <p className="text-violet-100 text-xs mt-0.5">
              {getPurchaseResolvedSource(purchase) === PURCHASE_SOURCE_KOTHAR_STOCK
                ? 'મુખ્ય કોઠાર સ્ટોક'
                : 'દુકાન માંથી ખરીદેલ માલ'}
            </p>
          </div>
          <motion.button
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={onBack}
            className="bg-black/20 p-2 rounded-xl hover:bg-black/40"
          >
            <ArrowLeft />
          </motion.button>
        </div>
        <div className="p-6 sm:p-10">
          {getPurchaseResolvedSource(purchase) === PURCHASE_SOURCE_KOTHAR_STOCK ? (
            <div className="grid grid-cols-1 gap-4 sm:gap-6 mb-8">
              <div className="bg-[#252525] p-4 sm:p-5 rounded-2xl sm:rounded-3xl border border-white/5">
                <p className="text-[10px] text-gray-500 font-bold uppercase mb-1">પ્રકાર</p>
                <p className="font-black text-white text-base sm:text-lg">સ્વામિનારાયણ ધામ મુખ્ય કોઠાર સ્ટોક</p>
              </div>
              <div className="bg-[#252525] p-4 sm:p-5 rounded-2xl sm:rounded-3xl border border-white/5">
                <p className="text-[10px] text-gray-500 font-bold uppercase mb-1">તારીખ</p>
                <p className="font-bold text-white text-sm">{formatDisplayDate(purchase.date || purchase.entryDate)}</p>
              </div>
            </div>
          ) : (
            <>
              {(purchase.center || '').trim() !== '' && (
                <div className="mb-4 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-[11px] font-bold text-amber-200">
                  જુનો Center: {purchase.center}
                </div>
              )}
              <div className="grid grid-cols-2 gap-4 sm:gap-6 mb-4">
                <div className="bg-[#252525] p-4 sm:p-5 rounded-2xl sm:rounded-3xl border border-white/5 sm:col-span-2">
                  <p className="text-[10px] text-gray-500 font-bold uppercase mb-1">Shop Name</p>
                  <p className="font-black text-white uppercase text-base sm:text-lg">{purchase.shopName || '-'}</p>
                </div>
                <div className="bg-[#252525] p-4 sm:p-5 rounded-2xl sm:rounded-3xl border border-white/5">
                  <p className="text-[10px] text-gray-500 font-bold uppercase mb-1">Bill Number</p>
                  <p className="font-black text-violet-300 text-base sm:text-lg">#{purchase.billNo || '-'}</p>
                </div>
                <div className="bg-[#252525] p-4 sm:p-5 rounded-2xl sm:rounded-3xl border border-white/5">
                  <p className="text-[10px] text-gray-500 font-bold uppercase mb-1">Bill Date</p>
                  <p className="font-bold text-white text-sm">{formatDisplayDate(purchase.billDate || purchase.date)}</p>
                </div>
              </div>
            </>
          )}
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            disabled={pdfLoading}
            onClick={handleDownload}
            className="w-full bg-gradient-to-r from-violet-500 to-fuchsia-600 text-white py-4 sm:py-5 rounded-xl sm:rounded-2xl font-black text-base sm:text-lg shadow-xl flex justify-center items-center gap-3 uppercase disabled:opacity-50"
          >
            {pdfLoading ? <Loader2 size={28} className="animate-spin" /> : <Download size={28} />}
            {pdfLoading ? 'Generating PDF...' : 'Download Purchase PDF'}
          </motion.button>
        </div>
      </motion.div>
    </motion.div>
    <PdfDownloadWaitOverlay active={pdfLoading} kind="purchase" />
    </>
  );
}

function SingleReportView({ reportId, onBack }) {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [pdfLoading, setPdfLoading] = useState(false);
  const [shareLoading, setShareLoading] = useState(false);

  useEffect(() => {
    const fetchReport = async () => {
      try {
        const docRef = doc(db, "reports", reportId);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          setReport(hydrateReport({ id: docSnap.id, ...docSnap.data() }));
        } else {
          setError("Report not found.");
        }
      } catch {
        setError("Load Error.");
      }
      setLoading(false);
    };
    fetchReport();
  }, [reportId]);

  const handleDownload = async () => {
    if (!report) return;
    setPdfLoading(true);
    try {
      await saveBlobFromProducer(() => generateSummaryReportPDFBlob(report), getReportFileName(report));
    } catch (err) {
      alert("Download Error: " + err.message);
    }
    setPdfLoading(false);
  };

  const handleShare = async () => {
    if (!report) return;
    setShareLoading(true);
    try {
      const blob = await generateSummaryReportPDFBlob(report);
      const file = new File([blob], getReportFileName(report), { type: 'application/pdf' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: report.title,
          text: `${report.title} - ${report.monthLabel}`,
        });
      } else {
        await saveBlobFromProducer(() => Promise.resolve(blob), getReportFileName(report));
        alert("Share not supported on this device. File downloaded instead.");
      }
    } catch (err) {
      alert("Share Error: " + err.message);
    }
    setShareLoading(false);
  };

  if (loading) {
    return (
      <div className="h-screen flex justify-center items-center bg-gradient-to-br from-[#0a0a0a] via-[#121212] to-[#0f0f0f]">
        <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }}>
          <Loader2 className="text-emerald-500" size={48} />
        </motion.div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-screen flex justify-center items-center flex-col text-white bg-gradient-to-br from-[#0a0a0a] via-[#121212] to-[#0f0f0f]">
        <p className="font-bold mb-4">{error}</p>
        <button onClick={onBack} className="bg-[#2d2d2d] px-4 py-2 rounded">Home</button>
      </div>
    );
  }

  return (
    <>
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="min-h-screen bg-gradient-to-br from-[#0a0a0a] via-[#121212] to-[#0f0f0f] p-4 sm:p-6"
    >
      <div className="max-w-6xl mx-auto">
        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="bg-gradient-to-b from-[#1e1e1e] to-[#181818] rounded-2xl sm:rounded-[2rem] shadow-2xl border border-white/5 overflow-hidden"
        >
          <div className="bg-gradient-to-r from-emerald-500 to-emerald-600 p-5 sm:p-6 text-white flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg sm:text-xl font-extrabold tracking-tight">{report.title}</h2>
              <p className="text-white/90 text-sm font-bold mt-2">{report.centerLabel}</p>
            </div>
            <div className="flex gap-2 sm:gap-3">
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={onBack}
                className="bg-black/20 p-2.5 rounded-xl hover:bg-black/40"
              >
                <ArrowLeft />
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                disabled={shareLoading}
                onClick={handleShare}
                className="bg-black/20 px-4 py-2 rounded-xl hover:bg-black/40 text-sm font-bold flex items-center gap-2 disabled:opacity-50"
              >
                {shareLoading ? <Loader2 size={16} className="animate-spin" /> : <Share2 size={16} />} Share
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                disabled={pdfLoading}
                onClick={handleDownload}
                className="bg-white text-slate-900 px-4 py-2 rounded-xl text-sm font-black flex items-center gap-2 disabled:opacity-50"
              >
                {pdfLoading ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
                {pdfLoading ? 'Generating...' : 'Download PDF'}
              </motion.button>
            </div>
          </div>

          <div className="p-4 sm:p-8">
            <ReportPreviewContent report={report} />
          </div>
        </motion.div>
      </div>
    </motion.div>
    <PdfDownloadWaitOverlay active={pdfLoading || shareLoading} kind="report" />
    </>
  );
}

export default App;
