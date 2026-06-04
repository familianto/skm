'use client';

import { BAGIAN_OPTIONS } from '@/lib/qurban/bagian-options';

/**
 * Checklist bagian hewan + field "Lainnya" (polish pendaftaran). Dipakai bersama
 * oleh form panitia (PesertaForm/PesertaEditForm) dan wizard publik. State
 * dipegang parent sebagai `selected: string[]` + `lainnya: string`; rakit string
 * simpanan lewat `composeBagian()` saat submit, dan isi awal lewat `parseBagian()`.
 */
interface Props {
  selected: string[];
  lainnya: string;
  onChange: (selected: string[], lainnya: string) => void;
  /** Unik per instance (mis. saat ada >1 checklist di satu halaman). */
  idPrefix?: string;
  disabled?: boolean;
}

export function BagianChecklist({ selected, lainnya, onChange, idPrefix = 'bagian', disabled }: Props) {
  const toggle = (opt: string, checked: boolean) => {
    const next = new Set(selected);
    if (checked) next.add(opt);
    else next.delete(opt);
    // Keep `selected` in canonical order so compose/summary stay stable.
    onChange(BAGIAN_OPTIONS.filter((o) => next.has(o)), lainnya);
  };

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
        {BAGIAN_OPTIONS.map((opt) => {
          const id = `${idPrefix}-${opt.toLowerCase().replace(/\s+/g, '-')}`;
          return (
            <label key={opt} htmlFor={id} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input
                id={id}
                type="checkbox"
                checked={selected.includes(opt)}
                onChange={(e) => toggle(opt, e.target.checked)}
                disabled={disabled}
                className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
              />
              {opt}
            </label>
          );
        })}
      </div>
      <div>
        <label htmlFor={`${idPrefix}-lainnya`} className="block text-xs font-medium text-gray-600 mb-1">
          Lainnya (sebutkan, pisah dengan koma)
        </label>
        <input
          id={`${idPrefix}-lainnya`}
          type="text"
          value={lainnya}
          onChange={(e) => onChange(selected, e.target.value)}
          disabled={disabled}
          placeholder="mis. Kulit, Lemak"
          className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 disabled:bg-gray-50 disabled:text-gray-400"
        />
      </div>
    </div>
  );
}
