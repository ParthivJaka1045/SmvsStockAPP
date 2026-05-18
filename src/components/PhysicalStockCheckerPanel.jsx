import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Loader2, Search } from 'lucide-react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { findGlobalUnitById } from '../globalUnits';
import { findCatalogItemByName } from '../itemCatalog';
import {
  computeItemPhysicalBalance,
  formatMetric,
  getCurrentMonthValue,
  getTodayIsoDate,
} from '../reporting';
import { formatUnitConversionHint, resolveCatalogItemUnit, UNIT_KG } from '../itemUnits';

const STOCK_TRANSACTIONS_COLLECTION = 'stock-transactions';
const MONTHLY_CLOSING_COLLECTION = 'monthly-closing-stock';

export default function PhysicalStockCheckerPanel({
  catalogItems,
  globalUnits,
  ItemNameAutocompleteInput,
}) {
  const [itemName, setItemName] = useState('');
  const [asOfDate, setAsOfDate] = useState(() => getTodayIsoDate());
  const [month, setMonth] = useState(() => getCurrentMonthValue());
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [stockTransactions, setStockTransactions] = useState([]);
  const [monthlyClosingStock, setMonthlyClosingStock] = useState([]);

  const loadLedger = useCallback(async () => {
    setLedgerLoading(true);
    try {
      const [txSnap, closingSnap] = await Promise.all([
        getDocs(collection(db, STOCK_TRANSACTIONS_COLLECTION)),
        getDocs(collection(db, MONTHLY_CLOSING_COLLECTION)),
      ]);
      setStockTransactions(txSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setMonthlyClosingStock(closingSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch {
      setStockTransactions([]);
      setMonthlyClosingStock([]);
    }
    setLedgerLoading(false);
  }, []);

  useEffect(() => {
    loadLedger();
  }, [loadLedger]);

  const catalogItem = useMemo(
    () => (itemName.trim() ? findCatalogItemByName(catalogItems, itemName) : null),
    [catalogItems, itemName],
  );

  const globalUnit = useMemo(
    () => (catalogItem?.globalUnitId ? findGlobalUnitById(globalUnits, catalogItem.globalUnitId) : null),
    [catalogItem, globalUnits],
  );

  const balance = useMemo(() => {
    if (!itemName.trim()) return null;
    return computeItemPhysicalBalance({
      itemName,
      asOfDate,
      monthValue: month,
      stockTransactions,
      monthlyClosingStock,
      catalogItem,
      globalUnit,
    });
  }, [itemName, asOfDate, month, stockTransactions, monthlyClosingStock, catalogItem, globalUnit]);

  const unitLabel = balance ? resolveCatalogItemUnit(catalogItem || { unit: balance.unit }) : UNIT_KG;
  const isNegative = balance && balance.balanceKg < 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="mt-6 mb-2 rounded-2xl border border-teal-500/25 bg-teal-500/5 p-4 sm:p-5"
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-widest text-teal-300">ફિઝિકલ સ્ટોક ચેકર</p>
          <p className="mt-1 text-sm text-gray-300">
            આઇટમ પસંદ કરો → અત્યારે કેટલો સ્ટોક છે (carry forward + IN − OUT).
          </p>
        </div>
        <button
          type="button"
          onClick={loadLedger}
          disabled={ledgerLoading}
          className="text-xs font-bold uppercase text-gray-400 hover:text-teal-300 flex items-center gap-1.5"
        >
          {ledgerLoading ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
          Refresh ledger
        </button>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="sm:col-span-2">
          <label className="block text-[11px] font-bold uppercase tracking-widest text-gray-500 mb-2">Item *</label>
          {ItemNameAutocompleteInput ? (
            <ItemNameAutocompleteInput
              accent="teal"
              catalogItems={catalogItems}
              placeholder="આઇટમ શોધો..."
              value={itemName}
              onChange={setItemName}
              onSelectItem={(item) => setItemName(item.name)}
            />
          ) : (
            <input
              className="w-full p-3 bg-[#252525] border border-white/10 rounded-xl text-white text-sm"
              value={itemName}
              onChange={(e) => setItemName(e.target.value)}
              placeholder="Item name"
            />
          )}
        </div>
        <div>
          <label className="block text-[11px] font-bold uppercase tracking-widest text-gray-500 mb-2">Month</label>
          <input
            type="month"
            className="w-full p-3 bg-[#252525] border border-white/10 rounded-xl text-white text-sm"
            value={month}
            onChange={(e) => {
              const nextMonth = e.target.value;
              setMonth(nextMonth);
              const today = getTodayIsoDate();
              if (today.startsWith(nextMonth)) {
                setAsOfDate(today);
              } else if (nextMonth && /^\d{4}-\d{2}$/.test(nextMonth)) {
                const [y, m] = nextMonth.split('-').map(Number);
                const lastDay = new Date(y, m, 0).getDate();
                setAsOfDate(`${nextMonth}-${String(lastDay).padStart(2, '0')}`);
              }
            }}
          />
        </div>
        <div>
          <label className="block text-[11px] font-bold uppercase tracking-widest text-gray-500 mb-2">As of date</label>
          <input
            type="date"
            className="w-full p-3 bg-[#252525] border border-white/10 rounded-xl text-white text-sm"
            value={asOfDate}
            onChange={(e) => setAsOfDate(e.target.value)}
          />
        </div>
      </div>

      {balance && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-5 rounded-2xl border border-white/10 bg-[#1a1a1a] p-4 sm:p-5"
        >
          <p className="text-lg font-black text-white">{balance.itemName}</p>
          <p className="mt-1 text-xs text-gray-500">
            Through {asOfDate.split('-').reverse().join('-')} · Month {month}
          </p>

          <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <div className="rounded-xl bg-[#252525] p-3 border border-white/5 text-center">
              <p className="text-[10px] text-gray-500 font-bold uppercase">Carry forward</p>
              <p className="font-black text-teal-300 mt-1">{formatMetric(balance.openingKg)} {UNIT_KG}</p>
            </div>
            <div className="rounded-xl bg-[#252525] p-3 border border-white/5 text-center">
              <p className="text-[10px] text-gray-500 font-bold uppercase">Month IN</p>
              <p className="font-black text-emerald-400 mt-1">+{formatMetric(balance.periodInKg)} {UNIT_KG}</p>
            </div>
            <div className="rounded-xl bg-[#252525] p-3 border border-white/5 text-center">
              <p className="text-[10px] text-gray-500 font-bold uppercase">Month OUT</p>
              <p className="font-black text-orange-400 mt-1">−{formatMetric(balance.periodOutKg)} {UNIT_KG}</p>
            </div>
            <div className={`rounded-xl p-3 border text-center ${isNegative ? 'bg-red-500/10 border-red-500/30' : 'bg-teal-500/10 border-teal-500/30'}`}>
              <p className="text-[10px] font-bold uppercase text-gray-400">Physical balance</p>
              <p className={`font-black text-xl mt-1 ${isNegative ? 'text-red-300' : 'text-teal-200'}`}>
                {formatMetric(balance.balanceInUnit)} {unitLabel}
              </p>
              <p className="text-[10px] text-gray-500 mt-1">({formatMetric(balance.balanceKg)} {UNIT_KG})</p>
            </div>
          </div>

          {catalogItem && formatUnitConversionHint(unitLabel, catalogItem) && (
            <p className="mt-3 text-[11px] text-teal-200/80">{formatUnitConversionHint(unitLabel, catalogItem)}</p>
          )}
        </motion.div>
      )}
    </motion.div>
  );
}
