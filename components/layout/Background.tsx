/**
 * Ambient page background.
 *
 * White is the main background everywhere; we only add an extremely subtle
 * warm highlight near the top so the page does not look completely flat.
 * No dark surfaces, no heavy gradients, no animations.
 */
export function Background() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-white">
      <div className="absolute inset-x-0 top-0 h-72 bg-gradient-to-b from-gold-50 via-white to-white" />
      <div className="absolute -top-24 right-0 h-72 w-72 rounded-full bg-gold-100/40 blur-3xl" />
      <div className="absolute -top-24 left-0 h-72 w-72 rounded-full bg-brand-50/60 blur-3xl" />
    </div>
  );
}
