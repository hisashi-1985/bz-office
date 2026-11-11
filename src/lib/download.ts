import { notify } from '../components/dialog';

interface DownloadsApi {
  save(req: { filename: string; data: string }): Promise<{ status: string }>;
}
type ClaudeWindow = Window & { claude?: { use?: (name: string) => Promise<unknown> } };

/**
 * ファイルを保存する。
 * claude.ai の公開ページでは downloads 機能（保存前に確認が出る）、通常のブラウザではリンクから保存。
 */
export async function downloadText(filename: string, text: string, type = 'text/plain'): Promise<void> {
  const claude = (window as ClaudeWindow).claude;
  if (claude?.use) {
    const api = (await claude.use('downloads').catch(() => null)) as DownloadsApi | null;
    if (api) {
      try {
        await api.save({ filename, data: text });
      } catch (e) {
        const code = (e as { code?: string })?.code;
        if (code !== 'declined') await notify(`ファイルを保存できませんでした（${code ?? '不明なエラー'}）。`);
      }
      return;
    }
  }
  const url = URL.createObjectURL(new Blob([text], { type: `${type};charset=utf-8` }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
