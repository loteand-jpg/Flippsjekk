import clsx from 'clsx';
import { Archive, ArrowDown, ArrowUp, ChevronsUpDown, Download, FileJson, Inbox, Search, SearchX, SlidersHorizontal, Star } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { useLiveQuery, useMediaQuery, useNow } from '../../app/hooks';
import { usePref } from '../../app/preferences';
import { useServices } from '../../app/services';
import { useSession } from '../../app/session';
import { RecommendationBadge, SaleStatusBadge } from '../../components/property/badges';
import { AnalyzeBox } from '../../components/property/AnalyzeBox';
import { activeFilterCount, applyFilters, EMPTY_FILTERS, SORT_LABEL, sortRows, type ListFilters, type SortKey } from '../../components/property/listLogic';
import { FilterPanel } from '../../components/property/ListViews';
import { buildRow, isArchiveRow, type PropertyRow } from '../../components/property/rowModel';
import { Segmented, Select, TextInput } from '../../components/ui/forms';
import { Alert, Button, buttonClass, EmptyState, PageLoading } from '../../components/ui/primitives';
import { NEW_ACCOUNT_DEFAULTS } from '../../config/defaults';
import { RISK_BAND_LABEL } from '../../domain/assessment';
import { PROPERTY_TYPE_LABEL, TENURE_LABEL } from '../../domain/enums';
import { formatArea, formatDateTimeCompact, formatNOK, formatPct, NO_BASIS } from '../../lib/format';
import type { SortDirection } from '../../lib/sort';
import { Fig, Metric, Pill, Surface, TONE_TEXT } from './parts/primitives';
import { floorToThousand, profitTone } from './present';

