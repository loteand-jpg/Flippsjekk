import { jumpTo } from './jump';

export const SECTIONS = [
  { id: 'versjoner', label: 'Versjoner' },
  { id: 'fra-til', label: 'Fra → til' },
  { id: 'oppussing', label: 'Oppussing' },
  { id: 'okonomi', label: 'Økonomi' },
  { id: 'marked', label: 'Marked' },
  { id: 'salg', label: 'Salg' },
  { id: 'risiko', label: 'Risiko' },
  { id: 'visning', label: 'Visning' },
  { id: 'detaljer', label: 'Detaljer' },
] as const;

/**
 * Innholdsfortegnelse for den lange objektsiden. Knapper (ikke #-lenker): hash-ruteren bruker adressefeltet til ruter, så ankerlenker ville
 * brutt navigasjonen. Hver knapp ruller til seksjonen og flytter fokus til overskriften.
 */
export function SectionNav() {
  return (
    <nav aria-label="På denne siden" className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0" data-testid="prop-sectionnav">
      <ul className="flex min-w-max gap-1.5 sm:min-w-0 sm:flex-wrap">
        {SECTIONS.map((s, i) => (
          <li key={s.id}>
            <button type="button" onClick={() => jumpTo(s.id)} className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-[var(--prop-line-strong)] bg-[var(--prop-paper)] px-3.5 text-sm font-medium whitespace-nowrap text-slate-800 hover:bg-[var(--prop-sand)]">
              <span className="prop-fig text-xs text-slate-600" aria-hidden>{i + 1}</span>
              {s.label}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
