/**
 * Данные о фазах обучения (кривая забывания)
 */
const hours = 60 * 60 * 1000;
const days = 24 * hours;

export const PHASES = [
  [0, 6 * hours],
  [12 * hours, 12 * hours],
  [1 * days, 12 * hours],
  [1 * days, 12 * hours],
  [2 * days, 12 * hours],
  [3 * days, 12 * hours],
  [5 * days, 1 * days],
  [8 * days, 1 * days],
  [13 * days, 2 * days],
  [21 * days, 2 * days],
  [34 * days, 2 * days],
  [55 * days, 3 * days],
  [89 * days, 3 * days],
  [144 * days, 7 * days],
  [233 * days, 30 * days],
];

export const PHASE_TEXTS = [
  ['Первичное усвоение', 'Выполнение заданий для фиксации'],
  ['Закрепление', 'Проверка активного удержания'],
  ['Уточнение', 'Углубление понимания и устранение ошибок'],
  ['Структуризация', 'Способность применять знание, начинает строиться логика'],
  ['Связи', 'Способность соединять знание с другим контекстом, расширение нейронных связей'],
  ['Углубление', 'Повтор на грани забывания, усиление извлечения и укрепление памяти'],
  ['Оперирование', 'Применение знания из памяти, без опоры на материалы'],
  ['Автоматизация I', 'Выполнение задания быстрее, проверка интуитивного извлечения'],
  ['Автоматизация II', 'Работа почти без осознанного усилия'],
  ['Консолидация', 'Использование знания в практических задачах'],
  ['Перенос', 'Применение знания в новых/смешанных контекстах'],
  ['Интеграция', 'Знание стало частью системы мышления'],
  ['Лёгкий вызов', 'Мгновенное извлечение с уверенным результатом'],
  ['Рефлексия', 'Возможность объяснить, применить и обобщить знание'],
  ['Устойчивость', 'Знание стало неотъемлемой частью основного набора навыков'],
  ['Архив', 'Минимальная поддержка для пожизненного хранения'],
];

export function getDates(phIndex: number) {
  const now = new Date();
  const [start, expiry] = PHASES[phIndex];
  return [
    new Date(now.getTime() + start).toISOString(),
    new Date(now.getTime() + start + expiry).toISOString(),
  ];
}

export function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const totalMinutes = Math.floor(totalSeconds / 60);
  const totalHours = Math.floor(totalMinutes / 60);
  const days = Math.floor(totalHours / 24);

  const hours = totalHours % 24;
  const minutes = totalMinutes % 60;

  if (days > 0) {
    return `${days}д ${hours}ч`;
  }
  if (hours > 0) {
    return `${hours}ч ${minutes}м`;
  }
  return `${minutes}м`;
}

export function getLessonStatusText(startDateStr: string, expiryDateStr: string) {
  const now = Date.now();
  const start = new Date(startDateStr).getTime();
  const expiry = new Date(expiryDateStr).getTime();

  if (now < start) {
    const diff = start - now;
    return {
      status: 'pending' as const,
      text: `Доступно через ${formatDuration(diff)}`,
      color: 'text-[#878568]',
      bg: 'bg-[#a3a289]/10',
    };
  } else if (now >= start && now <= expiry) {
    const diff = expiry - now;
    return {
      status: 'active' as const,
      text: `Повторить: ${formatDuration(diff)}`,
      color: 'text-emerald-800 font-bold',
      bg: 'bg-emerald-100/60 border border-emerald-200/50',
    };
  } else {
    return {
      status: 'expired' as const,
      text: 'Просрочено (пройдите ещё раз)',
      color: 'text-amber-800 font-bold',
      bg: 'bg-amber-100/60 border border-amber-200/50',
    };
  }
}
