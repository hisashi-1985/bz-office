import { useEffect, useState } from 'react';
import { useStore } from './store';
import { Dashboard } from './views/Dashboard';
import { SalesView } from './views/SalesView';
import { ReceiptsView } from './views/ReceiptsView';
import { ForecastView } from './views/ForecastView';
import { BudgetView } from './views/BudgetView';
import { CompareView } from './views/CompareView';
import { CustomersView } from './views/CustomersView';
import { DataView } from './views/DataView';

const TABS = [
  { id: 'dashboard', label: 'ダッシュボード', el: Dashboard },
  { id: 'sales', label: '売上管理', el: SalesView },
  { id: 'receipts', label: '入金管理', el: ReceiptsView },
  { id: 'budget', label: '予算', el: BudgetView },
  { id: 'forecast', label: '売上予測', el: ForecastView },
  { id: 'compare', label: '予実比較', el: CompareView },
  { id: 'customers', label: '取引先', el: CustomersView },
  { id: 'data', label: 'データ取込', el: DataView },
] as const;
type TabId = (typeof TABS)[number]['id'];

const readHash = (): TabId => {
  const h = location.hash.slice(1);
  return (TABS.find((t) => t.id === h)?.id ?? 'dashboard') as TabId;
};

export function App() {
  const { data, saveError } = useStore();
  const [tab, setTab] = useState<TabId>(() => (data.invoices.length ? readHash() : 'data'));
  useEffect(() => {
    const on = () => setTab(readHash());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  const go = (id: TabId) => {
    location.hash = id;
    setTab(id);
  };
  const View = TABS.find((t) => t.id === tab)!.el;

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">売上・入金管理</div>
        <nav className="tabs">
          {TABS.map((t) => (
            <button key={t.id} className={t.id === tab ? 'active' : ''} onClick={() => go(t.id)}>
              {t.label}
            </button>
          ))}
        </nav>
      </header>
      {saveError && <div className="banner error">{saveError}</div>}
      <main>
        <View />
      </main>
    </div>
  );
}
