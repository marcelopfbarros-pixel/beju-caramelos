import React, { useState } from 'react';

interface CurrencyInputProps {
  value?: number | null;
  onChangeValue: (value: number) => void;
  allowEmpty?: boolean;
  placeholder?: string;
  className?: string;
  id?: string;
  disabled?: boolean;
}

function formatTwoDecimals(num: number): string {
  return num.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function parseBrazilianNumber(raw: string): number {
  const cleaned = raw.replace(/[^\d.,]/g, '');
  if (!cleaned) return 0;
  const normalized = cleaned.includes(',')
    ? cleaned.replace(/\./g, '').replace(',', '.')
    : cleaned;
  const parsed = parseFloat(normalized);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

export const CurrencyInput: React.FC<CurrencyInputProps> = ({
  value,
  onChangeValue,
  allowEmpty = false,
  placeholder = '0,00',
  className = '',
  id,
  disabled = false,
}) => {
  const [isFocused, setIsFocused] = useState(false);
  const [draftText, setDraftText] = useState('');

  const numericValue = typeof value === 'number' && Number.isFinite(value) ? value : 0;
  const displayValue = isFocused
    ? draftText
    : allowEmpty && (value === undefined || value === null || value === 0)
    ? ''
    : formatTwoDecimals(numericValue);

  return (
    <input
      id={id}
      type="text"
      inputMode="decimal"
      disabled={disabled}
      placeholder={placeholder}
      value={displayValue}
      onFocus={(e) => {
        setIsFocused(true);
        setDraftText(numericValue > 0 ? numericValue.toFixed(2).replace('.', ',') : '');
        requestAnimationFrame(() => e.target.select());
      }}
      onChange={(e) => {
        const raw = e.target.value.replace(/[^\d.,]/g, '');
        setDraftText(raw);
        onChangeValue(parseBrazilianNumber(raw));
      }}
      onBlur={() => {
        setIsFocused(false);
      }}
      className={className}
    />
  );
};
