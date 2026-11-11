import type { Customer, Invoice, MonthStr, Receipt } from '../types';
import { parseCsv } from './csv';
import { monthOf, normalizeDate } from './dates';
import {
  extractInvoiceNo,
  findCustomerByName,
  findCustomerInText,
  guessCustomerName,
  nfkc,
} from './names';

const SALES_ACCOUNTS = ['売上高', '売上'];
const AR_ACCOUNTS = ['売掛金'];

interface Line {
  no: string;
  date: string;
  drAccount: string;
  drPartner: string;
  drAmount: number;
  crAccount: string;
  crPartner: string;
  crAmount: number;
  crTax: number;
  drTax: number;
  memo: string;
  type: string;
}

export interface ImportResult {
  invoices: Invoice[];
  receipts: Receipt[];
  /** 新たに作成された取引先 */
  newCustomers: Customer[];
  /** 期首売掛金（開始仕訳） */
  openingAR: { month: MonthStr; amount: number } | null;
  period: { from: string; to: string } | null;
  warnings: string[];
}

const num = (s: string | undefined) => {
  const n = Number((s ?? '').replace(/[,\s]/g, ''));
  return Number.isFinite(n) ? n : 0;
};

let seq = 0;
export const newId = (prefix: string) =>
  `${prefix}_${Date.now().toString(36)}_${(seq++).toString(36)}_${Math.random().toString(36).slice(2, 6)}`;

/**
 * マネーフォワード クラウド会計「仕訳帳」CSV を読み込み、売上（請求）と入金を抽出する。
 * - 売上高の貸方 → 請求（売掛金計上）
 * - 売掛金の貸方 → 入金
 * - 開始仕訳の売掛金 → 期首売掛金
 */
