import type { AppData, Invoice, Receipt } from '../types';
import type { ImportResult } from './mfImport';
import { applyInferredTerms } from './matching';

/**
 * 取込結果を既存データにマージする。
 * - 同じID（MFの取引No）の行は更新。ただし手動で設定した項目（取引先・消込先・期日など）は保持
 * - 取込期間内で今回のCSVに存在しないMF由来の行は削除（MF側で削除された仕訳）
 */
export function mergeImport(data: AppData, r: ImportResult, today: string): AppData {
  const inPeriod = (d: string) => !r.period || (d >= r.period.from && d <= r.period.to);

  const oldInv = new Map(data.invoices.map((i) => [i.id, i]));
  const newInvIds = new Set(r.invoices.map((i) => i.id));
  const invoices: Invoice[] = [
    ...data.invoices.filter((i) => (i.source !== 'mf' || !inPeriod(i.date)) && !newInvIds.has(i.id)),
    ...r.invoices.map((i) => {
      const o = oldInv.get(i.id);
      return o ? { ...i, customerId: o.customerId ?? i.customerId, dueDateOverride: o.dueDateOverride } : i;
    }),
  ];

  const oldRc = new Map(data.receipts.map((x) => [x.id, x]));
  const newRcIds = new Set(r.receipts.map((x) => x.id));
  const receipts: Receipt[] = [
    ...data.receipts.filter((x) => (x.source !== 'mf' || !inPeriod(x.date)) && !newRcIds.has(x.id)),
    ...r.receipts.map((x) => {
      const o = oldRc.get(x.id);
      return o
        ? {
            ...x,
            customerId: o.customerId ?? x.customerId,
            manualInvoiceId: o.manualInvoiceId ?? x.manualInvoiceId,
            openingBalance: o.openingBalance ?? x.openingBalance,
          }
        : x;
    }),
  ];

  const settings = { ...data.settings, openingAR: { ...data.settings.openingAR } };
  if (r.openingAR) settings.openingAR[r.openingAR.month] = r.openingAR.amount;

  const next: AppData = {
    ...data,
    customers: [...data.customers, ...r.newCustomers.filter((c) => !data.customers.some((d) => d.id === c.id))],
    invoices,
    receipts,
    settings,
  };
  return { ...next, customers: applyInferredTerms(next, today) };
}
