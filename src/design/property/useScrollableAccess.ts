import { useEffect, type RefObject } from 'react';

/**
 * Tilgjengelighet for tabeller som rulles sideveis (WCAG 2.1.1): et rullbart område må kunne nås og rulles med tastatur.
 * Delte blokker (Marked, Oppussing m.fl.) har tabeller i `overflow-x-auto`-beholdere uten fokus. Her får de som faktisk
 * rulles tabindex, rolle og navn – kun innenfor Property og kun når innholdet faktisk er bredere enn beholderen.
 */
export function useScrollableAccess(root: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const apply = () => {
      let n = el.querySelectorAll('[data-prop-scroll]').length;
      el.querySelectorAll<HTMLElement>('.overflow-x-auto, table.num').forEach((s) => {
        if (s.closest('details:not([open])') && !s.matches('summary *')) return;
        const scrolls = s.scrollWidth > s.clientWidth + 1;
        if (scrolls && !s.hasAttribute('data-prop-scroll')) {
          s.setAttribute('data-prop-scroll', '');
          if (!s.hasAttribute('tabindex')) s.tabIndex = 0;
          if (!s.hasAttribute('role')) s.setAttribute('role', 'region');
          if (!s.hasAttribute('aria-label')) s.setAttribute('aria-label', `Tabell ${++n} (kan rulles sideveis)`);
        }
      });
    };
    apply();
    const mo = new MutationObserver(() => apply());
    mo.observe(el, { childList: true, subtree: true });
    window.addEventListener('resize', apply);
    return () => {
      mo.disconnect();
      window.removeEventListener('resize', apply);
    };
  }, [root]);
}
