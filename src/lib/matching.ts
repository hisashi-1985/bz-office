import type { AppData, Customer, DateStr, Invoice, PaymentTerms, Receipt } from '../types';
import { dueDate, monthDiff, monthOf } from './dates';

export type MatchMethod = 'manual' | 'invoiceNo' | 'amount' | 'fifo';

export interface Allocation {
  receiptId: string;
  invoiceId: string;
  amount: number;
  method: MatchMethod;
}

export type InvoiceStatus = 'paid' | 'partial' | 'open' | 'overdue';

export interface InvoiceView extends Invoice {
  paid: number;
  outstanding: number;
  due: DateStr | null;
  status: InvoiceStatus;
  lastPaidDate: DateStr | null;
}

export interface ReceiptView extends Receipt {
  allocated: number;
  unallocated: number;
  allocations: Allocation[];
  /** 期首売掛金の回収と判定されたか */
  isOpening: boolean;
}

export interface Ledger {
  invoices: InvoiceView[];
  receipts: ReceiptView[];
  allocations: Allocation[];
  invoiceById: Map<string, InvoiceView>;
}

/**
 * 入金を請求に消し込む。
 * 優先順位: 手動指定 → 請求書番号一致 → 残高と同額の請求 → 古い順（FIFO）
 * 対象は入金日以前に計上された請求（番号・同額照合は同月内の請求まで許容）。
 */
export function reconcile(data: AppData, today: DateStr): Ledger {
  const customerById = new Map(data.customers.map((c) => [c.id, c]));
  const invs = [...data.invoices].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  const remaining = new Map(invs.map((i) => [i.id, Math.max(0, i.gross)]));
  const lastPaid = new Map<string, DateStr>();
  const allocations: Allocation[] = [];

  const receiptsSorted = [...data.receipts].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  const receiptViews: ReceiptView[] = [];

  const allocate = (r: Receipt, inv: Invoice, want: number, method: MatchMethod, acc: Allocation[]) => {
    const rest = remaining.get(inv.id) ?? 0;
    const amt = Math.min(rest, want);
    if (amt <= 0) return 0;
    remaining.set(inv.id, rest - amt);
    const a = { receiptId: r.id, invoiceId: inv.id, amount: amt, method };
    acc.push(a);
    allocations.push(a);
    const prev = lastPaid.get(inv.id);
    if (!prev || prev < r.date) lastPaid.set(inv.id, r.date);
    return amt;
  };

  // 手動消込を先に確定させる
  const manualFirst = [...receiptsSorted].sort((a, b) => Number(!!b.manualInvoiceId) - Number(!!a.manualInvoiceId));
  const accByReceipt = new Map<string, Allocation[]>();
  for (const r of manualFirst) accByReceipt.set(r.id, []);
  for (const r of manualFirst) {
    if (!r.manualInvoiceId) continue;
    const inv = invs.find((i) => i.id === r.manualInvoiceId);
    if (inv) allocate(r, inv, r.amount, 'manual', accByReceipt.get(r.id)!);
  }

  for (const r of receiptsSorted) {
    const acc = accByReceipt.get(r.id)!;
    let left = r.amount - acc.reduce((s, a) => s + a.amount, 0);
    let isOpening = r.openingBalance === true;

    if (!r.manualInvoiceId && r.openingBalance !== true && r.customerId) {
      // 番号・同額照合は同月内の前受け（請求日より前の入金）も許容する
      const rMonth = monthOf(r.date);
      const candidates = invs.filter(
        (i) => i.customerId === r.customerId && monthOf(i.date) <= rMonth && (remaining.get(i.id) ?? 0) > 0,
      );
      const customerHasEarlierInvoice = invs.some((i) => i.customerId === r.customerId && i.date <= r.date);

      // 1. 請求書番号
      if (r.invoiceNo) {
        const byNo = candidates.find((i) => i.invoiceNo === r.invoiceNo);
        if (byNo) left -= allocate(r, byNo, left, 'invoiceNo', acc);
        else if (
          r.openingBalance === null &&
          !invs.some((i) => i.customerId === r.customerId && i.invoiceNo === r.invoiceNo)
        ) {
          // 当データに存在しない請求書番号 → 前期以前の請求の回収
          isOpening = true;
        }
      }
      // 2. 同額
      if (left > 0 && !isOpening) {
        const same = candidates.find((i) => (remaining.get(i.id) ?? 0) === left);
        if (same) left -= allocate(r, same, left, 'amount', acc);
      }
      // 3. FIFO
      if (left > 0 && !isOpening) {
        if (!customerHasEarlierInvoice && r.openingBalance === null) isOpening = true;
        else
          for (const inv of candidates.filter((i) => i.date <= r.date)) {
            if (left <= 0) break;
            left -= allocate(r, inv, left, 'fifo', acc);
          }
      }
    }
    if (!r.customerId && r.openingBalance === null && !r.manualInvoiceId) isOpening = false;

    const allocated = acc.reduce((s, a) => s + a.amount, 0);
    receiptViews.push({
      ...r,
      allocations: acc,
      allocated,
      unallocated: isOpening ? 0 : r.amount - allocated,
      isOpening,
    });
  }

  const invoiceViews: InvoiceView[] = invs.map((i) => {
    const c = i.customerId ? customerById.get(i.customerId) : undefined;
    const due = i.dueDateOverride ?? (c?.terms ? dueDate(i.date, c.terms) : null);
    const outstanding = remaining.get(i.id) ?? 0;
    const paid = Math.max(0, i.gross) - outstanding;
    let status: InvoiceStatus = outstanding <= 0 ? 'paid' : paid > 0 ? 'partial' : 'open';
    if (outstanding > 0 && due && due < today) status = 'overdue';
    return { ...i, paid, outstanding, due, status, lastPaidDate: lastPaid.get(i.id) ?? null };
  });

  return {
    invoices: invoiceViews,
    receipts: receiptViews,
    allocations,
    invoiceById: new Map(invoiceViews.map((i) => [i.id, i])),
  };
}

/** 消込結果から取引先ごとの支払サイトを推定（最頻値） */
export function inferTerms(data: AppData, ledger: Ledger): Map<string, PaymentTerms> {
  const samples = new Map<string, string[]>();
  const receiptById = new Map(data.receipts.map((r) => [r.id, r]));
  for (const a of ledger.allocations) {
    if (a.method === 'fifo') continue;
    const inv = ledger.invoiceById.get(a.invoiceId);
    const r = receiptById.get(a.receiptId);
    if (!inv?.customerId || !r) continue;
    const offset = monthDiff(monthOf(inv.date), monthOf(r.date));
    if (offset < 0 || offset > 3) continue;
    const d = +r.date.slice(8, 10);
    const day = d >= 28 ? 31 : d;
    const k = `${offset}|${day}`;
    const list = samples.get(inv.customerId) ?? [];
    list.push(k);
    samples.set(inv.customerId, list);
  }
  const result = new Map<string, PaymentTerms>();
  for (const [cid, list] of samples) {
    const counts = new Map<string, number>();
    for (const k of list) counts.set(k, (counts.get(k) ?? 0) + 1);
    const [best] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
    const [monthOffset, day] = best.split('|').map(Number);
    result.set(cid, { monthOffset, day });
  }
  return result;
}

export function applyInferredTerms(data: AppData, today: DateStr): Customer[] {
  const inferred = inferTerms(data, reconcile(data, today));
  return data.customers.map((c) =>
    !c.terms || c.termsInferred
      ? inferred.has(c.id)
        ? { ...c, terms: inferred.get(c.id)!, termsInferred: true }
        : c
      : c,
  );
}
