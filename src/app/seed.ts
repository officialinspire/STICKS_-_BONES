/** A fresh secret seed for a match. Never shown, logged, or placed in a URL. */
export function secureSeed(): number {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return a[0]!;
}
