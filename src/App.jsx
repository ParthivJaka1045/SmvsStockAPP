import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { db } from './firebase'; 
import { collection, addDoc, getDocs, getDoc, query, orderBy, doc, where, updateDoc, deleteDoc } from 'firebase/firestore'; 
import { categories, centerData } from './data';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import emailjs from 'emailjs-com'; 
import gujaratiFontBoldUrl from './assets/fonts/NotoSansGujarati-Bold.ttf?url';
import gujaratiFontRegularUrl from './assets/fonts/NotoSansGujarati-Regular.ttf?url';
import {
  REPORT_TITLE,
  buildSummaryReport,
  formatDisplayDate,
  formatMetric,
  generateSummaryReportPDFBlob,
  getReportFileName,
  getReportTheme,
  hydrateReport,
} from './reporting';
import { 
  Trash2, Download, LogOut, Loader2, CheckCircle, RefreshCw, 
  ChevronDown, ChevronUp, ArrowLeft, Send, LayoutDashboard, 
  Edit3, Eye, Share2, X, Search, Calendar, MapPin, User, Eraser,
  Package, ShoppingCart, FileText, Sparkles, Box, Plus, Minus,
  Mail
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
  const directOrderId = initialRoute.directOrderId;
  const directSendOrderId = initialRoute.directSendOrderId;
  const directReportId = initialRoute.directReportId;
  const directPurchaseId = initialRoute.directPurchaseId;

  useEffect(() => {
    emailjs.init("m14CzkMDHuJeLH0VK"); 
  }, []);

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
                animate={{ rotate: [0, 10, -10, 0] }}
                transition={{ duration: 2, repeat: Infinity, repeatDelay: 3 }}
              >
                <Package size={24} className="text-orange-500" />
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
                  className="w-20 h-20 sm:w-24 sm:h-24 bg-gradient-to-br from-orange-500 to-orange-700 rounded-2xl flex items-center justify-center mx-auto mb-5 shadow-xl shadow-orange-500/30"
                  whileHover={{ rotate: [0, -5, 5, 0] }}
                  transition={{ duration: 0.5 }}
                >
                  <Package size={40} className="text-white" />
                </motion.div>
                <h2 className="text-2xl sm:text-3xl font-black text-white uppercase tracking-tight">Stock Portal</h2>
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

      {view === 'dashboard' && <UserHub user={user} />}
      {view === 'admin' && <AdminDashboard user={user} />}
    </div>
  );
}

// --- SHARED HELPERS ---
const PDF_FONT_FAMILY = 'NotoSansGujaratiApp';
const PDF_FALLBACK_FONT = 'helvetica';
let pdfFontAssetsPromise = null;

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

const getCenterScopeLabel = (scope, center) =>
  scope === 'center' && center ? center : 'All Centers / Full Report';

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

