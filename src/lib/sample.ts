import type { AppData, Customer, DateStr, Invoice, Receipt } from '../types';
import { addMonths, daysInMonth, dueDate, fiscalYearStart, monthOf } from './dates';
import { generateForecasts } from './forecast';
import { generateBudget } from './budget';

/** 架空の会社によるサンプルデータ（初回表示用）。日付は今日を基準に作る */
export function sampleData(today: DateStr): AppData {
  const customers: Customer[] = [
    { id: 's_a', name: '株式会社サンプル物産', aliases: [], terms: { monthOffset: 1, day: 31 }, termsInferred: false, note: '月額顧問契約（架空）' },
    { id: 's_b', name: 'みどり工務店株式会社', aliases: [], terms: { monthOffset: 0, day: 31 }, termsInferred: false, note: '月額（架空）' },
    { id: 's_c', name: '株式会社テックノート', aliases: [], terms: { monthOffset: 2, day: 10 }, termsInferred: false, note: '稼働に応じて変動（架空）' },
    { id: 's_d', name: '一般社団法人サンプル協会', aliases: [], terms: { monthOffset: 1, day: 31 }, termsInferred: false, note: 'スポット案件（架空）' },
    { id: 's_e', name: '合同会社デモデザイン', aliases: [], terms: { monthOffset: 1, day: 31 }, termsInferred: false, note: '新規（架空）' },
  ];
  const sm = 11;
  const cur = monthOf(today);
  const start = addMonths(fiscalYearStart(cur, sm), -12);
  const months: string[] = [];
  for (let m = start; m < cur; m = addMonths(m, 1)) months.push(m);

  const varC = [1500000, 1800000, 2400000, 1600000, 2100000, 900000, 1200000, 1500000, 2600000, 2800000, 1900000, 2200000];
  const invoices: Invoice[] = [];
  let no = 101;
  const eom = (m: string) => `${m}-${String(daysInMonth(m)).padStart(2, '0')}`;
  months.forEach((m, i) => {
    const add = (cid: string, net: number, label: string, date = eom(m)) =>
      invoices.push({
        id: `s_inv_${no}`,
        date,
        customerId: cid,
        invoiceNo: String(no++),
        description: `No.${no - 1} ${customers.find((c) => c.id === cid)!.name}・${label}`,
        gross: Math.round(net * 1.1),
        net,
        dueDateOverride: null,
        source: 'manual',
      });
    add('s_a', 1000000, `${+m.slice(5)}月分 顧問料`);
    add('s_b', 300000, `${+m.slice(5)}月分`, `${m}-01`);
    add('s_c', varC[i % 12], `${+m.slice(5)}月分 稼働`);
    if (i % 12 === 4) add('s_d', 8000000, '調査業務一式');
    if (i >= 9) add('s_e', 400000, `${+m.slice(5)}月分`);
  });

  // 期日が来た請求は期日に入金。ただしテックノートの1件は未入金（期日超過）、1件は一部入金
  const receipts: Receipt[] = [];
  const cTerms = new Map(customers.map((c) => [c.id, c.terms!]));
  const tech = invoices.filter((i) => i.customerId === 's_c');
  const overdue = tech[tech.length - 3]?.id;
  const partial = tech[tech.length - 4]?.id;
  for (const inv of invoices) {
    const due = dueDate(inv.date, cTerms.get(inv.customerId!)!);
    if (due >= today || inv.id === overdue) continue;
    receipts.push({
      id: `s_rc_${inv.id}`,
      date: due,
      customerId: inv.customerId,
      amount: inv.id === partial ? Math.round(inv.gross / 2) : inv.gross,
      description: `${customers.find((c) => c.id === inv.customerId)!.name} 振込`,
      invoiceNo: inv.id === partial ? null : inv.invoiceNo,
      manualInvoiceId: null,
      openingBalance: null,
      source: 'manual',
    });
  }

  let data: AppData = {
    version: 1,
    customers,
    invoices,
    receipts,
    forecasts: [],
    budgets: [],
    settings: { fiscalStartMonth: sm, taxRate: 0.1, openingAR: {}, sample: true },
  };
  const fy = fiscalYearStart(cur, sm);
  data = { ...data, forecasts: generateForecasts(data, fy, 'recent3', cur) };
  data.forecasts.push({ id: 's_fc_new', label: '新規案件（提案中）', customerId: null, probability: 50, amounts: { [addMonths(fy, 4)]: 3000000, [addMonths(fy, 5)]: 3000000 }, note: '' });
  data = { ...data, budgets: generateBudget({ ...data, forecasts: [] }, fy, 'prevActual', 10) };
  return data;
}
