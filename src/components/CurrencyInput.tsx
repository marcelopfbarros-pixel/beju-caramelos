import React, { useState } from 'react';

interface CurrencyInputProps {
  value?: number | null;
  onChangeValue: (value: number) => void;
  onBlur?: () => void;
  allowEmpty?: boolean;
  fixedDecimals?: boolean;
  placeholder?: string;
  className?: string;
  id?: string;
  ariaLabel?: string;
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

function parsePastedCurrency(raw: string): number {
  const cleaned = raw.replace(/[^\d.,]/g, '');
  if (!cleaned) return 0;

  const lastComma = cleaned.lastIndexOf(',');
  const lastDot = cleaned.lastIndexOf('.');
  let normalized = cleaned;

  if (lastComma > -1 && lastDot > -1) {
    if (lastComma > lastDot) {
      normalized = cleaned.replace(/\./g, '').replace(',', '.');
    } else {
      normalized = cleaned.replace(/,/g, '');
    }
  } else if (lastComma > -1) {
    normalized = `${cleaned.slice(0, lastComma).replace(/,/g, '')}.${cleaned
      .slice(lastComma + 1)
      .replace(/,/g, '')}`;
  } else if (lastDot > -1) {
    const afterLastDot = cleaned.slice(lastDot + 1);
    if (afterLastDot.length <= 2) {
      normalized = `${cleaned.slice(0, lastDot).replace(/\./g, '')}.${afterLastDot}`;
    } else {
      normalized = cleaned.replace(/\./g, '');
    }
  }

  const parsed = parseFloat(normalized);
  return Number.isFinite(parsed) ? Math.max(0, Number(parsed.toFixed(2))) : 0;
}

export const CurrencyInput: React.FC<CurrencyInputProps> = ({
  value,
  onChangeValue,
  onBlur,
  allowEmpty = false,
  fixedDecimals = false,
  placeholder = '0,00',
  className = '',
  id,
  ariaLabel,
  disabled = false,
}) => {
  const [isFocused, setIsFocused] = useState(false);
  const [draftText, setDraftText] = useState('');

  const numericValue = typeof value === 'number' && Number.isFinite(value) ? value : 0;
  const displayValue = fixedDecimals
    ? formatCurrencyBR(numericValue)
    : isFocused
    ? draftText
    : allowEmpty && (value === undefined || value === null || value === 0)
    ? ''
    : formatCurrencyBR(numericValue);

  return (
    <input
      id={id}
      type="text"
      inputMode="decimal"
      aria-label={ariaLabel}
      disabled={disabled}
      placeholder={placeholder}
      value={displayValue}
      onFocus={(e) => {
        setIsFocused(true);
        if (!fixedDecimals) {
          setDraftText(numericValue > 0 ? formatCurrencyBR(numericValue) : '');
        }
        requestAnimationFrame(() => e.target.select());
      }}
      onPaste={(e) => {
        if (!fixedDecimals) return;
        const pasted = e.clipboardData?.getData('text') || '';
        if (!pasted) return;
        e.preventDefault();
        onChangeValue(parsePastedCurrency(pasted));
      }}
      onChange={(e) => {
        if (fixedDecimals) {
          const digits = e.target.value.replace(/\D/g, '').slice(0, 11);
          const cents = digits ? parseInt(digits, 10) : 0;
          onChangeValue(Number((cents / 100).toFixed(2)));
          return;
        }
        const formatted = formatBrazilianInputLive(e.target.value, draftText);
        setDraftText(formatted);
        onChangeValue(parseBrazilianNumber(formatted));
      }}
      onBlur={() => {
        setIsFocused(false);
        onBlur?.();
      }}
      className={className}
    />
  );
};
