const numberFormatter = new Intl.NumberFormat("ja-JP");
const decimalFormatter = new Intl.NumberFormat("ja-JP", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

export function formatNumber(value: number): string {
  return numberFormatter.format(value);
}

export function formatDecimal(value: number): string {
  return decimalFormatter.format(value);
}

export function formatPopulation(value: number): string {
  if (value >= 10000) {
    return `${numberFormatter.format(Math.round(value / 10000))}万人`;
  }
  return `${numberFormatter.format(value)}人`;
}

interface TimeBreakdown {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

export function secondsToBreakdown(totalSeconds: number): TimeBreakdown {
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);
  return { days, hours, minutes, seconds };
}

export function formatTimeHMS(hours: number, minutes: number, seconds: number): string {
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function formatPercentage(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

/** 今日から days 日後の日付を "YYYY/MM/DD" 形式で返す */
export function formatDepletionDate(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + Math.floor(days));
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}/${m}/${d}`;
}
