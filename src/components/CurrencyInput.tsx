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

export function formatCurrencyBR(num?: number | null): string {
  const safe = typeof num === 'number' && Number.isFinite(num) ? num : 0;
  return safe.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatBrazilianInputLive(rawInput: string, previousDraft = ''): string {
  let cleaned = rawInput.replace(/[^\d.,]/g, '');
  if (!cleaned) return '';

  const isMultiCharPaste = rawInput.length - previousDraft.length > 1;
  if (!cleaned.includes(',') && cleaned.endsWith('.') && rawInput.length >= previousDraft.length) {
    cleaned = `${cleaned.slice(0, -1)},`;
  } else if (isMultiCharPaste && !cleaned.includes(',') && /^\d+\.\d{1,2}$/.test(cleaned)) {
    cleaned = cleaned.replace('.', ',');
  }

  const withoutThousands = cleaned.replace(/\./g, '');
  const hasComma = withoutThousands.includes(',');
  const [rawInt = '', ...rest] = withoutThousands.split(',');
  const trimmedInt = rawInt.replace(/^0+(?=\d)/, '');
  const intDigits = trimmedInt || (hasComma ? '0' : '');
  const formattedInt = intDigits.replace(/\B(?=(\d{3})+(?!\d))/g, '.');

  if (!hasComma) return formattedInt;
  const decDigits = rest.join('').slice(0, 2);
  return `${formattedInt},${decDigits}`;
}

function parseBrazilianNumber(formatted: string): number {
  const cleaned = formatted.replace(/[^\d.,]/g, '');
  if (!cleaned) return 0;
  const normalized = cleaned.replace(/\./g, '').replace(',', '.');
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
    : formatCurrencyBR(numericValue);

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
        setDraftText(numericValue > 0 ? formatCurrencyBR(numericValue) : '');
        requestAnimationFrame(() => e.target.select());
      }}
      onChange={(e) => {
        const formatted = formatBrazilianInputLive(e.target.value, draftText);
        setDraftText(formatted);
        onChangeValue(parseBrazilianNumber(formatted));
      }}
      onBlur={() => {
        setIsFocused(false);
      }}
      className={className}
    />
  );
};
