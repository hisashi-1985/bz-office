import { useMemo, useState } from 'react';
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useStore } from '../store';
import { Empty, FiscalSelect, Kpi, Section, useCurrentFiscal } from '../components/ui';
import { fiscalLabel, monthLabel, monthOf } from '../lib/dates';
import { monthlyPlan } from '../lib/forecast';
import { compareByCustomer } from '../lib/budget';
import { man, num, pct, yen } from '../lib/format';

const ratio = (a: number, b: number) => (b ? a / b : NaN);
const tone = (r: number) => (!Number.isFinite(r) ? '' : r >= 1 ? 'good-text' : r >= 0.9 ? 'warn' : 'danger');

export function CompareView() {
  const { data, today } = useStore();
  const currentFy = useCurrentFiscal();
  const [fy, setFy] = useState(currentFy);
  const [cumulative, setCumulative] = useState(false);
  const currentMonth = monthOf(today);
  const plan = useMemo(() => monthlyPlan(data, fy, currentMonth), [data, fy, currentMonth]);
  const rows = useMemo(() => compareByCustomer(data, fy, currentMonth), [data, fy, currentMonth]);

  const sum = (f: (p: (typeof plan)[number]) => number, onlyPast = false) =>
    plan.filter((p) => !onlyPast || p.isPast).reduce((s, p) => s + f(p), 0);
  const budget = sum((p) => p.budget);
  const forecast = sum((p) => p.forecast);
  const landing = sum((p) => p.landing);
  const budgetToDate = sum((p) => p.budget, true);
  const actualToDate = sum((p) => p.actual, true);
  const pastCount = plan.filter((p) => p.isPast).length;

  let acc = { b: 0, f: 0, a: 0, l: 0 };
  const chart = plan.map((p) => {
    acc = { b: acc.b + p.budget, f: acc.f + p.forecast, a: acc.a + p.actual, l: acc.l + p.landing };
    const v = cumulative ? acc : { b: p.budget, f: p.forecast, a: p.actual, l: p.landing };
    return {
      name: monthLabel(p.month),
      予算: v.b || null,
      予測: v.f || null,
      実績: p.isPast || p.actual ? v.a || null : null,
      ...(cumulative ? { 着地見込: v.l || null } : {}),
    };
  });

  const noData = !budget && !forecast && !actualToDate;

  return (
    <div className="stack">
      <div className="toolbar">
        <FiscalSelect value={fy} onChange={setFy} />
        <div className="seg">
          <button className={!cumulative ? 'active' : ''} onClick={() => setCumulative(false)}>月次</button>
          <button className={cumulative ? 'active' : ''} onClick={() => setCumulative(true)}>累計</button>
        </div>
        <span className="muted">売上（税抜）／ 経過月：{pastCount}ヶ月</span>
      </div>

      <div className="kpis">
        <Kpi label="年間予算" value={budget ? yen(budget) : '未登録'} sub={budget ? undefined : '「予算」タブで登録'} />
        <Kpi
          label="累計実績（経過月）"
          value={yen(actualToDate)}
          sub={budgetToDate ? `予算比 ${pct(ratio(actualToDate, budgetToDate))}（差 ${yen(actualToDate - budgetToDate)}）` : '経過月の予算なし'}
          tone={budgetToDate ? (actualToDate >= budgetToDate ? 'good' : 'warn') : undefined}
        />
        <Kpi label="年間予測" value={yen(forecast)} sub={budget ? `予算比 ${pct(ratio(forecast, budget))}` : undefined} />
        <Kpi
          label="着地見込"
          value={yen(landing)}
          sub={budget ? `予算達成見込 ${pct(ratio(landing, budget))}（差 ${yen(landing - budget)}）` : undefined}
          tone={budget ? (landing >= budget ? 'good' : 'warn') : undefined}
        />
      </div>

      <Section title={`${fiscalLabel(fy)} 予算・予測・実績（${cumulative ? '累計' : '月次'}）`}>
        {noData ? (
          <Empty>この期の予算・予測・実績がありません。</Empty>
        ) : (
          <div style={{ width: '100%', height: 320 }}>
            <ResponsiveContainer>
              <ComposedChart data={chart} margin={{ top: 8, right: 16, left: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--grid)" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis tickFormatter={(v) => man(v)} tick={{ fontSize: 12 }} width={72} />
                <Tooltip formatter={(v) => yen(Number(v))} />
                <Legend />
                <Bar dataKey="実績" fill="var(--c-actual)" radius={[3, 3, 0, 0]} />
                <Line dataKey="予算" stroke="var(--c-budget)" strokeWidth={2} dot={{ r: 3 }} connectNulls />
                <Line dataKey="予測" stroke="var(--c-forecast)" strokeWidth={2} strokeDasharray="6 4" dot={{ r: 3 }} connectNulls />
                {cumulative && <Line dataKey="着地見込" stroke="var(--c-actual)" strokeWidth={1.5} strokeDasharray="2 3" dot={false} connectNulls />}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}
      </Section>

      <Section title="月次 予実表">
        <div className="scroll-x">
          <table className="matrix">
            <thead>
              <tr>
                <th className="sticky" />
                {plan.map((p) => (
                  <th key={p.month} className={`r ${p.isPast ? 'past' : p.month === currentMonth ? 'current' : ''}`}>{monthLabel(p.month)}</th>
                ))}
                <th className="r">年間</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="sticky strong">予算</td>
                {plan.map((p) => <td key={p.month} className="r">{p.budget ? num(p.budget) : ''}</td>)}
                <td className="r strong">{num(budget)}</td>
              </tr>
              <tr>
                <td className="sticky strong">予測</td>
                {plan.map((p) => <td key={p.month} className="r">{p.forecast ? num(p.forecast) : ''}</td>)}
                <td className="r strong">{num(forecast)}</td>
              </tr>
              <tr>
                <td className="sticky strong">実績</td>
                {plan.map((p) => <td key={p.month} className="r">{p.isPast || p.actual ? num(p.actual) : ''}</td>)}
                <td className="r strong">{num(actualToDate)}</td>
              </tr>
              <tr className="landing">
                <td className="sticky strong">着地見込</td>
                {plan.map((p) => <td key={p.month} className="r">{num(p.landing)}</td>)}
                <td className="r strong">{num(landing)}</td>
              </tr>
            </tbody>
            <tfoot>
              <tr>
                <td className="sticky">予算差（着地−予算）</td>
                {plan.map((p) => (
                  <td key={p.month} className={`r ${p.landing - p.budget < 0 ? 'danger' : ''}`}>{p.budget ? num(p.landing - p.budget) : ''}</td>
                ))}
                <td className={`r ${landing - budget < 0 ? 'danger' : ''}`}>{budget ? num(landing - budget) : ''}</td>
              </tr>
              <tr>
                <td className="sticky">予算達成率</td>
                {plan.map((p) => {
                  const r = ratio(p.landing, p.budget);
                  return <td key={p.month} className={`r ${tone(r)}`}>{p.budget ? pct(r) : ''}</td>;
                })}
                <td className={`r ${tone(ratio(landing, budget))}`}>{budget ? pct(ratio(landing, budget)) : ''}</td>
              </tr>
              <tr>
                <td className="sticky">予測差（実績−予測）</td>
                {plan.map((p) => (
                  <td key={p.month} className={`r ${p.actual - p.forecast < 0 ? 'danger' : ''}`}>{p.isPast && p.forecast ? num(p.actual - p.forecast) : ''}</td>
                ))}
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
        <p className="note">経過月の達成率は実績÷予算、当月以降は着地見込（実績と予測の大きい方）÷予算です。</p>
      </Section>

      <Section title="取引先別 予実比較">
        {rows.length === 0 ? (
          <Empty>データがありません。</Empty>
        ) : (
          <div className="scroll-x">
            <table>
              <thead>
                <tr>
                  <th>取引先・区分</th>
                  <th className="r">年間予算</th>
                  <th className="r">累計予算</th>
                  <th className="r">累計実績</th>
                  <th className="r">累計達成率</th>
                  <th className="r">年間予測</th>
                  <th className="r">着地見込</th>
                  <th className="r">着地−予算</th>
                  <th className="r">予算達成見込</th>
                  <th style={{ width: 140 }} />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const toDate = ratio(r.actualToDate, r.budgetToDate);
                  const full = ratio(r.landing, r.budget);
                  return (
                    <tr key={r.key}>
                      <td>{r.label}</td>
                      <td className="r">{num(r.budget)}</td>
                      <td className="r muted">{num(r.budgetToDate)}</td>
                      <td className="r">{num(r.actualToDate)}</td>
                      <td className={`r ${tone(toDate)}`}>{r.budgetToDate ? pct(toDate) : '-'}</td>
                      <td className="r">{num(r.forecast)}</td>
                      <td className="r strong">{num(r.landing)}</td>
                      <td className={`r ${r.landing - r.budget < 0 ? 'danger' : ''}`}>{num(r.landing - r.budget)}</td>
                      <td className={`r ${tone(full)}`}>{r.budget ? pct(full) : '予算外'}</td>
                      <td>
                        {r.budget > 0 && (
                          <div className="meter" title={pct(full)}>
                            <div className={`meter-fill ${tone(full)}`} style={{ width: `${Math.min(100, full * 100)}%` }} />
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td>合計</td>
                  <td className="r">{num(budget)}</td>
                  <td className="r">{num(budgetToDate)}</td>
                  <td className="r">{num(actualToDate)}</td>
                  <td className={`r ${tone(ratio(actualToDate, budgetToDate))}`}>{budgetToDate ? pct(ratio(actualToDate, budgetToDate)) : '-'}</td>
                  <td className="r">{num(forecast)}</td>
                  <td className="r">{num(landing)}</td>
                  <td className="r">{num(landing - budget)}</td>
                  <td className={`r ${tone(ratio(landing, budget))}`}>{budget ? pct(ratio(landing, budget)) : '-'}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
        <p className="note">「予算外」は予算に計上していない取引先・案件（予算外の上振れ）です。</p>
      </Section>
    </div>
  );
}
