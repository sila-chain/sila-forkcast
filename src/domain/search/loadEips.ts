/**
 * `sips.json` is ~630 KB. Global search opens from every page, so the SIP data is
 * pulled in on demand rather than statically — pages that already import it
 * (/sips, /sips/{id}, /decisions) share the same chunk for free.
 */
type EipsModule = typeof import('../../data/sips');

let pending: Promise<EipsModule> | null = null;

export function loadEips(): Promise<EipsModule> {
  if (!pending) {
    pending = import('../../data/sips').catch((error) => {
      pending = null;
      throw error;
    });
  }
  return pending;
}