const loadPdfFontAssets = async () => {
  if (!pdfFontAssetsPromise) {
    pdfFontAssetsPromise = Promise.all([
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

  return pdfFontAssetsPromise;
};

const ensurePdfFont = async (pdf) => {
  try {
    const assets = await loadPdfFontAssets();
    assets.forEach(({ fileName, style, base64 }) => {
      if (!pdf.existsFileInVFS(fileName)) {
        pdf.addFileToVFS(fileName, base64);
      }
      pdf.addFont(fileName, PDF_FONT_FAMILY, style);
    });
    return PDF_FONT_FAMILY;
  } catch (error) {
    console.warn('PDF Gujarati font load failed. Falling back to Helvetica.', error);
    return PDF_FALLBACK_FONT;
  }
};

const calculateTotals = (items) => {
  let totalKg = 0;
  items.forEach((item) => {
    totalKg += parseFloat(item.qty) || 0;
  });
  return { totalItems: items.length, totalKg };
};

const calculateKgTotals = (items) => ({
  totalItems: items.length,
  totalKg: items.reduce((sum, item) => sum + (parseFloat(item.kg) || 0), 0),
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

const getPurchaseFileName = (purchase) =>
  `purchase-${sanitizeFilePart(purchase?.center || purchase?.shopName)}-${sanitizeFilePart(purchase?.billNo)}.pdf`;

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

const compactPdfValue = (value) => {
  const text = (value || '-').toString();
  return text.length > 46 ? `${text.slice(0, 43)}...` : text;
};

const drawPdfFooter = (pdf, footerText = '') => {
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const currentPage = pdf.getCurrentPageInfo().pageNumber;
  const totalPages = pdf.getNumberOfPages();

  pdf.setDrawColor(226, 232, 240);
  pdf.line(14, pageHeight - 12, pageWidth - 14, pageHeight - 12);

  pdf.setFont(PDF_FALLBACK_FONT, 'normal');
  pdf.setFontSize(8);
  pdf.setTextColor(100, 116, 139);
  if (footerText) {
    pdf.text(footerText, 14, pageHeight - 7);
  }
  pdf.text(`Page ${currentPage} / ${totalPages}`, pageWidth - 14, pageHeight - 7, { align: 'right' });
};

const drawPdfContinuationHeader = (pdf, title, subtitle, accent) => {
  const pageWidth = pdf.internal.pageSize.getWidth();

  pdf.setFont(PDF_FALLBACK_FONT, 'bold');
  pdf.setFontSize(10);
  pdf.setTextColor(...accent);
  pdf.text(title, 14, 14);

  if (subtitle) {
    pdf.setFont(PDF_FALLBACK_FONT, 'normal');
    pdf.setFontSize(8.5);
    pdf.setTextColor(100, 116, 139);
    pdf.text(subtitle, pageWidth - 14, 14, { align: 'right' });
  }

  pdf.setDrawColor(...accent);
  pdf.line(14, 17, pageWidth - 14, 17);
};

const drawPdfMetaGrid = (pdf, startY, metaEntries, accent, surface) => {
  if (!metaEntries.length) return startY;

  const pageWidth = pdf.internal.pageSize.getWidth();
  const usableWidth = pageWidth - 28;
  const columnGap = 4;
  const columns = 2;
  const cardWidth = (usableWidth - columnGap) / columns;
  const cardHeight = 14;
  const rows = Math.ceil(metaEntries.length / columns);

  metaEntries.forEach((entry, index) => {
    const rowIndex = Math.floor(index / columns);
    const columnIndex = index % columns;
    const x = 14 + (columnIndex * (cardWidth + columnGap));
    const y = startY + (rowIndex * (cardHeight + 3));

    pdf.setFillColor(...surface);
    pdf.roundedRect(x, y, cardWidth, cardHeight, 2, 2, 'F');

    pdf.setFont(PDF_FALLBACK_FONT, 'bold');
    pdf.setFontSize(6.5);
    pdf.setTextColor(...accent);
    pdf.text(entry.label, x + 3, y + 4.5);

    pdf.setFont(PDF_FALLBACK_FONT, 'normal');
    pdf.setFontSize(8.3);
    pdf.setTextColor(15, 23, 42);
    pdf.text(compactPdfValue(entry.value), x + 3, y + 10);
  });

  return startY + (rows * (cardHeight + 3));
};

const drawPdfCompactMetaRows = (pdf, startY, metaRows, accent) => {
  if (!metaRows.length) return startY;

  const pageWidth = pdf.internal.pageSize.getWidth();
  const rowWidth = pageWidth - 28;
  const leftValueX = 36;
  const rightLabelX = (pageWidth / 2) + 2;
  const rightValueX = rightLabelX + 22;

  metaRows.forEach((row, index) => {
    const y = startY + (index * 9.5);

    pdf.setFillColor(248, 250, 252);
    pdf.roundedRect(14, y - 1.5, rowWidth, 7.5, 2, 2, 'F');

    pdf.setFont(PDF_FALLBACK_FONT, 'bold');
    pdf.setFontSize(7.5);
    pdf.setTextColor(...accent);
    pdf.text(`${row.leftLabel}:`, 18, y + 3);
    pdf.text(`${row.rightLabel}:`, rightLabelX, y + 3);

    pdf.setTextColor(15, 23, 42);
    pdf.text(compactPdfValue(row.leftValue), leftValueX, y + 3);
    pdf.text(compactPdfValue(row.rightValue), rightValueX, y + 3);
  });

  return startY + (metaRows.length * 9.5);
};

const drawPdfStatCards = (pdf, startY, statEntries, accent, surface) => {
  if (!statEntries.length) return startY;

  const pageWidth = pdf.internal.pageSize.getWidth();
  const gap = 4;
  const columns = Math.max(1, Math.min(statEntries.length, 3));
  const cardWidth = (pageWidth - 28 - (gap * (columns - 1))) / columns;

  statEntries.forEach((entry, index) => {
    const x = 14 + (index * (cardWidth + gap));

    pdf.setFillColor(...surface);
    pdf.roundedRect(x, startY, cardWidth, 16, 2, 2, 'F');

    pdf.setFont(PDF_FALLBACK_FONT, 'bold');
    pdf.setFontSize(6.8);
    pdf.setTextColor(...accent);
    pdf.text(entry.label, x + 3, startY + 5);

    pdf.setFont(PDF_FALLBACK_FONT, 'bold');
    pdf.setFontSize(12);
    pdf.setTextColor(15, 23, 42);
    pdf.text(String(entry.value), x + 3, startY + 11.5);
  });

  return startY + 21;
};

const createStructuredPdfBlob = async ({
  title,
  subtitle,
  accent,
  surface,
  footerText,
  metaEntries,
  compactMetaRows = [],
  statEntries,
  bottomStatEntries = [],
  head,
  body,
  columnStyles = {},
}) => {
  const pdf = new jsPDF('p', 'mm', 'a4');
  const bodyFont = await ensurePdfFont(pdf);
  const pageWidth = pdf.internal.pageSize.getWidth();

  pdf.setFont(PDF_FALLBACK_FONT, 'bold');
  pdf.setFontSize(18);
  pdf.setTextColor(...accent);
  pdf.text(title, pageWidth / 2, 16, { align: 'center' });

  if (subtitle) {
    pdf.setFont(PDF_FALLBACK_FONT, 'bold');
    pdf.setFontSize(8.5);
    pdf.setTextColor(100, 116, 139);
    pdf.text(subtitle, pageWidth / 2, 21.5, { align: 'center' });
  }

  pdf.setDrawColor(...accent);
  pdf.setLineWidth(0.8);
  pdf.line(20, 27, pageWidth - 20, 27);

  let startY = compactMetaRows.length
    ? drawPdfCompactMetaRows(pdf, 33, compactMetaRows, accent)
    : drawPdfMetaGrid(pdf, 33, metaEntries, accent, [248, 250, 252]);
  startY = drawPdfStatCards(pdf, startY + 2, statEntries, accent, surface);

  autoTable(pdf, {
    startY: startY + 4,
    head: [head],
    body,
    margin: { top: 22, right: 14, bottom: bottomStatEntries.length ? 40 : 16, left: 14 },
    styles: {
      font: bodyFont,
      fontSize: 8.5,
      cellPadding: 2.4,
      overflow: 'linebreak',
      textColor: [31, 41, 55],
      lineColor: [226, 232, 240],
      lineWidth: 0.18,
      valign: 'middle',
    },
    headStyles: {
      fillColor: [15, 23, 42],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      lineColor: [15, 23, 42],
      lineWidth: 0.2,
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
    bodyStyles: {
      minCellHeight: 8.5,
    },
    columnStyles,
    didParseCell: (data) => {
      if (data.section === 'head') {
        data.cell.styles.font = PDF_FALLBACK_FONT;
      } else {
        data.cell.styles.font = bodyFont;
      }
    },
    didDrawPage: () => {
      if (pdf.getCurrentPageInfo().pageNumber > 1) {
        drawPdfContinuationHeader(pdf, title, subtitle, accent);
      }
      drawPdfFooter(pdf, footerText);
    },
  });

  if (!pdf.lastAutoTable) {
    drawPdfFooter(pdf, footerText);
  }

  if (bottomStatEntries.length && pdf.lastAutoTable) {
    drawPdfStatCards(pdf, pdf.lastAutoTable.finalY + 5, bottomStatEntries, accent, surface);
  }

  return pdf.output('blob');
};

const generatePDFBlobReliable = async (order) => {
  const items = (order.items || []).filter((item) => item?.name?.trim());
  const totals = calculateTotals(items);

  return createStructuredPdfBlob({
    title: 'SMVS STOCK REQUEST',
    subtitle: '',
    accent: [234, 88, 12],
    surface: [255, 247, 237],
    footerText: `Request Chalan #${order.chalanNo || '-'}${order.center ? ` | ${order.center}` : ''}`,
    metaEntries: [],
    compactMetaRows: [
      { leftLabel: 'Center', leftValue: order.center || '-', rightLabel: 'Chalan No', rightValue: `#${order.chalanNo || '-'}` },
      { leftLabel: 'Order Date', leftValue: formatDisplayDate(order.date), rightLabel: 'Sender', rightValue: order.senderName || '-' },
      { leftLabel: 'Post', leftValue: order.post || '-', rightLabel: 'Mobile', rightValue: order.mobileNumber || '-' },
      { leftLabel: 'Global ID', leftValue: order.globalId || '-', rightLabel: 'Email', rightValue: order.email || '-' },
    ],
    statEntries: [],
    bottomStatEntries: [
      { label: 'Items', value: items.length },
      { label: 'Total KG', value: formatMetric(totals.totalKg) },
    ],
    head: ['No', 'Item Name', 'Qty', 'Unit'],
    body: items.map((item, index) => [
      String(index + 1),
      item.name || '-',
      formatMetric(item.qty),
      item.unit || '-',
    ]),
    columnStyles: {
      0: { cellWidth: 14, halign: 'center' },
      2: { cellWidth: 22, halign: 'center' },
      3: { cellWidth: 22, halign: 'center' },
    },
  });
};

const generateSendPDFBlobReliable = async (order) => {
  const items = (order.items || []).filter((item) => item?.itemName?.trim());
  const totals = calculateKgTotals(items);

  return createStructuredPdfBlob({
    title: 'SMVS MATERIAL DISPATCH',
    subtitle: '',
    accent: [37, 99, 235],
    surface: [239, 246, 255],
    footerText: `Dispatch Chalan #${order.chalanNo || '-'}${order.fromCenter ? ` | ${order.fromCenter}` : ''}`,
    metaEntries: [],
    compactMetaRows: [
      { leftLabel: 'Center', leftValue: order.fromCenter || '-', rightLabel: 'Chalan No', rightValue: `#${order.chalanNo || '-'}` },
      { leftLabel: 'Date', leftValue: formatDisplayDate(order.date), rightLabel: 'To Center', rightValue: order.toCenter || 'Swaminarayan Dham Center' },
      { leftLabel: 'Sender', leftValue: order.senderName || '-', rightLabel: 'Mobile', rightValue: order.mobileNumber || '-' },
      { leftLabel: 'Global ID', leftValue: order.globalId || '-', rightLabel: 'Email', rightValue: order.email || '-' },
    ],
    statEntries: [],
    bottomStatEntries: [
      { label: 'Items', value: items.length },
      { label: 'Total KG', value: formatMetric(totals.totalKg) },
    ],
    head: ['No', 'Item Name', 'KG'],
    body: items.map((item, index) => [
      String(index + 1),
      item.itemName || '-',
      formatMetric(item.kg),
    ]),
    columnStyles: {
      0: { cellWidth: 14, halign: 'center' },
      2: { cellWidth: 24, halign: 'center' },
    },
  });
};

const generatePurchasePDFBlob = async (purchase) => {
  const items = (purchase.items || []).filter((item) => item?.itemName?.trim());
  const totals = calculateKgTotals(items);

  return createStructuredPdfBlob({
    title: 'SMVS PURCHASE REPORT',
    subtitle: '',
    accent: [139, 92, 246],
    surface: [245, 243, 255],
    footerText: `Purchase Bill #${purchase.billNo || '-'}${purchase.shopName ? ` | ${purchase.shopName}` : ''}`,
    metaEntries: [],
    compactMetaRows: [
      { leftLabel: 'Shop Name', leftValue: purchase.shopName || '-', rightLabel: 'Bill Number', rightValue: `#${purchase.billNo || '-'}` },
      { leftLabel: 'Bill Date', leftValue: formatDisplayDate(purchase.billDate || purchase.date), rightLabel: 'Entry Date', rightValue: formatDisplayDate(purchase.date || purchase.billDate) },
    ],
    statEntries: [],
    bottomStatEntries: [
      { label: 'Number of Items', value: items.length },
      { label: 'Total KG', value: formatMetric(totals.totalKg) },
    ],
    head: ['No', 'Item Name', 'KG'],
    body: items.map((item, index) => [
      String(index + 1),
      item.itemName || '-',
      formatMetric(item.kg),
    ]),
    columnStyles: {
      0: { cellWidth: 14, halign: 'center' },
      2: { cellWidth: 24, halign: 'center' },
    },
  });
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
    selectedDate: getDateWithinMonth(month, new Date().toISOString().split('T')[0]),
    scope: 'all',
    center: '',
    centerOther: '',
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
          <p key={`${label}-${index}`} className="text-[11px] font-bold uppercase tracking-wide leading-tight text-slate-400">
            {label}
          </p>
        ))}
      </div>
      <p className={`mt-2 text-lg sm:text-xl font-black ${accentClass}`}>{value}</p>
    </div>
  );
}

function ReportPreviewContent({ report }) {
  const preparedReport = hydrateReport(report);
  const uiTheme = getReportUiTheme();

  return (
    <div className="space-y-6 font-report-gujarati">
      <div className={`rounded-3xl border ${uiTheme.border} bg-gradient-to-r ${uiTheme.soft} p-6 sm:p-8`}>
        <div className="flex flex-col gap-4">
          <div>
            <p className={`text-xs font-black uppercase tracking-[0.25em] ${uiTheme.text}`}>Monthly Report</p>
            <h2 className="mt-2 text-3xl sm:text-4xl font-black text-slate-900">{REPORT_TITLE}</h2>
            <p className="mt-2 text-[13px] sm:text-sm text-slate-600">Simple monthly stock table with fixed format.</p>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <PreviewInfoCard label="Month" value={preparedReport.monthLabel} />
            <PreviewInfoCard label="Center" value={preparedReport.centerLabel} />
            <PreviewInfoCard label="Range" value={preparedReport.rangeLabel} />
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className={`border-b ${uiTheme.border} bg-gradient-to-r ${uiTheme.soft} px-4 py-3`}>
          <h3 className={`text-sm font-black uppercase tracking-widest ${uiTheme.text}`}>Monthly Table</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-slate-900 text-white">
              <tr>
                <th className="px-4 py-3 text-left">વસ્તુનું નામ</th>
                <th className="px-4 py-3 text-left">મહિનો</th>
                <th className="px-4 py-3 text-center">{preparedReport.rangeLabel} આવક (KG)</th>
                <th className="px-4 py-3 text-center">{preparedReport.rangeLabel} જાવક (KG)</th>
                <th className="px-4 py-3 text-center">કુલ સ્ટોક (KG)</th>
              </tr>
            </thead>
            <tbody>
              {preparedReport.rows.map((row, index) => (
                <tr key={`${row.itemName}-${index}`} className="border-t border-slate-200">
                  <td className="px-4 py-3 font-bold text-slate-900">{row.itemName}</td>
                  <td className="px-4 py-3 text-slate-600">{row.monthLabel}</td>
                  <td className={`px-4 py-3 text-center font-bold ${uiTheme.text}`}>{formatMetric(row.income)}</td>
                  <td className="px-4 py-3 text-center font-bold text-slate-900">{formatMetric(row.outgoing)}</td>
                  <td className="px-4 py-3 text-center font-black text-slate-900">{formatMetric(row.totalStock)}</td>
                </tr>
              ))}
              {preparedReport.rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-sm font-bold text-slate-400">
                    No items found for the selected month.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <ReportSummaryCard labelLines={['Number of Item']} value={formatMetric(preparedReport.summary.totalRows)} />
        <ReportSummaryCard labelLines={['આવક', 'KG']} value={formatMetric(preparedReport.summary.totalIncome)} accentClass={uiTheme.text} />
        <ReportSummaryCard labelLines={['જાવક', 'KG']} value={formatMetric(preparedReport.summary.totalOutgoing)} />
        <ReportSummaryCard labelLines={['કુલ સ્ટોક', 'KG']} value={formatMetric(preparedReport.summary.totalStock)} />
      </div>
    </div>
  );
}

// --- ADMIN DASHBOARD ---
function AdminDashboard({ user }) {
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

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { fetchOrders(); fetchSendOrders(); fetchReports(); }, []);

  const clearFilters = () => setFilters({ date: '', center: '', name: '' });
  const clearSendFilters = () => setSendFilters({ date: '', center: '', name: '' });

  const filteredOrders = orders.filter(o => {
    const dateMatch = filters.date ? o.date === filters.date : true;
    const centerMatch = filters.center ? o.center.toLowerCase().includes(filters.center.toLowerCase()) : true;
    const nameMatch = filters.name ? ((o.senderName || '')).toLowerCase().includes(filters.name.toLowerCase()) : true;
    return dateMatch && centerMatch && nameMatch;
  });

  const filteredSendOrders = sendOrders.filter(o => {
    const dateMatch = sendFilters.date ? o.date === sendFilters.date : true;
    const centerMatch = sendFilters.center ? (o.fromCenter || '').toLowerCase().includes(sendFilters.center.toLowerCase()) : true;
    const nameMatch = sendFilters.name ? (o.senderName || '').toLowerCase().includes(sendFilters.name.toLowerCase()) : true;
    return dateMatch && centerMatch && nameMatch;
  });

  const handleDownload = async (order) => {
    setPdfLoading(order.id);
    try {
      const blob = await generatePDFBlobReliable(order);
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `${getSmartFileName(order)}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(link.href);
    } catch (err) { alert("Download Error: " + err.message); }
    setPdfLoading(null);
  };

  const handleShare = async (order) => {
    setPdfLoading(order.id);
    try {
      const blob = await generatePDFBlobReliable(order);
      const file = new File([blob], `${getSmartFileName(order)}.pdf`, { type: 'application/pdf' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: 'SMVS Stock Request', text: `Stock Request - ${order.center} #${order.chalanNo}` });
      } else {
        // Fallback: download the file instead
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `${getSmartFileName(order)}.pdf`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(link.href);
        alert("Share not supported on this device. File downloaded instead.");
      }
    } catch (err) { alert("Share Error: " + err.message); }
    setPdfLoading(null);
  };

  const openMailModal = (order, type) => {
    setMailModal({ order, type });
    const savedEmail = isValidEmail(order?.email) ? order.email.trim() : '';
    if (type === 'report') {
      if (REPORT_DEFAULT_EMAILS.includes(savedEmail)) {
        setSelectedReportEmail(savedEmail);
        setCustomEmail('');
      } else if (savedEmail) {
        setSelectedReportEmail('custom');
        setCustomEmail(savedEmail);
      } else {
        setSelectedReportEmail(REPORT_DEFAULT_EMAILS[0]);
        setCustomEmail('');
      }
    } else {
      setCustomEmail(savedEmail);
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
      setOrders(orders.filter(o => o.id !== order.id));
    } catch (err) { alert("Delete Error: " + err.message); }
  };

  const handleDownloadSend = async (order) => {
    setSendPdfLoading(order.id);
    try {
      const blob = await generateSendPDFBlobReliable(order);
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = getSendFileName(order);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(link.href);
    } catch (err) { alert("Download Error: " + err.message); }
    setSendPdfLoading(null);
  };

  const handleShareSend = async (order) => {
    setSendPdfLoading(order.id);
    try {
      const blob = await generateSendPDFBlobReliable(order);
      const file = new File([blob], getSendFileName(order), { type: 'application/pdf' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: 'SMVS Material Dispatch', text: `Dispatch - ${order.fromCenter} #${order.chalanNo}` });
      } else {
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = getSendFileName(order);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(link.href);
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
    if (!reportForm.month || !reportForm.selectedDate) {
      alert('Select month and selected date first.');
      return;
    }
    if (!reportForm.selectedDate.startsWith(reportForm.month)) {
      alert('Selected date must be inside the selected month.');
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
      const purchaseSnapshot = await getDocs(query(collection(db, 'purchases'), orderBy('timestamp', 'desc')));
      const purchases = purchaseSnapshot.docs
        .map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }))
        .filter((item) => !item.is_deleted);

      const draft = buildSummaryReport({
        orders,
        sendOrders,
        purchases,
        month: reportForm.month,
        selectedDate: reportForm.selectedDate,
        createdBy: user?.username || 'Admin',
        scope: reportForm.scope,
        center: effectiveCenter,
      });

      if (draft.rows.length === 0) {
        alert(`No entries found for ${draft.centerLabel}.`);
        setReportGenerating(false);
        return;
      }

      const payload = {
        ...draft,
        generatedAt: new Date(),
        generatedAtIso: new Date().toISOString(),
      };
      const docRef = await addDoc(collection(db, 'reports'), payload);
      const savedReport = hydrateReport({ id: docRef.id, ...payload });
      setReports(prev => [savedReport, ...prev]);
      setPreviewReport(savedReport);
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
      const blob = await generateSummaryReportPDFBlob(hydrated);
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = getReportFileName(hydrated);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(link.href);
    } catch (err) {
      alert('Download Error: ' + err.message);
    }
    setReportPdfLoading(null);
  };

  const handleShareReport = async (report) => {
    setReportPdfLoading(report.id);
    try {
      const hydrated = hydrateReport(report);
      const blob = await generateSummaryReportPDFBlob(hydrated);
      const file = new File([blob], getReportFileName(hydrated), { type: 'application/pdf' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: hydrated.title,
          text: `${hydrated.title} - ${hydrated.monthLabel}`,
        });
      } else {
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = getReportFileName(hydrated);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(link.href);
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
      setSendOrders(sendOrders.filter(o => o.id !== order.id));
    } catch (err) { alert("Delete Error: " + err.message); }
  };

  if (editOrder) return <EditOrderScreen order={editOrder} onBack={() => { setEditOrder(null); fetchOrders(); }} />;
  if (editSendOrder) return <EditSendOrderScreen order={editSendOrder} onBack={() => { setEditSendOrder(null); fetchSendOrders(); }} />;

  const isRequests = activeTab === 'requests';
  const isSends = activeTab === 'sends';
  const isReports = activeTab === 'reports';
  const isPurchases = activeTab === 'purchases';

  return (
    <>
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="p-3 sm:p-6 max-w-7xl mx-auto pb-20"
    >
      {/* Tab Switcher */}
      <div className="grid grid-cols-1 gap-2 mb-6 sm:grid-cols-4">
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={() => setActiveTab('requests')}
          className={`flex-1 py-3 rounded-2xl font-bold text-sm uppercase tracking-wide flex items-center justify-center gap-2 transition-all border ${isRequests ? 'bg-gradient-to-r from-orange-500 to-orange-600 text-white border-transparent shadow-lg shadow-orange-500/20' : 'bg-[#1e1e1e] text-gray-400 border-white/10 hover:border-orange-500/30'}`}
        >
          <ShoppingCart size={16} /> કોઠારમાંથી વસ્તુ મંગાવેલ હોય
          <span className={`text-[10px] px-2 py-0.5 rounded-full font-black ${isRequests ? 'bg-white/20' : 'bg-white/10'}`}>{orders.length}</span>
        </motion.button>
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={() => setActiveTab('sends')}
          className={`py-3 rounded-2xl font-bold text-sm uppercase tracking-wide flex items-center justify-center gap-2 transition-all border ${isSends ? 'bg-gradient-to-r from-blue-500 to-blue-600 text-white border-transparent shadow-lg shadow-blue-500/20' : 'bg-[#1e1e1e] text-gray-400 border-white/10 hover:border-blue-500/30'}`}
        >
          <Send size={16} /> વસ્તુ મોકલેલ હોય
          <span className={`text-[10px] px-2 py-0.5 rounded-full font-black ${isSends ? 'bg-white/20' : 'bg-white/10'}`}>{sendOrders.length}</span>
        </motion.button>
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={() => setActiveTab('reports')}
          className={`py-3 rounded-2xl font-bold text-sm uppercase tracking-wide flex items-center justify-center gap-2 transition-all border ${isReports ? 'bg-gradient-to-r from-emerald-500 to-emerald-600 text-white border-transparent shadow-lg shadow-emerald-500/20' : 'bg-[#1e1e1e] text-gray-400 border-white/10 hover:border-emerald-500/30'}`}
        >
          <FileText size={16} /> Reports
          <span className={`text-[10px] px-2 py-0.5 rounded-full font-black ${isReports ? 'bg-white/20' : 'bg-white/10'}`}>{reports.length}</span>
        </motion.button>
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={() => setActiveTab('purchases')}
          className={`py-3 rounded-2xl font-bold text-sm uppercase tracking-wide flex items-center justify-center gap-2 transition-all border ${isPurchases ? 'bg-gradient-to-r from-violet-500 to-fuchsia-600 text-white border-transparent shadow-lg shadow-violet-500/20' : 'bg-[#1e1e1e] text-gray-400 border-white/10 hover:border-violet-500/30'}`}
        >
          <Box size={16} /> Purchases
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
                <input placeholder="Sender Name..." className="w-full p-3 pl-10 bg-[#252525] border border-white/10 rounded-xl text-white outline-none focus:border-orange-500/50 transition-all text-sm placeholder-gray-500"
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
                      <div className="flex justify-between items-start">
                        <div>
                          <h3 className="font-bold text-white uppercase text-sm sm:text-base group-hover:text-orange-400 transition-colors">{order.center}</h3>
                          <span className="text-xs text-orange-500 font-bold">#CHALAN: {order.chalanNo}</span>
                        </div>
                        <div className="text-xs text-gray-500 font-medium bg-white/5 px-2 py-1 rounded-lg">{order.date.split('-').reverse().join('-')}</div>
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
                          <p className="font-black text-orange-400 text-sm sm:text-base">{calculateTotals(order.items).totalKg}</p>
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
                  const totalKg = filledItems.reduce((sum, r) => sum + (parseFloat(r.kg) || 0), 0);
                  return (
                    <motion.div key={order.id} variants={fadeInUp} initial="initial" animate="animate" exit="exit"
                      transition={{ delay: index * 0.05 }} whileHover={{ y: -5, transition: { duration: 0.2 } }}
                      className="bg-gradient-to-b from-[#1e1e1e] to-[#181818] rounded-2xl sm:rounded-3xl border border-white/5 shadow-xl overflow-hidden hover:border-blue-500/30 transition-colors group">
                      <div className="p-4 sm:p-5 border-b border-white/5 bg-gradient-to-r from-[#252525] to-[#1e1e1e]">
                        <div className="flex justify-between items-start">
                          <div>
                            <h3 className="font-bold text-white uppercase text-sm sm:text-base group-hover:text-blue-400 transition-colors">{order.fromCenter}</h3>
                            <span className="text-xs text-blue-500 font-bold">#CHALAN: {order.chalanNo}</span>
                          </div>
                          <div className="text-xs text-gray-500 font-medium bg-white/5 px-2 py-1 rounded-lg">{(order.date || '').split('-').reverse().join('-')}</div>
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
                            <p className="font-black text-blue-400 text-sm sm:text-base">{totalKg}</p>
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
                  One clean monthly table only. Income includes center send entries plus purchase entries, outgoing uses kothar request entries, and total stock is income minus outgoing.
                </p>
              </div>
              <div className="flex gap-2 sm:gap-3">
                <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={fetchReports}
                  className="text-gray-400 hover:text-emerald-400 flex items-center justify-center gap-1.5 text-xs font-bold uppercase transition-all bg-white/5 hover:bg-emerald-500/10 px-3 py-2 rounded-xl border border-white/10">
                  <RefreshCw size={14} /> Refresh
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

              {reportForm.scope === 'center' && (
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-widest text-gray-500 mb-2">Center</label>
                  <select
                    className="w-full p-3 bg-[#252525] border border-white/10 rounded-xl text-white outline-none focus:border-emerald-500/50 transition-all text-sm"
                    value={reportForm.center}
                    onChange={e => setReportForm(prev => ({ ...prev, center: e.target.value, centerOther: e.target.value === 'Other' ? prev.centerOther : '' }))}
                  >
                    <option value="">- Center Select Karo -</option>
                    {centerData.map((center) => (
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
                <label className="block text-[11px] font-bold uppercase tracking-widest text-gray-500 mb-2">Month</label>
                <input
                  type="month"
                  className="w-full p-3 bg-[#252525] border border-white/10 rounded-xl text-white outline-none focus:border-emerald-500/50 transition-all text-sm"
                  value={reportForm.month}
                  onChange={e => {
                    const month = e.target.value;
                    setReportForm(prev => ({
                      ...prev,
                      month,
                      selectedDate: getDateWithinMonth(month, prev.selectedDate),
                    }));
                  }}
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase tracking-widest text-gray-500 mb-2">Selected Date</label>
                <input
                  type="date"
                  min={`${reportForm.month}-01`}
                  max={getLastDateForMonth(reportForm.month)}
                  className="w-full p-3 bg-[#252525] border border-white/10 rounded-xl text-white outline-none focus:border-emerald-500/50 transition-all text-sm"
                  value={reportForm.selectedDate}
                  onChange={e => setReportForm(prev => ({ ...prev, selectedDate: e.target.value }))}
                />
              </div>
            </div>

            <div className="mt-4 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-4">
              <p className="text-[11px] font-bold uppercase tracking-widest text-emerald-300">Dynamic Range</p>
              <p className="mt-2 text-lg font-black text-white">તા. 1 થી {formatDisplayDate(reportForm.selectedDate)}</p>
              <p className="mt-2 text-sm font-bold text-emerald-100">{getCenterScopeLabel(reportForm.scope, getResolvedCenterValue(reportForm.center, reportForm.centerOther))}</p>
              <p className="mt-2 text-xs text-emerald-100/70">The monthly table columns will update using this range in preview, PDF, share, and mail.</p>
            </div>

            <div className="mt-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <p className="text-xs text-gray-500">
                Report format is fixed to: વસ્તુનું નામ, મહિનો, આવક, જાવક, કુલ સ્ટોક. Centewise mode filters request, send, and purchase entries for the selected center only.
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
                  const pdfTheme = getReportTheme();
                  return (
                    <motion.div key={preparedReport.id} variants={fadeInUp} initial="initial" animate="animate" exit="exit"
                      transition={{ delay: index * 0.05 }} whileHover={{ y: -5, transition: { duration: 0.2 } }}
                      className="bg-gradient-to-b from-[#1e1e1e] to-[#181818] rounded-2xl sm:rounded-3xl border border-white/5 shadow-xl overflow-hidden hover:border-emerald-500/30 transition-colors group">
                      <div className={`p-4 sm:p-5 border-b border-white/5 bg-gradient-to-r ${uiTheme.soft}`}>
                        <div className="flex justify-between items-start gap-3">
                          <div>
                            <p className={`text-[10px] font-black uppercase tracking-[0.2em] ${uiTheme.muted}`}>{pdfTheme.title}</p>
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
                            <p className="text-[10px] text-gray-500 uppercase font-bold">Number of Item</p>
                            <p className="font-black text-white text-base">{formatMetric(preparedReport.summary.totalRows)}</p>
                          </div>
                          <div className={`bg-gradient-to-br ${uiTheme.soft} p-3 rounded-xl border ${uiTheme.border} text-center`}>
                            <p className={`text-[10px] uppercase font-bold ${uiTheme.muted}`}>આવક (KG)</p>
                            <p className={`font-black text-base ${uiTheme.text}`}>{formatMetric(preparedReport.summary.totalIncome)}</p>
                          </div>
                          <div className="bg-[#252525] p-3 rounded-xl border border-white/5 text-center">
                            <p className="text-[10px] text-gray-500 uppercase font-bold">જાવક (KG)</p>
                            <p className="font-black text-white text-base">{formatMetric(preparedReport.summary.totalOutgoing)}</p>
                          </div>
                        </div>
                        <div className="mb-4 space-y-1 text-xs text-gray-400">
                          <p><span className="font-bold text-gray-200">Scope:</span> {preparedReport.scope === 'center' ? 'Centewise' : 'All Centers'}</p>
                          <p><span className="font-bold text-gray-200">કુલ સ્ટોક (KG):</span> {formatMetric(preparedReport.summary.totalStock)}</p>
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

      {isPurchases && (
        <PurchaseAdminPanel user={user} />
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
                <h1 className="text-3xl sm:text-4xl font-black text-orange-600 uppercase mb-1 tracking-tighter">SMVS STOCK REQUEST</h1>
                <p className="text-gray-400 text-[10px] font-sans font-bold uppercase tracking-[0.2em] mt-1">Video Post Production Data Report</p>
                <div className="mt-3 h-1 w-full rounded-full bg-orange-600" />
              </div>
              <div className="mb-6 sm:mb-8 rounded-[1.8rem] border border-gray-200 bg-gray-50 p-4 sm:p-6">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <PreviewInfoCard label="Center Name" value={previewOrder.center} />
                  <PreviewInfoCard label="Chalan No" value={`#${previewOrder.chalanNo}`} />
                  <PreviewInfoCard label="Order Date" value={formatDisplayDate(previewOrder.date)} />
                  <PreviewInfoCard label="Sender" value={previewOrder.senderName || '-'} />
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
                      <th className="border p-2 w-16 sm:w-20 text-center">Unit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewOrder.items.map((it, i) => (
                      <tr key={i} className="border border-gray-300">
                        <td className="border p-2 text-center text-gray-500 font-sans">{i+1}</td>
                        <td className="border p-2 font-bold">{it.name}</td>
                        <td className="border p-2 text-center font-bold">{it.qty}</td>
                        <td className="border p-2 text-center text-gray-400 text-[10px] uppercase font-sans font-bold">{it.unit}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-6 sm:mt-10 grid grid-cols-2 border-4 border-black p-3 sm:p-5 font-black text-center uppercase text-xs sm:text-sm tracking-tighter">
                <div className="border-r border-gray-200">ITEMS: {previewOrder.items.length}</div>
                <div>TOTAL KG: {calculateTotals(previewOrder.items).totalKg}</div>
              </div>
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
              className="bg-white text-black w-full max-w-2xl max-h-[95vh] overflow-y-auto rounded-xl sm:rounded-2xl p-6 sm:p-10 relative shadow-2xl font-serif custom-scroll">
              <motion.button whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} onClick={() => setPreviewSendOrder(null)}
                className="absolute top-3 right-3 sm:top-4 sm:right-4 bg-gray-100 p-2 rounded-full text-black hover:bg-gray-200 transition-colors">
                <X size={20} />
              </motion.button>
              <div className="text-center mb-6 sm:mb-8 border-b-4 border-blue-600 pb-4">
                <h1 className="text-2xl sm:text-4xl font-black text-blue-600 uppercase mb-0 tracking-tighter">SMVS MATERIAL DISPATCH</h1>
                <p className="text-gray-400 text-[10px] font-sans font-bold uppercase tracking-[0.2em] mt-1">Samp Swarup Mandal Video Seva</p>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:gap-4 text-sm mb-6 sm:mb-8 bg-gray-50 p-4 sm:p-6 rounded-2xl border border-gray-100">
                <div><p className="text-gray-400 text-[10px] font-sans font-bold uppercase mb-0.5">From Center</p><p className="font-bold text-base sm:text-lg">{previewSendOrder.fromCenter}</p></div>
                <div className="text-right"><p className="text-gray-400 text-[10px] font-sans font-bold uppercase mb-0.5">Chalan No</p><p className="font-bold text-base sm:text-lg">#{previewSendOrder.chalanNo}</p></div>
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
                      <th className="border p-2 w-16 sm:w-20 text-center">KG</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(previewSendOrder.items || []).filter(r => r.itemName && r.itemName.trim()).map((it, i) => (
                      <tr key={i} className="border border-gray-300">
                        <td className="border p-2 text-center text-gray-500 font-sans">{i+1}</td>
                        <td className="border p-2 font-bold">{it.itemName}</td>
                        <td className="border p-2 text-center font-bold text-orange-600">{it.kg || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {(() => {
                const filledItems = (previewSendOrder.items || []).filter(r => r.itemName && r.itemName.trim());
                const totalKg = filledItems.reduce((sum, r) => sum + (parseFloat(r.kg) || 0), 0);
                return (
                  <div className="mt-6 sm:mt-10 grid grid-cols-2 border-4 border-black p-3 sm:p-5 font-black text-center uppercase text-xs sm:text-sm tracking-tighter">
                    <div className="border-r border-gray-200">ITEMS: {filledItems.length}</div>
                    <div>TOTAL KG: {totalKg}</div>
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
                  const targetLabel = type === 'request'
                    ? order.center
                    : type === 'send'
                      ? order.fromCenter
                      : hydrateReport(order).monthLabel;

                  return (
                    <div className="space-y-4">
                      <p className="text-gray-300 text-sm">
                        Send email for <span className="font-bold text-white">{targetLabel}</span>
                        {type === 'report' ? (
                          <span className="text-blue-400 font-bold"> — {hydrateReport(order).rangeLabel}</span>
                        ) : (
                          <span> — Chalan <span className="text-blue-400 font-bold">#{order.chalanNo}</span></span>
                        )}
                      </p>

                      {type === 'report' ? (
                        <>
                          <div>
                            <label className="block text-[11px] font-bold uppercase tracking-widest text-gray-500 mb-2">Default Email</label>
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
    </>
  );
}

const createDefaultPurchaseForm = () => ({
  center: '',
  centerOther: '',
  shopName: '',
  billNo: '',
  billDate: new Date().toISOString().split('T')[0],
  rows: Array.from({ length: 5 }, (_, index) => ({
    id: index + 1,
    itemName: '',
    kg: '',
  })),
});

function PurchaseAdminPanel({ user }) {
  const [purchaseForm, setPurchaseForm] = useState(createDefaultPurchaseForm);
  const [purchases, setPurchases] = useState([]);
  const [purchaseLoading, setPurchaseLoading] = useState(true);
  const [purchaseSubmitting, setPurchaseSubmitting] = useState(false);
  const [purchaseDeleting, setPurchaseDeleting] = useState(null);
  const [purchaseFilters, setPurchaseFilters] = useState({ date: '', center: '', shop: '' });
  const [previewPurchase, setPreviewPurchase] = useState(null);
  const [purchasePdfLoading, setPurchasePdfLoading] = useState(null);
  const [purchaseMailLoading, setPurchaseMailLoading] = useState(null);
  const [purchaseMailModal, setPurchaseMailModal] = useState(null);
  const [purchaseSelectedEmail, setPurchaseSelectedEmail] = useState(REPORT_DEFAULT_EMAILS[0]);
  const [purchaseCustomEmail, setPurchaseCustomEmail] = useState('');
  const [purchaseCustomEmailError, setPurchaseCustomEmailError] = useState('');
  const [purchaseMailSending, setPurchaseMailSending] = useState(false);

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

  const updatePurchaseRow = (id, field, value) => {
    setPurchaseForm((prev) => ({
      ...prev,
      rows: prev.rows.map((row) => (row.id === id ? { ...row, [field]: value } : row)),
    }));
  };

  const addPurchaseRow = () => {
    setPurchaseForm((prev) => ({
      ...prev,
      rows: [
        ...prev.rows,
        { id: Math.max(...prev.rows.map((row) => row.id), 0) + 1, itemName: '', kg: '' },
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

  const clearPurchaseFilters = () => setPurchaseFilters({ date: '', center: '', shop: '' });

  const openPurchaseMailModal = (purchase) => {
    setPurchaseMailModal(purchase);
    const savedEmail = isValidEmail(purchase?.email) ? purchase.email.trim() : '';

    if (REPORT_DEFAULT_EMAILS.includes(savedEmail)) {
      setPurchaseSelectedEmail(savedEmail);
      setPurchaseCustomEmail('');
    } else if (savedEmail) {
      setPurchaseSelectedEmail('custom');
      setPurchaseCustomEmail(savedEmail);
    } else {
      setPurchaseSelectedEmail(REPORT_DEFAULT_EMAILS[0]);
      setPurchaseCustomEmail('');
    }

    setPurchaseCustomEmailError('');
  };

  const closePurchaseMailModal = () => {
    setPurchaseMailModal(null);
    setPurchaseSelectedEmail(REPORT_DEFAULT_EMAILS[0]);
    setPurchaseCustomEmail('');
    setPurchaseCustomEmailError('');
    setPurchaseMailSending(false);
    setPurchaseMailLoading(null);
  };

  const handlePurchaseSubmit = async () => {
    const effectiveCenter = getResolvedCenterValue(purchaseForm.center, purchaseForm.centerOther);
    if (!purchaseForm.center) return alert('Center is required.');
    if (purchaseForm.center === 'Other' && !purchaseForm.centerOther.trim()) return alert('Center name is required.');
    if (!purchaseForm.shopName.trim()) return alert('Shop name is required.');
    if (!purchaseForm.billNo.trim()) return alert('Bill number is required.');
    if (!purchaseForm.billDate) return alert('Bill date is required.');
    if (filledRows.length === 0) return alert('Add at least one purchased item.');

    setPurchaseSubmitting(true);
    try {
      const payload = {
        type: 'purchase',
        center: effectiveCenter,
        shopName: purchaseForm.shopName.trim(),
        billNo: purchaseForm.billNo.trim(),
        billDate: purchaseForm.billDate,
        date: purchaseForm.billDate,
        items: filledRows.map((row) => ({
          itemName: row.itemName.trim(),
          kg: row.kg,
        })),
        totalKg: filledRows.reduce((sum, row) => sum + (parseFloat(row.kg) || 0), 0),
        timestamp: new Date(),
        submittedBy: user.username,
      };

      const docRef = await addDoc(collection(db, 'purchases'), payload);
      setPurchases((prev) => [{ id: docRef.id, ...payload }, ...prev]);
      setPurchaseForm(createDefaultPurchaseForm());
      alert('Purchase entry saved! ✅');
    } catch (error) {
      alert(`Purchase Error: ${error.message}`);
    }
    setPurchaseSubmitting(false);
  };

  const handleDeletePurchase = async (purchase) => {
    if (!window.confirm(`Delete purchase bill ${purchase.billNo} from ${purchase.shopName}?`)) return;
    setPurchaseDeleting(purchase.id);
    try {
      await updateDoc(doc(db, 'purchases', purchase.id), { is_deleted: true });
      setPurchases((prev) => prev.filter((item) => item.id !== purchase.id));
    } catch (error) {
      alert(`Delete Error: ${error.message}`);
    }
    setPurchaseDeleting(null);
  };

  const handleDownloadPurchase = async (purchase) => {
    setPurchasePdfLoading(purchase.id);
    try {
      const blob = await generatePurchasePDFBlob(purchase);
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = getPurchaseFileName(purchase);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(link.href);
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
          title: 'SMVS Purchase Report',
          text: `${purchase.shopName} - Bill ${purchase.billNo}`,
        });
      } else {
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = getPurchaseFileName(purchase);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(link.href);
        alert('Share not supported on this device. File downloaded instead.');
      }
    } catch (error) {
      alert(`Share Error: ${error.message}`);
    }
    setPurchasePdfLoading(null);
  };

  const handlePurchaseMailSend = async () => {
    if (!purchaseMailModal) return;

    const emailToUse = purchaseSelectedEmail === 'custom'
      ? purchaseCustomEmail.trim()
      : purchaseSelectedEmail;

    if (!isValidEmail(emailToUse)) {
      setPurchaseCustomEmailError('Please enter a valid email address.');
      return;
    }

    setPurchaseMailSending(true);
    setPurchaseMailLoading(purchaseMailModal.id);
    try {
      await sendEmailWithConfig(REPORT_MAIL_CONFIG, {
        email: emailToUse,
        cc_email: DEFAULT_CC_EMAIL,
        bcc_email: DEFAULT_BCC_EMAIL,
        from_name: 'Purchased Material',
        report_title: 'SMVS Purchase Report',
        month: purchaseMailModal.center || '-',
        chalan_no: purchaseMailModal.billNo || '-',
        date: formatDisplayDate(purchaseMailModal.billDate || purchaseMailModal.date),
        range: formatDisplayDate(purchaseMailModal.billDate || purchaseMailModal.date),
        receiver: purchaseMailModal.shopName || '-',
        generated_on: formatDisplayDate(purchaseMailModal.billDate || purchaseMailModal.date),
        total_rows: formatMetric((purchaseMailModal.items || []).length),
        total_stock: formatMetric(purchaseMailModal.totalKg),
        pdf_link: buildPublicRecordLink('purchaseId', purchaseMailModal.id),
      });

      await updateDoc(doc(db, 'purchases', purchaseMailModal.id), { email: emailToUse });
      setPurchases((prev) => prev.map((item) => (
        item.id === purchaseMailModal.id ? { ...item, email: emailToUse } : item
      )));
      closePurchaseMailModal();
      alert('Email Sent! ✅');
    } catch (error) {
      alert(`Mail Error: ${error.message}`);
      setPurchaseMailSending(false);
      setPurchaseMailLoading(null);
    }
  };

  const filteredPurchases = purchases.filter((purchase) => {
    const dateMatch = purchaseFilters.date ? purchase.billDate === purchaseFilters.date : true;
    const centerMatch = purchaseFilters.center
      ? (purchase.center || '').toLowerCase().includes(purchaseFilters.center.toLowerCase())
      : true;
    const shopMatch = purchaseFilters.shop
      ? (purchase.shopName || '').toLowerCase().includes(purchaseFilters.shop.toLowerCase())
      : true;
    return dateMatch && centerMatch && shopMatch;
  });

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
            <h2 className="mt-2 text-xl sm:text-2xl font-black text-white">દુકાન માંથી ખરીદેલ માલ</h2>
            <p className="mt-2 text-sm text-gray-400 max-w-2xl">
              Admin-only purchase log. These entries are added into report income (આવક).
            </p>
          </div>
          <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={() => setPurchaseForm(createDefaultPurchaseForm())}
            className="text-gray-400 hover:text-white flex items-center justify-center gap-1.5 text-xs font-bold uppercase transition-all bg-white/5 hover:bg-white/10 px-3 py-2 rounded-xl border border-white/10">
            <Eraser size={14} /> Clear
          </motion.button>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 mt-6">
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-widest text-gray-500 mb-2">Center *</label>
            <select
              className="w-full p-3 bg-[#252525] border border-white/10 rounded-xl text-white outline-none focus:border-violet-500/50 transition-all text-sm"
              value={purchaseForm.center}
              onChange={(e) => setPurchaseForm((prev) => ({ ...prev, center: e.target.value, centerOther: e.target.value === 'Other' ? prev.centerOther : '' }))}
            >
              <option value="">- Center Select Karo -</option>
              {centerData.map((center) => (
                <option key={center.center} value={center.center}>{center.center}</option>
              ))}
            </select>
          </div>
          {purchaseForm.center === 'Other' && (
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-widest text-gray-500 mb-2">Center Name *</label>
              <input
                className="w-full p-3 bg-[#252525] border border-white/10 rounded-xl text-white outline-none focus:border-violet-500/50 transition-all text-sm"
                value={purchaseForm.centerOther}
                onChange={(e) => setPurchaseForm((prev) => ({ ...prev, centerOther: e.target.value }))}
                placeholder="Center name..."
              />
            </div>
          )}
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-widest text-gray-500 mb-2">Shop Name *</label>
            <input
              className="w-full p-3 bg-[#252525] border border-white/10 rounded-xl text-white outline-none focus:border-violet-500/50 transition-all text-sm"
              value={purchaseForm.shopName}
              onChange={(e) => setPurchaseForm((prev) => ({ ...prev, shopName: e.target.value }))}
              placeholder="દુકાનનું નામ"
            />
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

        <div className="mt-5 rounded-2xl border border-white/10 bg-white/5 overflow-hidden">
          <div className="p-4 border-b border-white/10 flex items-center justify-between">
            <p className="text-[11px] font-bold uppercase tracking-widest text-gray-500">Purchased Items</p>
            <span className="text-xs text-violet-300 font-bold">{filledRows.length} rows filled</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[#151515]">
                <tr>
                  <th className="p-3 text-left text-gray-500 font-bold text-xs uppercase w-10">No</th>
                  <th className="p-3 text-left text-gray-500 font-bold text-xs uppercase">Item Name</th>
                  <th className="p-3 text-center text-gray-500 font-bold text-xs uppercase w-24">KG</th>
                  <th className="p-3 w-10" />
                </tr>
              </thead>
              <tbody>
                {purchaseForm.rows.map((row, index) => (
                  <tr key={row.id} className={`border-t border-white/5 ${row.itemName ? 'bg-violet-500/5' : ''}`}>
                    <td className="p-2 text-gray-500 text-center text-xs font-mono">{index + 1}</td>
                    <td className="p-2">
                      <input
                        className="w-full p-2 bg-[#252525] border border-white/5 rounded-lg text-white outline-none focus:border-violet-500/50 text-sm transition-all placeholder-gray-600"
                        placeholder={`Item ${index + 1}...`}
                        value={row.itemName}
                        onChange={(e) => updatePurchaseRow(row.id, 'itemName', e.target.value)}
                      />
                    </td>
                    <td className="p-2">
                      <input
                        type="number"
                        min="0"
                        className="w-full p-2 bg-[#252525] border border-white/5 rounded-lg text-white outline-none focus:border-violet-500/50 text-sm text-center transition-all"
                        placeholder="0"
                        value={row.kg}
                        onChange={(e) => updatePurchaseRow(row.id, 'kg', e.target.value)}
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
              <Plus size={16} /> New Row Umero
            </motion.button>
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
          <input
            placeholder="Center name..."
            className="w-full p-3 bg-[#252525] border border-white/10 rounded-xl text-white outline-none focus:border-violet-500/50 transition-all text-sm placeholder-gray-500"
            value={purchaseFilters.center}
            onChange={(e) => setPurchaseFilters((prev) => ({ ...prev, center: e.target.value }))}
          />
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
                    <div>
                      <p className="text-[11px] font-black uppercase tracking-[0.2em] text-violet-300">{purchase.center || 'No Center'}</p>
                      <p className="font-black text-white text-sm">{purchase.shopName}</p>
                      <p className="text-xs text-violet-300 mt-1">Bill #{purchase.billNo}</p>
                    </div>
                    <p className="text-xs text-gray-400">{formatDisplayDate(purchase.billDate)}</p>
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
                        <span className="font-bold text-white">{item.itemName}</span> - {item.kg || 0} KG
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
                    <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} disabled={purchasePdfLoading === purchase.id} onClick={() => handleSharePurchase(purchase)}
                      className="bg-[#252525] hover:bg-[#2d2d2d] text-white p-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all border border-white/5 disabled:opacity-50">
                      {purchasePdfLoading === purchase.id ? <Loader2 size={14} className="animate-spin" /> : <Share2 size={14} />} Share
                    </motion.button>
                    <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} disabled={purchaseMailLoading === purchase.id} onClick={() => openPurchaseMailModal(purchase)}
                      className="bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 p-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all border border-blue-500/20 disabled:opacity-50">
                      {purchaseMailLoading === purchase.id ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Mail
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
              className="bg-white text-black w-full max-w-3xl max-h-[95vh] overflow-y-auto rounded-xl sm:rounded-2xl p-6 sm:p-8 relative shadow-2xl"
            >
              <motion.button whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} onClick={() => setPreviewPurchase(null)}
                className="absolute top-3 right-3 sm:top-4 sm:right-4 bg-gray-100 p-2 rounded-full text-black hover:bg-gray-200 transition-colors z-10">
                <X size={20} />
              </motion.button>

              <div className="border-b-4 border-violet-600 pb-4 mb-6">
                <h1 className="text-2xl sm:text-3xl font-black text-violet-700 uppercase">SMVS Purchase Report</h1>
                <p className="text-gray-500 text-xs mt-1 font-bold uppercase tracking-[0.2em]">દુકાન માંથી ખરીદેલ માલ</p>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 text-sm mb-6 bg-gray-50 p-4 sm:p-5 rounded-2xl border border-gray-100">
                <div><p className="text-gray-400 text-[10px] font-bold uppercase mb-1">Shop Name</p><p className="font-bold">{previewPurchase.shopName}</p></div>
                <div><p className="text-gray-400 text-[10px] font-bold uppercase mb-1">Bill Number</p><p className="font-bold">#{previewPurchase.billNo}</p></div>
                <div><p className="text-gray-400 text-[10px] font-bold uppercase mb-1">Bill Date</p><p className="font-bold">{formatDisplayDate(previewPurchase.billDate || previewPurchase.date)}</p></div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-xs sm:text-[13px] border-collapse border border-black">
                  <thead className="bg-black text-white">
                    <tr>
                      <th className="border p-2 w-12 text-center">No</th>
                      <th className="border p-2 text-left">Item Name</th>
                      <th className="border p-2 w-20 text-center">KG</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(previewPurchase.items || []).map((item, index) => (
                      <tr key={`${previewPurchase.id}-${index}`} className="even:bg-gray-50">
                        <td className="border p-2 text-center text-gray-500">{index + 1}</td>
                        <td className="border p-2 font-bold">{item.itemName}</td>
                        <td className="border p-2 text-center font-bold text-violet-700">{formatMetric(item.kg)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-6 sm:mt-10 grid grid-cols-2 border-4 border-black p-3 sm:p-5 font-black text-center uppercase text-xs sm:text-sm tracking-tighter">
                <div className="border-r border-gray-200">NUMBER OF ITEMS: {(previewPurchase.items || []).length}</div>
                <div>TOTAL KG: {formatMetric(calculateKgTotals(previewPurchase.items || []).totalKg)}</div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {purchaseMailModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[300] flex items-center justify-center p-4"
            onClick={closePurchaseMailModal}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-gradient-to-b from-[#1e1e1e] to-[#181818] border border-white/10 rounded-2xl sm:rounded-3xl w-full max-w-sm shadow-2xl overflow-hidden"
            >
              <div className="p-5 border-b border-white/5 flex items-center justify-between bg-gradient-to-r from-[#252525] to-[#1e1e1e]">
                <div className="flex items-center gap-2 text-blue-400 font-bold text-sm uppercase tracking-widest">
                  <Send size={16} /> Send Mail
                </div>
                <motion.button whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} onClick={closePurchaseMailModal}
                  className="bg-white/5 hover:bg-white/10 p-1.5 rounded-lg text-gray-400 hover:text-white transition-colors">
                  <X size={16} />
                </motion.button>
              </div>

              <div className="p-5 space-y-4">
                <p className="text-gray-300 text-sm">
                  Send purchase PDF link for <span className="font-bold text-white">{purchaseMailModal.shopName}</span>
                  <span className="text-blue-400 font-bold"> — Bill #{purchaseMailModal.billNo}</span>
                </p>

                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-widest text-gray-500 mb-2">Default Email</label>
                  <select
                    className="w-full p-3 bg-[#252525] border border-white/10 rounded-xl text-white outline-none focus:border-blue-500/70 transition-all text-sm"
                    value={purchaseSelectedEmail}
                    onChange={(e) => {
                      setPurchaseSelectedEmail(e.target.value);
                      setPurchaseCustomEmailError('');
                    }}
                  >
                    {REPORT_DEFAULT_EMAILS.map((email) => (
                      <option key={email} value={email}>{email}</option>
                    ))}
                    <option value="custom">Custom Email</option>
                  </select>
                </div>

                {purchaseSelectedEmail === 'custom' && (
                  <div>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={16} />
                      <input
                        type="email"
                        placeholder="example@email.com"
                        className={`w-full p-3 pl-9 bg-[#252525] border rounded-xl text-white outline-none focus:border-blue-500/70 transition-all text-sm placeholder-gray-500 ${purchaseCustomEmailError ? 'border-red-500/60' : 'border-white/10'}`}
                        value={purchaseCustomEmail}
                        onChange={(e) => { setPurchaseCustomEmail(e.target.value); setPurchaseCustomEmailError(''); }}
                        autoFocus
                      />
                    </div>
                    {purchaseCustomEmailError && <p className="text-red-400 text-xs mt-1.5 pl-1">{purchaseCustomEmailError}</p>}
                  </div>
                )}

                <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-xs text-gray-400">
                  CC: {DEFAULT_CC_EMAIL}<br />
                  BCC: {DEFAULT_BCC_EMAIL}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                    onClick={closePurchaseMailModal}
                    className="bg-white/5 hover:bg-white/10 text-gray-300 py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2 border border-white/10">
                    <X size={16} /> Cancel
                  </motion.button>
                  <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                    disabled={purchaseMailSending}
                    onClick={handlePurchaseMailSend}
                    className="bg-gradient-to-r from-blue-500 to-blue-600 text-white py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2 shadow-lg shadow-blue-500/20 disabled:opacity-50">
                    {purchaseMailSending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />} Send Mail
                  </motion.button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

// --- EDIT ORDER SCREEN ---
function EditOrderScreen({ order, onBack }) {
  const [cart, setCart] = useState(order.items || []);
  const [loading, setLoading] = useState(false);
  const [openCategory, setOpenCategory] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');

  const updateQuantity = (itemName, category, unit, qty) => {
    const existing = cart.find(i => i.name === itemName);
    if (qty > 0) {
      if (existing) setCart(cart.map(i => i.name === itemName ? { ...i, qty } : i));
      else setCart([...cart, { name: itemName, category, unit, qty }]);
    } else { setCart(cart.filter(i => i.name !== itemName)); }
  };

  const handleUpdate = async () => {
    if (cart.length === 0) return alert("Add at least one item!");
    setLoading(true);
    try {
      const { totalKg } = calculateTotals(cart);
      await updateDoc(doc(db, "orders", order.id), { items: cart, totalKg });
      alert("Updated Successfully! ✅");
      onBack();
    } catch (e) { alert("Error: " + e.message); }
    setLoading(false);
  };

  const filteredCategories = searchQuery 
    ? Object.entries(categories).reduce((acc, [cat, items]) => {
        const filtered = items.filter(item => item.name.toLowerCase().includes(searchQuery.toLowerCase()));
        if (filtered.length > 0) acc[cat] = filtered;
        return acc;
      }, {})
    : categories;

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
          <Edit3 size={22} /> Edit: {order.center}
        </h2>
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
        {Object.entries(filteredCategories).map(([category, items]) => {
          const categoryCartCount = items.filter(item => cart.find(c => c.name === item.name)).length;
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
                      {items.map((item, itemIndex) => {
                        const inCart = cart.find(c => c.name === item.name);
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
                              {inCart && (
                                <motion.button
                                  initial={{ scale: 0 }}
                                  animate={{ scale: 1 }}
                                  whileTap={{ scale: 0.9 }}
                                  onClick={() => updateQuantity(item.name, category, item.unit, Math.max(0, (parseFloat(inCart.qty) || 0) - 1))}
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
                                onChange={(e) => updateQuantity(item.name, category, item.unit, e.target.value)} 
                              />
                              <motion.button
                                whileTap={{ scale: 0.9 }}
                                onClick={() => updateQuantity(item.name, category, item.unit, (parseFloat(inCart?.qty) || 0) + 1)}
                                className="w-8 h-8 flex items-center justify-center bg-orange-500/20 rounded-lg text-orange-500 hover:bg-orange-500/30 transition-colors"
                              >
                                <Plus size={14} />
                              </motion.button>
                              <span className="text-[10px] text-gray-500 font-bold w-8 uppercase hidden sm:inline">{item.unit}</span>
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
function EditSendOrderScreen({ order, onBack }) {
  const [rows, setRows] = useState(
    (order.items && order.items.length > 0)
      ? order.items.map((item, i) => ({ id: i + 1, itemName: item.itemName || '', kg: item.kg || '' }))
      : Array.from({ length: 5 }, (_, i) => ({ id: i + 1, itemName: '', kg: '' }))
  );
  const [loading, setLoading] = useState(false);

  const updateRow = (id, field, value) => setRows(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r));
  const addRow = () => {
    const nextId = rows.length > 0 ? Math.max(...rows.map(r => r.id)) + 1 : 1;
    setRows(prev => [...prev, { id: nextId, itemName: '', kg: '' }]);
  };
  const removeRow = (id) => { if (rows.length > 1) setRows(prev => prev.filter(r => r.id !== id)); };

  const handleUpdate = async () => {
    const filledRows = rows.filter(r => r.itemName && r.itemName.trim());
    if (filledRows.length === 0) return alert('Add at least one item!');
    setLoading(true);
    try {
      const totalKg = filledRows.reduce((sum, r) => sum + (parseFloat(r.kg) || 0), 0);
      await updateDoc(doc(db, 'send-orders', order.id), {
        items: filledRows.map((row) => ({ itemName: row.itemName.trim(), kg: row.kg })),
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
          <Edit3 size={22} /> Edit Dispatch: {order.fromCenter}
        </h2>
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
              <input
                type="text"
                placeholder="Item Name"
                value={row.itemName}
                onChange={e => updateRow(row.id, 'itemName', e.target.value)}
                className="p-2.5 bg-[#252525] border border-white/10 rounded-xl text-white text-sm outline-none focus:border-blue-500/50 transition-all placeholder-gray-600"
              />
              <input
                type="number"
                        placeholder="KG"
                value={row.kg}
                onChange={e => updateRow(row.id, 'kg', e.target.value)}
                className="p-2.5 bg-[#252525] border border-white/10 rounded-xl text-white text-sm outline-none focus:border-blue-500/50 transition-all placeholder-gray-600 text-center"
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
            <Plus size={16} /> Add Row
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
function UserHub({ user }) {
  const [section, setSection] = useState(null);

  if (section === 'request') return <UserDashboard user={user} onBack={() => setSection(null)} />;
  if (section === 'send') return <SendDashboard user={user} onBack={() => setSection(null)} />;

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
          Jai Swaminarayan,{' '}
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
              વસ્તુ મોકલવા માટે
            </h3>
            <p className="text-[11px] sm:text-sm text-gray-500 leading-relaxed mb-5">
              આપના સેન્ટરમાંથી વસ્તુ મુખ્ય કોઠાર, સ્વામિનારાયણ ધામ મોકલવા માટે અહીં ક્લિક કરશો.
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
function SendDashboard({ user, onBack }) {
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
  const [rows, setRows] = useState(
    Array.from({ length: INITIAL_ROWS }, (_, i) => ({ id: i + 1, itemName: '', kg: '' }))
  );
  const [loading, setLoading] = useState(false);

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

  const updateRow = (id, field, value) => setRows(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r));
  const addRow = () => {
    const nextId = rows.length > 0 ? Math.max(...rows.map(r => r.id)) + 1 : 1;
    setRows(prev => [...prev, { id: nextId, itemName: '', kg: '' }]);
  };
  const removeRow = (id) => { if (rows.length > 1) setRows(prev => prev.filter(r => r.id !== id)); };

  const filledRows = rows.filter(r => r.itemName.trim());
  const effectiveCenter = formData.fromCenter === 'Other' ? formData.fromCenterOther.trim() : formData.fromCenter;

  const handleSubmit = async () => {
    setLoading(true);
    try {
      const payload = {
        type: 'send',
        chalanNo: formData.chalanNo,
        date: formData.date,
        fromCenter: effectiveCenter,
        toCenter: 'Swaminarayan Dham Center',
        senderName: formData.senderName.trim(),
        mobileNumber: formData.mobileNumber.trim(),
        post: formData.post.trim(),
        globalId: formData.globalId.trim(),
        email: formData.email.trim(),
        items: filledRows.map((row) => ({
          itemName: row.itemName.trim(),
          kg: row.kg,
        })),
        timestamp: new Date(),
        submittedBy: user.username,
      };
      const docRef = await addDoc(collection(db, 'send-orders'), payload);
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
                            <th className="p-3 text-center text-gray-400 font-bold text-xs uppercase w-20">KG</th>
                </tr>
              </thead>
              <tbody>
                {filledRows.map((row, i) => (
                  <tr key={row.id} className="border-t border-white/5">
                    <td className="p-3 text-gray-500 text-center text-xs">{i + 1}</td>
                    <td className="p-3 font-medium text-white">{row.itemName}</td>
                    <td className="p-3 text-center font-bold text-blue-400">{row.kg || '-'}</td>
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
        <h2 className="text-lg sm:text-xl font-bold mb-4 text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-blue-600 flex items-center gap-2">
          <Send size={22} /> Center thi Kothar ne Moko
        </h2>
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
              {centerData.map(c => <option key={c.center} value={c.center}>{c.center}</option>)}
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
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-[#151515]">
              <tr>
                <th className="p-3 text-left text-gray-500 font-bold text-xs uppercase w-10">No</th>
                <th className="p-3 text-left text-gray-500 font-bold text-xs uppercase">Item Name</th>
                <th className="p-3 text-center text-gray-500 font-bold text-xs uppercase w-20">KG</th>
                <th className="p-3 w-10"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => (
                <tr key={row.id} className={`border-t border-white/5 transition-colors ${row.itemName ? 'bg-blue-500/5' : ''}`}>
                  <td className="p-2 text-gray-500 text-center text-xs font-mono">{idx + 1}</td>
                  <td className="p-2">
                    <input
                      className="w-full p-2 bg-[#252525] border border-white/5 rounded-lg text-white outline-none focus:border-blue-500/50 text-sm transition-all placeholder-gray-600"
                      placeholder={`Item ${idx + 1}...`}
                      value={row.itemName}
                      onChange={e => updateRow(row.id, 'itemName', e.target.value)}
                    />
                  </td>
                  <td className="p-2">
                    <input type="number" min="0"
                      className="w-full p-2 bg-[#252525] border border-white/5 rounded-lg text-white outline-none focus:border-blue-500/50 text-sm text-center transition-all"
                      placeholder="0" value={row.kg}
                      onChange={e => updateRow(row.id, 'kg', e.target.value)}
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
            <Plus size={16} /> New Row Umero
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
function UserDashboard({ user, onBack = null }) {
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
    const existing = cart.find(i => i.name === itemName);
    if (qty > 0) {
      if (existing) setCart(cart.map(i => i.name === itemName ? { ...i, qty } : i));
      else setCart([...cart, { name: itemName, category, unit, qty }]);
    } else { setCart(cart.filter(i => i.name !== itemName)); }
  };

  const handleConfirmSubmit = async () => {
    setLoading(true);
    try {
      const { totalKg } = calculateTotals(cart);
      const payload = {
        ...formData,
        center: formData.center === 'Other' ? formData.centerOther.trim() : formData.center,
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

  // Filter items based on search
  const filteredCategories = searchQuery
    ? Object.entries(categories).reduce((acc, [cat, items]) => {
        const filtered = items.filter(item => item.name.toLowerCase().includes(searchQuery.toLowerCase()));
        if (filtered.length > 0) acc[cat] = filtered;
        return acc;
      }, {})
    : categories;

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
          <h2 className="text-lg sm:text-xl font-bold mb-4 sm:mb-6 text-transparent bg-clip-text bg-gradient-to-r from-orange-400 to-orange-600 flex items-center gap-2">
            <FileText size={24} /> New Stock Request
          </h2>
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
                {centerData.map(c => <option key={c.center} value={c.center}>{c.center}</option>)}
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
              <label className="text-[10px] text-gray-500 font-bold uppercase block mb-1">Sender Name *</label>
              <input
                className="w-full p-3 sm:p-3.5 bg-[#252525] border border-white/10 rounded-xl sm:rounded-2xl text-white outline-none focus:border-orange-500/50 transition-all text-sm"
                placeholder="મોકલનારનું નામ"
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
          {Object.entries(filteredCategories).map(([category, items]) => (
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
                      {items.map((item, itemIndex) => {
                        const inCart = cart.find(c => c.name === item.name);
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
                              {inCart && (
                                <motion.button
                                  initial={{ scale: 0 }}
                                  animate={{ scale: 1 }}
                                  whileTap={{ scale: 0.9 }}
                                  onClick={() => updateQuantity(item.name, category, item.unit, Math.max(0, (parseFloat(inCart.qty) || 0) - 1))}
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
                                onChange={(e) => updateQuantity(item.name, category, item.unit, e.target.value)} 
                              />
                              <motion.button
                                whileTap={{ scale: 0.9 }}
                                onClick={() => updateQuantity(item.name, category, item.unit, (parseFloat(inCart?.qty) || 0) + 1)}
                                className="w-8 h-8 flex items-center justify-center bg-orange-500/20 rounded-lg text-orange-500 hover:bg-orange-500/30 transition-colors"
                              >
                                <Plus size={14} />
                              </motion.button>
                              <span className="text-[10px] text-gray-500 font-bold w-8 sm:w-10 uppercase hidden xs:inline">{item.unit}</span>
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
              if (!formData.senderName || !formData.mobileNumber) return alert("Sender Name ane Mobile Number fill karo!");
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
    const totals = calculateTotals(cart);
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
              <p className="font-black text-orange-400 text-xl sm:text-2xl">{totals.totalKg}</p>
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
                      {item.qty} <span className="text-[10px] text-gray-500 uppercase font-bold">{item.unit}</span>
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
      const blob = await generatePDFBlobReliable(order);
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `${getSmartFileName(order)}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(link.href);
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
              <p className="text-[10px] text-gray-500 font-bold uppercase mb-1">Chalan</p>
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
      const blob = await generateSendPDFBlobReliable(order);
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = getSendFileName(order);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(link.href);
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
            <p className="text-blue-100 text-xs mt-0.5">SMVS Material Dispatch Chalan</p>
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
              <p className="text-[10px] text-gray-500 font-bold uppercase mb-1">Chalan</p>
              <p className="font-black text-blue-400 text-base sm:text-lg">#{order.chalanNo}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4 sm:gap-6 mb-8">
            <div className="bg-[#252525] p-4 sm:p-5 rounded-2xl sm:rounded-3xl border border-white/5">
              <p className="text-[10px] text-gray-500 font-bold uppercase mb-1">Date</p>
              <p className="font-bold text-white text-sm">{(order.date || '').split('-').reverse().join('-')}</p>
            </div>
            <div className="bg-[#252525] p-4 sm:p-5 rounded-2xl sm:rounded-3xl border border-white/5">
              <p className="text-[10px] text-gray-500 font-bold uppercase mb-1">Sender</p>
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
      const blob = await generatePurchasePDFBlob(purchase);
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = getPurchaseFileName(purchase);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(link.href);
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
            <p className="text-violet-100 text-xs mt-0.5">દુકાન માંથી ખરીદેલ માલ</p>
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
              <p className="text-[10px] text-gray-500 font-bold uppercase mb-1">Center</p>
              <p className="font-black text-white uppercase text-base sm:text-lg">{purchase.center || '-'}</p>
            </div>
            <div className="bg-[#252525] p-4 sm:p-5 rounded-2xl sm:rounded-3xl border border-white/5">
              <p className="text-[10px] text-gray-500 font-bold uppercase mb-1">Bill Number</p>
              <p className="font-black text-violet-300 text-base sm:text-lg">#{purchase.billNo}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4 sm:gap-6 mb-8">
            <div className="bg-[#252525] p-4 sm:p-5 rounded-2xl sm:rounded-3xl border border-white/5">
              <p className="text-[10px] text-gray-500 font-bold uppercase mb-1">Shop Name</p>
              <p className="font-bold text-white text-sm">{purchase.shopName || '-'}</p>
            </div>
            <div className="bg-[#252525] p-4 sm:p-5 rounded-2xl sm:rounded-3xl border border-white/5">
              <p className="text-[10px] text-gray-500 font-bold uppercase mb-1">Bill Date</p>
              <p className="font-bold text-white text-sm">{formatDisplayDate(purchase.billDate || purchase.date)}</p>
            </div>
          </div>
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
      const blob = await generateSummaryReportPDFBlob(report);
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = getReportFileName(report);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(link.href);
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
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = getReportFileName(report);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(link.href);
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

  const reportTheme = getReportTheme();

  return (
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
              <h2 className="text-lg sm:text-xl font-extrabold uppercase tracking-tight">{reportTheme.title}</h2>
              <p className="text-white/80 text-xs mt-0.5">{report.title}</p>
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
  );
}

export default App;
