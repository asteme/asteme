// Small formatting helpers shared by the screens. No React here.

// Dates and numbers follow the language the panel is shown in, which the copy
// names in its "_lang" entry, not the language of the operating system.
let language, dateTime = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });
export function setLanguage(tag) {
  if (!tag || tag === language || tag === '_lang' || tag.endsWith('._lang')) return;
  try { dateTime = new Intl.DateTimeFormat(tag, { dateStyle: 'medium', timeStyle: 'short' }); language = tag; } catch {}
}
export const currentLanguage = () => language ?? 'en';

/** Date and time in the reader's locale, or null when the value is missing or invalid. */
export function formatDateTime(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : dateTime.format(date);
}

export const formatNumber = value => (typeof value === 'number' ? value.toLocaleString(language) : '—');
export const formatBytes = n => typeof n !== 'number' ? '' : n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(1)} MB`;

/**
 * Copy for a value that comes from data (an enum the backend may extend).
 * Falls back to the raw value when the locale has no entry for it, whichever
 * way the host's `t` reports a missing key.
 */
export function labelFor(t, key, fallback) {
  const text = t(key);
  return !text || text === key || text.endsWith('.' + key) ? fallback : text;
}

export const cx = (...parts) => parts.filter(Boolean).join(' ');
