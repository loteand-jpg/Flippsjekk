import { Gavel, Hourglass, LoaderCircle, Star, TriangleAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import { BUYER_TYPE_LABEL, PRICE_BASIS_SHORT, PROPERTY_TYPE_LABEL, TENURE_LABEL } from '../../domain/enums';
import { formatArea, formatDate, formatDateTimeCompact, formatHours, formatMonths, formatNOK, formatPct, NO_BASIS, roundBidDown, UNKNOWN } from '../../lib/format';
import { QualityBadge, RecommendationBadge, RiskBadge, SaleStatusBadge, WorkStatusBadge } from './badges';
import type { SortKey } from './listLogic';
import type { PropertyRow } from './rowModel';

export interface ColumnDef {
  id: string;
  label: string;
  /** Forklaring som vises i kolonnevelgeren og som tittel. */
  help?: string;
  defaultVisible: boolean;
  sortKey?: SortKey;
  align?: 'left' | 'right';
  render: (r: PropertyRow) => ReactNode;
}

/** Økonomiske celler: ukjent/manglende vises som tekst, aldri som 0 kr. */
export function MoneyCell({ value, row, unknown = NO_BASIS }: { value: number | null; row: PropertyRow; unknown?: string }) {
  if (row.calcStatus === 'pending')
    return (
      <span className="inline-flex items-center gap-1 text-xs text-slate-500">
        <LoaderCircle className="size-3 animate-spin" aria-hidden /> Analyse pågår
      </span>
    );
  if (value === null) return <span className="text-xs text-slate-500">{row.calcStatus === 'invalid' ? 'Ugyldig input' : unknown}</span>;
  return <span className={value < 0 ? 'text-red-800' : undefined}>{formatNOK(value)}</span>;
}

export const COLUMNS: ColumnDef[] = [
  {
    id: 'address',
    label: 'Adresse / område',
    defaultVisible: true,
    sortKey: 'address',
    render: (r) => (
      <div className="min-w-[12rem]">
        <div className="flex items-center gap-1.5 font-medium text-ink">
          {r.favorite && <Star className="size-3.5 fill-amber-400 text-amber-500" aria-label="Favoritt" />}
          {r.address}
        </div>
        <div className="text-xs text-slate-600">
          {[r.district, PROPERTY_TYPE_LABEL[r.propertyType], r.areaBRAi ? formatArea(r.areaBRAi) : null].filter(Boolean).join(' · ')}
          {r.isDemo && <span className="ml-1 text-violet-800">· demo</span>}
        </div>
      </div>
    ),
  },
  { id: 'type', label: 'Boligtype', defaultVisible: false, render: (r) => PROPERTY_TYPE_LABEL[r.propertyType] },
  { id: 'tenure', label: 'Eierform', defaultVisible: false, render: (r) => TENURE_LABEL[r.tenure] },
  { id: 'area', label: 'BRA-i', defaultVisible: false, sortKey: 'area', align: 'right', render: (r) => formatArea(r.areaBRAi) },
  { id: 'asking', label: 'Prisantydning kontant', defaultVisible: false, sortKey: 'asking', align: 'right', render: (r) => formatNOK(r.askingCash) },
  { id: 'debt', label: 'Fellesgjeld', defaultVisible: false, align: 'right', render: (r) => formatNOK(r.sharedDebt) },
  {
    id: 'askingInclDebt',
    label: 'Pris inkl. fellesgjeld',
    help: 'Prisantydning + fellesgjeld, eksklusive kjøpskostnader.',
    defaultVisible: false,
    align: 'right',
    render: (r) => formatNOK(r.askingInclDebt),
  },
  { id: 'purchase', label: 'Min kjøpspris', help: 'Planlagt kontant kjøpspris i primært scenario.', defaultVisible: true, sortKey: 'purchase', align: 'right', render: (r) => formatNOK(r.purchase) },
  {
    id: 'maxBid',
    label: 'Maksbud',
    help: 'Modellert høyeste kontante kjøpspris som når fortjenestemålet i normalt scenario. Ikke budfullmakt.',
    defaultVisible: true,
    sortKey: 'maxBid',
    align: 'right',
    render: (r) => (r.maxBidStatus === 'none' ? <span className="text-xs text-red-800">Ingen gjennomførbar pris</span> : <MoneyCell value={roundBidDown(r.maxBid)} row={r} />),
  },
  { id: 'renovation', label: 'Oppussing inkl. reserve', help: 'Valgt oppussingssum pluss reserve.', defaultVisible: true, sortKey: 'renovation', align: 'right', render: (r) => <MoneyCell value={r.renovationWithReserve} row={r} /> },
  {
    id: 'sale',
    label: 'Forventet salgspris',
    help: 'Normalt scenario. Prisgrunnlaget står under beløpet.',
    defaultVisible: true,
    sortKey: 'sale',
    align: 'right',
    render: (r) => (
      <div>
        <div>{formatNOK(r.saleBase, NO_BASIS)}</div>
        {r.saleBasis && <div className="text-[11px] text-slate-500">{PRICE_BASIS_SHORT[r.saleBasis]}</div>}
      </div>
    ),
  },
  {
    id: 'profit',
    label: 'Fortjeneste før skatt',
    help: 'Resultat før skatt og før verdsetting av eget arbeid, normalt scenario.',
    defaultVisible: true,
    sortKey: 'profit',
    align: 'right',
    render: (r) => (
      <div className="font-semibold">
        <MoneyCell value={r.profit} row={r} />
        {r.missing.length > 0 && r.calcStatus === 'incomplete' && (
          <div className="text-[11px] font-normal text-slate-500" title={r.missing.join(', ')}>
            {r.missing.length} mangler
          </div>
        )}
      </div>
    ),
  },
  { id: 'profitOwn', label: 'Etter eget arbeid', help: 'Fortjeneste minus egne timer × timeverdi.', defaultVisible: false, align: 'right', render: (r) => <MoneyCell value={r.profitAfterOwnWork} row={r} unknown={UNKNOWN} /> },
  { id: 'return', label: 'Prosjektavkastning', help: '(S − C) / (C + fellesgjeld ved kjøp). Ikke egenkapitalavkastning.', defaultVisible: false, sortKey: 'return', align: 'right', render: (r) => formatPct(r.projectReturn, NO_BASIS) },
  { id: 'months', label: 'Prosjekttid', defaultVisible: false, sortKey: 'months', align: 'right', render: (r) => formatMonths(r.months) },
  { id: 'hours', label: 'Egne timer', defaultVisible: false, align: 'right', render: (r) => formatHours(r.ownHours) },
  { id: 'risk', label: 'Risiko', help: 'Høyeste kjente alvorlighet 1–10. Uavklart når ingen nivåer er kjent.', defaultVisible: true, sortKey: 'risk', render: (r) => (
      <div>
        <RiskBadge score={r.riskScore} band={r.riskBand} />
        {r.riskUnknown > 0 && <div className="mt-0.5 text-[11px] text-slate-500">+{r.riskUnknown} ukjent</div>}
      </div>
    ) },
  { id: 'quality', label: 'Datakvalitet', help: 'Hvor godt grunnlaget er dokumentert. Måles separat fra risiko.', defaultVisible: true, sortKey: 'quality', render: (r) => <QualityBadge grade={r.quality} /> },
  {
    id: 'recommendation',
    label: 'Anbefaling',
    defaultVisible: true,
    render: (r) => (
      <div className="flex flex-col items-start gap-1">
        <RecommendationBadge value={r.recommendation} />
        {r.preliminary.length > 0 && (
          <span className="inline-flex items-center gap-1 text-[11px] text-amber-800" title={r.preliminary.join(' · ')}>
            <Hourglass className="size-3" aria-hidden /> Foreløpig
          </span>
        )}
      </div>
    ),
  },
  { id: 'viewing', label: 'Neste visning', defaultVisible: true, sortKey: 'viewing', render: (r) => (r.nextViewing ? <span className="whitespace-nowrap">{formatDateTimeCompact(r.nextViewing)}</span> : <span className="text-xs text-slate-500">Ingen kjent</span>) },
  {
    id: 'bidDay',
    label: 'Forventet buddag',
    help: 'Prognose: kl. 12 dagen etter siste annonserte visning. Ikke bekreftet budstart.',
    defaultVisible: false,
    sortKey: 'bidDay',
    render: (r) =>
      r.bidDay ? (
        <span className="inline-flex items-center gap-1">
          <Gavel className="size-3 text-amber-700" aria-hidden />
          {formatDateTimeCompact(r.bidDay)}
          {r.bidDayIsOverride && <span className="text-[11px] text-violet-800">(privat)</span>}
        </span>
      ) : (
        <span className="text-xs text-slate-500">Ingen prognose</span>
      ),
  },
  { id: 'saleStatus', label: 'Salgsstatus', defaultVisible: false, render: (r) => <SaleStatusBadge value={r.saleStatus} note={r.item.snapshot?.saleStatusNote} /> },
  { id: 'workStatus', label: 'Min status', defaultVisible: false, render: (r) => <WorkStatusBadge value={r.workStatus} /> },
  { id: 'buyerType', label: 'Kjøpertype', defaultVisible: false, render: (r) => (r.buyerType ? BUYER_TYPE_LABEL[r.buyerType] : UNKNOWN) },
  {
    id: 'updated',
    label: 'Oppdatert',
    help: 'Grunnanalysen og siste kontroll av pris, visninger og salgsstatus.',
    defaultVisible: false,
    sortKey: 'updated',
    render: (r) => (
      <div className="text-xs">
        <div>Analyse: {formatDate(r.analysisUpdatedAt, '–')}</div>
        <div className="text-slate-600">Annonse: {formatDate(r.listingCheckedAt, '–')}</div>
      </div>
    ),
  },
];

export const DEFAULT_COLUMN_IDS = COLUMNS.filter((c) => c.defaultVisible).map((c) => c.id);

export function RowFlags({ r }: { r: PropertyRow }) {
  const flags: ReactNode[] = [];
  if (r.workStatus !== 'vurderes') flags.push(<WorkStatusBadge key="w" value={r.workStatus} />);
  if (r.scenarioSource === 'mitt_scenario') flags.push(<span key="m" className="rounded bg-violet-50 px-1.5 text-[11px] font-medium text-violet-900 ring-1 ring-violet-200">Mitt scenario</span>);
  if (r.scenarioSource === 'grunnanalyse') flags.push(<span key="g" className="rounded bg-slate-50 px-1.5 text-[11px] font-medium text-slate-700 ring-1 ring-slate-200">Grunnanalyse</span>);
  if (r.scenarioSource === 'importert') flags.push(<span key="i" className="rounded bg-amber-50 px-1.5 text-[11px] font-medium text-amber-900 ring-1 ring-amber-200">Importert utkast</span>);
  if (r.hasNewVersion) flags.push(<span key="n" className="rounded bg-sky-50 px-1.5 text-[11px] font-medium text-sky-900 ring-1 ring-sky-200">Ny analyseversjon</span>);
  if (r.jobFailed) flags.push(<span key="f" className="inline-flex items-center gap-1 rounded bg-red-50 px-1.5 text-[11px] font-medium text-red-900 ring-1 ring-red-200"><TriangleAlert className="size-3" aria-hidden />Analyse feilet</span>);
  if (r.warnings.some((w) => w.includes('Påkrevd'))) flags.push(<span key="p" className="rounded bg-amber-50 px-1.5 text-[11px] font-medium text-amber-900 ring-1 ring-amber-200">Påkrevd tiltak utelatt</span>);
  return flags.length ? <div className="mt-1 flex flex-wrap gap-1">{flags}</div> : null;
}
