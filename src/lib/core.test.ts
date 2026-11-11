import { readFileSync } from 'node:fs';
import { importMfJournal } from './mfImport';
import { applyInferredTerms, reconcile } from './matching';
import { mergeImport } from './merge';
import { cashForecast, generateForecasts, monthlyPlan } from './forecast';
import { dueDate, fiscalYearStart } from './dates';
import { extractInvoiceNo, nameKey } from './names';
import { parseCsv } from './csv';
import type { AppData } from '../types';

const csv = readFileSync(new URL('./__fixtures__/journal.csv', import.meta.url), 'utf-8');
const empty = (): AppData => ({
  version: 1,
  customers: [],
  invoices: [],
  receipts: [],
  forecasts: [],
  settings: { fiscalStartMonth: 11, taxRate: 0.1, openingAR: {} },
});
const TODAY = '2026-03-15';
const load = () => mergeImport(empty(), importMfJournal(csv, []), TODAY);
const cid = (d: AppData, name: string) => d.customers.find((c) => c.name.includes(name))!.id;

describe('csv / names / dates', () => {
  test('quoted cells with commas and newlines', () => {
    expect(parseCsv('"a","b,c"\r\n"d ""e""","f\ng"\n')).toEqual([['a', 'b,c'], ['d "e"', 'f\ng']]);
  });
  test('name normalisation', () => {
    expect(nameKey('株式会社Ｈｉｎｏｄｅ　Ｌａｂｏ')).toBe(nameKey('株式会社 Hinode Labo'));
  });
  test('invoice number extraction', () => {
    expect(extractInvoiceNo('No.47 株式会社X')).toBe('47');
    expect(extractInvoiceNo('Hinode　請求書番号：40')).toBe('40');
    expect(extractInvoiceNo('11月分')).toBeNull();
  });
  test('due date / fiscal year', () => {
    expect(dueDate('2026-01-15', { monthOffset: 1, day: 31 })).toBe('2026-02-28');
    expect(dueDate('2025-11-30', { monthOffset: 2, day: 10 })).toBe('2026-01-10');
    expect(fiscalYearStart('2026-03', 11)).toBe('2025-11');
    expect(fiscalYearStart('2026-11', 11)).toBe('2026-11');
  });
});

describe('MF import', () => {
  const r = importMfJournal(csv, []);
  test('extracts sales, receipts and opening AR', () => {
    expect(r.invoices).toHaveLength(6);
    expect(r.receipts).toHaveLength(4); // 売掛金回収3件 + 即時入金1件
    expect(r.openingAR).toEqual({ month: '2025-11', amount: 500000 });
    expect(r.period).toEqual({ from: '2025-11-01', to: '2026-02-28' });
  });
  test('compound entry is grouped; net excludes tax', () => {
    const inv = r.invoices.find((i) => i.invoiceNo === '14')!;
    expect(inv.gross).toBe(1100000);
    expect(inv.net).toBe(1003000);
  });
  test('customer inferred from memo when partner is blank, new customer created otherwise', () => {
    const sample = r.newCustomers.find((c) => c.name === '株式会社サンプル商事')!;
    expect(r.invoices.find((i) => i.invoiceNo === '12')!.customerId).toBe(sample.id);
    expect(r.newCustomers.map((c) => c.name)).toContain('新規デザイン合同会社');
  });
  test('cash sale (not via AR) creates an immediate receipt', () => {
    expect(r.receipts.some((x) => x.manualInvoiceId === r.invoices.find((i) => i.invoiceNo === '15')!.id)).toBe(true);
  });
  test('warns on suspicious 1-yen invoice', () => {
    expect(r.warnings.some((w) => w.includes('No.15'))).toBe(true);
  });
});

describe('reconciliation', () => {
  const d = load();
  const L = reconcile(d, TODAY);
  const inv = (no: string) => L.invoices.find((i) => i.invoiceNo === no)!;

  test('receipt referencing unknown invoice no. is treated as opening balance', () => {
    const r = L.receipts.find((x) => x.date === '2025-11-10')!;
    expect(r.isOpening).toBe(true);
    expect(r.unallocated).toBe(0);
  });
  test('exact amount match', () => {
    expect(inv('10').status).toBe('paid');
    expect(inv('12').outstanding).toBe(110000);
  });
  test('partial payment by FIFO', () => {
    expect(inv('11').paid).toBe(100000);
    expect(inv('11').outstanding).toBe(120000);
  });
  test('payment terms inferred from history', () => {
    expect(d.customers.find((c) => c.id === cid(d, 'サンプル'))!.terms).toEqual({ monthOffset: 1, day: 31 });
  });
  test('manual allocation wins and opening flag can be overridden', () => {
    const rc = d.receipts.find((x) => x.date === '2025-12-31')!;
    const d2 = { ...d, receipts: d.receipts.map((x) => (x.id === rc.id ? { ...x, manualInvoiceId: inv('12').id } : x)) };
    const L2 = reconcile(d2, TODAY);
    expect(L2.invoices.find((i) => i.invoiceNo === '12')!.status).toBe('paid');
    expect(L2.invoices.find((i) => i.invoiceNo === '10')!.outstanding).toBe(330000);
  });
});

describe('re-import', () => {
  test('is idempotent and keeps manual edits', () => {
    const d = load();
    const target = d.invoices.find((i) => i.invoiceNo === '11')!;
    const edited = { ...d, invoices: d.invoices.map((i) => (i.id === target.id ? { ...i, dueDateOverride: '2026-04-30' } : i)) };
    const again = mergeImport(edited, importMfJournal(csv, edited.customers), TODAY);
    expect(again.invoices).toHaveLength(d.invoices.length);
    expect(again.receipts).toHaveLength(d.receipts.length);
    expect(again.customers).toHaveLength(d.customers.length);
    expect(again.invoices.find((i) => i.id === target.id)!.dueDateOverride).toBe('2026-04-30');
  });
});

describe('forecast', () => {
  test('generate from last year, plan and cash forecast', () => {
    const d = load();
    d.customers = applyInferredTerms(d, TODAY);
    d.forecasts = generateForecasts(d, '2026-11', 'lastYear', '2026-11');
    const line = d.forecasts.find((l) => l.customerId === cid(d, 'サンプル'))!;
    expect(line.amounts['2026-11']).toBe(300000);
    expect(line.amounts['2026-12']).toBe(100000);

    const plan = monthlyPlan(d, '2026-11', '2026-11');
    expect(plan[0].forecast).toBe(500000); // サンプル 300,000 + テスト 200,000
    expect(plan[0].landing).toBe(500000);

    const cash = cashForecast(d, reconcile(d, '2026-11-01'), '2026-11', 3);
    // 11月売上予測 → 翌月末入金（税込）
    expect(cash.months[1].fromForecast).toBeGreaterThanOrEqual(330000);
  });
  test('probability weights forecast', () => {
    const d = load();
    d.forecasts = [{ id: 'x', label: '新規', customerId: null, probability: 50, amounts: { '2026-12': 1000000 }, note: '' }];
    expect(monthlyPlan(d, '2026-11', '2026-11')[1].forecast).toBe(500000);
  });
});
