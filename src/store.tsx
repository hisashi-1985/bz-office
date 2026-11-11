import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { AppData } from './types';
import { reconcile, type Ledger } from './lib/matching';
import { todayStr } from './lib/dates';
import { sampleData } from './lib/sample';

const STORAGE_KEY = 'bz-office-sales:v1';

export const emptyData = (): AppData => ({
  version: 1,
  customers: [],
  invoices: [],
  receipts: [],
  forecasts: [],
  budgets: [],
  settings: { fiscalStartMonth: 11, taxRate: 0.1, openingAR: {} },
});

function load(): AppData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...emptyData(), ...JSON.parse(raw) };
  } catch {
    /* 読み込めない場合はサンプルを表示 */
  }
  return sampleData(todayStr());
}

interface Store {
  data: AppData;
  setData: (fn: (d: AppData) => AppData) => void;
  ledger: Ledger;
  today: string;
  saveError: string | null;
}

const Ctx = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [data, setState] = useState<AppData>(load);
  const [saveError, setSaveError] = useState<string | null>(null);
  const today = todayStr();

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      setSaveError(null);
    } catch (e) {
      setSaveError('ブラウザへの保存に失敗しました。「データ」タブからバックアップを書き出してください。');
    }
  }, [data]);

  const ledger = useMemo(() => reconcile(data, today), [data, today]);
  const value = useMemo(
    () => ({ data, setData: (fn: (d: AppData) => AppData) => setState(fn), ledger, today, saveError }),
    [data, ledger, today, saveError],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore() {
  const s = useContext(Ctx);
  if (!s) throw new Error('StoreProvider がありません');
  return s;
}

export function useCustomerName() {
  const { data } = useStore();
  const map = useMemo(() => new Map(data.customers.map((c) => [c.id, c.name])), [data.customers]);
  return (id: string | null) => (id ? map.get(id) ?? '（不明）' : '（未設定）');
}
