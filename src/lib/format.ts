export const yen = (n: number) => `${n < 0 ? '-' : ''}¥${Math.abs(Math.round(n)).toLocaleString('ja-JP')}`;
export const num = (n: number) => Math.round(n).toLocaleString('ja-JP');
/** 万円表記（グラフ・KPI用） */
export const man = (n: number) => `${(n / 10000).toLocaleString('ja-JP', { maximumFractionDigits: 0 })}万円`;
export const pct = (n: number) => (Number.isFinite(n) ? `${(n * 100).toFixed(1)}%` : '-');
export const parseAmount = (s: string) => {
  const n = Number(s.normalize('NFKC').replace(/[,¥\s円]/g, ''));
  return Number.isFinite(n) ? n : 0;
};
