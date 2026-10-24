import { ArchiveRestore, ArrowLeft, Copy, ExternalLink, LoaderCircle, Pencil, RefreshCw, RotateCcw, Save, Star, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useBlocker, useParams, useSearchParams } from 'react-router';
import { useLiveQuery, useNow } from '../app/hooks';
import { useServices } from '../app/services';
import { useEditAccess } from '../app/access';
import { useSession } from '../app/session';
import { useToast } from '../app/toast';
import { buildBaseValues, diffValues, evaluateScenario, rebaseValues } from '../calc/scenario';
import { CalculatorTab } from '../components/analysis/CalculatorTab';
import { OverviewTab, ReportTab, RiskTab } from '../components/analysis/InfoTabs';
import { MarketTab } from '../components/analysis/MarketTab';
import { RenovationTab } from '../components/analysis/RenovationTab';
import { KeyFigures, type PropertyContext } from '../components/analysis/shared';
import { ViewingsTab } from '../components/analysis/ViewingsTab';
import { DemoBadge, PreliminaryBadge, RecommendationBadge, SaleStatusBadge } from '../components/property/badges';
import { snapshotFor } from '../components/property/rowModel';
import { Field, Select, TextInput } from '../components/ui/forms';
import { Dialog, TabPanel, Tabs } from '../components/ui/overlay';
import { Alert, Badge, Button, EmptyState, PageLoading } from '../components/ui/primitives';
import { REFRESH_REASON_LABEL, TECHNICAL_REASON_LABEL } from '../domain/refreshPolicy';
import { NEW_ACCOUNT_DEFAULTS } from '../config/defaults';
import { preliminaryReasons } from '../domain/assessment';
import { PROPERTY_TYPE_LABEL, RECOMMENDATION_LABEL, TENURE_LABEL, WORK_STATUS_LABEL, WORK_STATUSES, type WorkStatus } from '../domain/enums';
import type { ScenarioValues, SharedAnalysis } from '../domain/schemas';
import { formatArea, formatDate, formatNOK, formatRelative } from '../lib/format';
import { uuid } from '../lib/ids';

