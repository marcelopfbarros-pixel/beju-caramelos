import React from 'react';
import { Calendar, Filter, ArrowUpDown, Layers, ChevronDown } from 'lucide-react';

export interface SelectOption {
  value: string;
  label: string;
}

interface HybridFilterSortProps {
  dateLabel?: string;
  dateValue?: string;
  onDateChange?: (value: string) => void;
  dateOptions?: SelectOption[];
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
  dateLabel = 'Data:',
  dateValue,
  onDateChange,
  dateOptions,
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
  const segments = [
    ...(dateOptions && onDateChange && dateValue !== undefined
      ? [{
          key: 'date',
          title: dateLabel,
          icon: <Calendar className="w-3.5 h-3.5 text-slate-500 shrink-0" />,
          value: dateValue,
          onChange: onDateChange,
          options: dateOptions
        }]
      : []),
    {
      key: 'filter',
      title: filterLabel,
      icon: <Filter className="w-3.5 h-3.5 text-slate-500 shrink-0" />,
      value: filterValue,
      onChange: onFilterChange,
      options: filterOptions
    },
    {
      key: 'sort',
      title: 'Ordem de classificação',
      icon: <ArrowUpDown className="w-3.5 h-3.5 text-brand-600 shrink-0" />,
      value: sortValue,
      onChange: onSortChange,
      options: sortOptions
    },
    ...(groupOptions && onGroupChange && groupValue !== undefined
      ? [{
          key: 'group',
          title: 'Agrupar por',
          icon: <Layers className="w-3.5 h-3.5 text-slate-500 shrink-0" />,
          value: groupValue,
          onChange: onGroupChange,
          options: groupOptions
        }]
      : [])
  ];

  return (
    <div
      className={`flex sm:inline-flex flex-nowrap items-center h-9 w-full sm:w-auto max-w-full overflow-hidden bg-slate-50 border border-slate-200 rounded-lg divide-x divide-slate-200 shadow-2xs sm:shrink-0 ${className}`}
    >
      {segments.map(seg => (
        <div key={seg.key} className="relative flex flex-1 sm:flex-initial items-center gap-1 sm:gap-1.5 h-full min-w-0 pl-1.5 sm:pl-2.5 pr-3.5 sm:pr-6 sm:shrink-0" title={seg.title}>
          {seg.icon}
          <select
            value={seg.value}
            onChange={(e) => seg.onChange(e.target.value)}
            aria-label={seg.title}
            className="appearance-none bg-transparent py-1 pr-3 -mr-3 sm:pr-4 sm:-mr-4 leading-normal w-full sm:w-auto min-w-0 sm:max-w-[115px] xl:max-w-[140px] 2xl:max-w-none truncate text-[11px] sm:text-xs font-bold text-slate-800 outline-none cursor-pointer"
          >
            {seg.options.map(opt => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <ChevronDown className="w-3 h-3 text-slate-400 absolute right-1 sm:right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
        </div>
      ))}
    </div>
  );
};
