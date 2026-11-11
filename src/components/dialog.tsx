import { useEffect, useRef, useState } from 'react';

/**
 * ページ内の確認ダイアログ。
 * window.confirm / alert は埋め込み表示（claude.ai の公開ページなど）では動かないため使わない。
 */
interface Pending {
  message: string;
  okLabel: string;
  danger: boolean;
  cancellable: boolean;
  resolve: (ok: boolean) => void;
}

let push: ((p: Pending) => void) | null = null;

export function askConfirm(message: string, opts: { okLabel?: string; danger?: boolean } = {}): Promise<boolean> {
  return new Promise((resolve) => {
    if (!push) return resolve(false);
    push({ message, okLabel: opts.okLabel ?? '実行する', danger: !!opts.danger, cancellable: true, resolve });
  });
}

export function notify(message: string): Promise<void> {
  return new Promise((resolve) => {
    if (!push) return resolve();
    push({ message, okLabel: 'OK', danger: false, cancellable: false, resolve: () => resolve() });
  });
}

export function DialogHost() {
  const [queue, setQueue] = useState<Pending[]>([]);
  const okRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    push = (p) => setQueue((q) => [...q, p]);
    return () => {
      push = null;
    };
  }, []);
  const current = queue[0];
  useEffect(() => okRef.current?.focus(), [current]);
  if (!current) return null;
  const close = (ok: boolean) => {
    current.resolve(ok);
    setQueue((q) => q.slice(1));
  };
  return (
    <div className="dialog-backdrop" onClick={() => current.cancellable && close(false)}>
      <div
        className="dialog"
        role="alertdialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.key === 'Escape' && current.cancellable && close(false)}
      >
        <p>{current.message}</p>
        <div className="dialog-actions">
          {current.cancellable && <button onClick={() => close(false)}>キャンセル</button>}
          <button ref={okRef} className={current.danger ? 'danger-fill' : 'primary'} onClick={() => close(true)}>
            {current.okLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
