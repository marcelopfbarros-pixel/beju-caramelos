import React from 'react';

interface PrintReportHeaderProps {
  title: string;
  badge?: string;
  subtitle?: string;
}

export const PrintReportHeader: React.FC<PrintReportHeaderProps> = ({
  title,
  badge = 'Relatório',
  subtitle
}) => {
  const todayFormatted = new Date().toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });

  return (
    <div
      className="hidden print:flex items-center justify-between border-b-2 border-rose-300 bg-gradient-to-r from-rose-50 via-white to-amber-50 rounded-xl px-4 py-3 mb-4"
      style={{ WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }}
    >
      <div className="flex items-center gap-3.5">
        <img
          src="/logo.jpg"
          alt="Beju Caramelos"
          className="w-12 h-12 rounded-full object-cover border-2 border-rose-300 shadow-xs"
        />
        <div>
          <div className="flex items-center gap-2">
            <span className="text-base font-extrabold tracking-tight text-slate-900">Beju Caramelos</span>
            <span className="text-[10px] font-mono font-bold uppercase px-2 py-0.5 rounded-full bg-rose-600 text-white">
              {badge}
            </span>
          </div>
          <h2 className="text-sm font-semibold text-rose-900 mt-0.5">{title}</h2>
        </div>
      </div>
      <div className="text-right font-mono text-[11px] text-slate-600">
        <div className="font-bold text-slate-800">{todayFormatted}</div>
        {subtitle && <div className="text-[10px] text-slate-500">{subtitle}</div>}
      </div>
    </div>
  );
};
