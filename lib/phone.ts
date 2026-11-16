import areaCodes from './argentine-area-codes.mjs';
const areas = new Set(areaCodes);
/** Argentine mobile format: 10 national digits, plus 54 9 for WhatsApp.
 * Legacy 0 + area + 15 + subscriber is accepted only with one possible split.
 * Short local-only numbers cannot identify an area and are rejected.
 */
export const PHONE_ERROR = 'Ingresá código de área y número completos (por ejemplo, 358 4928722). No incluyas internos.';
export function normalizeArgentineMobile(value: unknown): string {
  if (typeof value !== 'string' || value.length > 40 || !/^\+?[\d\s()\-]+$/.test(value.trim())) throw Error(PHONE_ERROR);
  let digits = value.replace(/\D/g, '');
  if (digits.startsWith('549') && digits.length === 13) digits = digits.slice(3);
  else if (digits.startsWith('54') && digits.length === 12) digits = digits.slice(2);
  else if (value.trim().startsWith('+')) throw Error(PHONE_ERROR);
  if (digits.startsWith('0')) digits = digits.slice(1);
  const national = (n:string)=>/^\d{10}$/.test(n)&&areaCodes.some(area=>n.startsWith(area));
  if (digits.length === 12) {
    const candidates = new Set<string>();
    for (const area of [2, 3, 4]) {
      if (digits.slice(area, area + 2) === '15') {
        const candidate = digits.slice(0, area) + digits.slice(area + 2);
        if (national(candidate) && areas.has(digits.slice(0,area))) candidates.add(candidate);
      }
    }
    if (candidates.size !== 1) throw Error(PHONE_ERROR);
    digits = [...candidates][0];
  }
  if (!national(digits)) throw Error(PHONE_ERROR);
  return '549' + digits;
}
export function whatsappUrl(value: unknown, message = ''): string | null {
  try { return 'https://wa.me/' + normalizeArgentineMobile(value) + (message ? '?text=' + encodeURIComponent(message) : ''); }
  catch { return null; }
}