const TABS = [
  { id: 'oversikt', label: 'Oversikt' },
  { id: 'kalkyle', label: 'Min kalkyle' },
  { id: 'oppussing', label: 'Oppussing' },
  { id: 'risiko', label: 'Risiko og sjekkliste' },
  { id: 'marked', label: 'Marked' },
  { id: 'rapport', label: 'Rapport og kilder' },
  { id: 'visninger', label: 'Visninger og bud' },
] as const;
type TabId = (typeof TABS)[number]['id'];

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export function PropertyPage() {
  const { id = '' } = useParams();
  const services = useServices();
  const { profile, entitlements } = useSession();
  const { canEdit } = useEditAccess('scenarios');
  const toast = useToast();
  const now = useNow();
  const [params, setParams] = useSearchParams();
  const tab = (TABS.some((t) => t.id === params.get('fane')) ? params.get('fane') : 'oversikt') as TabId;
  const setTab = (t: TabId) => setParams((p) => {
    p.set('fane', t);
    return p;
  }, { replace: true });

  const item = useLiveQuery(() => services.properties.getMine(id), [id]);
  const scenarios = useLiveQuery(() => services.scenarios.list(id), [id]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = useMemo(() => {
    const list = scenarios.data ?? [];
    return list.find((s) => s.id === selectedId) ?? list.find((s) => s.id === item.data?.link.primaryScenarioId) ?? list[0] ?? null;
  }, [scenarios.data, selectedId, item.data]);
  const analysisQ = useLiveQuery(() => (selected ? services.analysis.getAnalysis(selected.analysisId) : Promise.resolve(null)), [selected?.analysisId]);
  const analysis = analysisQ.data ?? null;

  const [draft, setDraft] = useState<ScenarioValues | null>(null);
  const [draftFor, setDraftFor] = useState<string | null>(null);
  useEffect(() => {
    if (!selected) return;
    const key = `${selected.id}:${selected.updatedAt}`;
    if (draftFor !== key) {
      setDraft(structuredClone(selected.values));
      setDraftFor(key);
    }
  }, [selected, draftFor]);

  const dirty = Boolean(selected && draft && !same(selected.values, draft));
  const locked = Boolean(selected?.locked);
  const editable = canEdit && !locked;
  const defaults = profile?.defaults ?? NEW_ACCOUNT_DEFAULTS;
  const baseSnapshot = item.data && analysis ? snapshotFor(item.data, analysis) : null;
  const base = useMemo(
    () => (item.data && analysis && baseSnapshot ? buildBaseValues({ property: item.data.property, snapshot: baseSnapshot, analysis, defaults, analysisScenarioId: draft?.analysisScenarioId ?? selected?.values.analysisScenarioId ?? null }) : null),
    [item.data, analysis, baseSnapshot, defaults, draft?.analysisScenarioId, selected?.values.analysisScenarioId],
  );
  const result = useMemo(() => (draft ? evaluateScenario(draft) : null), [draft]);
  const baseResult = useMemo(() => (base ? evaluateScenario(base.values) : null), [base]);

  // Ulagrede endringer: blokkér navigasjon og lukking av fanen.
  const blocker = useBlocker(({ currentLocation, nextLocation }) => dirty && currentLocation.pathname !== nextLocation.pathname);
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty]);

  const [pendingSwitch, setPendingSwitch] = useState<string | null>(null);
  const [nameDialog, setNameDialog] = useState<null | { mode: 'rename' | 'saveAs'; name: string }>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [rebaseOpen, setRebaseOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const run = async (key: string, fn: () => Promise<unknown>, ok?: string) => {
    setBusy(key);
    try {
      await fn();
      if (ok) toast({ tone: 'success', title: ok });
      return true;
    } catch (e) {
      toast({ tone: 'danger', title: 'Handlingen feilet', body: (e as Error).message });
      return false;
    } finally {
      setBusy(null);
    }
  };

  if ((item.loading && !item.data) || (scenarios.loading && !scenarios.data)) return <PageLoading label="Henter objektet …" />;
  if (!item.data) {
    return (
      <EmptyState title="Fant ikke objektet i listen din" action={<Link to="/oversikt" className="font-medium text-pine-800 underline">Til oversikten</Link>}>
        Objektet kan være fjernet fra listen din, eller lenken er feil.
      </EmptyState>
    );
  }
  const it = item.data;

  // Analyse pågår eller feilet – ingen grunnanalyse ennå
  if (!selected || !analysis) {
    if (analysisQ.loading && selected) return <PageLoading />;
    return (
      <div className="space-y-4">
        <BackLink />
        <h1 className="text-2xl font-semibold">{it.link.label ?? it.property.address}</h1>
        {it.activeJob ? (
          <Alert tone="info" title="Analyse pågår">
            <p className="inline-flex items-center gap-2">
              <LoaderCircle className="size-4 animate-spin" aria-hidden /> {it.activeJob.steps[Math.min(it.activeJob.stepIndex, it.activeJob.steps.length - 1)]} …
            </p>
          </Alert>
        ) : it.lastFailedJob ? (
          <Alert
            tone="danger"
            title="Analysen ble ikke fullført"
            action={
              <Button size="sm" variant="primary" icon={<RefreshCw className="size-4" aria-hidden />} loading={busy === 'retry'} onClick={() => run('retry', () => services.analysis.retryJob(it.lastFailedJob!.id), 'Nytt forsøk startet')}>
                Prøv igjen
              </Button>
            }
          >
            {it.lastFailedJob.error?.message}
          </Alert>
        ) : (
          <Alert
            tone="warning"
            title="Grunnanalysen for objektet mangler"
            action={
              <Button
                size="sm"
                variant="primary"
                icon={<RefreshCw className="size-4" aria-hidden />}
                loading={busy === 'refetch'}
                disabled={!entitlements?.canRequestNewAnalysis}
                onClick={() => run('refetch', () => services.analysis.requestRefresh(it.property.id, 'full', uuid()), 'Henter analysen på nytt')}
              >
                Hent analysen på nytt
              </Button>
            }
          >
            <p>Dine private scenarioer og notater er beholdt. Analysen kan ha blitt borte fra den lokale demolagringen.</p>
            <p>Å hente den på nytt regnes som én ny analyse. Alternativt kan du tilbakestille demodata under «Testkontroller».</p>
          </Alert>
        )}
      </div>
    );
  }
  if (!draft || !result) return <PageLoading />;

  const latest = it.latestAnalysis;
  const hasNewVersion = Boolean(latest && analysis.visibility === 'shared' && latest.version > analysis.version);
  const sharedAvailableForImport = Boolean(latest && analysis.visibility === 'private');
  // Analysedatoen er datoen brukeren selv analyserte boligen – ikke når grunnlaget først ble laget.
  const analysisDate = it.link.analyzedAt ?? analysis.publishedAt ?? analysis.createdAt;
  const analysisAge = (now.getTime() - Date.parse(analysisDate)) / 86_400_000;
  const volatileAgeH = it.snapshot ? (now.getTime() - Date.parse(it.snapshot.observedAt)) / 3_600_000 : null;
  const priceChanged = baseSnapshot && it.snapshot && baseSnapshot.id !== it.snapshot.id && baseSnapshot.askingPrice !== it.snapshot.askingPrice;
  const prelim = preliminaryReasons(analysis);

  const ctx: PropertyContext = {
    item: it,
    analysis,
    baseSnapshot,
    scenario: selected,
    scenarios: scenarios.data ?? [],
    base,
    draft,
    setDraft: (v) => setDraft((d) => (typeof v === 'function' ? v(d as ScenarioValues) : v)),
    result,
    baseResult,
    editable,
    locked,
    profile,
    now,
    createScenarioFrom: async (analysisScenarioId, name) => {
      const snapshot = baseSnapshot ?? it.snapshot;
      if (!snapshot) return;
      const values = buildBaseValues({ property: it.property, snapshot, analysis, defaults, analysisScenarioId }).values;
      let created: { id: string } | null = null;
      const ok = await run('create', async () => {
        created = await services.scenarios.create(it.property.id, { name: name.slice(0, 80), analysisId: analysis.id, values });
      }, 'Nytt scenario er opprettet');
      if (ok && created) switchTo((created as { id: string }).id);
    },
  };

  const save = async () => {
    const hadBase = (scenarios.data ?? []).some((s) => s.locked);
    const ok = await run('save', () => services.scenarios.update(selected.id, { values: draft }), 'Scenarioet er lagret');
    if (ok && !hadBase) {
      const after = await services.scenarios.list(it.property.id);
      if (after.some((s) => s.locked)) toast({ tone: 'info', title: 'Grunnlaget er lagret som «Nettsidens vurdering»', body: 'Du finner det i scenarioutvalget. Det er låst, men du kan lagre det som nytt scenario.' });
    }
    return ok;
  };
  const switchTo = (sid: string) => {
    if (dirty) setPendingSwitch(sid);
    else setSelectedId(sid);
  };
  const refresh = (kind: 'light' | 'market' | 'full') =>
    run(`refresh-${kind}`, async () => {
      const r = await services.analysis.requestRefresh(it.property.id, kind, uuid());
      if (r.outcome === 'already_fresh') toast({ tone: 'info', title: kind === 'market' ? 'Markedsdataene er allerede oppdaterte' : 'Annonseopplysningene er allerede ferske', body: 'Ingen oppfrisking ble belastet.' });
      else toast({ tone: 'info', title: kind === 'light' ? 'Oppfrisking startet' : kind === 'market' ? 'Markedsoppfriskning startet' : 'Ny analyse startet' });
    });

  return (
    <div className="space-y-5">
      <BackLink />
      {/* Hode */}
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">{it.link.label ?? it.property.address}</h1>
            <button
              type="button"
              aria-pressed={it.link.favorite}
              aria-label={it.link.favorite ? 'Fjern som favoritt' : 'Marker som favoritt'}
              onClick={() => run('fav', () => services.properties.updatePersonalStatus(it.property.id, { favorite: !it.link.favorite }))}
              className="rounded-md p-1 hover:bg-amber-50"
            >
              <Star className={`size-5 ${it.link.favorite ? 'fill-amber-400 text-amber-500' : 'text-slate-400'}`} aria-hidden />
            </button>
          </div>
          <p className="mt-0.5 text-sm text-slate-600">
            {[it.property.district, it.property.city].filter(Boolean).join(', ')} · {PROPERTY_TYPE_LABEL[it.property.propertyType]} · {TENURE_LABEL[it.property.tenure]} · {formatArea(it.snapshot?.areaBRAi ?? null)}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <RecommendationBadge value={analysis.recommendation} />
            <PreliminaryBadge reasons={prelim} />
            <SaleStatusBadge value={it.snapshot?.saleStatus ?? null} note={it.snapshot?.saleStatusNote} />
            {(it.property.dataOrigin === 'demo' || it.property.dataOrigin === 'synthetic') && <DemoBadge synthetic={it.property.dataOrigin === 'synthetic'} />}
            <a href={it.property.canonicalUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-pine-800 underline">
              FINN-kode {it.property.finnId} <ExternalLink className="size-3" aria-hidden />
            </a>
          </div>
          <p className="mt-1 text-xs text-slate-600">
            {analysis.visibility === 'private' ? 'Privat importert utkast' : 'Analyse'} fra {formatDate(analysisDate)} · annonse kontrollert{' '}
            {it.snapshot ? formatRelative(it.snapshot.observedAt, now) : 'aldri'}
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <Field label="Min status" className="w-48">
            {(p) => (
              <Select {...p} value={it.link.workStatus} onChange={(e) => run('ws', () => services.properties.updatePersonalStatus(it.property.id, { workStatus: e.target.value as WorkStatus }))}>
                {WORK_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {WORK_STATUS_LABEL[s]}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          {it.link.archivedAt ? (
            <Button icon={<ArchiveRestore className="size-4" aria-hidden />} onClick={() => run('arch', () => services.properties.archiveMine(it.property.id, false), 'Flyttet til aktive')}>
              Gjenopprett
            </Button>
          ) : (
            <Button
              onClick={() =>
                run('arch', async () => {
                  await services.properties.archiveMine(it.property.id, true);
                }, 'Fjernet fra listen – ligger i arkivet med scenarioene dine')
              }
            >
              Fjern fra min liste
            </Button>
          )}
        </div>
      </header>

      {/* Varsler om grunnlaget */}
      <div className="space-y-2">
        {hasNewVersion && (
          <Alert tone="warning" title="Dataene kan være utdatert" action={<Button size="sm" variant="primary" onClick={() => setRebaseOpen(true)}>Oppfrisk analysen</Button>}>
            Det finnes nyere opplysninger om boligen. Vi anbefaler at du oppfrisker analysen. Kalkylene og endringene dine beholdes, og ingenting oppdateres uten at du velger det.
          </Alert>
        )}
        {sharedAvailableForImport && (
          <Alert tone="info" title="Det finnes oppdaterte opplysninger om boligen" action={<Button size="sm" onClick={() => setRebaseOpen(true)}>Sammenlign</Button>}>
            Scenarioet bygger på ditt importerte utkast.
          </Alert>
        )}
        {analysis.visibility === 'shared' && it.refreshDecision.kind === 'market_refresh' && !it.technicalReanalysis.needed && (
          <Alert
            tone="warning"
            title={`Markedsdataene er ${Math.floor(it.refreshDecision.thoroughAgeDays ?? analysisAge)} dager gamle`}
            action={
              <Button size="sm" loading={busy === 'refresh-market'} disabled={!entitlements?.canRefresh || Boolean(it.activeJob)} onClick={() => refresh('market')}>
                Oppdater markedsdata
              </Button>
            }
          >
            <p>Vi henter ny prisantydning, visninger og salgsstatus, oppdaterer markedsreferansene og regner salgsverdien og økonomien på nytt for hvert scenario.</p>
            <p>Det tekniske grunnlaget (dokumenter, risiko, oppussingsbehov og scenarioer) leses ikke på nytt. Belastes som én oppfriskning.</p>
          </Alert>
        )}
        {analysis.visibility === 'shared' && it.technicalReanalysis.needed && (
          <Alert
            tone="warning"
            title="Teknisk grunnlag bør analyseres på nytt"
            action={
              <Button size="sm" loading={busy === 'refresh-full'} disabled={!entitlements?.canRequestNewAnalysis || Boolean(it.activeJob)} onClick={() => refresh('full')}>
                Bestill ny teknisk analyse
              </Button>
            }
          >
            <ul className="list-disc pl-4">
              {it.technicalReanalysis.reasons.map((r) => (
                <li key={r}>{TECHNICAL_REASON_LABEL[r]}</li>
              ))}
            </ul>
            <p>En ny teknisk analyse belastes som én ny analyse.</p>
          </Alert>
        )}
        {it.refreshDecision.kind === 'lightweight_refresh' && (
          <Alert
            tone="info"
            title="Pris, visninger og salgsstatus bør kontrolleres"
            action={
              <Button size="sm" loading={busy === 'refresh-light'} disabled={!entitlements?.canRefresh || Boolean(it.activeJob)} onClick={() => refresh('light')}>
                Lett oppfrisking
              </Button>
            }
          >
            {it.refreshDecision.reasons.map((r) => REFRESH_REASON_LABEL[r]).join('. ')}
            {volatileAgeH !== null ? `. Sist kontrollert for ${Math.round(volatileAgeH)} timer siden` : ''}. Oppfrisking endrer ikke dine lagrede forutsetninger.
          </Alert>
        )}
        {it.activeJob && (
          <Alert tone="info" title={it.activeJob.type === 'light_refresh' ? 'Oppfrisking pågår' : it.activeJob.type === 'market_refresh' ? 'Markedsoppfriskning pågår' : 'Ny analyse pågår'}>
            <span className="inline-flex items-center gap-2">
              <LoaderCircle className="size-4 animate-spin" aria-hidden /> {it.activeJob.steps[Math.min(it.activeJob.stepIndex, it.activeJob.steps.length - 1)]} …
            </span>
          </Alert>
        )}
        {priceChanged && (
          <Alert
            tone="warning"
            title={`Prisantydningen er endret: ${formatNOK(baseSnapshot!.askingPrice)} → ${formatNOK(it.snapshot!.askingPrice)}`}
            action={
              editable && it.snapshot!.askingPrice !== null ? (
                <Button size="sm" onClick={() => setDraft({ ...draft, purchasePrice: it.snapshot!.askingPrice })}>
                  Bruk ny prisantydning som kjøpspris
                </Button>
              ) : undefined
            }
          >
            Siste observasjon {formatRelative(it.snapshot!.observedAt, now)}. Kalkylen bruker fortsatt din lagrede kjøpspris ({formatNOK(draft.purchasePrice)}).
          </Alert>
        )}
      </div>

      {/* Scenariolinje */}
      <div className="sticky top-14 z-20 -mx-4 border-y border-slate-200 bg-white/95 px-4 py-2 backdrop-blur sm:mx-0 sm:rounded-xl sm:border">
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="scenario-select" className="text-sm font-medium">
            Scenario
          </label>
          <div className="w-full max-w-xs sm:w-72">
          <Select id="scenario-select" className="h-9" value={selected.id} onChange={(e) => switchTo(e.target.value)}>
            {(scenarios.data ?? []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
                {s.locked ? ' (låst)' : ''}
                {s.id === it.link.primaryScenarioId ? ' (primært)' : ''}
              </option>
            ))}
          </Select>
          </div>
          {selected.id === it.link.primaryScenarioId ? (
            <Badge tone="pine">Primært – brukes i oversikt og kalender</Badge>
          ) : (
            <Button size="sm" variant="ghost" onClick={() => run('primary', () => services.scenarios.setPrimary(it.property.id, selected.id), 'Satt som primært scenario')}>
              Sett som primært
            </Button>
          )}
          <span className="ml-auto flex flex-wrap items-center gap-2">
            {dirty && (
              <span className="text-xs font-medium text-amber-800" role="status">
                Ulagrede endringer
              </span>
            )}
            <Button size="sm" variant="primary" icon={<Save className="size-4" aria-hidden />} disabled={!dirty || !editable} loading={busy === 'save'} onClick={save}>
              Lagre
            </Button>
            <Button size="sm" variant={locked ? 'primary' : 'secondary'} icon={<Copy className="size-4" aria-hidden />} disabled={!canEdit} onClick={() => setNameDialog({ mode: 'saveAs', name: locked ? 'Mitt scenario' : `${selected.name} (kopi)` })}>
              Lagre som nytt
            </Button>
            <Button size="sm" icon={<Pencil className="size-4" aria-hidden />} disabled={!editable} onClick={() => setNameDialog({ mode: 'rename', name: selected.name })} aria-label="Gi nytt navn">
              <span className="hidden sm:inline">Navn</span>
            </Button>
            <Button size="sm" icon={<RotateCcw className="size-4" aria-hidden />} disabled={!editable || !base} onClick={() => base && setDraft(structuredClone(base.values))} title="Sett alle forutsetninger tilbake til grunnanalysen (ulagret til du lagrer)">
              <span className="hidden sm:inline">Tilbakestill til grunnlag</span>
            </Button>
            <Button size="sm" variant="danger" icon={<Trash2 className="size-4" aria-hidden />} disabled={!editable || (scenarios.data?.length ?? 0) < 2} onClick={() => setConfirmDelete(true)} aria-label="Slett scenario" />
          </span>
        </div>
      </div>

      <KeyFigures ctx={ctx} />

      <div>
        <Tabs label="Analyse" tabs={TABS.map((t) => ({ ...t }))} value={tab} onChange={setTab} />
        <TabPanel id={tab}>
          {tab === 'oversikt' && <OverviewTab ctx={ctx} />}
          {tab === 'kalkyle' && <CalculatorTab ctx={ctx} />}
          {tab === 'oppussing' && <RenovationTab ctx={ctx} />}
          {tab === 'risiko' && <RiskTab ctx={ctx} />}
          {tab === 'marked' && <MarketTab ctx={ctx} />}
          {tab === 'rapport' && <ReportTab ctx={ctx} />}
          {tab === 'visninger' && <ViewingsTab ctx={ctx} />}
        </TabPanel>
      </div>

      <NotesBox propertyId={it.property.id} initial={it.link.notes} />

      {/* Dialoger */}
      <Dialog
        open={blocker.state === 'blocked' || pendingSwitch !== null}
        onClose={() => {
          if (blocker.state === 'blocked') blocker.reset();
          setPendingSwitch(null);
        }}
        title="Du har ulagrede endringer"
        description={`Endringene i «${selected.name}» er ikke lagret.`}
        footer={
          <>
            <Button
              onClick={() => {
                if (blocker.state === 'blocked') blocker.reset();
                setPendingSwitch(null);
              }}
            >
              Bli her
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                setDraft(structuredClone(selected.values));
                if (blocker.state === 'blocked') blocker.proceed();
                if (pendingSwitch) setSelectedId(pendingSwitch);
                setPendingSwitch(null);
              }}
            >
              Forkast endringer
            </Button>
            <Button
              variant="primary"
              disabled={!editable}
              onClick={async () => {
                const ok = await save();
                if (!ok) return;
                if (blocker.state === 'blocked') blocker.proceed();
                if (pendingSwitch) setSelectedId(pendingSwitch);
                setPendingSwitch(null);
              }}
            >
              Lagre og fortsett
            </Button>
          </>
        }
      >
        <p className="text-sm text-slate-700">Velg om du vil lagre endringene før du går videre.</p>
      </Dialog>

      <Dialog
        open={nameDialog !== null}
        onClose={() => setNameDialog(null)}
        title={nameDialog?.mode === 'rename' ? 'Gi scenarioet nytt navn' : 'Lagre som nytt scenario'}
        description={nameDialog?.mode === 'saveAs' ? 'Det nye scenarioet får forutsetningene du ser nå. Det opprinnelige forblir uendret.' : undefined}
        footer={
          <>
            <Button onClick={() => setNameDialog(null)}>Avbryt</Button>
            <Button
              variant="primary"
              loading={busy === 'name'}
              onClick={async () => {
                if (!nameDialog) return;
                if (nameDialog.mode === 'rename') {
                  await run('name', () => services.scenarios.update(selected.id, { name: nameDialog.name }), 'Navnet er endret');
                } else {
                  await run('name', async () => {
                    const s = await services.scenarios.create(it.property.id, { name: nameDialog.name, analysisId: selected.analysisId, values: draft });
                    setDraft(structuredClone(selected.values));
                    setSelectedId(s.id);
                  }, 'Nytt scenario lagret');
                }
                setNameDialog(null);
              }}
            >
              Lagre
            </Button>
          </>
        }
      >
        <Field label="Navn">{(p) => <TextInput {...p} autoFocus maxLength={80} value={nameDialog?.name ?? ''} onChange={(e) => setNameDialog((n) => (n ? { ...n, name: e.target.value } : n))} />}</Field>
      </Dialog>

      <Dialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title={`Slette «${selected.name}»?`}
        size="sm"
        footer={
          <>
            <Button onClick={() => setConfirmDelete(false)}>Avbryt</Button>
            <Button
              variant="danger"
              loading={busy === 'del'}
              onClick={async () => {
                await run('del', async () => {
                  await services.scenarios.remove(selected.id);
                  setSelectedId(null);
                }, 'Scenarioet er slettet');
                setConfirmDelete(false);
              }}
            >
              Slett scenario
            </Button>
          </>
        }
      >
        <p className="text-sm">Bare dette scenarioet slettes. Analysen og andre scenarioer beholdes.</p>
      </Dialog>

      {latest && (
        <RebaseDialog
          open={rebaseOpen}
          onClose={() => setRebaseOpen(false)}
          oldAnalysis={analysis}
          newAnalysis={latest}
          ctx={ctx}
          onApply={async (mode) => {
            const newSnap = snapshotFor(it, latest);
            if (!newSnap) return;
            const newBase = buildBaseValues({ property: it.property, snapshot: newSnap, analysis: latest, defaults, analysisScenarioId: draft.analysisScenarioId }).values;
            const values = base ? rebaseValues(base.values, newBase, draft, mode) : newBase;
            const ok = await run('rebase', async () => {
              await services.scenarios.update(selected.id, { analysisId: latest.id, values });
              await services.properties.updatePersonalStatus(it.property.id, { lastSeenAnalysisVersion: latest.version });
            }, 'Analysen er oppfrisket');
            if (ok) setRebaseOpen(false);
          }}
        />
      )}
    </div>
  );
}

function BackLink() {
  return (
    <Link to="/oversikt" className="inline-flex items-center gap-1 text-sm text-pine-800 hover:underline">
      <ArrowLeft className="size-4" aria-hidden /> Mine objekter
    </Link>
  );
}

function NotesBox({ propertyId, initial }: { propertyId: string; initial: string }) {
  const services = useServices();
  const toast = useToast();
  const [text, setText] = useState(initial);
  const [saving, setSaving] = useState(false);
  useEffect(() => setText(initial), [initial]);
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <label htmlFor="notes" className="text-sm font-semibold">
        Mine notater <span className="font-normal text-slate-500">(private)</span>
      </label>
      <textarea
        id="notes"
        rows={3}
        className="mt-2 block w-full rounded-lg border border-slate-300 p-2 text-sm focus:border-pine-600 focus:ring-2 focus:ring-pine-600/30 focus:outline-none"
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <div className="mt-2 flex items-center gap-2">
        <Button
          size="sm"
          disabled={text === initial}
          loading={saving}
          onClick={async () => {
            setSaving(true);
            try {
              await services.properties.updatePersonalStatus(propertyId, { notes: text });
              toast({ tone: 'success', title: 'Notatet er lagret' });
            } catch (e) {
              toast({ tone: 'danger', title: 'Kunne ikke lagre notatet', body: (e as Error).message });
            } finally {
              setSaving(false);
            }
          }}
        >
          Lagre notat
        </Button>
        {text !== initial && <span className="text-xs text-amber-800">Ikke lagret</span>}
      </div>
    </section>
  );
}

