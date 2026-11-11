import type { AppData, BudgetLine, MonthStr } from '../types';
import { addMonths, fiscalMonths, monthOf } from './dates';
import { weighted } from './forecast';
import { newId } from './mfImport';

export type BudgetSource = 'prevActual' | 'forecast';

export const BUDGET_SOURCE_LABELS: Record<BudgetSource, string> = {
  prevActual: '前期実績',
  forecast: '現在の売上予測',
};

/**
 * 予算のたたき台を作成する。
 * - prevActual: 取引先ごとの前年同月実績 ×（1 + 成長率）
 * - forecast  : 予測ラインの加重額 ×（1 + 成長率）
 * 対象期の既存予算は置き換える（他の期の予算は保持）。
 */
export function generateBudget(data: AppData, fyStart: MonthStr, source: BudgetSource, growthPct: number): BudgetLine[] {
  const months = fiscalMonths(fyStart);
  const mul = 1 + growthPct / 100;
  const round = (v: number) => Math.round((v * mul) / 1000) * 1000;
  const lines = new Map<string, BudgetLine>();
  const lineFor = (key: string, label: string, customerId: string | null) => {
    let l = lines.get(key);
    if (!l) {
      l = { id: newId('bg'), label, customerId, amounts: {}, note: '' };
      lines.set(key, l);
    }
    return l;
  };

  if (source === 'prevActual') {
    for (const inv of data.invoices) {
      const m = addMonths(monthOf(inv.date), 12);
      if (!months.includes(m)) continue;
      const c = data.customers.find((x) => x.id === inv.customerId);
      const l = lineFor(inv.customerId ?? '_', c?.name ?? '取引先未設定', inv.customerId);
      l.amounts[m] = (l.amounts[m] ?? 0) + inv.net;
    }
  } else {
    for (const f of data.forecasts) {
      const l = lineFor(f.customerId ?? `label:${f.label}`, f.label, f.customerId);
      for (const m of months) {
        const v = weighted(f, m);
        if (v) l.amounts[m] = (l.amounts[m] ?? 0) + v;
      }
    }
  }
  for (const l of lines.values()) {
    for (const m of Object.keys(l.amounts)) {
      l.amounts[m] = round(l.amounts[m]);
      if (!l.amounts[m]) delete l.amounts[m];
    }
  }

  // 対象期の金額だけ差し替え、他の期の金額は残す
  const kept = (data.budgets ?? [])
    .map((b) => ({ ...b, amounts: Object.fromEntries(Object.entries(b.amounts).filter(([m]) => !months.includes(m))) }))
    .filter((b) => Object.keys(b.amounts).length > 0);
  for (const nl of lines.values()) {
    if (!Object.keys(nl.amounts).length) continue;
    const same = kept.find((b) => (nl.customerId ? b.customerId === nl.customerId : !b.customerId && b.label === nl.label));
    if (same) same.amounts = { ...same.amounts, ...nl.amounts };
    else kept.push(nl);
  }
  return kept;
}

export interface CompareRow {
  key: string;
  label: string;
  budget: number;
  /** 経過月までの予算 */
  budgetToDate: number;
  actualToDate: number;
  forecast: number;
  landing: number;
}

/** 取引先（または予算・予測の区分）ごとの 予算・予測・実績・着地見込 */
export function compareByCustomer(data: AppData, fyStart: MonthStr, currentMonth: MonthStr): CompareRow[] {
  const months = fiscalMonths(fyStart);
  const name = (id: string) => data.customers.find((c) => c.id === id)?.name ?? '（不明）';
  const rows = new Map<string, { label: string; budget: number[]; actual: number[]; forecast: number[] }>();
  const row = (customerId: string | null, label: string) => {
    const key = customerId ?? `label:${label}`;
    let r = rows.get(key);
    if (!r) {
      r = { label: customerId ? name(customerId) : label, budget: Array(12).fill(0), actual: Array(12).fill(0), forecast: Array(12).fill(0) };
      rows.set(key, r);
    }
    return r;
  };

  for (const b of data.budgets ?? [])
    months.forEach((m, i) => {
      if (b.amounts[m]) row(b.customerId, b.label).budget[i] += b.amounts[m];
    });
  for (const f of data.forecasts)
    months.forEach((m, i) => {
      const v = weighted(f, m);
      if (v) row(f.customerId, f.label).forecast[i] += v;
    });
  for (const inv of data.invoices) {
    const i = months.indexOf(monthOf(inv.date));
    if (i >= 0) row(inv.customerId, '取引先未設定').actual[i] += inv.net;
  }

  const sum = (a: number[]) => a.reduce((s, v) => s + v, 0);
  return [...rows.entries()]
    .map(([key, r]) => {
      const past = months.map((m) => m < currentMonth);
      return {
        key,
        label: r.label,
        budget: sum(r.budget),
        budgetToDate: sum(r.budget.filter((_, i) => past[i])),
        actualToDate: sum(r.actual.filter((_, i) => past[i])),
        forecast: sum(r.forecast),
        landing: sum(months.map((_, i) => (past[i] ? r.actual[i] : Math.max(r.actual[i], r.forecast[i])))),
      };
    })
    .filter((r) => r.budget || r.actualToDate || r.forecast || r.landing)
    .sort((a, b) => b.budget - a.budget || b.landing - a.landing);
}
