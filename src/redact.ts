// Tokens never reach a screen, a log or an error message. Everything we print passes through here.
const TOKEN = /dxm_[A-Za-z0-9_-]{4,}/g

/** "dxm_AbCdEf…" becomes "dxm_AbCd****". Keeps the first 4 characters so you can tell tokens apart. */
export const redact = (text: string): string =>
  text.replace(TOKEN, (t, at: number) => (text.startsWith('****', at + t.length) ? t : t.slice(0, 8) + '****'))
