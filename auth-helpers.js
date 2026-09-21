// Simple non-cryptographic hash for password comparison.
// Not secure crypto, but sufficient for this school app's needs.
export function hashPassword(password) {
  const str = String(password).trim();
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) + str.charCodeAt(i);
    hash = hash & 0xffffffff;
  }
  return "h" + Math.abs(hash).toString(36);
}

export function normalizeName(name) {
  return String(name).trim().toLowerCase();
}

export function generateUid() {
  return "u_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
}
