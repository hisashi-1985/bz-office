import { useRef, useState } from 'react';
import { emptyData, useStore } from '../store';
import { Section } from '../components/ui';
import { decodeCsvBytes } from '../lib/csv';
import { importMfJournal, type ImportResult } from '../lib/mfImport';
import { mergeImport } from '../lib/merge';
import { downloadText } from '../lib/download';
import { yen } from '../lib/format';
import type { AppData } from '../types';

export function DataView() {
  const { data, setData, today } = useStore();
  const [preview, setPreview] = useState<{ file: string; result: ImportResult } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const csvRef = useRef<HTMLInputElement>(null);
  const jsonRef = useRef<HTMLInputElement>(null);

  const onCsv = async (file: File) => {
    setError(null);
    setDone(null);
    try {
      const text = decodeCsvBytes(await file.arrayBuffer());
      setPreview({ file: file.name, result: importMfJournal(text, data.customers) });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const apply = () => {
    if (!preview) return;
    setData((d) => mergeImport(d, preview.result, today));
    setDone(`${preview.file} を取り込みました（売上 ${preview.result.invoices.length}件 / 入金 ${preview.result.receipts.length}件）`);
    setPreview(null);
  };

  const onJson = async (file: File) => {
    try {
      const parsed = JSON.parse(await file.text()) as AppData;
      if (parsed.version !== 1 || !Array.isArray(parsed.invoices)) throw new Error('バックアップファイルの形式が正しくありません');
      if (!confirm('現在のデータをバックアップの内容で置き換えます。よろしいですか？')) return;
      setData(() => ({ ...emptyData(), ...parsed }));
      setDone('バックアップから復元しました');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const r = preview?.result;
  return (
    <div className="stack">
      <Section title="マネーフォワード会計から取込">
        <ol className="steps">
          <li>MFクラウド会計 → 会計帳簿 → 仕訳帳 → 「エクスポート」→「仕訳帳（CSV）」を選択してダウンロード</li>
          <li>下のボタンからCSVを選択（Shift_JIS / UTF-8 どちらも可）</li>
          <li>内容を確認して「取り込む」。同じ期間を何度取り込んでも重複しません</li>
        </ol>
        <input ref={csvRef} type="file" accept=".csv,text/csv" hidden onChange={(e) => e.target.files?.[0] && onCsv(e.target.files[0])} />
        <button className="primary" onClick={() => { if (csvRef.current) { csvRef.current.value = ''; csvRef.current.click(); } }}>
          仕訳帳CSVを選択
        </button>
        {error && <div className="banner error">{error}</div>}
        {done && <div className="banner ok">{done}</div>}
        {r && (
          <div className="preview">
            <h3>取込内容の確認：{preview!.file}</h3>
            <table>
              <tbody>
                <tr><th>期間</th><td>{r.period ? `${r.period.from} 〜 ${r.period.to}` : '-'}</td></tr>
                <tr><th>売上（請求）</th><td>{r.invoices.length}件 / 税抜 {yen(r.invoices.reduce((s, i) => s + i.net, 0))}</td></tr>
                <tr><th>入金（売掛金回収）</th><td>{r.receipts.length}件 / {yen(r.receipts.reduce((s, x) => s + x.amount, 0))}</td></tr>
                <tr><th>期首売掛金</th><td>{r.openingAR ? yen(r.openingAR.amount) : 'なし'}</td></tr>
                <tr><th>新規取引先</th><td>{r.newCustomers.length ? r.newCustomers.map((c) => c.name).join('、') : 'なし'}</td></tr>
              </tbody>
            </table>
            {r.warnings.length > 0 && (
              <div className="banner warn">
                <strong>確認が必要な項目</strong>
                <ul>{r.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
              </div>
            )}
            <div className="form-row">
              <button className="primary" onClick={apply}>取り込む</button>
              <button onClick={() => setPreview(null)}>キャンセル</button>
            </div>
          </div>
        )}
      </Section>

      <Section title="バックアップ">
        <p className="muted">
          データはこのブラウザ内（localStorage）にのみ保存され、外部には送信されません。別のPCで使う場合や定期的な保全のため、バックアップを書き出してください。
        </p>
        <div className="form-row">
          <button onClick={() => downloadText(`sales-backup_${today}.json`, JSON.stringify(data, null, 2), 'application/json')}>バックアップを書き出す</button>
          <input ref={jsonRef} type="file" accept=".json,application/json" hidden onChange={(e) => e.target.files?.[0] && onJson(e.target.files[0])} />
          <button onClick={() => { if (jsonRef.current) { jsonRef.current.value = ''; jsonRef.current.click(); } }}>バックアップから復元</button>
          <button
            className="danger"
            onClick={() => confirm('すべてのデータを削除します。元に戻せません。よろしいですか？') && setData(() => emptyData())}
          >
            全データを削除
          </button>
        </div>
        <p className="note">
          現在のデータ：取引先 {data.customers.length} / 請求 {data.invoices.length} / 入金 {data.receipts.length} / 予算 {(data.budgets ?? []).length} / 予測 {data.forecasts.length}
        </p>
      </Section>

      <Section title="設定">
        <div className="form-row">
          <label>
            期首月
            <select
              value={data.settings.fiscalStartMonth}
              onChange={(e) => setData((d) => ({ ...d, settings: { ...d.settings, fiscalStartMonth: Number(e.target.value) } }))}
            >
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                <option key={m} value={m}>{m}月</option>
              ))}
            </select>
          </label>
          <label>
            消費税率（予測→入金予定の換算）
            <select
              value={data.settings.taxRate}
              onChange={(e) => setData((d) => ({ ...d, settings: { ...d.settings, taxRate: Number(e.target.value) } }))}
            >
              <option value={0.1}>10%</option>
              <option value={0.08}>8%</option>
              <option value={0}>0%</option>
            </select>
          </label>
        </div>
      </Section>
    </div>
  );
}
