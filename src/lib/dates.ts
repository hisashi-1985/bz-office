import type { DateStr, MonthStr, PaymentTerms } from '../types';

export const pad = (n: number) => String(n).padStart(2, '0');

export function todayStr(): DateStr {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** '2025/11/01' → '2025-11-01' */
export function normalizeDate(s: string): DateStr {
  const m = s.trim().match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);
  if (!m) throw new Error(`日付を解釈できません: ${s}`);
  return `${m[1]}-${pad(+m[2])}-${pad(+m[3])}`;
}

export const monthOf = (d: DateStr): MonthStr => d.slice(0, 7);

export function addMonths(month: MonthStr, n: number): MonthStr {
  const [y, m] = month.split('-').map(Number);
  const idx = y * 12 + (m - 1) + n;
  return `${Math.floor(idx / 12)}-${pad((idx % 12) + 1)}`;
}

export function monthDiff(from: MonthStr, to: MonthStr): number {
  const [y1, m1] = from.split('-').map(Number);
  const [y2, m2] = to.split('-').map(Number);
  return (y2 - y1) * 12 + (m2 - m1);
}

export function daysInMonth(month: MonthStr): number {
  const [y, m] = month.split('-').map(Number);
  return new Date(y, m, 0).getDate();
}

/** 期首月を返す（例: 期首11月, 2026-03 → 2025-11） */
export function fiscalYearStart(month: MonthStr, startMonth: number): MonthStr {
  const [y, m] = month.split('-').map(Number);
  const year = m >= startMonth ? y : y - 1;
  return `${year}-${pad(startMonth)}`;
}

export function fiscalMonths(fyStart: MonthStr): MonthStr[] {
  return Array.from({ length: 12 }, (_, i) => addMonths(fyStart, i));
}

/** 期の表示名（終了月の年で「2026年10月期」） */
export function fiscalLabel(fyStart: MonthStr): string {
  const end = addMonths(fyStart, 11);
  const [y, m] = end.split('-').map(Number);
  return `${y}年${m}月期`;
}

export function dueDate(invoiceDate: DateStr, terms: PaymentTerms): DateStr {
  const month = addMonths(monthOf(invoiceDate), terms.monthOffset);
  const day = Math.min(terms.day, daysInMonth(month));
  return `${month}-${pad(day)}`;
}

export function termsLabel(t: PaymentTerms | null): string {
  if (!t) return '未設定';
  const mo = ['当月', '翌月', '翌々月'][t.monthOffset] ?? `${t.monthOffset}ヶ月後`;
  return `${mo}${t.day >= 31 ? '末' : `${t.day}日`}`;
}

export const monthLabel = (m: MonthStr) => `${+m.slice(5, 7)}月`;
