import { DeliveryShift, DeliveryType } from '../types';

/**
 * Utilities for handling delivery/pickup time windows and delivery shifts.
 * `dataHoraEntrega` stores the window start (`YYYY-MM-DDTHH:mm` or ISO),
 * `dataHoraEntregaFim` stores the window end (defaulting to +1 hour),
 * and `turnoEntrega` stores the shift (Manhã/Tarde/Noite) for DELIVERY orders.
 */

export const DELIVERY_SHIFT_CONFIG: Record<
  DeliveryShift,
  { label: string; start: string; end: string }
> = {
  MANHA: { label: 'Manhã', start: '09:00', end: '12:00' },
  TARDE: { label: 'Tarde', start: '13:00', end: '18:00' },
  NOITE: { label: 'Noite', start: '18:00', end: '21:00' },
};

export function inferDeliveryShiftFromDateTime(dateTimeStr?: string): DeliveryShift {
  if (!dateTimeStr) return 'TARDE';
  const parsed = new Date(dateTimeStr);
  if (Number.isNaN(parsed.getTime())) return 'TARDE';
  const h = parsed.getHours();
  if (h < 12) return 'MANHA';
  if (h < 18) return 'TARDE';
  return 'NOITE';
}

export function extractLocalDateYyyyMmDd(dateTimeStr?: string): string {
  const trimmed = (dateTimeStr ?? '').trim();
  if (!trimmed) return '';
  if (/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?)?$/.test(trimmed)) {
    return trimmed.slice(0, 10);
  }
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return '';
  return toLocalDateTimeString(parsed).slice(0, 10);
}

export function applyDeliveryShiftToDate(
  dateStr: string,
  shift: DeliveryShift
): { start: string; end: string } {
  const cleanDate =
    extractLocalDateYyyyMmDd(dateStr) || toLocalDateTimeString(new Date()).slice(0, 10);
  const cfg = DELIVERY_SHIFT_CONFIG[shift];
  return {
    start: `${cleanDate}T${cfg.start}`,
    end: `${cleanDate}T${cfg.end}`,
  };
}

export function toLocalDateTimeString(date: Date): string {
  const tzOffset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - tzOffset).toISOString().slice(0, 16);
}

export function addHoursToDateTime(dateTimeStr: string, hours = 1): string {
  if (!dateTimeStr) return '';
  const parsed = new Date(dateTimeStr);
  if (Number.isNaN(parsed.getTime())) return '';
  return toLocalDateTimeString(new Date(parsed.getTime() + hours * 3600000));
}

export function extractTimeHHmm(dateTimeStr?: string): string {
  const trimmed = (dateTimeStr ?? '').trim();
  if (!trimmed) return '';
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/.test(trimmed)) {
    return trimmed.slice(11, 16);
  }
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return '';
  const hh = String(parsed.getHours()).padStart(2, '0');
  const mm = String(parsed.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

export function combineDateWithTime(baseDateTimeStr: string, timeHHmm: string): string {
  if (!baseDateTimeStr || !/^\d{2}:\d{2}$/.test(timeHHmm)) return '';
  const datePart = extractLocalDateYyyyMmDd(baseDateTimeStr);
  if (!datePart) return '';
  return `${datePart}T${timeHHmm}`;
}

export function formatDeliveryTimeRange(
  start?: string,
  end?: string,
  options?: {
    includeDate?: boolean;
    separator?: string;
    turnoEntrega?: DeliveryShift;
    tipoEntrega?: DeliveryType;
  }
): string {
  if (!start) return 'A combinar';
  const startDate = new Date(start);
  if (Number.isNaN(startDate.getTime())) return 'A combinar';

  const resolvedShift =
    options?.turnoEntrega ||
    (options?.tipoEntrega === 'DELIVERY' ? inferDeliveryShiftFromDateTime(start) : undefined);
  const shiftLabel = resolvedShift ? DELIVERY_SHIFT_CONFIG[resolvedShift]?.label : undefined;

  let rangeText = shiftLabel || '';
  if (!rangeText) {
    const startTime = startDate.toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
    });

    const resolvedEnd = end || addHoursToDateTime(start, 1);
    const endDate = resolvedEnd ? new Date(resolvedEnd) : null;
    const endTime =
      endDate && !Number.isNaN(endDate.getTime())
        ? endDate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
        : '';

    const sep = options?.separator ?? ' às ';
    rangeText = endTime ? `${startTime}${sep}${endTime}` : startTime;
  }

  if (options?.includeDate === false) {
    return rangeText;
  }

  const dateText = startDate.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
  });

  return `${dateText} • ${rangeText}`;
}
