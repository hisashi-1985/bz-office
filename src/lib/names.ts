import type { Customer } from '../types';

const CORP_WORDS = /(株式会社|有限会社|合同会社|合資会社|一般社団法人|公益社団法人|一般財団法人|公益財団法人|医療法人|社会福祉法人|\(株\)|㈱)/g;

/** 全角→半角などの正規化（表示用） */
export const nfkc = (s: string) => s.normalize('NFKC').replace(/\s+/g, ' ').trim();

/** 照合キー：法人格・空白・記号を除去し小文字化 */
export function nameKey(s: string): string {
  return nfkc(s)
    .replace(CORP_WORDS, '')
    .replace(/[\s・･.,'’()（）「」\-]/g, '')
    .toLowerCase();
}

export function customerKeys(c: Customer): string[] {
  return [c.name, ...c.aliases].map(nameKey).filter((k) => k.length >= 2);
}

export function findCustomerByName(customers: Customer[], name: string): Customer | undefined {
  const k = nameKey(name);
  if (!k) return undefined;
  return customers.find((c) => customerKeys(c).includes(k));
}

/** 摘要などの自由文から取引先を探す（最長一致） */
export function findCustomerInText(customers: Customer[], text: string): Customer | undefined {
  const t = nameKey(text);
  let best: { c: Customer; len: number } | undefined;
  for (const c of customers) {
    for (const k of customerKeys(c)) {
      if (t.includes(k) && (!best || k.length > best.len)) best = { c, len: k.length };
    }
  }
  return best?.c;
}

/** 摘要から請求書番号を抽出（"No.47", "請求書番号：40"） */
export function extractInvoiceNo(text: string): string | null {
  const t = nfkc(text);
  const m = t.match(/(?:No\.?|請求書番号[:：]?)\s*(\d+)/i);
  return m ? m[1] : null;
}

/** 摘要「No.107 M's Webmarketing合同会社・ご請求書」から取引先名らしき部分を推定 */
export function guessCustomerName(text: string): string | null {
  const t = nfkc(text)
    .replace(/^No\.?\s*\d+\s*/i, '')
    .split(/[・、,]/)[0]
    .trim();
  return t.length >= 2 ? t : null;
}
