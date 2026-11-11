import { useMemo, useState } from 'react';
import { useStore } from '../store';
import { FiscalSelect, Section, useCurrentFiscal } from '../components/ui';
import { AmountInput } from '../components/AmountInput';
import { addMonths, fiscalLabel, fiscalMonths, monthLabel } from '../lib/dates';
import { actualsByCustomer, monthlyPlan } from '../lib/forecast';
import { BUDGET_SOURCE_LABELS, generateBudget, type BudgetSource } from '../lib/budget';
import { num, pct } from '../lib/format';
import { newId } from '../lib/mfImport';
import type { BudgetLine } from '../types';

export function BudgetView() {
  const { data, setData } = useStore();
  const currentFy = useCurrentFiscal();
  const [fy, setFy] = useState(currentFy);
  const [source, setSource] = useState<BudgetSource>('prevActual');
  const [growth, setGrowth] = useState(10);
  const months = fiscalMonths(fy);
  const budgets = data.budgets ?? [];
  const actuals = useMemo(() => actualsByCustomer(data), [data]);
  const prevPlan = useMemo(() => monthlyPlan(data, addMonths(fy, -12), '9999-12'), [data, fy]);

  const updateLine = (id: string, patch: Partial<BudgetLine>) =>
    setData((d) => ({ ...d, budgets: (d.budgets ?? []).map((l) => (l.id === id ? { ...l, ...patch } : l)) }));
  const setAmount = (l: BudgetLine, m: string, v: number) => {
    const amounts = { ...l.amounts };
    if (v) amounts[m] = v;
    else delete amounts[m];
    updateLine(l.id, { amounts });
  };
  const fillRight = (l: BudgetLine, from: string) => {
    const v = l.amounts[from] ?? 0;
    const amounts = { ...l.amounts };
    for (const m of months) if (m > from) v ? (amounts[m] = v) : delete amounts[m];
    updateLine(l.id, { amounts });
  };
  const generate = () => {
    const desc = `${BUDGET_SOURCE_LABELS[source]} × ${growth >= 0 ? '+' : ''}${growth}%`;
    if (!confirm(`${fiscalLabel(fy)}の予算を「${desc}」で作成します。\nこの期の予算はすべて置き換わります。よろしいですか？`)) return;
    setData((d) => ({ ...d, budgets: generateBudget(d, fy, source, growth) }));
  };
  const addLine = () =>
    setData((d) => ({ ...d, budgets: [...(d.budgets ?? []), { id: newId('bg'), label: '新規開拓', customerId: null, amounts: {}, note: '' }] }));

  // この期に金額がある行 + 金額が一つもない行（追加直後）を表示
  const lines = budgets.filter((l) => months.some((m) => l.amounts[m]) || Object.keys(l.amounts).length === 0);
  const colTotals = months.map((m) => lines.reduce((s, l) => s + (l.amounts[m] ?? 0), 0));
  const total = colTotals.reduce((a, b) => a + b, 0);
  const prevTotal = prevPlan.reduce((s, p) => s + p.actual, 0);

  return (
    <div className="stack">
      <div className="toolbar">
        <FiscalSelect value={fy} onChange={setFy} />
        <span className="sep" />
        <select value={source} onChange={(e) => setSource(e.target.value as BudgetSource)}>
          {Object.entries(BUDGET_SOURCE_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <label className="inline">
          ×
          <input className="pct" type="number" step={5} value={growth} onChange={(e) => setGrowth(Number(e.target.value))} />% 増
        </label>
        <button onClick={generate}>予算のたたき台を作成</button>
        <button className="primary" onClick={addLine}>＋ 予算行を追加</button>
      </div>

      <Section title={`${fiscalLabel(fy)} 売上予算（税抜）`}>
        <div className="scroll-x">
          <table className="matrix forecast">
            <thead>
              <tr>
                <th className="sticky">取引先・区分</th>
                {months.map((m) => (
                  <th key={m} className="r">{monthLabel(m)}</th>
                ))}
                <th className="r">年間予算</th>
                <th className="r">前期比</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {lines.length === 0 && (
                <tr>
                  <td colSpan={16} className="empty">
                    予算が未登録です。「予算のたたき台を作成」で前期実績や予測から作るか、「予算行を追加」で手入力してください。
                  </td>
                </tr>
              )}
              {lines.map((l) => {
                const a = l.customerId ? actuals.get(l.customerId) : undefined;
                const lineTotal = months.reduce((s, m) => s + (l.amounts[m] ?? 0), 0);
                const prev = months.reduce((s, m) => s + (a?.get(addMonths(m, -12)) ?? 0), 0);
                return (
                  <tr key={l.id}>
                    <td className="sticky">
                      <input className="label-input" value={l.label} onChange={(e) => updateLine(l.id, { label: e.target.value })} />
                      <select
                        className="mini"
                        value={l.customerId ?? ''}
                        onChange={(e) => {
                          const c = data.customers.find((x) => x.id === e.target.value);
                          updateLine(l.id, { customerId: c?.id ?? null, label: c?.name ?? l.label });
                        }}
                      >
                        <option value="">取引先なし（全社・新規など）</option>
                        {data.customers.map((c) => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                    </td>
                    {months.map((m) => {
                      const p = a?.get(addMonths(m, -12)) ?? 0;
                      return (
                        <td key={m} className="cell">
                          <AmountInput value={l.amounts[m] ?? 0} onCommit={(v) => setAmount(l, m, v)} />
                          <div className="cell-sub">
                            {p ? <span title="前年同月の実績">前年 {num(p)}</span> : <span />}
                            {l.amounts[m] ? (
                              <button className="link" title="以降の月に同額をコピー" onClick={() => fillRight(l, m)}>→</button>
                            ) : null}
                          </div>
                        </td>
                      );
                    })}
                    <td className="r strong">{num(lineTotal)}</td>
                    <td className="r muted">{prev ? pct(lineTotal / prev) : '-'}</td>
                    <td>
                      <button
                        className="link danger"
                        onClick={() =>
                          confirm(`「${l.label}」の予算を削除しますか？`) &&
                          setData((d) => ({ ...d, budgets: (d.budgets ?? []).filter((x) => x.id !== l.id) }))
                        }
                      >
                        削除
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td className="sticky">予算合計</td>
                {colTotals.map((v, i) => (
                  <td key={i} className="r">{num(v)}</td>
                ))}
                <td className="r">{num(total)}</td>
                <td className="r">{prevTotal ? pct(total / prevTotal) : '-'}</td>
                <td />
              </tr>
              <tr>
                <td className="sticky muted">前期実績</td>
                {prevPlan.map((p) => (
                  <td key={p.month} className="r muted">{p.actual ? num(p.actual) : ''}</td>
                ))}
                <td className="r muted">{num(prevTotal)}</td>
                <td />
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
        <p className="note">
          予算は期初に決めた目標です。見込みの変化は「売上予測」で更新し、予算は原則そのままにしておくと「予実比較」で目標とのズレが追えます。
          金額は1,000円単位で丸めて作成します。
        </p>
      </Section>
    </div>
  );
}
