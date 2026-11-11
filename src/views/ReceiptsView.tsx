import { useMemo, useState } from 'react';
import { useCustomerName, useStore } from '../store';
import { Empty, Kpi, Section, StatusBadge } from '../components/ui';
import { todayStr } from '../lib/dates';
import { num, parseAmount, yen } from '../lib/format';
import { newId } from '../lib/mfImport';
import type { MatchMethod } from '../lib/matching';
import type { Receipt } from '../types';

const METHOD_LABEL: Record<MatchMethod, string> = { manual: '手動', invoiceNo: '請求No一致', amount: '金額一致', fifo: '古い順' };

const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);

export function ReceiptsView() {
  const { data, setData, ledger, today } = useStore();
  const name = useCustomerName();
  const [filter, setFilter] = useState<'all' | 'unallocated' | 'opening'>('all');
  const [customer, setCustomer] = useState('');

  const aging = useMemo(() => {
    const rows = new Map<string, { notDue: number; d30: number; d60: number; d61: number; noDue: number }>();
    for (const i of ledger.invoices) {
      if (i.outstanding <= 0) continue;
      const k = i.customerId ?? '';
      const r = rows.get(k) ?? { notDue: 0, d30: 0, d60: 0, d61: 0, noDue: 0 };
      if (!i.due) r.noDue += i.outstanding;
      else {
        const late = daysBetween(i.due, today);
        if (late <= 0) r.notDue += i.outstanding;
        else if (late <= 30) r.d30 += i.outstanding;
        else if (late <= 60) r.d60 += i.outstanding;
        else r.d61 += i.outstanding;
      }
      rows.set(k, r);
    }
    return [...rows.entries()].map(([cid, r]) => ({ cid, ...r, total: r.notDue + r.d30 + r.d60 + r.d61 + r.noDue }));
  }, [ledger.invoices, today]);

  const openingEntries = Object.entries(data.settings.openingAR).sort();
  const openingTotal = openingEntries.length ? openingEntries[openingEntries.length - 1][1] : 0;
  const openingCollected = ledger.receipts.filter((r) => r.isOpening).reduce((s, r) => s + r.amount, 0);

  const list = ledger.receipts
    .filter((r) => filter === 'all' || (filter === 'unallocated' ? r.unallocated > 0 : r.isOpening))
    .filter((r) => !customer || r.customerId === customer)
    .sort((a, b) => b.date.localeCompare(a.date));

  const update = (id: string, patch: Partial<Receipt>) =>
    setData((d) => ({ ...d, receipts: d.receipts.map((r) => (r.id === id ? { ...r, ...patch } : r)) }));

  const totalAR = aging.reduce((s, r) => s + r.total, 0);
  const unallocTotal = ledger.receipts.reduce((s, r) => s + r.unallocated, 0);

  return (
    <div className="stack">
      <div className="kpis">
        <Kpi label="売掛金残高" value={yen(totalAR)} />
        <Kpi label="期日超過" value={yen(aging.reduce((s, r) => s + r.d30 + r.d60 + r.d61, 0))} tone="warn" />
        <Kpi label="未消込の入金" value={yen(unallocTotal)} tone={unallocTotal ? 'warn' : 'good'} />
        {openingTotal > 0 && (
          <Kpi
            label="期首売掛金の回収"
            value={`${yen(openingCollected)} / ${yen(openingTotal)}`}
            sub={openingCollected === openingTotal ? '全額回収済' : `差額 ${yen(openingTotal - openingCollected)}`}
            tone={openingCollected === openingTotal ? 'good' : 'warn'}
          />
        )}
      </div>

      <Section title="売掛金 年齢表（税込）">
        {aging.length === 0 ? (
          <Empty>未回収の売掛金はありません。</Empty>
        ) : (
          <table>
            <thead>
              <tr>
                <th>取引先</th>
                <th className="r">期日前</th>
                <th className="r">超過 1〜30日</th>
                <th className="r">31〜60日</th>
                <th className="r">61日以上</th>
                <th className="r">期日未設定</th>
                <th className="r">合計</th>
              </tr>
            </thead>
            <tbody>
              {aging.map((r) => (
                <tr key={r.cid}>
                  <td>{name(r.cid || null)}</td>
                  <td className="r">{r.notDue ? num(r.notDue) : ''}</td>
                  <td className="r warn">{r.d30 ? num(r.d30) : ''}</td>
                  <td className="r warn">{r.d60 ? num(r.d60) : ''}</td>
                  <td className="r danger">{r.d61 ? num(r.d61) : ''}</td>
                  <td className="r muted">{r.noDue ? num(r.noDue) : ''}</td>
                  <td className="r strong">{num(r.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {aging.some((r) => r.noDue) && <p className="note">「期日未設定」は取引先タブで支払サイトを設定すると期日が計算されます。</p>}
      </Section>

      <Section
        title={`入金一覧（${list.length}件）`}
        actions={
          <>
            <select value={customer} onChange={(e) => setCustomer(e.target.value)}>
              <option value="">すべての取引先</option>
              {data.customers.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <select value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)}>
              <option value="all">すべて</option>
              <option value="unallocated">未消込のみ</option>
              <option value="opening">期首残高の回収のみ</option>
            </select>
          </>
        }
      >
        <NewReceiptForm />
        <div className="scroll-x">
          <table>
            <thead>
              <tr>
                <th>入金日</th>
                <th>取引先</th>
                <th>摘要</th>
                <th className="r">入金額</th>
                <th>消込先</th>
                <th>手動指定</th>
                <th>期首分</th>
              </tr>
            </thead>
            <tbody>
              {list.map((r) => {
                const openInvs = ledger.invoices.filter(
                  (i) => i.customerId === r.customerId && (i.outstanding > 0 || i.id === r.manualInvoiceId || r.allocations.some((a) => a.invoiceId === i.id)),
                );
                return (
                  <tr key={r.id} className={r.unallocated > 0 ? 'row-warn' : ''}>
                    <td className="nowrap">{r.date}</td>
                    <td>{name(r.customerId)}</td>
                    <td className="desc" title={r.description}>{r.description}</td>
                    <td className="r">{num(r.amount)}</td>
                    <td>
                      {r.isOpening ? (
                        <span className="badge paid">期首売掛金</span>
                      ) : (
                        <>
                          {r.allocations.map((a) => {
                            const inv = ledger.invoiceById.get(a.invoiceId);
                            return (
                              <div key={a.invoiceId} className="alloc">
                                No.{inv?.invoiceNo ?? '-'}（{inv?.date.slice(0, 7)}）{num(a.amount)}
                                <span className="tag">{METHOD_LABEL[a.method]}</span>
                                {inv && <StatusBadge status={inv.status} />}
                              </div>
                            );
                          })}
                          {r.unallocated > 0 && <div className="alloc danger">未消込 {num(r.unallocated)}</div>}
                        </>
                      )}
                    </td>
                    <td>
                      <select
                        value={r.manualInvoiceId ?? ''}
                        onChange={(e) => update(r.id, { manualInvoiceId: e.target.value || null, openingBalance: e.target.value ? false : r.openingBalance })}
                      >
                        <option value="">自動</option>
                        {openInvs.map((i) => (
                          <option key={i.id} value={i.id}>
                            No.{i.invoiceNo ?? '-'} {i.date} {num(i.gross)}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="c">
                      <input
                        type="checkbox"
                        checked={r.isOpening}
                        title="前期以前の請求（期首売掛金）の回収として扱う"
                        onChange={(e) => update(r.id, { openingBalance: e.target.checked, manualInvoiceId: e.target.checked ? null : r.manualInvoiceId })}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="note">
          自動消込の順序：①請求No一致 → ②残高と同額の請求 → ③古い請求から順に充当。当データにない請求Noを含む入金や、最初の請求より前の入金は期首売掛金の回収と判定します。
        </p>
      </Section>
    </div>
  );
}

function NewReceiptForm() {
  const { data, setData } = useStore();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ date: todayStr(), customerId: '', amount: '', description: '' });
  if (!open) return <button className="primary small" onClick={() => setOpen(true)}>＋ 入金を手入力</button>;
  const submit = () => {
    const amount = parseAmount(f.amount);
    if (!f.customerId || !amount) return alert('取引先と入金額を入力してください');
    setData((d) => ({
      ...d,
      receipts: [
        ...d.receipts,
        { id: newId('rcp'), date: f.date, customerId: f.customerId, amount, description: f.description, invoiceNo: null, manualInvoiceId: null, openingBalance: null, source: 'manual' },
      ],
    }));
    setOpen(false);
    setF({ ...f, amount: '', description: '' });
  };
  return (
    <div className="form-row">
      <input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
      <select value={f.customerId} onChange={(e) => setF({ ...f, customerId: e.target.value })}>
        <option value="">取引先を選択</option>
        {data.customers.map((c) => (
          <option key={c.id} value={c.id}>{c.name}</option>
        ))}
      </select>
      <input placeholder="摘要" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
      <input placeholder="入金額" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} className="r" style={{ width: 140 }} />
      <button className="primary" onClick={submit}>追加</button>
      <button onClick={() => setOpen(false)}>取消</button>
    </div>
  );
}