function downloadText(filename: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Verdi i listen: ukjent er tekst («Mangler grunnlag»), aldri 0. */
function Money({ value, row, strong, signed }: { value: number | null; row: PropertyRow; strong?: boolean; signed?: boolean }) {
  if (value === null) {
    return (
      <span className="text-xs font-normal text-slate-500" title={row.missing.length ? `Mangler: ${row.missing.join(', ')}` : undefined}>
        {row.calcStatus === 'pending' ? 'Analyse pågår' : NO_BASIS}
      </span>
    );
  }
  return <Fig className={clsx(strong && 'font-semibold', signed && TONE_TEXT[profitTone(value)])}>{formatNOK(value)}</Fig>;
}

function RiskText({ r }: { r: PropertyRow }) {
  const band = r.riskScore === null ? 'Uavklart' : `${RISK_BAND_LABEL[r.riskBand]} (${r.riskScore}/10)`;
  return (
    <span className={clsx('text-sm', r.riskBand === 'hoy' && 'font-semibold text-[var(--fin-neg)]')} title={r.riskUnknown ? `${r.riskUnknown} risiko(er) med ukjent alvorlighet` : undefined}>
      {band}
      {r.riskUnknown ? <span className="text-slate-500"> +{r.riskUnknown}</span> : null}
    </span>
  );
}

function Summary({ rows, now }: { rows: PropertyRow[]; now: Date }) {
  const active = rows.filter((r) => !isArchiveRow(r));
  const interesting = active.filter((r) => r.recommendation === 'interessant').length;
  const upcoming = active.filter((r) => r.nextViewing).sort((a, b) => (a.nextViewing ?? '').localeCompare(b.nextViewing ?? ''));
  const week = upcoming.filter((r) => Date.parse(r.nextViewing!) - now.getTime() < 7 * 86_400_000).length;
  const best = active.filter((r) => r.profit !== null).reduce<PropertyRow | null>((a, b) => (a === null || (b.profit ?? -Infinity) > (a.profit ?? -Infinity) ? b : a), null);
  const incomplete = active.filter((r) => r.calcStatus === 'incomplete' || r.calcStatus === 'invalid').length;
  return (
    <dl className="fin-metrics grid grid-cols-2 gap-x-8 lg:grid-cols-4" aria-label="Oppsummering">
      <Metric label="Aktive objekter" value={String(active.length)} sub={`${interesting} vurdert som interessante`} />
      <Metric label="Visninger neste 7 dager" value={String(week)} sub={upcoming[0] ? `Neste: ${formatDateTimeCompact(upcoming[0].nextViewing)}` : 'Ingen kjente visninger'} />
      <Metric
        label="Høyest forventet fortjeneste"
        value={best ? formatNOK(best.profit) : 'Ingen komplette kalkyler'}
        tone={best ? profitTone(best.profit) : 'neutral'}
        unknown={!best}
        sub={best ? best.address : undefined}
      />
      <Metric label="Mangler grunnlag" value={String(incomplete)} sub="Objekter med ufullstendig kalkyle" tone={incomplete ? 'warn' : 'neutral'} />
    </dl>
  );
}

const COLS: { key: SortKey; label: string; align: 'left' | 'right'; className?: string }[] = [
  { key: 'address', label: 'Objekt', align: 'left' },
  { key: 'purchase', label: 'Kjøpspris', align: 'right' },
  { key: 'sale', label: 'Salgsverdi', align: 'right' },
  { key: 'profit', label: 'Fortjeneste', align: 'right' },
  { key: 'return', label: 'Avkastning', align: 'right' },
  { key: 'maxBid', label: 'Maksbud', align: 'right' },
  { key: 'risk', label: 'Risiko', align: 'left' },
  { key: 'viewing', label: 'Neste visning', align: 'left' },
];

function SortHeader({ col, sort, onSort }: { col: (typeof COLS)[number]; sort: { key: SortKey; dir: SortDirection }; onSort: (k: SortKey) => void }) {
  const active = sort.key === col.key;
  const Icon = !active ? ChevronsUpDown : sort.dir === 'asc' ? ArrowUp : ArrowDown;
  return (
    <th scope="col" aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'} className={clsx('px-3 py-2.5 font-medium', col.align === 'right' ? 'text-right' : 'text-left')}>
      <button
        type="button"
        onClick={() => onSort(col.key)}
        className={clsx('inline-flex items-center gap-1 rounded px-1 py-0.5 text-xs font-semibold tracking-wide uppercase hover:text-ink', active ? 'text-ink' : 'text-slate-600', col.align === 'right' && 'flex-row-reverse')}
      >
        {col.label}
        <Icon className={clsx('size-3', !active && 'opacity-50')} aria-hidden />
      </button>
    </th>
  );
}

function FinanceTable({ rows, sort, onSort }: { rows: PropertyRow[]; sort: { key: SortKey; dir: SortDirection }; onSort: (k: SortKey) => void }) {
  return (
    <Surface className="overflow-hidden">
      <table className="w-full table-fixed text-sm" data-testid="fin-table">
        <caption className="sr-only">Mine objekter som investeringsoversikt</caption>
        <colgroup>
          <col className="w-[26%]" />
          <col className="w-[11%]" />
          <col className="w-[11%]" />
          <col className="w-[11%]" />
          <col className="w-[9%]" />
          <col className="w-[12%]" />
          <col className="w-[10%]" />
          <col className="w-[10%]" />
        </colgroup>
        <thead className="border-b border-[var(--fin-line)] bg-[var(--fin-surface-muted)]">
          <tr>
            {COLS.map((c) => (
              <SortHeader key={c.key} col={c} sort={sort} onSort={onSort} />
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--fin-line)]">
          {rows.map((r) => (
            <tr key={r.id} className="group align-top hover:bg-[var(--fin-surface-muted)]" data-testid="fin-row">
              <th scope="row" className="px-3 py-3.5 text-left font-normal">
                <div className="flex min-w-0 items-start gap-1.5">
                  {r.favorite && <Star className="mt-0.5 size-3.5 shrink-0 fill-amber-400 text-amber-500" aria-label="Favoritt" />}
                  <div className="min-w-0">
                    <Link to={`/objekter/${r.id}`} className="block truncate font-semibold text-ink hover:underline" title={r.address}>
                      {r.address}
                    </Link>
                    <p className="truncate text-xs text-slate-600">
                      {[r.district, PROPERTY_TYPE_LABEL[r.propertyType], TENURE_LABEL[r.tenure], formatArea(r.areaBRAi, '')].filter(Boolean).join(' · ')}
                    </p>
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      <RecommendationBadge value={r.recommendation} />
                      <SaleStatusBadge value={r.saleStatus} />
                      {r.hasNewVersion && <Pill tone="info">Ny versjon</Pill>}
                    </div>
                  </div>
                </div>
              </th>
              <td className="px-3 py-3.5 text-right"><Money value={r.purchase} row={r} /></td>
              <td className="px-3 py-3.5 text-right"><Money value={r.saleBase} row={r} /></td>
              <td className="px-3 py-3.5 text-right"><Money value={r.profit} row={r} signed strong /></td>
              <td className="px-3 py-3.5 text-right">
                <Fig>{r.projectReturn === null ? <span className="text-xs text-slate-500">–</span> : formatPct(r.projectReturn)}</Fig>
              </td>
              <td className="px-3 py-3.5 text-right">
                {r.maxBidStatus === 'none' ? <span className="text-xs text-[var(--fin-neg)]">Ingen gjennomførbar pris</span> : <Money value={r.maxBid === null ? null : floorToThousand(r.maxBid)} row={r} strong />}
              </td>
              <td className="px-3 py-3.5"><RiskText r={r} /></td>
              <td className="px-3 py-3.5 text-xs text-slate-700">{r.nextViewing ? <Fig>{formatDateTimeCompact(r.nextViewing)}</Fig> : <span className="text-slate-500">Ingen kjent</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Surface>
  );
}

function FinanceCards({ rows }: { rows: PropertyRow[] }) {
  return (
    <ul className="space-y-3" data-testid="fin-cards">
      {rows.map((r) => (
        <li key={r.id}>
          <Link to={`/objekter/${r.id}`} className="block rounded-xl border border-[var(--fin-line)] bg-white p-4 active:bg-slate-50" aria-label={`Åpne ${r.address}`}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 font-semibold">
                  {r.favorite && <Star className="size-3.5 shrink-0 fill-amber-400 text-amber-500" aria-label="Favoritt" />}
                  <span className="min-w-0 break-words">{r.address}</span>
                </p>
                <p className="mt-0.5 text-xs text-slate-600">{[r.district, PROPERTY_TYPE_LABEL[r.propertyType], formatArea(r.areaBRAi, '')].filter(Boolean).join(' · ')}</p>
              </div>
              <RecommendationBadge value={r.recommendation} />
            </div>
            <div className="mt-3 flex items-end justify-between gap-3 border-t border-[var(--fin-line)] pt-3">
              <div className="min-w-0">
                <p className="fin-label">Maksbud</p>
                <p className="mt-0.5 text-2xl font-semibold tracking-tight">
                  {r.maxBidStatus === 'none' ? <span className="text-base text-[var(--fin-neg)]">Ingen gjennomførbar pris</span> : <Money value={r.maxBid === null ? null : floorToThousand(r.maxBid)} row={r} />}
                </p>
              </div>
              <div className="text-right">
                <p className="fin-label">Kjøpspris</p>
                <p className="mt-0.5 text-sm font-medium"><Money value={r.purchase} row={r} /></p>
              </div>
            </div>
            <dl className="mt-3 grid grid-cols-3 gap-x-3 text-sm">
              <div className="min-w-0">
                <dt className="fin-label">Fortjeneste</dt>
                <dd className="mt-0.5 font-semibold"><Money value={r.profit} row={r} signed /></dd>
              </div>
              <div className="min-w-0">
                <dt className="fin-label">Avkastning</dt>
                <dd className="mt-0.5 font-semibold"><Fig>{r.projectReturn === null ? '–' : formatPct(r.projectReturn)}</Fig></dd>
              </div>
              <div className="min-w-0">
                <dt className="fin-label">Risiko</dt>
                <dd className="mt-0.5"><RiskText r={r} /></dd>
              </div>
            </dl>
            <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600">
              <span>Salgsverdi <Fig className="font-medium text-ink">{r.saleBase === null ? NO_BASIS : formatNOK(r.saleBase)}</Fig></span>
              <span>{r.nextViewing ? <>Visning <Fig className="font-medium text-ink">{formatDateTimeCompact(r.nextViewing)}</Fig></> : 'Ingen kjent visning'}</span>
              <SaleStatusBadge value={r.saleStatus} />
            </p>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function FinanceDashboard() {
  const services = useServices();
  const { session, profile, entitlements } = useSession();
  const now = useNow();
  const uid = session?.user.id ?? 'anon';
  const isDesktop = useMediaQuery('(min-width: 1024px)');
  const items = useLiveQuery(() => services.properties.listMine({ includeArchived: true }), []);
  const [view, setView] = usePref<'active' | 'archive'>(`${uid}.view`, 'active');
  const [filters, setFilters] = usePref<ListFilters>(`${uid}.filters`, EMPTY_FILTERS);
  const [sort, setSort] = usePref<{ key: SortKey; dir: SortDirection }>(`${uid}.sort`, { key: 'profit', dir: 'desc' });
  const [showFilters, setShowFilters] = useState(false);

  const defaults = profile?.defaults ?? NEW_ACCOUNT_DEFAULTS;
  const rows = useMemo(() => (items.data ?? []).map((i) => buildRow(i, defaults, now)), [items.data, defaults, now]);
  const visible = useMemo(() => sortRows(applyFilters(rows, filters, view), sort.key, sort.dir), [rows, filters, view, sort]);
  const totalInView = rows.filter((r) => (view === 'archive' ? isArchiveRow(r) : !isArchiveRow(r) || (filters.showClosed && !r.archived))).length;
  const archiveCount = rows.filter(isArchiveRow).length;
  const nFilters = activeFilterCount({ ...filters, query: '' });
  const onSort = (key: SortKey) => setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: key === 'address' ? 'asc' : 'desc' }));
  const exportScenarios = async () => {
    const f = await services.imports.exportScenarios();
    downloadText(f.filename, f.content, 'application/json');
  };

  if (items.loading && !items.data) return <PageLoading label="Henter objektene dine …" />;

  return (
    <div className="space-y-7">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Investeringsoversikt</h1>
          <p className="mt-1 text-sm text-slate-600">Økonomien beregnes fra scenarioet du har valgt som primært for hvert objekt.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/import" className={buttonClass('secondary', 'sm')}>
            <FileJson className="size-4" aria-hidden /> Importer
          </Link>
          <Button size="sm" icon={<Download className="size-4" aria-hidden />} onClick={exportScenarios}>
            Eksporter scenarioer
          </Button>
        </div>
      </div>

      <Surface className="p-4 sm:p-5">
        {entitlements?.access === 'full' ? (
          <AnalyzeBox />
        ) : (
          <Alert tone="warning" title="Analyse krever aktivt abonnement" action={<Link to="/konto" className="font-medium underline">Se abonnement</Link>}>
            Du kan fortsatt se, sortere og eksportere objektene du har lagret.
          </Alert>
        )}
        {entitlements?.access === 'full' && entitlements.plan && (
          <p className="mt-2 text-xs text-slate-600">
            Nye analyser denne perioden: {entitlements.used.newAnalyses} av {entitlements.limits.newAnalyses}
            {entitlements.used.pendingNewAnalyses ? ` (+${entitlements.used.pendingNewAnalyses} pågår)` : ''}
          </p>
        )}
      </Surface>

      {items.error ? (
        <Alert tone="danger" title="Kunne ikke hente objektene" action={<Button size="sm" onClick={items.reload}>Prøv igjen</Button>}>
          {(items.error as Error).message}
        </Alert>
      ) : null}

      {rows.length > 0 && <Summary rows={rows} now={now} />}

      {rows.length === 0 ? (
        <EmptyState icon={<Inbox className="size-10" aria-hidden />} title="Ingen objekter ennå">
          Lim inn en FINN-lenke over for å analysere din første bolig. Objektet legges automatisk i listen og kalenderen.
        </EmptyState>
      ) : (
        <section aria-label="Objektliste" className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Segmented
              label="Liste"
              value={view}
              onChange={setView}
              options={[
                { value: 'active', label: 'Aktive' },
                {
                  value: 'archive',
                  label: (
                    <span className="inline-flex items-center gap-1">
                      <Archive className="size-3.5" aria-hidden /> Arkiv ({archiveCount})
                    </span>
                  ),
                },
              ]}
            />
            <div className="flex min-w-full flex-1 flex-wrap items-center justify-end gap-2 sm:min-w-0">
              <div className="relative w-full sm:w-64">
                <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" aria-hidden />
                <TextInput aria-label="Søk i mine objekter" placeholder="Søk adresse, område, FINN-kode" className="pl-9" value={filters.query} onChange={(e) => setFilters({ ...filters, query: e.target.value })} />
              </div>
              <Button size="sm" icon={<SlidersHorizontal className="size-4" aria-hidden />} aria-expanded={showFilters} onClick={() => setShowFilters(!showFilters)}>
                Filtre{nFilters ? ` (${nFilters})` : ''}
              </Button>
              {!isDesktop && (
                <Select
                  aria-label="Sorter etter"
                  className="h-10 w-auto text-sm"
                  value={`${sort.key}:${sort.dir}`}
                  onChange={(e) => {
                    const [key, dir] = e.target.value.split(':') as [SortKey, SortDirection];
                    setSort({ key, dir });
                  }}
                >
                  {(Object.keys(SORT_LABEL) as SortKey[]).flatMap((k) => [
                    <option key={`${k}:desc`} value={`${k}:desc`}>
                      {SORT_LABEL[k]} – synkende
                    </option>,
                    <option key={`${k}:asc`} value={`${k}:asc`}>
                      {SORT_LABEL[k]} – stigende
                    </option>,
                  ])}
                </Select>
              )}
            </div>
          </div>
          {showFilters && <FilterPanel filters={filters} onChange={setFilters} view={view} />}
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-slate-600" aria-live="polite">
            <span>
              Viser <strong className="text-ink">{visible.length}</strong> av {totalInView} {view === 'archive' ? 'i arkivet' : 'aktive objekter'} · sortert etter {SORT_LABEL[sort.key].toLowerCase()} ({sort.dir === 'asc' ? 'stigende' : 'synkende'}), ukjente verdier sist
            </span>
            {(nFilters > 0 || filters.query) && (
              <Button size="sm" variant="ghost" onClick={() => setFilters(EMPTY_FILTERS)}>
                Fjern filtre
              </Button>
            )}
          </div>
          {visible.length === 0 ? (
            <EmptyState
              icon={<SearchX className="size-10" aria-hidden />}
              title={view === 'archive' ? 'Ingen objekter i arkivet med disse filtrene' : 'Ingen treff med disse filtrene'}
              action={<Button onClick={() => setFilters(EMPTY_FILTERS)}>Fjern filtre</Button>}
            >
              {view === 'active' && archiveCount > 0 ? 'Solgte, trukne og arkiverte objekter ligger i arkivet.' : 'Prøv å fjerne ett eller flere filtre.'}
            </EmptyState>
          ) : isDesktop ? (
            <FinanceTable rows={visible} sort={sort} onSort={onSort} />
          ) : (
            <FinanceCards rows={visible} />
          )}
          <p className="text-xs text-slate-600">Maksbud er avrundet ned til hele tusen. Tall merket «Mangler grunnlag» er ukjente – ikke null.</p>
        </section>
      )}
    </div>
  );
}
