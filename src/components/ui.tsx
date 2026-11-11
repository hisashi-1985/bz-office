import type { ReactNode } from 'react';
import { useStore } from '../store';
import { addMonths, fiscalLabel, fiscalYearStart, monthOf } from '../lib/dates';
import type { MonthStr } from '../types';

export function Kpi({ label, value, sub, tone }: { label: string; value: string; sub?: ReactNode; tone?: 'warn' | 'good' }) {
  return (
    <div className={`kpi ${tone ?? ''}`}>
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{value}</div>
      {sub && <div className="kpi-sub">{sub}</div>}
    </div>
  );
}

export function Section({ title, actions, children }: { title: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <section className="card">
      <div className="card-head">
        <h2>{title}</h2>
        {actions && <div className="card-actions">{actions}</div>}
      </div>
      {children}
    </section>
  );
}

/** 期の選択肢：データのある期 + 現在期 + 翌期 */
export function useFiscalYears(): MonthStr[] {
  const { data, today } = useStore();
  const sm = data.settings.fiscalStartMonth;
  const set = new Set<MonthStr>();
  for (const i of data.invoices) set.add(fiscalYearStart(monthOf(i.date), sm));
  for (const f of data.forecasts) for (const m of Object.keys(f.amounts)) set.add(fiscalYearStart(m, sm));
  const cur = fiscalYearStart(monthOf(today), sm);
  set.add(cur);
  set.add(addMonths(cur, 12));
  return [...set].sort();
}

export function FiscalSelect({ value, onChange }: { value: MonthStr; onChange: (v: MonthStr) => void }) {
  const years = useFiscalYears();
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}>
      {years.map((y) => (
        <option key={y} value={y}>
          {fiscalLabel(y)}
        </option>
      ))}
    </select>
  );
}

export function useCurrentFiscal(): MonthStr {
  const { data, today } = useStore();
  return fiscalYearStart(monthOf(today), data.settings.fiscalStartMonth);
}

export const STATUS_LABEL = { paid: '入金済', partial: '一部入金', open: '未入金', overdue: '期日超過' } as const;

export function StatusBadge({ status }: { status: keyof typeof STATUS_LABEL }) {
  return <span className={`badge ${status}`}>{STATUS_LABEL[status]}</span>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}
