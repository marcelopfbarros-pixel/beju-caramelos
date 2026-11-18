import { MonthlyRevenueGoals, StoreUnit } from '../types';

export function getMonthYearKey(year: number, monthIndex0: number): string {
  return `${year}-${String(monthIndex0 + 1).padStart(2, '0')}`;
}

export function getUnitMonthGoalKey(unitId: string, year: number, monthIndex0: number): string {
  return `${unitId}::${getMonthYearKey(year, monthIndex0)}`;
}

/**
 * Resolves the revenue goal for a given unit (or 'all' consolidated across active units)
 * for a given year and 0-indexed month.
 * Falls back to legacy global 'YYYY-MM' keys when unitId === 'all' and no per-unit goals exist for that month.
 */
export function getMonthGoalForUnit(
  goals: MonthlyRevenueGoals,
  unitId: string,
  year: number,
  monthIndex0: number,
  activeUnits: StoreUnit[]
): number {
  const ym = getMonthYearKey(year, monthIndex0);
  if (unitId !== 'all') {
    return Number(goals[`${unitId}::${ym}`]) || 0;
  }

  let unitSum = 0;
  let hasAnyUnitGoal = false;
  for (const unit of activeUnits) {
    const key = `${unit.id}::${ym}`;
    if (key in goals) {
      hasAnyUnitGoal = true;
      unitSum += Number(goals[key]) || 0;
    }
  }

  if (hasAnyUnitGoal) {
    return unitSum;
  }
  return Number(goals[ym]) || 0;
}

export function getYearGoalForUnit(
  goals: MonthlyRevenueGoals,
  unitId: string,
  year: number,
  activeUnits: StoreUnit[]
): number {
  let total = 0;
  for (let m = 0; m < 12; m++) {
    total += getMonthGoalForUnit(goals, unitId, year, m, activeUnits);
  }
  return total;
}
