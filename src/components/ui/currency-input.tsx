'use client';

import { ChangeEvent, ClipboardEvent, InputHTMLAttributes, forwardRef, useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

type BaseProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'>;

export interface CurrencyInputProps extends BaseProps {
  label?: string;
  error?: string;
  value: number | null;
  onChange: (value: number | null) => void;
}

function formatDisplay(value: number | null): string {
  return value != null ? value.toLocaleString('id-ID') : '';
}

/**
 * Input nominal Rupiah dengan thousand separator titik (format Indonesia).
 * Display formatted (mis. "1.500.000"), state & onChange tetap raw integer.
 * Karakter non-digit otomatis di-strip; paste "Rp 1.000.000" → 1000000.
 */
export const CurrencyInput = forwardRef<HTMLInputElement, CurrencyInputProps>(
  ({ className, label, error, id, value, onChange, ...props }, ref) => {
    const inputId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);
    const [display, setDisplay] = useState<string>(() => formatDisplay(value));

    useEffect(() => {
      setDisplay(formatDisplay(value));
    }, [value]);

    const commit = (raw: string) => {
      const digits = raw.replace(/\D/g, '');
      if (digits === '') {
        setDisplay('');
        onChange(null);
        return;
      }
      const num = parseInt(digits, 10);
      if (Number.isNaN(num)) return;
      setDisplay(num.toLocaleString('id-ID'));
      onChange(num);
    };

    const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
      commit(e.target.value);
    };

    const handlePaste = (e: ClipboardEvent<HTMLInputElement>) => {
      const pasted = e.clipboardData.getData('text');
      if (!pasted) return;
      e.preventDefault();
      commit(pasted);
    };

    return (
      <div className="w-full">
        {label && (
          <label htmlFor={inputId} className="block text-sm font-medium text-gray-700 mb-1">
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          type="text"
          inputMode="numeric"
          value={display}
          onChange={handleChange}
          onPaste={handlePaste}
          className={cn(
            'block w-full rounded-lg border px-3 py-2 text-sm',
            'focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500',
            'placeholder:text-gray-400',
            error
              ? 'border-red-300 text-red-900 focus:ring-red-500 focus:border-red-500'
              : 'border-gray-300 text-gray-900',
            className
          )}
          {...props}
        />
        {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
      </div>
    );
  }
);

CurrencyInput.displayName = 'CurrencyInput';
