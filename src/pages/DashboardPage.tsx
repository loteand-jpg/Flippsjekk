import { Archive, ArrowDownUp, Download, FileJson, Inbox, Search, SearchX, SlidersHorizontal } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { useLiveQuery, useMediaQuery, useNow } from '../app/hooks';
import { usePref } from '../app/preferences';
import { useServices } from '../app/services';
import { useSession } from '../app/session';
import { AnalyzeBox } from '../components/property/AnalyzeBox';
import { DEFAULT_COLUMN_IDS } from '../components/property/columns';
import { applyFilters, activeFilterCount, EMPTY_FILTERS, SORT_LABEL, sortRows, type ListFilters, type SortKey } from '../components/property/listLogic';
import { ColumnPicker, FilterPanel, PropertyCards, PropertyTable } from '../components/property/ListViews';
import { buildRow, isArchiveRow, type PropertyRow } from '../components/property/rowModel';
import { Segmented, Select, TextInput } from '../components/ui/forms';
import { Alert, Button, buttonClass, Card, EmptyState, PageLoading, Stat } from '../components/ui/primitives';
import { InfoTip } from '../components/ui/overlay';
import { NEW_ACCOUNT_DEFAULTS } from '../config/defaults';
import { formatDateTime, formatNOK } from '../lib/format';
import type { SortDirection } from '../lib/sort';

function downloadText(filename: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function Summary({ rows, now }: { rows: PropertyRow[]; now: Date }) {
  const active = rows.filter((r) => !isArchiveRow(r));
  const interesting = active.filter((r) => r.recommendation === 'interessant').length;
  const upcoming = active
    .filter((r) => r.nextViewing)
    .sort((a, b) => (a.nextViewing ?? '').localeCompare(b.nextViewing ?? ''));
  const week = upcoming.filter((r) => Date.parse(r.nextViewing!) - now.getTime() < 7 * 86_400_000).length;
  const complete = active.filter((r) => r.profit !== null);
  const best = complete.reduce<PropertyRow | null>((a, b) => (a === null || (b.profit ?? -Infinity) > (a.profit ?? -Infinity) ? b : a), null);
  const incomplete = active.filter((r) => r.calcStatus === 'incomplete' || r.calcStatus === 'invalid').length;
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Stat label="Aktive objekter" value={active.length} sub={`${interesting} vurdert som interessante`} />
      <Stat label="Visninger neste 7 dager" value={week} sub={upcoming[0] ? `Neste: ${formatDateTime(upcoming[0].nextViewing)}` : 'Ingen kjente visninger'} />
      <Stat
        label="Høyest forventet fortjeneste"
        info={
          <InfoTip label="Scenariooversikt">
            Viser objektet med høyest resultat før skatt i ditt primære scenario. Fortjenester summeres ikke – du kan normalt ikke kjøpe alle objektene samtidig.
          </InfoTip>
        }
        value={best ? formatNOK(best.profit) : '–'}
        sub={best ? best.address : 'Ingen komplette kalkyler'}
        emphasis={best && (best.profit ?? 0) < 0 ? 'negative' : null}
      />
      <Stat label="Mangler grunnlag" value={incomplete} sub="Objekter med ufullstendig kalkyle" emphasis={incomplete ? 'unknown' : null} />
    </div>
  );
}

export function DashboardPage() {
  const services = useServices();
  const { session, profile, entitlements } = useSession();
  const now = useNow();
  const uid = session?.user.id ?? 'anon';
  const isDesktop = useMediaQuery('(min-width: 1024px)');
  const items = useLiveQuery(() => services.properties.listMine({ includeArchived: true }), []);
  const [view, setView] = usePref<'active' | 'archive'>(`${uid}.view`, 'active');
  const [filters, setFilters] = usePref<ListFilters>(`${uid}.filters`, EMPTY_FILTERS);
  const [sort, setSort] = usePref<{ key: SortKey; dir: SortDirection }>(`${uid}.sort`, { key: 'profit', dir: 'desc' });
  const [columns, setColumns] = usePref<string[]>(`${uid}.columns`, DEFAULT_COLUMN_IDS);
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
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Mine objekter</h1>
          <p className="text-sm text-slate-600">Økonomien beregnes fra scenarioet du har valgt som primært for hvert objekt.</p>
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

      <Card className="p-4 sm:p-5">
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
            {entitlements.used.pendingNewAnalyses ? ` (+${entitlements.used.pendingNewAnalyses} pågår)` : ''} · Gjenbruk belastes ikke.
          </p>
        )}
      </Card>

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
            <div className="flex flex-1 flex-wrap items-center justify-end gap-2">
              <div className="relative w-full sm:w-64">
                <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" aria-hidden />
                <TextInput aria-label="Søk i mine objekter" placeholder="Søk adresse, område, FINN-kode" className="pl-9" value={filters.query} onChange={(e) => setFilters({ ...filters, query: e.target.value })} />
              </div>
              <Button size="sm" icon={<SlidersHorizontal className="size-4" aria-hidden />} aria-expanded={showFilters} onClick={() => setShowFilters(!showFilters)}>
                Filtre{nFilters ? ` (${nFilters})` : ''}
              </Button>
              {isDesktop ? (
                <ColumnPicker value={columns} onChange={setColumns} />
              ) : (
                <div className="flex items-center gap-1">
                  <ArrowDownUp className="size-4 text-slate-500" aria-hidden />
                  <Select aria-label="Sorter etter" className="h-8 w-auto text-xs" value={`${sort.key}:${sort.dir}`} onChange={(e) => {
                    const [key, dir] = e.target.value.split(':') as [SortKey, SortDirection];
                    setSort({ key, dir });
                  }}>
                    {(Object.keys(SORT_LABEL) as SortKey[]).flatMap((k) => [
                      <option key={`${k}:desc`} value={`${k}:desc`}>
                        {SORT_LABEL[k]} – synkende
                      </option>,
                      <option key={`${k}:asc`} value={`${k}:asc`}>
                        {SORT_LABEL[k]} – stigende
                      </option>,
                    ])}
                  </Select>
                </div>
              )}
            </div>
          </div>
          {showFilters && <FilterPanel filters={filters} onChange={setFilters} view={view} />}
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-slate-600" aria-live="polite">
            <span>
              Viser <strong className="text-ink">{visible.length}</strong> av {totalInView} {view === 'archive' ? 'i arkivet' : 'aktive objekter'}
              {isDesktop && ` · sortert etter ${SORT_LABEL[sort.key].toLowerCase()} (${sort.dir === 'asc' ? 'stigende' : 'synkende'}), ukjente verdier sist`}
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
            <PropertyTable rows={visible} columns={columns} sort={sort} onSort={onSort} />
          ) : (
            <PropertyCards rows={visible} />
          )}
          <p className="text-xs text-slate-600">
            «Mitt scenario» betyr at du har endret forutsetninger fra grunnanalysen. Tall merket «Mangler grunnlag» er ukjente – ikke null.
          </p>
        </section>
      )}
    </div>
  );
}
