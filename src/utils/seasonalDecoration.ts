export interface SeasonalDecoration {
  id: string;
  label: string;
  icons: [string, string];
  badgeClass: string;
  textGradientClass: string;
  dotColorClass: string;
  blinkEvery10Min?: boolean;
}

/**
 * Computes Gregorian Easter Sunday for a given year (Meeus/Jones/Butcher algorithm).
 */
function getEasterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31); // 3 = March, 4 = April
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  result.setDate(result.getDate() + days);
  return result;
}

function isSameOrBetween(target: Date, start: Date, end: Date): boolean {
  const t = new Date(target.getFullYear(), target.getMonth(), target.getDate()).getTime();
  const s = new Date(start.getFullYear(), start.getMonth(), start.getDate()).getTime();
  const e = new Date(end.getFullYear(), end.getMonth(), end.getDate()).getTime();
  return t >= s && t <= e;
}

/**
 * Returns a small colorful seasonal decoration for the Beju Caramelos brand
 * based on Brazilian holidays and seasons of the year.
 */
export function getSeasonalDecoration(date: Date = new Date(), userName?: string): SeasonalDecoration {
  const year = date.getFullYear();
  const month = date.getMonth() + 1; // 1-12
  const day = date.getDate();

  const normalizedUser = (userName || '').trim().toLowerCase();
  const isJulianaAbib = normalizedUser.includes('juliana') && normalizedUser.includes('abib');

  // Datas especiais exclusivas para Juliana Abib
  if (isJulianaAbib && month === 1 && day === 23) {
    return {
      id: 'aniversario-casamento',
      label: 'Feliz Aniversário de Casamento. Te Amo!',
      icons: ['💍', '❤️'],
      badgeClass: 'bg-red-100 border-red-400 text-red-700',
      textGradientClass: 'bg-gradient-to-r from-red-600 via-rose-600 to-red-500 bg-clip-text text-transparent',
      dotColorClass: 'bg-red-500',
      blinkEvery10Min: true,
    };
  }

  if (isJulianaAbib && month === 6 && day === 20) {
    return {
      id: 'aniversario-juliana',
      label: 'Feliz Aniversário! Te Amo!',
      icons: ['🎂', '💙'],
      badgeClass: 'bg-blue-100 border-blue-400 text-blue-700',
      textGradientClass: 'bg-gradient-to-r from-blue-600 via-sky-600 to-indigo-600 bg-clip-text text-transparent',
      dotColorClass: 'bg-blue-500',
      blinkEvery10Min: true,
    };
  }

  // Ano Novo: Dec 26 - Jan 6
  if ((month === 12 && day >= 26) || (month === 1 && day <= 6)) {
    return {
      id: 'ano-novo',
      label: 'Ano Novo',
      icons: ['✨', '🎆'],
      badgeClass: 'bg-gradient-to-r from-amber-100 via-yellow-100 to-indigo-100 border-amber-300 text-amber-800',
      textGradientClass: 'bg-gradient-to-r from-amber-600 via-rose-500 to-indigo-600 bg-clip-text text-transparent',
      dotColorClass: 'bg-amber-400',
    };
  }

  // Natal: Dec 1 - Dec 25
  if (month === 12 && day <= 25) {
    return {
      id: 'natal',
      label: 'Natal',
      icons: ['🎄', '🎁'],
      badgeClass: 'bg-gradient-to-r from-emerald-100 via-red-100 to-amber-100 border-emerald-300 text-emerald-800',
      textGradientClass: 'bg-gradient-to-r from-red-600 via-emerald-600 to-amber-600 bg-clip-text text-transparent',
      dotColorClass: 'bg-red-500',
    };
  }

  // Movable holidays (Carnaval & Páscoa)
  const easter = getEasterSunday(year);
  const carnavalStart = addDays(easter, -56);
  const carnavalEnd = addDays(easter, -46); // Ash Wednesday
  if (isSameOrBetween(date, carnavalStart, carnavalEnd)) {
    return {
      id: 'carnaval',
      label: 'Carnaval',
      icons: ['🎭', '🎉'],
      badgeClass: 'bg-gradient-to-r from-fuchsia-100 via-amber-100 to-cyan-100 border-fuchsia-300 text-fuchsia-800',
      textGradientClass: 'bg-gradient-to-r from-fuchsia-600 via-amber-500 to-cyan-600 bg-clip-text text-transparent',
      dotColorClass: 'bg-fuchsia-500',
    };
  }

  const easterStart = addDays(easter, -14);
  const easterEnd = addDays(easter, 1);
  if (isSameOrBetween(date, easterStart, easterEnd)) {
    return {
      id: 'pascoa',
      label: 'Páscoa',
      icons: ['🐣', '🍫'],
      badgeClass: 'bg-gradient-to-r from-violet-100 via-pink-100 to-amber-100 border-violet-300 text-violet-800',
      textGradientClass: 'bg-gradient-to-r from-violet-600 via-pink-500 to-amber-600 bg-clip-text text-transparent',
      dotColorClass: 'bg-violet-500',
    };
  }

  // Mês das Mães: May
  if (month === 5) {
    return {
      id: 'mes-das-maes',
      label: 'Mês das Mães',
      icons: ['💐', '💖'],
      badgeClass: 'bg-gradient-to-r from-rose-100 via-pink-100 to-emerald-100 border-rose-300 text-rose-800',
      textGradientClass: 'bg-gradient-to-r from-rose-600 via-pink-500 to-fuchsia-600 bg-clip-text text-transparent',
      dotColorClass: 'bg-rose-500',
    };
  }

  // São João / Festas Juninas: June
  if (month === 6) {
    return {
      id: 'sao-joao',
      label: 'São João',
      icons: ['🌽', '🔥'],
      badgeClass: 'bg-gradient-to-r from-orange-100 via-amber-100 to-red-100 border-orange-300 text-orange-800',
      textGradientClass: 'bg-gradient-to-r from-orange-600 via-amber-500 to-red-600 bg-clip-text text-transparent',
      dotColorClass: 'bg-orange-500',
    };
  }

  // Mês dos Pais: August
  if (month === 8) {
    return {
      id: 'mes-dos-pais',
      label: 'Mês dos Pais',
      icons: ['👔', '💙'],
      badgeClass: 'bg-gradient-to-r from-sky-100 via-blue-100 to-indigo-100 border-sky-300 text-sky-800',
      textGradientClass: 'bg-gradient-to-r from-sky-600 via-blue-600 to-indigo-600 bg-clip-text text-transparent',
      dotColorClass: 'bg-sky-500',
    };
  }

  // Mês das Crianças: Oct 1 - Oct 24
  if (month === 10 && day <= 24) {
    return {
      id: 'mes-das-criancas',
      label: 'Mês das Crianças',
      icons: ['🎈', '🍭'],
      badgeClass: 'bg-gradient-to-r from-sky-100 via-amber-100 to-rose-100 border-sky-300 text-sky-800',
      textGradientClass: 'bg-gradient-to-r from-sky-500 via-amber-500 to-rose-500 bg-clip-text text-transparent',
      dotColorClass: 'bg-rose-400',
    };
  }

  // Halloween: Oct 25 - Nov 2
  if ((month === 10 && day >= 25) || (month === 11 && day <= 2)) {
    return {
      id: 'halloween',
      label: 'Halloween',
      icons: ['🎃', '✨'],
      badgeClass: 'bg-gradient-to-r from-orange-100 via-purple-100 to-amber-100 border-orange-300 text-orange-800',
      textGradientClass: 'bg-gradient-to-r from-orange-600 via-purple-600 to-amber-600 bg-clip-text text-transparent',
      dotColorClass: 'bg-orange-500',
    };
  }

  // Astronomical Brazilian Seasons fallback
  // Verão: Dec 21 - Mar 19
  if ((month === 12 && day >= 21) || month === 1 || month === 2 || (month === 3 && day <= 19)) {
    return {
      id: 'verao',
      label: 'Verão',
      icons: ['☀️', '🌴'],
      badgeClass: 'bg-gradient-to-r from-amber-100 via-yellow-100 to-cyan-100 border-amber-300 text-amber-800',
      textGradientClass: 'bg-gradient-to-r from-amber-500 via-orange-500 to-cyan-600 bg-clip-text text-transparent',
      dotColorClass: 'bg-amber-400',
    };
  }

  // Outono: Mar 20 - Jun 20
  if ((month === 3 && day >= 20) || month === 4 || month === 5 || (month === 6 && day <= 20)) {
    return {
      id: 'outono',
      label: 'Outono',
      icons: ['🍂', '🍯'],
      badgeClass: 'bg-gradient-to-r from-amber-100 via-orange-100 to-rose-100 border-amber-300 text-amber-900',
      textGradientClass: 'bg-gradient-to-r from-amber-600 via-orange-600 to-rose-600 bg-clip-text text-transparent',
      dotColorClass: 'bg-amber-500',
    };
  }

  // Inverno: Jun 21 - Sep 21
  if ((month === 6 && day >= 21) || month === 7 || month === 8 || (month === 9 && day <= 21)) {
    return {
      id: 'inverno',
      label: 'Inverno',
      icons: ['❄️', '☕'],
      badgeClass: 'bg-gradient-to-r from-sky-100 via-cyan-100 to-indigo-100 border-sky-300 text-sky-800',
      textGradientClass: 'bg-gradient-to-r from-sky-600 via-cyan-600 to-indigo-600 bg-clip-text text-transparent',
      dotColorClass: 'bg-sky-400',
    };
  }

  // Primavera: Sep 22 - Nov 30
  return {
    id: 'primavera',
    label: 'Primavera',
    icons: ['🌸', '🦋'],
    badgeClass: 'bg-gradient-to-r from-pink-100 via-emerald-100 to-violet-100 border-pink-300 text-pink-800',
    textGradientClass: 'bg-gradient-to-r from-pink-600 via-emerald-600 to-violet-600 bg-clip-text text-transparent',
    dotColorClass: 'bg-pink-500',
  };
}
