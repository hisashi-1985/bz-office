import { useMemo, useState } from 'react';
import { useStore } from '../store';
import { FiscalSelect, Section, useCurrentFiscal } from '../components/ui';
import { AmountInput } from '../components/AmountInput';
import { addMonths, fiscalLabel, fiscalMonths, monthLabel, monthOf } from '../lib/dates';
import { actualsByCustomer, GENERATE_LABELS, generateForecasts, monthlyPlan, weighted, type GenerateMethod } from '../lib/forecast';
import { num, pct } from '../lib/format';
import { newId } from '../lib/mfImport';
import type { ForecastLine } from '../types';

export function ForecastView() {
  const { data, setData, today } = useStore();
  const currentFy = useCurrentFiscal();
  const [fy, setFy] = useState(currentFy);
  const [method, setMethod] = useState<GenerateMethod>('recent3');
  const months = fiscalMonths(fy);
  const currentMonth = monthOf(today);
  const actuals = useMemo(() => actualsByCustomer(data), [data]);
  const plan = useMemo(() => monthlyPlan(data, fy, currentMonth), [data, fy, currentMonth]);

  const updateLine = (id: string, patch: Partial<ForecastLine>) =>
    setData((d) => ({ ...d, forecasts: d.forecasts.map((l) => (l.id === id ? { ...l, ...patch } : l)) }));
  const setAmount = (l: ForecastLine, m: string, v: number) => {
    const amounts = { ...l.amounts };
    if (v) amounts[m] = v;
    else delete amounts[m];
    updateLine(l.id, { amounts });
  };
  const fillRight = (l: ForecastLine, from: string) => {
    const v = l.amounts[from] ?? 0;
    const amounts = { ...l.amounts };
    for (const m of months) if (m > from) v ? (amounts[m] = v) : delete amounts[m];
    updateLine(l.id, { amounts });
  };

  const generate = () => {
    const base = fy > currentMonth ? currentMonth : fy;
    const msg =
      method === 'lastYear'
        ? `${fiscalLabel(fy)}の予測を、前年同月の実績で作成します。`
        : `${fiscalLabel(fy)}の予測を、${base}より前の${GENERATE_LABELS[method]}で作成します。`;
    if (!confirm(`${msg}\n実績のある取引先の月額は上書きされます。よろしいですか？`)) return;
    setData((d) => ({ ...d, forecasts: generateForecasts(d, fy, method, base) }));
  };

  const addLine = () =>
    setData((d) => ({
      ...d,
      forecasts: [...d.forecasts, { id: newId('fc'), label: '新規案件', customerId: null, probability: 50, amounts: {}, note: '' }],
    }));

  const lines = [...data.forecasts].sort((a, b) => Number(!a.customerId) - Number(!b.customerId));
  const totalForecast = plan.reduce((s, m) => s + m.forecast, 0);
  const totalActual = plan.reduce((s, m) => s + m.actual, 0);
  const totalLanding = plan.reduce((s, m) => s + m.landing, 0);

  return (
    <div className="stack">
      <div className="toolbar">
        <FiscalSelect value={fy} onChange={setFy} />
        <span className="sep" />
        <select value={method} onChange={(e) => setMethod(e.target.value as GenerateMethod)}>
          {Object.entries(GENERATE_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <button onClick={generate}>実績から予測を作成</button>
        <button className="primary" onClick={addLine}>＋ 案件を追加</button>
      </div>

      <Section title={`${fiscalLabel(fy)} 売上予測（税抜）`}>
        <div className="scroll-x">
          <table className="matrix forecast">
            <thead>
              <tr>
                <th className="sticky">取引先・案件</th>
                <th className="r">確度</th>
                {months.map((m) => (
                  <th key={m} className={`r ${m < currentMonth ? 'past' : m === currentMonth ? 'current' : ''}`}>{monthLabel(m)}</th>
                ))}
                <th className="r">合計(加重)</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {lines.length === 0 && (
                <tr>
                  <td colSpan={16} className="empty">予測がありません。「実績から予測を作成」または「案件を追加」から始めてください。</td>
                </tr>
              )}
              {lines.map((l) => {
                const a = l.customerId ? actuals.get(l.customerId) : undefined;
                const total = months.reduce((s, m) => s + weighted(l, m), 0);
                return (
                  <tr key={l.id}>
                    <td className="sticky">
                      <input className="label-input" value={l.label} onChange={(e) => updateLine(l.id, { label: e.target.value })} />
                      <select className="mini" value={l.customerId ?? ''} onChange={(e) => updateLine(l.id, { customerId: e.target.value || null })}>
                        <option value="">取引先未登録（新規）</option>
                        {data.customers.map((c) => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                    </td>
                    <td className="r">
                      <input
                        className="pct"
                        type="number"
                        min={0}
                        max={100}
                        step={10}
                        value={l.probability}
                        onChange={(e) => updateLine(l.id, { probability: Math.max(0, Math.min(100, Number(e.target.value))) })}
                      />
                      %
                    </td>
                    {months.map((m) => {
                      const act = a?.get(m) ?? 0;
                      const prev = a?.get(addMonths(m, -12)) ?? 0;
                      return (
                        <td key={m} className={`cell ${m < currentMonth ? 'past' : ''}`}>
                          <AmountInput value={l.amounts[m] ?? 0} onCommit={(v) => setAmount(l, m, v)} />
                          <div className="cell-sub">
                            {act ? (
                              <span className="act" title="当月の実績">実 {num(act)}</span>
                            ) : prev ? (
                              <span title="前年同月の実績">前年 {num(prev)}</span>
                            ) : (
                              <span />
                            )}
                            {l.amounts[m] ? (
                              <button className="link" title="以降の月に同額をコピー" onClick={() => fillRight(l, m)}>→</button>
                            ) : null}
                          </div>
                        </td>
                      );
                    })}
                    <td className="r strong">{num(total)}</td>
                    <td>
                      <button className="link danger" onClick={() => confirm(`「${l.label}」を削除しますか？`) && setData((d) => ({ ...d, forecasts: d.forecasts.filter((x) => x.id !== l.id) }))}>
                        削除
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td className="sticky">予測（加重）</td>
                <td />
                {plan.map((p) => (
                  <td key={p.month} className="r">{num(p.forecast)}</td>
                ))}
                <td className="r">{num(totalForecast)}</td>
                <td />
              </tr>
              <tr>
                <td className="sticky">実績</td>
                <td />
                {plan.map((p) => (
                  <td key={p.month} className="r">{p.actual ? num(p.actual) : ''}</td>
                ))}
                <td className="r">{num(totalActual)}</td>
                <td />
              </tr>
              <tr>
                <td className="sticky">予実差</td>
                <td />
                {plan.map((p) => {
                  const show = p.isPast || p.actual;
                  const diff = p.actual - p.forecast;
                  return (
                    <td key={p.month} className={`r ${show && diff < 0 ? 'danger' : ''}`}>
                      {show ? num(diff) : ''}
                    </td>
                  );
                })}
                <td className="r">{pct(totalForecast ? totalActual / totalForecast : NaN)}</td>
                <td />
              </tr>
              <tr className="landing">
                <td className="sticky">着地見込</td>
                <td />
                {plan.map((p) => (
                  <td key={p.month} className="r">{num(p.landing)}</td>
                ))}
                <td className="r">{num(totalLanding)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
        <p className="note">
          確度は「加重＝金額×確度」で集計します（継続案件は100%、見込み案件は50%など）。着地見込は、経過月＝実績、当月以降＝実績と予測の大きい方です。
          各セルの下に当月の実績（実）、未計上の月は前年同月の実績（前年）を参考表示します。
        </p>
      </Section>
    </div>
  );
}
