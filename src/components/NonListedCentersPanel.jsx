import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { AlertTriangle, Edit3 } from 'lucide-react';
import { findCenterByName } from '../centers';
import { centerData } from '../data';

const isListedCenter = (name, centersList) => {
  const raw = (name || '').trim();
  if (!raw) return true;
  const list = centersList?.length ? centersList : centerData;
  return !!findCenterByName(list, raw);
};

export const entryNeedsCenterResolution = (storedCenter, centersList, fromOtherFlag) => {
  if (fromOtherFlag === true) return true;
  return !isListedCenter(storedCenter, centersList);
};

export default function NonListedCentersPanel({
  centersList,
  orders = [],
  sendOrders = [],
  onEditRequest,
  onEditSend,
}) {
  const requestEntries = useMemo(
    () => orders.filter(
      (o) => entryNeedsCenterResolution(o.center, centersList, o.centerFromOther),
    ),
    [orders, centersList],
  );

  const sendEntries = useMemo(
    () => sendOrders.filter(
      (o) => entryNeedsCenterResolution(o.fromCenter, centersList, o.fromCenterFromOther),
    ),
    [sendOrders, centersList],
  );

  const total = requestEntries.length + sendEntries.length;
  if (total === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="mt-6 rounded-2xl border border-amber-500/35 bg-amber-500/10 p-4 sm:p-5"
    >
      <div className="flex items-start gap-3">
        <AlertTriangle className="shrink-0 text-amber-400" size={22} />
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold uppercase tracking-widest text-amber-300">
            લિસ્ટ બહારનાં સેન્ટર ({total})
          </p>
          <p className="mt-1 text-sm text-gray-300">
            નીચેની એન્ટ્રીઓ માસ્ટર લિસ્ટમાં નથી. Edit કરીને માન્ય સેન્ટર પસંદ કરો — સેવ થયા પછી અહીંથી દૂર થશે.
          </p>
        </div>
      </div>

      <motion.div className="mt-4 space-y-2 max-h-56 overflow-y-auto custom-scroll">
        {requestEntries.map((order) => (
          <div
            key={`req-${order.id}`}
            className="flex items-center justify-between gap-3 rounded-xl border border-amber-500/25 bg-[#252525]/80 px-3 py-2.5"
          >
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase text-orange-400">Request · #{order.chalanNo}</p>
              <p className="font-bold text-white truncate">{order.center}</p>
              <p className="text-[10px] text-gray-500">{order.date}</p>
            </div>
            <button
              type="button"
              onClick={() => onEditRequest?.(order)}
              className="shrink-0 flex items-center gap-1 rounded-lg border border-amber-500/30 bg-amber-500/15 px-2.5 py-1.5 text-[10px] font-bold uppercase text-amber-200 hover:bg-amber-500/25"
            >
              <Edit3 size={12} /> Edit
            </button>
          </div>
        ))}
        {sendEntries.map((order) => (
          <div
            key={`send-${order.id}`}
            className="flex items-center justify-between gap-3 rounded-xl border border-amber-500/25 bg-[#252525]/80 px-3 py-2.5"
          >
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase text-blue-400">Send · #{order.chalanNo}</p>
              <p className="font-bold text-white truncate">{order.fromCenter}</p>
              <p className="text-[10px] text-gray-500">{order.date}</p>
            </div>
            <button
              type="button"
              onClick={() => onEditSend?.(order)}
              className="shrink-0 flex items-center gap-1 rounded-lg border border-amber-500/30 bg-amber-500/15 px-2.5 py-1.5 text-[10px] font-bold uppercase text-amber-200 hover:bg-amber-500/25"
            >
              <Edit3 size={12} /> Edit
            </button>
          </div>
        ))}
      </motion.div>
    </motion.div>
  );
}
