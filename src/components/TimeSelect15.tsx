import React from 'react';

interface TimeSelect15Props {
  value: string; // HH:mm
  onChange: (nextTime: string) => void;
  ariaLabel?: string;
  className?: string;
}

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
const MINUTES = ['00', '15', '30', '45'] as const;

export function snapMinuteTo15(minuteStr: string): string {
  const num = parseInt(minuteStr, 10);
  if (Number.isNaN(num)) return '00';
  const snapped = Math.round(num / 15) * 15;
  if (snapped >= 60) return '45';
  return String(snapped).padStart(2, '0');
}

export const TimeSelect15: React.FC<TimeSelect15Props> = ({
  value,
  onChange,
  ariaLabel = 'Selecionar horário',
  className = '',
}) => {
  const [rawH = '12', rawM = '00'] = (value || '12:00').split(':');
  const hour = HOURS.includes(rawH.padStart(2, '0')) ? rawH.padStart(2, '0') : '12';
  const minute = snapMinuteTo15(rawM);

  return (
    <div
      className={`inline-flex items-center justify-center gap-0.5 bg-white border border-slate-300 rounded-lg px-2 py-2 font-mono text-xs text-slate-800 w-auto shrink-0 ${className}`}
      aria-label={ariaLabel}
    >
      <select
        aria-label={`${ariaLabel} - Hora`}
        value={hour}
        onChange={(e) => onChange(`${e.target.value}:${minute}`)}
        className="w-11 text-center bg-transparent font-mono font-semibold text-slate-800 outline-none cursor-pointer"
      >
        {HOURS.map((h) => (
          <option key={h} value={h}>
            {h}
          </option>
        ))}
      </select>
      <span className="font-bold text-slate-400 select-none">:</span>
      <select
        aria-label={`${ariaLabel} - Minutos`}
        value={minute}
        onChange={(e) => onChange(`${hour}:${e.target.value}`)}
        className="w-11 text-center bg-transparent font-mono font-semibold text-slate-800 outline-none cursor-pointer"
      >
        {MINUTES.map((m) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
      </select>
    </div>
  );
};
