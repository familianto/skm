export const LABEL_BAWA_SENDIRI = 'Bawa Sendiri';
export const LABEL_BELI = 'Beli';

export function displayTipeQurban(raw: string | null | undefined): string {
  if (!raw) return '';
  const s = String(raw).trim();
  if (!s) return '';
  const lower = s.toLowerCase();
  if (lower === 'penitipan' || lower === 'titipan' || lower === 'bawa sendiri') {
    return LABEL_BAWA_SENDIRI;
  }
  if (lower === 'beli') return LABEL_BELI;
  return s;
}
