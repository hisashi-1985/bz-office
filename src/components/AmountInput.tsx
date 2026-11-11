import { useEffect, useState } from 'react';
import { num, parseAmount } from '../lib/format';

/** カンマ区切り表示の金額入力。確定（blur / Enter）時に onCommit */
export function AmountInput({ value, onCommit, placeholder }: { value: number; onCommit: (v: number) => void; placeholder?: string }) {
  const [draft, setDraft] = useState<string | null>(null);
  useEffect(() => setDraft(null), [value]);
  const commit = () => {
    if (draft === null) return;
    const v = parseAmount(draft);
    setDraft(null);
    if (v !== value) onCommit(v);
  };
  return (
    <input
      className="amount"
      inputMode="numeric"
      placeholder={placeholder}
      value={draft ?? (value ? num(value) : '')}
      onFocus={(e) => {
        setDraft(value ? String(value) : '');
        requestAnimationFrame(() => e.target.select());
      }}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        if (e.key === 'Escape') {
          setDraft(null);
          (e.target as HTMLInputElement).blur();
        }
      }}
    />
  );
}
