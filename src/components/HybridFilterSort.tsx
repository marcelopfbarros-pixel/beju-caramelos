import React from 'react';
import { Calendar, Filter, ArrowUpDown, Layers, ChevronDown, RotateCcw } from 'lucide-react';

export interface SelectOption {
  value: string;
  label: string;
}

interface HybridFilterSortProps {
  dateLabel?: string;
  dateValue?: string;
  onDateChange?: (value: string) => void;
  dateOptions?: SelectOption[];
  dateActive?: boolean;
  secondDateLabel?: string;
  secondDateValue?: string;
  onSecondDateChange?: (value: string) => void;
  secondDateOptions?: SelectOption[];
  secondDateActive?: boolean;
  filterLabel?: string;
  filterValue: string;
  onFilterChange: (value: string) => void;
  filterOptions: SelectOption[];
  filterActive?: boolean;
  secondFilterLabel?: string;
  secondFilterValue?: string;
  onSecondFilterChange?: (value: string) => void;
  secondFilterOptions?: SelectOption[];
  secondFilterActive?: boolean;
  sortValue: string;
  onSortChange: (value: string) => void;
  sortOptions: SelectOption[];
  groupValue?: string;
  onGroupChange?: (value: string) => void;
  groupOptions?: SelectOption[];
  hasActiveFilters?: boolean;
  onResetFilters?: () => void;
  className?: string;
}

export const HybridFilterSort: React.FC<HybridFilterSortProps> = ({
  dateLabel = 'Data:',
  dateValue,
  onDateChange,
  dateOptions,
  dateActive = false,
  secondDateLabel = 'Data 2:',
  secondDateValue,
  onSecondDateChange,
  secondDateOptions,
  secondDateActive = false,
  filterLabel = 'Filtro:',
  filterValue,
  onFilterChange,
  filterOptions,
  filterActive = false,
  secondFilterLabel = 'Filtro 2:',
  secondFilterValue,
  onSecondFilterChange,
  secondFilterOptions,
  secondFilterActive = false,
  sortValue,
  onSortChange,
  sortOptions,
  groupValue,
  onGroupChange,
  groupOptions,
  hasActiveFilters = false,
  onResetFilters,
  className = ''
}) => {
  const segments = [
    ...(dateOptions && onDateChange && dateValue !== undefined
      ? [{
          key: 'date',
          title: dateLabel,
          icon: <Calendar className={`w-3.5 h-3.5 shrink-0 ${dateActive ? 'text-blue-600' : 'text-slate-500'}`} />,
          value: dateValue,
          onChange: onDateChange,
          options: dateOptions,
          active: dateActive
        }]
      : []),
    ...(secondDateOptions && onSecondDateChange && secondDateValue !== undefined
      ? [{
          key: 'secondDate',
          title: secondDateLabel,
          icon: <Calendar className={`w-3.5 h-3.5 shrink-0 ${secondDateActive ? 'text-blue-600' : 'text-emerald-600'}`} />,
          value: secondDateValue,
          onChange: onSecondDateChange,
          options: secondDateOptions,
          active: secondDateActive
        }]
      : []),
    {
      key: 'filter',
      title: filterLabel,
      icon: <Filter className={`w-3.5 h-3.5 shrink-0 ${filterActive ? 'text-blue-600' : 'text-slate-500'}`} />,
      value: filterValue,
      onChange: onFilterChange,
      options: filterOptions,
      active: filterActive
    },
    ...(secondFilterOptions && onSecondFilterChange && secondFilterValue !== undefined
      ? [{
          key: 'secondFilter',
          title: secondFilterLabel,
          icon: <Filter className={`w-3.5 h-3.5 shrink-0 ${secondFilterActive ? 'text-blue-600' : 'text-indigo-500'}`} />,
          value: secondFilterValue,
          onChange: onSecondFilterChange,
          options: secondFilterOptions,
          active: secondFilterActive
        }]
      : []),
    {
      key: 'sort',
      title: 'Ordem de classificação',
      icon: <ArrowUpDown className="w-3.5 h-3.5 text-brand-600 shrink-0" />,
      value: sortValue,
      onChange: onSortChange,
      options: sortOptions,
      active: false
    },
    ...(groupOptions && onGroupChange && groupValue !== undefined
      ? [{
          key: 'group',
          title: 'Agrupar por',
          icon: <Layers className="w-3.5 h-3.5 text-slate-500 shrink-0" />,
          value: groupValue,
          onChange: onGroupChange,
          options: groupOptions,
          active: false
        }]
      : [])
  ];

  return (
    <div
      className={`flex sm:inline-flex flex-nowrap items-center h-9 w-full sm:w-auto max-w-full min-w-0 overflow-hidden bg-slate-50 border border-slate-200 rounded-lg divide-x divide-slate-200 shadow-2xs ${className}`}
    >
      {segments.map(seg => (
        <div
          key={seg.key}
          className={`relative flex flex-1 sm:flex-[0_1_auto] items-center gap-1 sm:gap-1.5 h-full min-w-0 pl-1.5 sm:pl-2 pr-3.5 sm:pr-5 transition-colors ${
            seg.active ? 'bg-blue-50/80' : ''
          }`}
          title={seg.title}
        >
          {seg.icon}
          <select
            value={seg.value}
            onChange={(e) => seg.onChange(e.target.value)}
            aria-label={seg.title}
            className={`appearance-none bg-transparent py-1 pr-3 -mr-3 sm:pr-4 sm:-mr-4 leading-normal w-full sm:w-auto max-w-full min-w-0 sm:max-w-[115px] xl:max-w-[130px] 2xl:max-w-[175px] truncate text-[11px] sm:text-xs font-bold outline-none cursor-pointer ${
              seg.active ? 'text-blue-900' : 'text-slate-800'
            }`}
          >
            {seg.options.map(opt => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <ChevronDown className={`w-3 h-3 absolute right-1 sm:right-1.5 top-1/2 -translate-y-1/2 pointer-events-none ${seg.active ? 'text-blue-500' : 'text-slate-400'}`} />
        </div>
      ))}
      {onResetFilters && (
        <button
          type="button"
          onClick={onResetFilters}
          disabled={!hasActiveFilters}
          title={hasActiveFilters ? 'Limpar filtros' : 'Limpar filtros (filtros no padrão)'}
          aria-label="Limpar filtros"
          className={`h-full px-2 flex items-center justify-center transition-colors shrink-0 ${
            hasActiveFilters
              ? 'text-rose-600 bg-rose-50/70 hover:text-rose-700 hover:bg-rose-100/80 cursor-pointer'
              : 'text-slate-400/70 cursor-not-allowed'
          }`}
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
};
