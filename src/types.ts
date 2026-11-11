/** 'YYYY-MM-DD' */
export type DateStr = string;
/** 'YYYY-MM' */
export type MonthStr = string;

export interface PaymentTerms {
  /** 請求月から何ヶ月後に入金か（0=当月, 1=翌月, 2=翌々月） */
  monthOffset: number;
  /** 入金日（1〜31。31 は月末扱い） */
  day: number;
}

export interface Customer {
  id: string;
  name: string;
  /** 照合用の別名（摘要内の表記ゆれなど） */
  aliases: string[];
  terms: PaymentTerms | null;
  /** terms がデータから自動推定されたものか */
  termsInferred: boolean;
  note: string;
}

export interface Invoice {
  id: string;
  /** 売上計上日 */
  date: DateStr;
  customerId: string | null;
  invoiceNo: string | null;
  description: string;
  /** 請求額（税込） */
  gross: number;
  /** 売上高（税抜） */
  net: number;
  /** 期日の手動上書き */
  dueDateOverride: DateStr | null;
  source: 'mf' | 'manual';
}

export interface Receipt {
  id: string;
  date: DateStr;
  customerId: string | null;
  /** 入金額 */
  amount: number;
  description: string;
  invoiceNo: string | null;
  /** 手動消込先（指定時は自動消込より優先） */
  manualInvoiceId: string | null;
  /** 前期以前の売掛金（期首残高）の回収として扱う */
  openingBalance: boolean | null;
  source: 'mf' | 'manual';
}

export interface ForecastLine {
  id: string;
  /** 取引先または案件名 */
  label: string;
  customerId: string | null;
  /** 確度（%） */
  probability: number;
  /** 月別の売上予測（税抜） */
  amounts: Record<MonthStr, number>;
  note: string;
}

export interface BudgetLine {
  id: string;
  /** 取引先名・区分名（例：全社、新規開拓） */
  label: string;
  customerId: string | null;
  /** 月別の売上予算（税抜） */
  amounts: Record<MonthStr, number>;
  note: string;
}

export interface Settings {
  /** 期首月（1〜12） */
  fiscalStartMonth: number;
  /** 消費税率（予測→入金予定の税込換算に使用） */
  taxRate: number;
  /** 期首売掛金（開始仕訳から取得） key=期首月 'YYYY-MM' */
  openingAR: Record<MonthStr, number>;
}

export interface AppData {
  version: 1;
  customers: Customer[];
  invoices: Invoice[];
  receipts: Receipt[];
  forecasts: ForecastLine[];
  budgets: BudgetLine[];
  settings: Settings;
}
