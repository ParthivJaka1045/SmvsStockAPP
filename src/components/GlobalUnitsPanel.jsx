import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, Plus } from 'lucide-react';
import { CONVERSION_BASE_UNITS, conversionInputToKgFactor, UNIT_KG } from '../itemUnits';
import { fetchGlobalUnits, saveGlobalUnit, softDeleteGlobalUnit } from '../globalUnits';

export default function GlobalUnitsPanel({ onUnitsChange }) {
  const [units, setUnits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ id: null, name: '', defaultAmount: '', defaultBase: UNIT_KG });

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setUnits(await fetchGlobalUnits());
    } catch {
      setUnits([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const resetForm = () => setForm({ id: null, name: '', defaultAmount: '', defaultBase: UNIT_KG });

  const handleSubmit = async (e) => {
    e.preventDefault();
    const name = form.name.trim();
    if (!name) return alert('એકમનું નામ લખો.');
    const defaultUnitToKg = form.defaultAmount
      ? conversionInputToKgFactor(form.defaultAmount, form.defaultBase)
      : null;
    setSaving(true);
    try {
      await saveGlobalUnit({ id: form.id, name, defaultUnitToKg });
      await refresh();
      onUnitsChange?.();
      resetForm();
    } catch (err) {
      alert(err.message || 'Save failed.');
    }
    setSaving(false);
  };

  const handleDelete = async (row) => {
    if (!window.confirm(`"${row.name}" દૂર કરવું?`)) return;
    setSaving(true);
    try {
      await softDeleteGlobalUnit(row.id);
      await refresh();
      onUnitsChange?.();
      if (form.id === row.id) resetForm();
    } catch (err) {
      alert(err.message || 'Delete failed.');
    }
    setSaving(false);
  };

  return (
    <div className="mt-6 rounded-2xl border border-amber-500/25 bg-amber-500/5 p-4 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-widest text-amber-300">Global Units</p>
          <p className="mt-1.5 text-sm text-gray-300 leading-relaxed">
            ડબ્બો, બોરી વગેરે ગ્લોબલી ઉમેરો — દરેક આઇટમ પર અલગ kg રૂપાંતર સેટ કરી શકાય.
          </p>
        </div>
        {form.id && (
          <button
            type="button"
            onClick={resetForm}
            className="shrink-0 self-start rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-bold uppercase text-gray-300 hover:text-white hover:bg-white/10 transition-colors"
          >
            નવું એકમ
          </button>
        )}
      </div>

      <form onSubmit={handleSubmit} className="mt-5 space-y-4">
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-2">
            એકમનું નામ *
          </label>
          <input
            className="w-full p-3 bg-[#252525] border border-white/10 rounded-xl text-white text-sm outline-none focus:border-amber-500/50"
            placeholder="ઉદા. ડબ્બો, બોરી"
            value={form.name}
            onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
            required
          />
        </div>

        <div>
          <label className="block text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-2">
            ડિફોલ્ટ રૂપાંતર (વૈકલ્પિક)
          </label>
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-white/10 bg-[#252525] p-3 sm:p-4">
            <span className="text-sm font-bold text-amber-300 whitespace-nowrap">૧ એકમ =</span>
            <input
              type="number"
              min="0"
              step="any"
              value={form.defaultAmount}
              onChange={(e) => setForm((p) => ({ ...p, defaultAmount: e.target.value }))}
              placeholder="15"
              className="w-24 p-2.5 bg-[#1a1a1a] border border-white/10 rounded-lg text-white text-sm outline-none focus:border-amber-500/50"
            />
            <select
              value={form.defaultBase}
              onChange={(e) => setForm((p) => ({ ...p, defaultBase: e.target.value }))}
              className="min-w-[5.5rem] p-2.5 bg-[#1a1a1a] border border-white/10 rounded-lg text-white text-sm outline-none focus:border-amber-500/50"
            >
              {CONVERSION_BASE_UNITS.map((u) => (
                <option key={u} value={u}>{u}</option>
              ))}
            </select>
            <span className="text-[10px] text-gray-500 w-full sm:w-auto">(આઇટમ પર ઓવરરાઇડ શક્ય)</span>
          </div>
        </div>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3 pt-1">
          {form.id && (
            <button
              type="button"
              onClick={resetForm}
              className="w-full sm:w-auto px-5 py-3 rounded-xl border border-white/10 bg-white/5 text-sm font-bold text-gray-300 hover:bg-white/10 transition-colors"
            >
              રદ કરો
            </button>
          )}
          <button
            type="submit"
            disabled={saving}
            className="w-full sm:w-auto sm:min-w-[160px] flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-600 text-white text-sm font-bold shadow-lg shadow-amber-500/20 disabled:opacity-50 transition-opacity"
          >
            {saving ? (
              <Loader2 size={18} className="animate-spin" />
            ) : (
              <Plus size={18} />
            )}
            {saving ? 'સેવ થઈ રહ્યું…' : (form.id ? 'અપડેટ કરો' : 'એકમ ઉમેરો')}
          </button>
        </div>
      </form>

      <div className="mt-8 border-t border-white/10 pt-6">
        <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-3">સાચવેલા એકમ</p>
        <div className="max-h-44 overflow-y-auto rounded-xl border border-white/10 bg-[#1a1a1a] custom-scroll">
          {loading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="animate-spin text-amber-400" size={28} />
            </div>
          ) : units.length === 0 ? (
            <p className="p-6 text-center text-sm text-gray-500">હજી કોઈ ગ્લોબલ એકમ નથી.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-[#252525] text-gray-400 sticky top-0 z-10">
                <tr>
                  <th className="p-3 text-left font-bold text-xs uppercase">Unit</th>
                  <th className="p-3 text-left font-bold text-xs uppercase">Default kg</th>
                  <th className="p-3 text-right font-bold text-xs uppercase w-32">Actions</th>
                </tr>
              </thead>
              <tbody>
                {units.map((row) => (
                  <tr key={row.id} className="border-t border-white/5 hover:bg-white/[0.02]">
                    <td className="p-3 font-bold text-white">{row.name}</td>
                    <td className="p-3 text-gray-400">{row.defaultUnitToKg ?? '— (per item)'}</td>
                    <td className="p-3">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setForm({
                            id: row.id,
                            name: row.name,
                            defaultAmount: row.defaultUnitToKg != null ? String(row.defaultUnitToKg) : '',
                            defaultBase: UNIT_KG,
                          })}
                          className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5 text-[10px] font-bold uppercase text-amber-200 hover:bg-amber-500/20 transition-colors"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(row)}
                          className="rounded-lg border border-red-500/30 bg-red-500/10 px-2.5 py-1.5 text-[10px] font-bold uppercase text-red-300 hover:bg-red-500/20 transition-colors"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
