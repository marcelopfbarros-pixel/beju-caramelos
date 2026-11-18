import React from 'react';
import { Filter, ArrowUpDown, Layers } from 'lucide-react';

export interface SelectOption {
  value: string;
  label: string;
}

interface HybridFilterSortProps {
  filterLabel?: string;
  filterValue: string;
  onFilterChange: (value: string) => void;
  filterOptions: SelectOption[];
  sortValue: string;
  onSortChange: (value: string) => void;
  sortOptions: SelectOption[];
  groupValue?: string;
  onGroupChange?: (value: string) => void;
  groupOptions?: SelectOption[];
  className?: string;
}

export const HybridFilterSort: React.FC<HybridFilterSortProps> = ({
  filterLabel = 'Filtro:',
  filterValue,
  onFilterChange,
  filterOptions,
  sortValue,
  onSortChange,
  sortOptions,
  groupValue,
  onGroupChange,
  groupOptions,
  className = ''
}) => {
  return (
    <div
      className={`inline-flex flex-wrap items-center bg-slate-50 border border-slate-200 rounded-lg divide-x divide-slate-200 shadow-2xs ${className}`}
    >
      <div className="flex items-center gap-1.5 px-2.5 py-1.5">
        <Filter className="w-3.5 h-3.5 text-slate-500 shrink-0" />
        <span className="text-xs text-slate-500 font-semibold">{filterLabel}</span>
        <select
          value={filterValue}
          onChange={(e) => onFilterChange(e.target.value)}
          aria-label={filterLabel}
          className="bg-transparent text-xs font-bold text-slate-800 outline-none cursor-pointer"
        >
          {filterOptions.map(opt => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex items-center gap-1.5 px-2.5 py-1.5">
        <ArrowUpDown className="w-3.5 h-3.5 text-brand-600 shrink-0" />
        <span className="text-xs text-slate-500 font-semibold">Ordem:</span>
        <select
          value={sortValue}
          onChange={(e) => onSortChange(e.target.value)}
          aria-label="Ordem de classificação"
          className="bg-transparent text-xs font-bold text-slate-800 outline-none cursor-pointer"
        >
          {sortOptions.map(opt => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {groupOptions && onGroupChange && groupValue !== undefined && (
        <div className="flex items-center gap-1.5 px-2.5 py-1.5">
          <Layers className="w-3.5 h-3.5 text-slate-500 shrink-0" />
          <span className="text-xs text-slate-500 font-semibold">Agrupar:</span>
          <select
            value={groupValue}
            onChange={(e) => onGroupChange(e.target.value)}
            aria-label="Agrupar por"
            className="bg-transparent text-xs font-bold text-slate-800 outline-none cursor-pointer"
          >
            {groupOptions.map(opt => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
};