function RebaseDialog({
  open,
  onClose,
  oldAnalysis,
  newAnalysis,
  ctx,
  onApply,
}: {
  open: boolean;
  onClose: () => void;
  oldAnalysis: SharedAnalysis;
  newAnalysis: SharedAnalysis;
  ctx: PropertyContext;
  onApply: (mode: 'keep_my_changes' | 'replace_all') => void;
}) {
  const defaults = ctx.profile?.defaults ?? NEW_ACCOUNT_DEFAULTS;
  const newSnap = snapshotFor(ctx.item, newAnalysis);
  const newBase = newSnap ? buildBaseValues({ property: ctx.item.property, snapshot: newSnap, analysis: newAnalysis, defaults, analysisScenarioId: ctx.draft.analysisScenarioId }).values : null;
  const baseChanges = ctx.base && newBase ? diffValues(ctx.base.values, newBase) : [];
  const myChanges = ctx.base ? diffValues(ctx.base.values, ctx.draft) : [];
  const newRisks = newAnalysis.risks.filter((r) => !oldAnalysis.risks.some((o) => o.title === r.title));
  const fmt = (v: unknown) => (typeof v === 'number' ? formatNOK(v) : v === null ? 'Ikke avklart' : Array.isArray(v) ? `${v.length} tiltak` : String(v));
  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="lg"
      title={newAnalysis.visibility === 'shared' && oldAnalysis.visibility === 'shared' ? 'Oppfrisk analysen' : 'Bytt til oppdatert analyse'}
      footer={
        <>
          <Button onClick={onClose}>Behold nåværende analyse</Button>
          <Button onClick={() => onApply('replace_all')}>Erstatt alle forutsetninger</Button>
          <Button variant="primary" onClick={() => onApply('keep_my_changes')}>
            Oppdater – behold mine endringer
          </Button>
        </>
      }
    >
      <div className="space-y-4 text-sm">
        <div>
          <p className="font-medium">Anbefaling</p>
          <p className="text-slate-700">
            {oldAnalysis.recommendation ? RECOMMENDATION_LABEL[oldAnalysis.recommendation] : 'Ikke vurdert'} →{' '}
            <strong>{newAnalysis.recommendation ? RECOMMENDATION_LABEL[newAnalysis.recommendation] : 'Ikke vurdert'}</strong>. {newAnalysis.recommendationRationale}
          </p>
        </div>
        <div>
          <p className="font-medium">Endrede grunnverdier ({baseChanges.length})</p>
          {baseChanges.length === 0 ? (
            <p className="text-slate-600">Ingen endringer i inngangsverdiene.</p>
          ) : (
            <ul className="num mt-1 divide-y divide-slate-100">
              {baseChanges.map((d) => (
                <li key={d.key} className="flex justify-between gap-2 py-1">
                  <span>{d.label}</span>
                  <span className="text-slate-600">
                    {fmt(d.base)} → <strong className="text-ink">{fmt(d.current)}</strong>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
        {newRisks.length > 0 && (
          <div>
            <p className="font-medium">Nye risikoer</p>
            <ul className="list-disc pl-5 text-slate-700">
              {newRisks.map((r) => (
                <li key={r.id}>
                  {r.title} ({r.level === null ? 'ukjent alvorlighet' : `${r.level}/10`})
                </li>
              ))}
            </ul>
          </div>
        )}
        <Alert tone="info">
          «Behold mine endringer» beholder de {myChanges.length} forutsetningene du selv har endret, og henter resten fra de nye opplysningene. Endringen lagres i kalkylen din.
        </Alert>
      </div>
    </Dialog>
  );
}
