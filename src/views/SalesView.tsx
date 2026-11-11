import { useMemo, useState } from 'react';
import { useCustomerName, useStore } from '../store';
import { Empty, FiscalSelect, Section, StatusBadge, STATUS_LABEL, useCurrentFiscal } from '../components/ui';
import { fiscalMonths, monthLabel, monthOf, todayStr } from '../lib/dates';
import { num, parseAmount, yen } from '../lib/format';
import { newId } from '../lib/mfImport';
import { toCsv } from '../lib/csv';
import { downloadText } from '../lib/download';
import type { InvoiceStatus } from '../lib/matching';

export function SalesView() {
  const { data, setData, ledger } = useStore();
  const name = useCustomerName();
  const currentFy = useCurrentFiscal();
  const latestFy = useMemo(() => {
    const last = [...data.invoices].sort((a, b) => b.date.localeCompare(a.date))[0];
    if (!last) return currentFy;
    const sm = data.settings.fiscalStartMonth;
    const [y, m] = monthOf(last.date).split('-').map(Number);
    return `${m >= sm ? y : y - 1}-${String(sm).padStart(2, '0')}`;
  }, [data.invoices, data.settings.fiscalStartMonth, currentFy]);
  const [fy, setFy] = useState(latestFy);
  const [customer, setCustomer] = useState('');
  const [status, setStatus] = useState<'' | InvoiceStatus>('');
  const months = fiscalMonths(fy);

  const fyInvoices = ledger.invoices.filter((i) => months.includes(monthOf(i.date)));

  const matrix = useMemo(() => {
    const rows = new Map<string, number[]>();
    for (const i of fyInvoices) {
      const k = i.customerId ?? '';
      const arr = rows.get(k) ?? Array(12).fill(0);
      arr[months.indexOf(monthOf(i.date))] += i.net;
      rows.set(k, arr);
    }
    return [...rows.entries()]
      .map(([cid, vals]) => ({ cid, vals, total: vals.reduce((a, b) => a + b, 0) }))
      .sort((a, b) => b.total - a.total);
  }, [fyInvoices, months]);
  const colTotals = months.map((_, i) => matrix.reduce((s, r) => s + r.vals[i], 0));
  const grand = colTotals.reduce((a, b) => a + b, 0);

  const list = fyInvoices
    .filter((i) => !customer || i.customerId === customer)
    .filter((i) => !status || i.status === status)
    .sort((a, b) => b.date.localeCompare(a.date));

  const update = (id: string, patch: Partial<(typeof data.invoices)[number]>) =>
    setData((d) => ({ ...d, invoices: d.invoices.map((i) => (i.id === id ? { ...i, ...patch } : i)) }));

  const exportCsv = () => {
    const rows = [
      ['計上日', '取引先', '請求No', '摘要', '売上(税抜)', '請求額(税込)', '入金済', '未回収', '入金期日', '状態'],
      ...list.map((i) => [i.date, name(i.customerId), i.invoiceNo ?? '', i.description, i.net, i.gross, i.paid, i.outstanding, i.due ?? '', STATUS_LABEL[i.status]]),
    ];
    downloadText(`売上一覧_${fy}.csv`, '﻿' + toCsv(rows), 'text/csv');
  };

  return (
    <div className="stack">
      <div className="toolbar">
        <FiscalSelect value={fy} onChange={setFy} />
      </div>

      <Section title="取引先別 月次売上（税抜）">
        {matrix.length === 0 ? (
          <Empty>この期の売上データはありません。「データ取込」からCSVを取り込んでください。</Empty>
        ) : (
          <div className="scroll-x">
            <table className="matrix">
              <thead>
                <tr>
                  <th className="sticky">取引先</th>
                  {months.map((m) => (
                    <th key={m} className="r">{monthLabel(m)}</th>
                  ))}
                  <th className="r">合計</th>
                  <th className="r">構成比</th>
                </tr>
              </thead>
              <tbody>
                {matrix.map((r) => (
                  <tr key={r.cid}>
                    <td className="sticky">{name(r.cid || null)}</td>
                    {r.vals.map((v, i) => (
                      <td key={i} className="r">{v ? num(v) : ''}</td>
                    ))}
                    <td className="r strong">{num(r.total)}</td>
                    <td className="r muted">{grand ? ((r.total / grand) * 100).toFixed(1) : 0}%</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td className="sticky">合計</td>
                  {colTotals.map((v, i) => (
                    <td key={i} className="r">{num(v)}</td>
                  ))}
                  <td className="r">{num(grand)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Section>

      <Section
        title={`請求一覧（${list.length}件）`}
        actions={
          <>
            <select value={customer} onChange={(e) => setCustomer(e.target.value)}>
              <option value="">すべての取引先</option>
              {data.customers.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <select value={status} onChange={(e) => setStatus(e.target.value as InvoiceStatus | '')}>
              <option value="">すべての状態</option>
              {Object.entries(STATUS_LABEL).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
            <button onClick={exportCsv}>CSV出力</button>
          </>
        }
      >
        <NewInvoiceForm />
        <div className="scroll-x">
          <table>
            <thead>
              <tr>
                <th>計上日</th>
                <th>取引先</th>
                <th>No.</th>
                <th>摘要</th>
                <th className="r">売上(税抜)</th>
                <th className="r">請求額(税込)</th>
                <th className="r">未回収</th>
                <th>入金期日</th>
                <th>状態</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {list.map((i) => (
                <tr key={i.id}>
                  <td className="nowrap">{i.date}</td>
                  <td>
                    <select value={i.customerId ?? ''} onChange={(e) => update(i.id, { customerId: e.target.value || null })}>
                      <option value="">（未設定）</option>
                      {data.customers.map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </td>
                  <td>{i.invoiceNo ?? ''}</td>
                  <td className="desc" title={i.description}>{i.description}</td>
                  <td className="r">{num(i.net)}</td>
                  <td className="r">{num(i.gross)}</td>
                  <td className="r strong">{i.outstanding ? num(i.outstanding) : ''}</td>
                  <td>
                    <input
                      type="date"
                      value={i.due ?? ''}
                      className={i.dueDateOverride ? 'overridden' : ''}
                      title={i.dueDateOverride ? '手動設定（空にすると支払サイトから自動計算）' : '取引先の支払サイトから自動計算'}
                      onChange={(e) => update(i.id, { dueDateOverride: e.target.value || null })}
                    />
                  </td>
                  <td><StatusBadge status={i.status} /></td>
                  <td>
                    {i.source === 'manual' && (
                      <button className="link danger" onClick={() => confirm('この請求を削除しますか？') && setData((d) => ({ ...d, invoices: d.invoices.filter((x) => x.id !== i.id) }))}>
                        削除
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="note">金額の修正はMF会計側で行い、CSVを再取込してください（手動で設定した取引先・期日は保持されます）。</p>
      </Section>
    </div>
  );
}

function NewInvoiceForm() {
  const { data, setData } = useStore();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ date: todayStr(), customerId: '', invoiceNo: '', description: '', gross: '' });
  if (!open) return <button className="primary small" onClick={() => setOpen(true)}>＋ 請求を手入力</button>;
  const gross = parseAmount(f.gross);
  const net = Math.round(gross / (1 + data.settings.taxRate));
  const submit = () => {
    if (!f.customerId || !gross) return alert('取引先と請求額を入力してください');
    setData((d) => ({
      ...d,
      invoices: [
        ...d.invoices,
        { id: newId('inv'), date: f.date, customerId: f.customerId, invoiceNo: f.invoiceNo || null, description: f.description, gross, net, dueDateOverride: null, source: 'manual' },
      ],
    }));
    setOpen(false);
    setF({ ...f, invoiceNo: '', description: '', gross: '' });
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
      <input placeholder="請求No" value={f.invoiceNo} onChange={(e) => setF({ ...f, invoiceNo: e.target.value })} style={{ width: 80 }} />
      <input placeholder="摘要" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
      <input placeholder="請求額（税込）" value={f.gross} onChange={(e) => setF({ ...f, gross: e.target.value })} className="r" style={{ width: 140 }} />
      <span className="muted">税抜 {yen(net)}</span>
      <button className="primary" onClick={submit}>追加</button>
      <button onClick={() => setOpen(false)}>取消</button>
    </div>
  );
}
