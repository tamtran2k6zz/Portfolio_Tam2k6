import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

export function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  return `scrypt$${salt}$${hash.toString('hex')}`;
}

export function verifyPassword(password, encoded) {
  try {
    const [algorithm, salt, hash] = encoded.split('$');
    if (algorithm !== 'scrypt' || !/^[a-f0-9]{32}$/.test(salt) || !/^[a-f0-9]{128}$/.test(hash)) return false;
    const candidate = scryptSync(password, salt, 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
    return timingSafeEqual(candidate, Buffer.from(hash, 'hex'));
  } catch { return false; }
}

export function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const aa = Buffer.from(a); const bb = Buffer.from(b);
  return aa.length === bb.length && timingSafeEqual(aa, bb);
}

export function text(value, max, required = true) {
  if (typeof value !== 'string') throw Object.assign(new Error('Dữ liệu không hợp lệ.'), {status: 400});
  const result = value.trim();
  if ((required && !result) || result.length > max) throw Object.assign(new Error(`Nội dung bắt buộc và không vượt quá ${max} ký tự.`), {status: 400});
  return result;
}

export function webUrl(value) {
  const result = text(value, 500, false);
  if (!result) return '';
  try {
    const url = new URL(result);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw new Error();
    return url.toString();
  } catch { throw Object.assign(new Error('URL phải bắt đầu bằng http:// hoặc https://.'), {status: 400}); }
}

export function positiveId(value) {
  if (!/^[1-9]\d{0,9}$/.test(String(value))) throw Object.assign(new Error('ID không hợp lệ.'), {status: 400});
  return Number(value);
}