export function importMfJournal(text: string, existingCustomers: Customer[]): ImportResult {
  const rows = parseCsv(text);
  if (rows.length < 2) throw new Error('CSV にデータ行がありません');
  const header = rows[0].map((h) => h.trim());
  const col = (name: string) => {
    const i = header.indexOf(name);
    if (i < 0) throw new Error(`列「${name}」が見つかりません。MF会計の仕訳帳CSVを指定してください`);
    return i;
  };
  const c = {
    no: col('取引No'),
    date: col('取引日'),
    drAccount: col('借方勘定科目'),
    drPartner: col('借方取引先'),
    drAmount: col('借方金額(円)'),
    drTax: col('借方税額'),
    crAccount: col('貸方勘定科目'),
    crPartner: col('貸方取引先'),
    crAmount: col('貸方金額(円)'),
    crTax: col('貸方税額'),
    memo: col('摘要'),
    type: col('MF仕訳タイプ'),
  };

  const lines: Line[] = rows.slice(1).map((r) => ({
    no: r[c.no],
    date: normalizeDate(r[c.date]),
    drAccount: r[c.drAccount] ?? '',
    drPartner: nfkc(r[c.drPartner] ?? ''),
    drAmount: num(r[c.drAmount]),
    drTax: num(r[c.drTax]),
    crAccount: r[c.crAccount] ?? '',
    crPartner: nfkc(r[c.crPartner] ?? ''),
    crAmount: num(r[c.crAmount]),
    crTax: num(r[c.crTax]),
    memo: r[c.memo] ?? '',
    type: r[c.type] ?? '',
  }));

  const customers = [...existingCustomers];
  const newCustomers: Customer[] = [];
  const warnings: string[] = [];

  const resolveCustomer = (partner: string, memo: string): string | null => {
    if (partner) {
      const found = findCustomerByName(customers, partner);
      if (found) return found.id;
    }
    if (!partner) {
      const found = findCustomerInText(customers, memo);
      if (found) return found.id;
    }
    const name = partner || guessCustomerName(memo);
    if (!name) return null;
    const created: Customer = {
      id: newId('cus'),
      name,
      aliases: [],
      terms: null,
      termsInferred: false,
      note: '',
    };
    customers.push(created);
    newCustomers.push(created);
    return created.id;
  };

  // 取引先が明示されている行を先に登録しておき、摘要からの推定精度を上げる
  for (const l of lines) {
    if (SALES_ACCOUNTS.includes(l.crAccount) && l.crPartner) resolveCustomer(l.crPartner, '');
  }

  // 取引No + 日付 でグルーピング（複合仕訳）
  const groups = new Map<string, Line[]>();
  for (const l of lines) {
    const key = `${l.no}|${l.date}`;
    const g = groups.get(key);
    if (g) g.push(l);
    else groups.set(key, [l]);
  }

  const invoices: Invoice[] = [];
  const receipts: Receipt[] = [];
  let openingAmount = 0;
  let openingMonth: MonthStr | null = null;

  for (const [key, g] of groups) {
    const date = g[0].date;
    const memo = g.find((l) => l.memo)?.memo ?? '';
    const id = `mf_${key.replace('|', '_')}`;

    if (g[0].type === '開始仕訳') {
      const ar = g.filter((l) => AR_ACCOUNTS.includes(l.drAccount)).reduce((s, l) => s + l.drAmount, 0);
      if (ar) {
        openingAmount += ar;
        openingMonth ??= monthOf(date);
      }
      continue;
    }

    const salesCr = g.filter((l) => SALES_ACCOUNTS.includes(l.crAccount));
    const salesDr = g.filter((l) => SALES_ACCOUNTS.includes(l.drAccount));
    if (salesCr.length || salesDr.length) {
      const gross =
        salesCr.reduce((s, l) => s + l.crAmount, 0) - salesDr.reduce((s, l) => s + l.drAmount, 0);
      const net =
        salesCr.reduce((s, l) => s + l.crAmount - l.crTax, 0) -
        salesDr.reduce((s, l) => s + l.drAmount - l.drTax, 0);
      const partner = salesCr.find((l) => l.crPartner)?.crPartner ?? salesDr.find((l) => l.drPartner)?.drPartner ?? '';
      const customerId = resolveCustomer(partner, memo);
      const invoiceNo = extractInvoiceNo(memo);
      invoices.push({
        id,
        date,
        customerId,
        invoiceNo,
        description: nfkc(memo),
        gross,
        net,
        dueDateOverride: null,
        source: 'mf',
      });
      if (!customerId) warnings.push(`${date} 売上 ${gross.toLocaleString()}円：取引先を特定できませんでした`);

      // 売掛金を経由しない売上（現金売上など）は即時入金として扱う
      const viaAR = g.some((l) => AR_ACCOUNTS.includes(l.drAccount));
      if (!viaAR && gross > 0) {
        receipts.push({
          id: `${id}_cash`,
          date,
          customerId,
          amount: gross,
          description: `（即時入金）${nfkc(memo)}`,
          invoiceNo,
          manualInvoiceId: id,
          openingBalance: false,
          source: 'mf',
        });
      }
      continue;
    }

    for (const [i, l] of g.entries()) {
      if (!AR_ACCOUNTS.includes(l.crAccount) || l.crAmount === 0) continue;
      const customerId = resolveCustomer(l.crPartner || l.drPartner, l.memo || memo);
      receipts.push({
        id: g.length > 1 ? `${id}_${i}` : id,
        date,
        customerId,
        amount: l.crAmount,
        description: nfkc(l.memo || memo),
        invoiceNo: extractInvoiceNo(l.memo || memo),
        manualInvoiceId: null,
        openingBalance: null,
        source: 'mf',
      });
    }
  }

  // 1円などの極端に小さい売上は入力ミスの可能性
  for (const inv of invoices) {
    const m = nfkc(inv.description).match(/(\d{1,3}(?:,\d{3})+)\s*$/);
    if (m && Math.abs(inv.gross) < 1000 && Number(m[1].replace(/,/g, '')) >= 1000) {
      warnings.push(
        `${inv.date} 請求No.${inv.invoiceNo ?? '-'}：計上額 ${inv.gross.toLocaleString()}円 が摘要の金額 ${m[1]}円 と異なります（要確認）`,
      );
    }
  }

  const dates = lines.map((l) => l.date).sort();
  return {
    invoices,
    receipts,
    newCustomers,
    openingAR: openingMonth ? { month: openingMonth, amount: openingAmount } : null,
    period: dates.length ? { from: dates[0], to: dates[dates.length - 1] } : null,
    warnings,
  };
}
