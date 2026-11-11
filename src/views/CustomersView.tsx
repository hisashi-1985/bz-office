import { useMemo, useState } from 'react';
import { useStore } from '../store';
import { Section } from '../components/ui';
import { termsLabel } from '../lib/dates';
import { applyInferredTerms } from '../lib/matching';
import { num } from '../lib/format';
import { newId } from '../lib/mfImport';
import type { Customer, PaymentTerms } from '../types';

export function CustomersView() {
  const { data, setData, ledger, today } = useStore();
  const [newName, setNewName] = useState('');
  const [mergeFrom, setMergeFrom] = useState('');
  const [mergeTo, setMergeTo] = useState('');

  const stats = useMemo(() => {
    const m = new Map<string, { sales: number; ar: number; count: number }>();
    for (const i of ledger.invoices) {
      if (!i.customerId) continue;
      const s = m.get(i.customerId) ?? { sales: 0, ar: 0, count: 0 };
      s.sales += i.net;
      s.ar += i.outstanding;
      s.count++;
      m.set(i.customerId, s);
    }
    return m;
  }, [ledger.invoices]);

  const update = (id: string, patch: Partial<Customer>) =>
    setData((d) => ({ ...d, customers: d.customers.map((c) => (c.id === id ? { ...c, ...patch } : c)) }));
  const setTerms = (c: Customer, patch: Partial<PaymentTerms> | null) =>
    update(c.id, { terms: patch === null ? null : { ...(c.terms ?? { monthOffset: 1, day: 31 }), ...patch }, termsInferred: false });

  const add = () => {
    const name = newName.trim();
    if (!name) return;
    setData((d) => ({ ...d, customers: [...d.customers, { id: newId('cus'), name, aliases: [], terms: null, termsInferred: false, note: '' }] }));
    setNewName('');
  };

  const merge = () => {
    if (!mergeFrom || !mergeTo || mergeFrom === mergeTo) return;
    const from = data.customers.find((c) => c.id === mergeFrom)!;
    const to = data.customers.find((c) => c.id === mergeTo)!;
    if (!confirm(`「${from.name}」を「${to.name}」に統合します。請求・入金・予測の取引先も付け替えます。`)) return;
    const re = <T extends { customerId: string | null }>(x: T): T => (x.customerId === mergeFrom ? { ...x, customerId: mergeTo } : x);
    setData((d) => ({
      ...d,
      customers: d.customers
        .filter((c) => c.id !== mergeFrom)
        .map((c) => (c.id === mergeTo ? { ...c, aliases: [...new Set([...c.aliases, from.name, ...from.aliases])] } : c)),
      invoices: d.invoices.map(re),
      receipts: d.receipts.map(re),
      forecasts: d.forecasts.map(re),
    }));
    setMergeFrom('');
  };

  const sorted = [...data.customers].sort((a, b) => (stats.get(b.id)?.sales ?? 0) - (stats.get(a.id)?.sales ?? 0));

  return (
    <div className="stack">
      <Section
        title={`取引先（${data.customers.length}社）`}
        actions={
          <>
            <button onClick={() => setData((d) => ({ ...d, customers: applyInferredTerms(d, today) }))} title="手動設定した取引先は変更しません">
              支払サイトを入金実績から再推定
            </button>
          </>
        }
      >
        <div className="form-row">
          <input placeholder="新しい取引先名" value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
          <button className="primary" onClick={add}>追加</button>
        </div>
        <div className="scroll-x">
          <table>
            <thead>
              <tr>
                <th>取引先名</th>
                <th>別名（照合用・カンマ区切り）</th>
                <th>支払サイト</th>
                <th className="r">売上累計(税抜)</th>
                <th className="r">売掛残高</th>
                <th>メモ</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((c) => {
                const s = stats.get(c.id);
                return (
                  <tr key={c.id}>
                    <td><input value={c.name} onChange={(e) => update(c.id, { name: e.target.value })} /></td>
                    <td>
                      <input
                        defaultValue={c.aliases.join(', ')}
                        onBlur={(e) => update(c.id, { aliases: e.target.value.split(/[,、]/).map((x) => x.trim()).filter(Boolean) })}
                      />
                    </td>
                    <td className="nowrap">
                      <select
                        value={c.terms ? String(c.terms.monthOffset) : ''}
                        onChange={(e) => setTerms(c, e.target.value === '' ? null : { monthOffset: Number(e.target.value) })}
                      >
                        <option value="">未設定</option>
                        <option value="0">当月</option>
                        <option value="1">翌月</option>
                        <option value="2">翌々月</option>
                        <option value="3">3ヶ月後</option>
                      </select>
                      {c.terms && (
                        <select value={c.terms.day} onChange={(e) => setTerms(c, { day: Number(e.target.value) })}>
                          {[5, 10, 15, 20, 25].map((d) => (
                            <option key={d} value={d}>{d}日</option>
                          ))}
                          <option value={31}>末日</option>
                        </select>
                      )}
                      {c.termsInferred && <span className="tag" title="入金実績から自動推定">推定</span>}
                      <span className="sr-only">{termsLabel(c.terms)}</span>
                    </td>
                    <td className="r">{s ? num(s.sales) : ''}</td>
                    <td className="r">{s?.ar ? num(s.ar) : ''}</td>
                    <td><input value={c.note} onChange={(e) => update(c.id, { note: e.target.value })} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="取引先の統合（表記ゆれの解消）">
        <div className="form-row">
          <select value={mergeFrom} onChange={(e) => setMergeFrom(e.target.value)}>
            <option value="">統合元</option>
            {data.customers.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <span>→</span>
          <select value={mergeTo} onChange={(e) => setMergeTo(e.target.value)}>
            <option value="">統合先</option>
            {data.customers.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <button onClick={merge} disabled={!mergeFrom || !mergeTo || mergeFrom === mergeTo}>統合</button>
        </div>
        <p className="note">統合元の名前は統合先の「別名」に追加され、次回のCSV取込から自動で同じ取引先として扱われます。</p>
      </Section>
    </div>
  );
}
