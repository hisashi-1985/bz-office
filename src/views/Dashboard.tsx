import { useMemo, useState } from 'react';
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useCustomerName, useStore } from '../store';
import { FiscalSelect, Kpi, Section, StatusBadge, useCurrentFiscal } from '../components/ui';
import { addMonths, fiscalMonths, monthLabel, monthOf } from '../lib/dates';
import { cashForecast, monthlyPlan } from '../lib/forecast';
import { man, pct, yen } from '../lib/format';

export function Dashboard() {
  const { data, ledger, today } = useStore();
  const name = useCustomerName();
  const currentFy = useCurrentFiscal();
  const [fy, setFy] = useState(currentFy);
  const currentMonth = monthOf(today);

  const plan = useMemo(() => monthlyPlan(data, fy, currentMonth), [data, fy, currentMonth]);
  const prevPlan = useMemo(() => monthlyPlan(data, addMonths(fy, -12), currentMonth), [data, fy, currentMonth]);
  const cash = useMemo(() => cashForecast(data, ledger, currentMonth, 6), [data, ledger, currentMonth]);

  const totalBudget = plan.reduce((s, m) => s + m.budget, 0);
  const totalActual = plan.reduce((s, m) => s + m.actual, 0);
  const totalForecast = plan.reduce((s, m) => s + m.forecast, 0);
  const landing = plan.reduce((s, m) => s + m.landing, 0);
  const prevTotal = prevPlan.reduce((s, m) => s + m.actual, 0);
  const pastForecast = plan.filter((m) => m.isPast).reduce((s, m) => s + m.forecast, 0);
  const pastActual = plan.filter((m) => m.isPast).reduce((s, m) => s + m.actual, 0);

  const ar = ledger.invoices.reduce((s, i) => s + i.outstanding, 0);
  const overdueList = ledger.invoices.filter((i) => i.status === 'overdue');
  const overdue = overdueList.reduce((s, i) => s + i.outstanding, 0);
  const unallocated = ledger.receipts.filter((r) => r.unallocated > 0);

  const chart = fiscalMonths(fy).map((m, i) => ({
    name: monthLabel(m),
    実績: plan[i].actual || null,
    予算: plan[i].budget || null,
    予測: plan[i].forecast || null,
    前期実績: prevPlan[i].actual || null,
  }));

  return (
    <div className="stack">
      <div className="toolbar">
        <FiscalSelect value={fy} onChange={setFy} />
        <span className="muted">売上は税抜、請求・入金は税込で表示しています</span>
      </div>

      <div className="kpis">
        <Kpi label="売上実績（期累計）" value={yen(totalActual)} sub={prevTotal ? `前期実績 ${yen(prevTotal)}${totalActual ? `（前期比 ${pct(totalActual / prevTotal)}）` : ''}` : undefined} />
        <Kpi
          label="着地見込"
          value={yen(landing)}
          sub={
            totalBudget
              ? `予算 ${yen(totalBudget)} の ${pct(landing / totalBudget)}`
              : totalForecast
                ? `予測合計 ${yen(totalForecast)}（予算未登録）`
                : '予測未入力（売上予測タブで作成）'
          }
          tone={totalBudget ? (landing >= totalBudget ? 'good' : 'warn') : undefined}
        />
        <Kpi
          label="経過月の予実差"
          value={pastForecast ? yen(pastActual - pastForecast) : '-'}
          sub={pastForecast ? `達成率 ${pct(pastActual / pastForecast)}` : '予測が入っている経過月なし'}
          tone={pastForecast && pastActual < pastForecast ? 'warn' : undefined}
        />
        <Kpi label="売掛金残高" value={yen(ar)} sub={`未回収 ${ledger.invoices.filter((i) => i.outstanding > 0).length} 件`} />
        <Kpi label="期日超過" value={yen(overdue)} sub={`${overdueList.length} 件`} tone={overdue ? 'warn' : 'good'} />
      </div>

      <Section title="月次売上（税抜）">
        <div style={{ width: '100%', height: 300 }}>
          <ResponsiveContainer>
            <ComposedChart data={chart} margin={{ top: 8, right: 16, left: 8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--grid)" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis tickFormatter={(v) => man(v)} tick={{ fontSize: 12 }} width={72} />
              <Tooltip formatter={(v) => yen(Number(v))} />
              <Legend />
              <Bar dataKey="前期実績" fill="var(--c-prev)" radius={[3, 3, 0, 0]} />
              <Bar dataKey="実績" fill="var(--c-actual)" radius={[3, 3, 0, 0]} />
              <Line dataKey="予算" stroke="var(--c-budget)" strokeWidth={2} dot={{ r: 3 }} connectNulls />
              <Line dataKey="予測" stroke="var(--c-forecast)" strokeWidth={2} strokeDasharray="6 4" dot={{ r: 3 }} connectNulls />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </Section>

      <div className="grid2">
        <Section title="入金予定（今後6ヶ月・税込）">
          <table>
            <thead>
              <tr>
                <th>月</th>
                <th className="r">請求済分</th>
                <th className="r">予測分</th>
                <th className="r">合計</th>
              </tr>
            </thead>
            <tbody>
              {cash.months.map((m) => (
                <tr key={m.month}>
                  <td>{m.month.replace('-', '年')}月</td>
                  <td className="r">{yen(m.fromInvoices)}</td>
                  <td className="r muted">{yen(m.fromForecast)}</td>
                  <td className="r strong">{yen(m.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {cash.overdue > 0 && <p className="note warn">※ 期日超過 {yen(cash.overdue)} を当月に含めています</p>}
        </Section>

        <Section title="要対応">
          {overdueList.length === 0 && unallocated.length === 0 && <p className="muted">対応が必要な項目はありません。</p>}
          {overdueList.length > 0 && (
            <>
              <h3>期日超過の請求</h3>
              <table>
                <tbody>
                  {overdueList.map((i) => (
                    <tr key={i.id}>
                      <td>{name(i.customerId)}</td>
                      <td>No.{i.invoiceNo ?? '-'}</td>
                      <td>期日 {i.due}</td>
                      <td className="r">{yen(i.outstanding)}</td>
                      <td>
                        <StatusBadge status={i.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
          {unallocated.length > 0 && (
            <>
              <h3>未消込の入金</h3>
              <table>
                <tbody>
                  {unallocated.map((r) => (
                    <tr key={r.id}>
                      <td>{r.date}</td>
                      <td>{name(r.customerId)}</td>
                      <td className="r">{yen(r.unallocated)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </Section>
      </div>
    </div>
  );
}
