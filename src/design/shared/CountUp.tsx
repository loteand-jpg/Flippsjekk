import { useEffect, useRef, useState } from 'react';
import { usePrefersReducedMotion } from './hooks';

/**
 * Tall som glir fra forrige verdi til ny når verdien endres (scenariobytte, ny kjøpspris), og som får et kort lysglimt (variantens `flashClass`).
 * Delt av Investment og Property.
 * Egen, liten implementasjon (ca. 1 kB, ingen bibliotek): requestAnimationFrame med ease-out. Første visning er alltid
 * det endelige tallet (animasjon skal forklare endring, ikke pynte), med mindre `animateOnMount` er satt.
 *
 * Tilgjengelighet: den animerte teksten er skjult for skjermlesere (aria-hidden); det endelige tallet står alltid i en
 * skjult tekst ved siden av. `data-value` har det eksakte, endelige tallet. Med «reduser bevegelse» hoppes animasjonen over.
 */
export function CountUp({
  value,
  format,
  duration = 650,
  animateOnMount = false,
  className,
  testId,
  flashClass,
}: {
  value: number | null;
  format: (n: number) => string;
  duration?: number;
  animateOnMount?: boolean;
  className?: string;
  testId?: string;
  /** CSS-klasse for det korte lysglimtet når verdien endres (variantens egen). Uten klasse ingen glimt. */
  flashClass?: string;
}) {
  const reduced = usePrefersReducedMotion();
  const [shown, setShown] = useState<number | null>(animateOnMount && value !== null ? 0 : value);
  const [flash, setFlash] = useState(0);
  const from = useRef<number | null>(animateOnMount && value !== null ? 0 : value);
  const raf = useRef<number | null>(null);
  const first = useRef(true);
  const prevProp = useRef<number | null>(value);

  useEffect(() => {
    const isFirst = first.current;
    first.current = false;
    if (raf.current !== null) cancelAnimationFrame(raf.current);
    if (value === null || from.current === null || reduced || (isFirst && !animateOnMount)) {
      from.current = value;
      setShown(value);
      return;
    }
    const start = from.current;
    if (start === value) {
      setShown(value);
      return;
    }
    if (!isFirst && prevProp.current !== value) setFlash((f) => f + 1);
    prevProp.current = value;
    const t0 = performance.now();
    const step = (t: number) => {
      const p = Math.min(1, (t - t0) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      const v = start + (value - start) * eased;
      setShown(p >= 1 ? value : v);
      from.current = p >= 1 ? value : v;
      if (p < 1) raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
    return () => {
      if (raf.current !== null) cancelAnimationFrame(raf.current);
    };
  }, [value, duration, reduced, animateOnMount]);

  if (value === null) return null;
  const final = format(value);
  return (
    <span className={className} data-testid={testId} data-value={value}>
      <span key={flash} className={flash > 0 ? flashClass : undefined} aria-hidden>
        {format(shown ?? value)}
      </span>
      <span className="sr-only">{final}</span>
    </span>
  );
}
