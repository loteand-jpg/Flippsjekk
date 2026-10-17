/**
 * Markedstall og 2026-planleggingstall. Samlet her så de er lette å oppdatere.
 * Oppdater `checkedAt` og verdiene sammen når innholdet kontrolleres på nytt.
 */
export const MARKET_CHECKED_AT = '17. oktober 2026';

export interface MarketRow {
  label: string;
  value: string;
  note?: string;
}

export const MARKET_ROWS: MarketRow[] = [
  { label: 'Norges Banks styringsrente', value: '4,50 %' },
  { label: 'SSB: nye boliglån til husholdninger, august 2026', value: 'ca. 5,32 %' },
  { label: 'SSB: brukte boliger nasjonalt, Q3 2025 → Q3 2026', value: '+3,3 %' },
  { label: 'Trondheim, Q3 2025 → Q3 2026', value: '+2,8 %' },
  { label: 'Trondheim, sesongjustert Q2 → Q3 2026', value: '+0,9 %' },
];

export interface PlanningRow {
  post: string;
  indication: string;
  note: string;
}

export const PLANNING_ROWS: PlanningRow[] = [
  { post: 'Overflateoppussing', indication: 'rundt 4 000 kr/m² i gjennomsnitt', note: 'Grov publisert markedsindikasjon.' },
  { post: 'Totalrenovering', indication: 'rundt 14 000 kr/m² i gjennomsnitt', note: 'Registrert spenn kan være omtrent 8 000–25 000 kr/m². Avhenger kraftig av prosjektet.' },
  {
    post: 'Bad',
    indication: 'ned mot ca. 200 000 kr (enklere) · ofte 250 000–400 000 kr · godt over 400 000 kr (kompliserte/store)',
    note: 'Andre markedsdata viser mange bad rundt 150 000–350 000 kr.',
  },
  { post: 'Kjøkken', indication: 'ca. 75 000–300 000 kr, gjennomsnitt rundt 150 000 kr', note: 'Et middels eksempel med kjøkken, montering, elektriker og rørlegger lå rundt 164 000 kr.' },
  {
    post: 'Flytting av kjøkken',
    indication: 'Ingen standardpris',
    note: 'Et publisert større renoveringseksempel hadde omtrent 45 000 kr bare for nytt røropplegg til flyttet kjøkken – ikke totalprisen. I tillegg kan komme innredning, elektriker, avløp, ventilasjon, tømrer, overflater, branntetting, hulltaking og eventuell prosjektering/søknad.',
  },
];
