import { useEffect, useRef, useState } from 'react';

/** Målt bredde på en container (px), så SVG-diagrammer tegnes i ekte piksler og tekst aldri skaleres ned på mobil. */
export function useWidth<T extends HTMLElement>(initial = 640) {
  const ref = useRef<T | null>(null);
  const [width, setWidth] = useState(initial);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(Math.max(200, Math.round(el.getBoundingClientRect().width)) || initial);
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w) setWidth(Math.max(200, Math.round(w)));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [initial]);
  return [ref, width] as const;
}
