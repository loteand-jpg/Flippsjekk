/**
 * Hopp til en seksjon på siden. Hash-ruteren bruker adressefeltet til ruter, så vanlige #anker-lenker kan ikke brukes: dette er
 * knapper som ruller til seksjonen og flytter fokus til overskriften (tastatur og skjermleser følger med). Rolig rulling bare når
 * brukeren ikke har bedt om redusert bevegelse.
 */
export function jumpTo(id: string): void {
  const el = document.getElementById(id);
  if (!el) return;
  const reduce = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  const heading = el.querySelector<HTMLElement>('[id$="-t"]');
  heading?.focus({ preventScroll: true });
}
