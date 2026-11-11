import type { AppData, ForecastLine, MonthStr, PaymentTerms } from '../types';
import { addMonths, dueDate, fiscalMonths, monthOf } from './dates';
import { newId } from './mfImport';
import type { Ledger } from './matching';

export const DEFAULT_TERMS: PaymentTerms = { monthOffset: 1, day: 31 };

/** 取引先別・月別の売上実績（税抜） */
export function actualsByCustomer(data: AppData): Map<string, Map<MonthStr, number>> {
  const map = new Map<string, Map<MonthStr, number>>();
  for (const inv of data.invoices) {
    const key = inv.customerId ?? '_unknown';
    const m = map.get(key) ?? new Map<MonthStr, number>();
    const mo = monthOf(inv.date);
    m.set(mo, (m.get(mo) ?? 0) + inv.net);
    map.set(key, m);
  }
  return map;
}

export const weighted = (line: ForecastLine, month: MonthStr) =>
  Math.round(((line.amounts[month] ?? 0) * line.probability) / 100);

export interface MonthPlan {
  month: MonthStr;
  budget: number;
  actual: number;
  forecast: number;
  /** 着地見込：経過月は実績、当月以降は max(実績, 予測) */
  landing: number;
  isPast: boolean;
}

export function monthlyPlan(data: AppData, fyStart: MonthStr, currentMonth: MonthStr): MonthPlan[] {
  return fiscalMonths(fyStart).map((month) => {
    const actual = data.invoices.filter((i) => monthOf(i.date) === month).reduce((s, i) => s + i.net, 0);
    const forecast = data.forecasts.reduce((s, l) => s + weighted(l, month), 0);
    const budget = (data.budgets ?? []).reduce((s, l) => s + (l.amounts[month] ?? 0), 0);
    const isPast = month < currentMonth;
    return { month, budget, actual, forecast, landing: isPast ? actual : Math.max(actual, forecast), isPast };
  });
}

export type GenerateMethod = 'lastYear' | 'recent3' | 'lastMonth';

export const GENERATE_LABELS: Record<GenerateMethod, string> = {
  lastYear: '前年同月の実績',
  recent3: '直近3ヶ月の平均',
  lastMonth: '直近月の実績',
};

/** 実績から予測ラインを生成（既存ラインのある取引先は月額を上書き） */
export function generateForecasts(
  data: AppData,
  fyStart: MonthStr,
  method: GenerateMethod,
  baseMonth: MonthStr,
): ForecastLine[] {
  const actuals = actualsByCustomer(data);
  const months = fiscalMonths(fyStart);
  const lines = [...data.forecasts];

  for (const c of data.customers) {
    const a = actuals.get(c.id);
    if (!a) continue;
    const amounts: Record<MonthStr, number> = {};
    for (const m of months) {
      let v = 0;
      if (method === 'lastYear') v = a.get(addMonths(m, -12)) ?? 0;
      else if (method === 'lastMonth') v = a.get(addMonths(baseMonth, -1)) ?? 0;
      else v = Math.round([1, 2, 3].reduce((s, k) => s + (a.get(addMonths(baseMonth, -k)) ?? 0), 0) / 3);
      if (v) amounts[m] = v;
    }
    if (!Object.keys(amounts).length) continue;
    const idx = lines.findIndex((l) => l.customerId === c.id);
    if (idx >= 0) lines[idx] = { ...lines[idx], amounts: { ...lines[idx].amounts, ...amounts } };
    else
      lines.push({ id: newId('fc'), label: c.name, customerId: c.id, probability: 100, amounts, note: '' });
  }
  return lines;
}

export interface CashMonth {
  month: MonthStr;
  /** 既存請求の入金予定（税込） */
  fromInvoices: number;
  /** 予測売上からの入金見込（税込） */
  fromForecast: number;
  total: number;
}

/**
 * 入金予定（キャッシュイン見込）
 * - 未回収の請求：期日月に計上（期日超過分は当月に計上）
 * - 当月以降の予測：未請求分 max(0, 予測-実績) を税込換算し、取引先の支払サイトで入金月へずらす
 */
export function cashForecast(
  data: AppData,
  ledger: Ledger,
  currentMonth: MonthStr,
  months: number,
): { months: CashMonth[]; overdue: number } {
  const range = Array.from({ length: months }, (_, i) => addMonths(currentMonth, i));
  const result = new Map(range.map((m) => [m, { month: m, fromInvoices: 0, fromForecast: 0, total: 0 }]));
  let overdue = 0;

  for (const inv of ledger.invoices) {
    if (inv.outstanding <= 0) continue;
    const terms = data.customers.find((c) => c.id === inv.customerId)?.terms ?? DEFAULT_TERMS;
    const due = inv.due ?? dueDate(inv.date, terms);
    let m = monthOf(due);
    if (m < currentMonth) {
      overdue += inv.outstanding;
      m = currentMonth;
    }
    const slot = result.get(m);
    if (slot) slot.fromInvoices += inv.outstanding;
  }

  const actuals = actualsByCustomer(data);
  const taxMul = 1 + data.settings.taxRate;
  for (const line of data.forecasts) {
    const terms = data.customers.find((c) => c.id === line.customerId)?.terms ?? DEFAULT_TERMS;
    for (const m of Object.keys(line.amounts)) {
      if (m < currentMonth) continue;
      const already = line.customerId ? actuals.get(line.customerId)?.get(m) ?? 0 : 0;
      const rest = Math.max(0, weighted(line, m) - already);
      if (!rest) continue;
      const payMonth = monthOf(dueDate(`${m}-01`, terms));
      const slot = result.get(payMonth);
      if (slot) slot.fromForecast += Math.round(rest * taxMul);
    }
  }
  for (const s of result.values()) s.total = s.fromInvoices + s.fromForecast;
  return { months: [...result.values()], overdue };
}
