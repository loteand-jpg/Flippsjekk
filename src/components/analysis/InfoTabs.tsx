import { CheckCircle2, ListChecks, Pencil, Plus, RotateCcw, EyeOff } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useSession } from '../../app/session';
import { useServices } from '../../app/services';
import { useToast } from '../../app/toast';
import { CASE_LABEL } from '../../calc/engine';
import { diffValues } from '../../calc/scenario';
import { aggregateRisk, dataQuality, DATA_QUALITY_RULE_TEXT, preliminaryReasons, QUALITY_LABEL, RISK_BAND_LABEL, RISK_RULE_TEXT } from '../../domain/assessment';
import {
  CHECK_STATUS_LABEL,
  CHECKLIST_LABEL,
  PROPERTY_TYPE_LABEL,
  RISK_CATEGORIES,
  RISK_CATEGORY_LABEL,
  SALE_STATUS_LABEL,
  SOURCE_KIND_LABEL,
  TENURE_LABEL,
  type FactStatus,
} from '../../domain/enums';
import { effectiveRisks, validateRisk, type EffectiveRisk, type RiskFields, type RiskIssue } from '../../domain/risks';
import type { Source } from '../../domain/schemas';
import { formatArea, formatDate, formatDateKey, formatDateTime, formatMonths, formatNOK, formatNumber, formatPct, formatPctPoints, formatRelative, NO_BASIS, UNKNOWN } from '../../lib/format';
import { Checkbox, Field, NumberInput, Select, TextInput, Textarea } from '../ui/forms';
import { Dialog } from '../ui/overlay';
import { Alert, Badge, Button, type Tone } from '../ui/primitives';
import { PreliminaryBadge, ProvenanceTag, RecommendationBadge, SaleStatusBadge } from '../property/badges';
import { BasisNote, Panel, type PropertyContext } from './shared';

function sourceById(sources: Source[], id: string | null) {
  return id ? sources.find((s) => s.id === id) ?? null : null;
}

// ---------------------------------------------------------------------------
// Oversikt
// ---------------------------------------------------------------------------

export function OverviewTab({ ctx }: { ctx: PropertyContext }) {
  const { analysis: a, item, result } = ctx;
  const snap = item.snapshot;
  const prelim = preliminaryReasons(a);
  const ev = result.evaluation;
  const diffs = ctx.base ? diffValues(ctx.base.values, ctx.draft) : [];
  const prov = (k: string): FactStatus => snap?.factSources[k]?.status ?? 'uavklart';
  const upcoming = item.viewings.filter((v) => v.status !== 'avlyst');
  const factRows: { label: string; value: string; status: FactStatus; hint?: string }[] = snap
    ? [
        { label: 'Prisantydning (kontant)', value: formatNOK(snap.askingPrice), status: prov('askingPrice') },
        { label: 'Fellesgjeld', value: formatNOK(snap.sharedDebt), status: prov('sharedDebt') },
        {
          label: 'Pris inkl. fellesgjeld',
          hint: 'Ekskl. kjøpskostnader',
          value: snap.askingPrice !== null && snap.sharedDebt !== null ? formatNOK(snap.askingPrice + snap.sharedDebt) : UNKNOWN,
          status: snap.askingPrice !== null && snap.sharedDebt !== null && prov('askingPrice') === 'dokumentert' && prov('sharedDebt') === 'dokumentert' ? 'dokumentert' : 'uavklart',
        },
        ...(snap.listingTotalInclCosts !== null
          ? [{ label: 'Totalbeløp i annonsen', hint: 'Inkl. kjøpskostnader – ikke det samme som pris inkl. fellesgjeld', value: formatNOK(snap.listingTotalInclCosts), status: 'dokumentert' as FactStatus }]
          : []),
        { label: 'Felleskostnader per måned', value: formatNOK(snap.monthlyCommonCosts), status: prov('monthlyCommonCosts') },
        { label: 'Eierform', value: TENURE_LABEL[item.property.tenure], status: prov('tenure') },
        { label: 'Boligtype', value: PROPERTY_TYPE_LABEL[item.property.propertyType], status: 'dokumentert' },
        { label: 'Areal (BRA-i)', value: formatArea(snap.areaBRAi), status: prov('areaBRAi') },
        { label: 'Rom / soverom', value: `${formatNumber(snap.rooms)} / ${formatNumber(snap.bedrooms)}`, status: prov('rooms') },
        { label: 'Etasje', value: snap.floor === null ? 'Ikke relevant / ukjent' : String(snap.floor), status: 'dokumentert' },
        { label: 'Byggeår', value: snap.buildYear === null ? UNKNOWN : String(snap.buildYear), status: prov('buildYear') },
        ...(snap.plotArea ? [{ label: 'Tomt', value: formatArea(snap.plotArea), status: 'dokumentert' as FactStatus }] : []),
        ...(snap.energyLabel ? [{ label: 'Energimerke', value: snap.energyLabel, status: 'dokumentert' as FactStatus }] : []),
        { label: 'Salgsstatus', value: SALE_STATUS_LABEL[snap.saleStatus], status: prov('saleStatus'), hint: snap.saleStatusNote ?? undefined },
        {
          label: 'Annonserte visninger',
          value: upcoming.length ? `${upcoming.length} (neste ${formatDateTime(upcoming.find((v) => Date.parse(v.start) > ctx.now.getTime())?.start ?? null, 'passert')})` : 'Ingen kjent',
          status: 'dokumentert',
        },
      ]
    : [];

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
      <div className="space-y-5">
        <Panel title="Konklusjon" action={<div className="flex gap-1.5"><RecommendationBadge value={a.recommendation} /><PreliminaryBadge reasons={prelim} /></div>}>
          <p className="text-base text-ink">{a.summary || 'Ingen oppsummering i grunnlaget.'}</p>
          {a.recommendationRationale && <p className="mt-2 text-sm text-slate-700">{a.recommendationRationale}</p>}
          {a.strategy && (
            <p className="mt-3 text-sm">
              <span className="font-medium">Verdiskapingsstrategi:</span> {a.strategy}
            </p>
          )}
          {a.conditions.length > 0 && (
            <div className="mt-3">
              <p className="text-sm font-medium">Kjøpet kan bli interessant hvis:</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-slate-700">
                {a.conditions.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            </div>
          )}
          {prelim.length > 0 && (
            <Alert tone="warning" className="mt-3" title="Foreløpig vurdering">
              {prelim.join(' · ')}.
            </Alert>
          )}
          <p className="mt-3 text-xs text-slate-600">
            Anbefalingen er en egen faglig vurdering og følger ikke mekanisk av kalkylen. En positiv kalkyle betyr ikke at objektet er kjøpsklart.
          </p>
        </Panel>

        <Panel title="Resultat i tre salgsscenarioer" sub={<BasisNote basis={ctx.draft.saleBasis} />}>
          {ev.status === 'complete' ? (
            <table className="num w-full text-sm">
              <thead className="text-left text-xs text-slate-600">
                <tr>
                  <th className="py-1 font-medium">Scenario</th>
                  <th className="py-1 text-right font-medium">Salgspris</th>
                  <th className="py-1 text-right font-medium">Resultat før skatt</th>
                  <th className="py-1 text-right font-medium">Avkastning</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(['low', 'base', 'high'] as const).map((k) => {
                  const c = ev.cases[k];
                  return (
                    <tr key={k}>
                      <th scope="row" className="py-1.5 text-left font-normal">
                        {CASE_LABEL[k]}
                      </th>
                      <td className="py-1.5 text-right">{c ? formatNOK(c.V) : NO_BASIS}</td>
                      <td className={`py-1.5 text-right font-semibold ${c && c.profit < 0 ? 'text-red-800' : ''}`}>{c ? formatNOK(c.profit) : NO_BASIS}</td>
                      <td className="py-1.5 text-right">{c ? formatPct(c.projectReturn) : '–'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <Alert tone="warning" title="Ufullstendig kalkyle">
              Mangler: {result.missing.map((m) => m.label).join(', ')}.
            </Alert>
          )}
        </Panel>

        <Panel title="Mitt scenario mot grunnanalysen" sub={diffs.length ? `${diffs.length} forutsetning${diffs.length === 1 ? '' : 'er'} er endret av deg.` : 'Ingen endringer – scenarioet følger grunnanalysen.'}>
          {diffs.length > 0 && (
            <ul className="divide-y divide-slate-100 text-sm">
              {diffs.map((d) => (
                <li key={d.key} className="flex flex-wrap items-baseline justify-between gap-2 py-1.5">
                  <span className="flex items-center gap-2">
                    <ProvenanceTag status="mine" /> {d.label}
                  </span>
                  <span className="num text-slate-600">
                    {fmtDiff(d.kind, d.base)} → <strong className="text-ink">{fmtDiff(d.kind, d.current)}</strong>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        {a.nextSteps.length > 0 && (
          <Panel title="Neste steg før visning og bud">
            <ol className="list-decimal space-y-1 pl-5 text-sm">
              {a.nextSteps.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ol>
          </Panel>
        )}
      </div>

      <Panel title="Objektfakta" sub={snap ? `Sist kontrollert ${formatRelative(snap.observedAt, ctx.now)} · ${snap.origin === 'demo' || snap.origin === 'synthetic' ? 'demodata' : 'kilde'}` : undefined}>
        {snap ? (
          <dl className="divide-y divide-slate-100">
            {factRows.map((r) => (
              <div key={r.label} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 py-2 text-sm">
                <dt className="text-slate-600">
                  {r.label}
                  {r.hint && <span className="block text-[11px] text-slate-500">{r.hint}</span>}
                </dt>
                <dd className="num flex items-center gap-2 text-right font-medium">
                  {r.value}
                  <ProvenanceTag status={r.status} />
                </dd>
              </div>
            ))}
          </dl>
        ) : (
          <Alert tone="info">Annonsefakta er ikke hentet for dette objektet. Analysen bygger på et privat, importert utkast.</Alert>
        )}
        <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-slate-600">
          <ProvenanceTag status="dokumentert" /> fra kilde
          <ProvenanceTag status="anslag" /> analyseanslag
          <ProvenanceTag status="uavklart" /> ikke avklart
          <ProvenanceTag status="mine" /> din endring
        </div>
      </Panel>
    </div>
  );
}

function fmtDiff(kind: string, v: unknown): string {
  if (v === null || v === undefined) return UNKNOWN;
  if (kind === 'money') return formatNOK(v as number);
  if (kind === 'pct') return formatPctPoints(v as number);
  if (kind === 'months') return formatMonths(v as number);
  if (kind === 'hours') return `${formatNumber(v as number)} t`;
  if (kind === 'bool') return v ? 'Ja' : 'Nei';
  if (kind === 'items') return `${(v as unknown[]).length} tiltak`;
  if (kind === 'text') return (v as string) ? 'Endret tekst' : 'Tom';
  return String(v);
}

// ---------------------------------------------------------------------------
// Risiko og sjekkliste
// ---------------------------------------------------------------------------

const CHECK_TONE: Record<string, Tone> = { dokumentert: 'pine', delvis: 'amber', mangler: 'red', ikke_relevant: 'outline' };

export function RiskTab({ ctx }: { ctx: PropertyContext }) {
  const services = useServices();
  const toast = useToast();
  const { entitlements } = useSession();
  const canEdit = entitlements?.canEditScenarios ?? false;
  const { analysis: a, item } = ctx;
  const eff = useMemo(() => effectiveRisks(a.risks, item.riskEdits), [a.risks, item.riskEdits]);
  const risk = aggregateRisk(eff.active);
  const q = dataQuality(a, ctx.baseSnapshot);
  const [dialog, setDialog] = useState<null | { initial: EffectiveRisk | null }>(null);
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try {
      await fn();
      toast({ tone: 'success', title: ok });
      return true;
    } catch (e) {
      toast({ tone: 'danger', title: 'Kunne ikke lagre', body: (e as Error).message });
      return false;
    } finally {
      setBusy(false);
    }
  };
  const fieldsOf = (r: EffectiveRisk): RiskFields => ({ title: r.title, category: r.category, level: r.level, costLow: r.costLow, costHigh: r.costHigh, rationale: r.rationale, action: r.action });
  const save = async (f: RiskFields, target: EffectiveRisk | null) => {
    const ok = await run(
      () => {
        if (!target) return services.risks.create(item.property.id, f);
        if (target.origin === 'mine') return services.risks.update(target.editId as string, f);
        return services.risks.overrideBase(item.property.id, target.id, f);
      },
      target ? 'Risikoen er oppdatert' : 'Risikoen er lagt til',
    );
    if (ok) setDialog(null);
  };
  const toggle = async (key: (typeof a.checklist)[number]['key'], confirmed: boolean) => {
    try {
      await services.properties.updatePersonalStatus(item.property.id, { check: { key, confirmed } });
    } catch (e) {
      toast({ tone: 'danger', title: 'Kunne ikke lagre avkrysningen', body: (e as Error).message });
    }
  };
  const tasks = a.checklist.filter((c) => c.beforeBidTask);
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Panel title={`Samlet risiko: ${risk.score === null ? 'Uavklart' : `${risk.score}/10 (${RISK_BAND_LABEL[risk.band].toLowerCase()})`}`} sub={RISK_RULE_TEXT}>
          <p className="text-sm text-slate-700">
            {risk.knownCount} risiko{risk.knownCount === 1 ? '' : 'er'} med kjent alvorlighet, {risk.unknownCount} med ukjent alvorlighet. Manglende dokumentasjon regnes aldri som lav risiko.
          </p>
        </Panel>
        <Panel title={`Datadekning: ${Math.round(q.coverage * 100)} % (${QUALITY_LABEL[q.grade].toLowerCase()})`} sub={DATA_QUALITY_RULE_TEXT}>
          <div className="h-2 rounded-full bg-slate-100" role="img" aria-label={`Datadekning ${Math.round(q.coverage * 100)} prosent`}>
            <div className="h-2 rounded-full bg-[var(--color-series-1)]" style={{ width: `${Math.round(q.coverage * 100)}%` }} />
          </div>
          <p className="mt-2 text-sm text-slate-700">
            Sjekkliste {Math.round(q.checklistCoverage * 100)} % · nøkkelfakta {Math.round(q.factsCoverage * 100)} %.
            {q.undocumentedFacts.length > 0 && <> Ikke dokumentert: {q.undocumentedFacts.join(', ')}.</>}
          </p>
        </Panel>
      </div>

      <Panel
        title="Risikoer og mulige merkostnader"
        sub="Risikoene fra grunnlaget kan endres, skjules og suppleres med dine egne. Endringene er private og påvirker ikke andre brukere eller grunnlaget."
        action={
          <Button size="sm" variant="primary" icon={<Plus className="size-4" aria-hidden />} disabled={!canEdit} onClick={() => setDialog({ initial: null })}>
            Legg til risiko
          </Button>
        }
      >
        {eff.active.length === 0 ? (
          <Alert tone="warning">Ingen risikoer er registrert. Det betyr ikke at risikoen er lav – grunnlaget kan være ufullstendig.</Alert>
        ) : (
          <ul className="divide-y divide-slate-100">
            {[...eff.active]
              .sort((x, y) => (y.level ?? 11) - (x.level ?? 11))
              .map((r) => {
                const src = r.origin === 'mine' ? null : sourceById(a.sources, r.sourceId);
                return (
                  <li key={r.id} className="grid gap-2 py-3 sm:grid-cols-[8rem_1fr_auto]" data-testid="risk-row">
                    <div>
                      <Badge tone={r.level === null ? 'outline' : r.level >= 7 ? 'red' : r.level >= 4 ? 'amber' : 'green'}>{r.level === null ? 'Ukjent alvorlighet' : `Alvorlighet ${r.level}/10`}</Badge>
                      <p className="mt-1 text-xs text-slate-600">{RISK_CATEGORY_LABEL[r.category]}</p>
                    </div>
                    <div>
                      <p className="flex flex-wrap items-center gap-2 font-medium">
                        {r.title}
                        {r.origin === 'endret' && <Badge tone="blue">Endret av deg</Badge>}
                        {r.origin === 'mine' && <Badge tone="blue">Din risiko</Badge>}
                      </p>
                      <p className="text-sm text-slate-700">{r.rationale}</p>
                      <p className="num mt-1 text-sm">
                        Mulig kostnad:{' '}
                        {r.costLow === null && r.costHigh === null ? UNKNOWN : r.costLow !== null && r.costHigh !== null ? `${formatNOK(r.costLow)} – ${formatNOK(r.costHigh)}` : formatNOK(r.costHigh ?? r.costLow)}
                      </p>
                      {r.action && (
                        <p className="mt-1 text-sm">
                          <span className="font-medium">Tiltak:</span> {r.action}
                        </p>
                      )}
                      <p className="mt-1 text-xs text-slate-500">
                        {r.origin === 'mine' ? 'Kilde: din egen vurdering' : r.origin === 'endret' ? `Grunnlaget sa: alvorlighet ${r.original?.level ?? 'ukjent'}. Kilde: ${src ? src.title : 'ingen kilde oppgitt'}` : `Kilde: ${src ? src.title : 'ingen kilde oppgitt'}`}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-start gap-1 sm:flex-col">
                      <Button size="sm" variant="ghost" icon={<Pencil className="size-4" aria-hidden />} disabled={!canEdit} onClick={() => setDialog({ initial: r })} aria-label={`Rediger risiko: ${r.title}`}>
                        Rediger
                      </Button>
                      {r.origin === 'endret' && (
                        <Button size="sm" variant="ghost" icon={<RotateCcw className="size-4" aria-hidden />} disabled={!canEdit} onClick={() => run(() => services.risks.remove(r.editId as string), 'Tilbakestilt til grunnlaget')} aria-label={`Tilbakestill til grunnlaget: ${r.title}`}>
                          Tilbakestill
                        </Button>
                      )}
                      {r.origin === 'grunnlag' && (
                        <Button size="sm" variant="ghost" icon={<EyeOff className="size-4" aria-hidden />} disabled={!canEdit} onClick={() => run(() => services.risks.hideBase(item.property.id, r.id, fieldsOf(r)), 'Risikoen er skjult for deg')} aria-label={`Skjul risiko: ${r.title}`}>
                          Skjul
                        </Button>
                      )}
                      {r.origin === 'mine' && (
                        <Button size="sm" variant="ghost" disabled={!canEdit} onClick={() => run(() => services.risks.remove(r.editId as string), 'Risikoen er slettet')} aria-label={`Slett risiko: ${r.title}`}>
                          Slett
                        </Button>
                      )}
                    </div>
                  </li>
                );
              })}
          </ul>
        )}
        {eff.hidden.length > 0 && (
          <div className="mt-3 rounded-lg border border-dashed border-slate-300 p-3 text-sm">
            <p className="font-medium">Skjult av deg ({eff.hidden.length})</p>
            <p className="text-xs text-slate-600">Skjulte risikoer teller ikke i samlet risiko. Husk at en skjult risiko ikke er borte i virkeligheten.</p>
            <ul className="mt-2 space-y-1">
              {eff.hidden.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-2">
                  <span>{r.title}</span>
                  <Button size="sm" variant="ghost" disabled={!canEdit} onClick={() => run(() => services.risks.remove(r.editId as string), 'Risikoen vises igjen')} aria-label={`Vis igjen: ${r.title}`}>
                    Vis igjen
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        )}
        {!canEdit && <p className="mt-2 text-xs text-slate-600">Du trenger aktivt abonnement for å endre risikoer.</p>}
      </Panel>

      <RiskDialog open={dialog !== null} initial={dialog?.initial ?? null} busy={busy} onClose={() => setDialog(null)} onSave={(f) => save(f, dialog?.initial ?? null)} />

      <Panel
        title={
          <span className="inline-flex items-center gap-2">
            <ListChecks className="size-4" aria-hidden /> Sjekkliste
          </span>
        }
        sub="Kildestatus kommer fra grunnlaget. Din avkrysning er en privat bekreftelse og endrer ikke kildestatusen."
      >
        <ul className="divide-y divide-slate-100">
          {a.checklist.map((c) => {
            const mine = item.link.checks[c.key];
            const src = sourceById(a.sources, c.sourceId);
            return (
              <li key={c.key} className="grid gap-2 py-3 md:grid-cols-[minmax(0,1fr)_14rem]">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">{CHECKLIST_LABEL[c.key]}</p>
                    <Badge tone={CHECK_TONE[c.status]}>Kilde: {CHECK_STATUS_LABEL[c.status]}</Badge>
                  </div>
                  <p className="mt-0.5 text-sm text-slate-700">{c.note}</p>
                  {src && <p className="text-xs text-slate-500">Kilde: {src.title}</p>}
                  {c.beforeBidTask && (
                    <p className="mt-1 text-sm text-amber-900">
                      <span className="font-medium">Før bud:</span> {c.beforeBidTask}
                    </p>
                  )}
                </div>
                <div className="md:pt-0.5">
                  <Checkbox
                    label="Kontrollert av meg (privat)"
                    description={mine ? `Bekreftet ${formatDate(mine.confirmedAt)}` : undefined}
                    checked={Boolean(mine)}
                    disabled={!ctx.editable}
                    onChange={(v) => toggle(c.key, v)}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      </Panel>

      {tasks.length > 0 && (
        <Panel title="Oppgaver før bud">
          <ul className="space-y-1.5 text-sm">
            {tasks.map((c) => (
              <li key={c.key} className="flex gap-2">
                <CheckCircle2 className={`mt-0.5 size-4 shrink-0 ${item.link.checks[c.key] ? 'text-pine-700' : 'text-slate-300'}`} aria-hidden />
                <span>
                  {c.beforeBidTask} <span className="text-xs text-slate-500">({item.link.checks[c.key] ? 'kontrollert av deg' : 'ikke kontrollert'})</span>
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Full rapport, forutsetninger og kilder
// ---------------------------------------------------------------------------

export function ReportTab({ ctx }: { ctx: PropertyContext }) {
  const { analysis: a, item } = ctx;
  return (
    <div className="space-y-5">
      <Panel title="Analyseversjon">
        <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <dt className="text-slate-600">Grunnlag</dt>
            <dd className="font-medium">{a.visibility === 'private' ? 'Privat importert utkast' : `Felles grunnanalyse versjon ${a.version}`}</dd>
          </div>
          <div>
            <dt className="text-slate-600">Publisert</dt>
            <dd className="font-medium">{a.publishedAt ? formatDateTime(a.publishedAt) : 'Ikke publisert'}</dd>
          </div>
          <div>
            <dt className="text-slate-600">Annonseopplysninger kontrollert</dt>
            <dd className="font-medium">{item.snapshot ? formatDateTime(item.snapshot.observedAt) : '–'}</dd>
          </div>
          <div>
            <dt className="text-slate-600">Analyseskjema / kalkylemodell</dt>
            <dd className="font-medium">
              v{a.schemaVersion} / {a.modelVersion}
            </dd>
          </div>
          <div>
            <dt className="text-slate-600">Opprinnelse</dt>
            <dd className="font-medium">{a.origin === 'demo' ? 'Demodata (fiktiv)' : a.origin === 'synthetic' ? 'Demodata – ingen annonse hentet' : a.origin === 'import_v1' ? 'Import (v1)' : 'Analyseagent'}</dd>
          </div>
          <div>
            <dt className="text-slate-600">Salgsstatus</dt>
            <dd>
              <SaleStatusBadge value={item.snapshot?.saleStatus ?? null} note={item.snapshot?.saleStatusNote} />
            </dd>
          </div>
        </dl>
        {item.versions.length > 1 && (
          <div className="mt-3">
            <p className="text-sm font-medium">Versjonshistorikk</p>
            <ul className="mt-1 text-sm text-slate-700">
              {item.versions.map((v) => (
                <li key={v.id}>
                  v{v.version} · {formatDate(v.publishedAt)} · {v.status === 'published' ? 'gjeldende' : 'erstattet'}
                  {v.id === a.id && <strong> · brukes av dette scenarioet</strong>}
                </li>
              ))}
            </ul>
          </div>
        )}
      </Panel>

      <Panel title="Analyserapport">
        <div className="space-y-4">
          {a.report.map((r) => (
            <section key={r.title}>
              <h4 className="font-semibold">{r.title}</h4>
              <p className="mt-1 text-sm whitespace-pre-line text-slate-700">{r.body}</p>
            </section>
          ))}
        </div>
      </Panel>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Panel title="Forutsetninger">
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {a.assumptions.map((x) => (
              <li key={x}>{x}</li>
            ))}
            {a.assumptions.length === 0 && <li>Ingen forutsetninger oppgitt.</li>}
          </ul>
        </Panel>
        <Panel title="Usikkerheter">
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {a.uncertainties.map((x) => (
              <li key={x}>{x}</li>
            ))}
            {a.uncertainties.length === 0 && <li>Ingen usikkerheter oppgitt – det betyr ikke at det ikke finnes noen.</li>}
          </ul>
        </Panel>
      </div>

      <Panel title="Kilder">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[40rem] text-sm">
            <thead className="text-left text-xs text-slate-600">
              <tr>
                <th className="py-1.5 pr-2 font-medium">Kilde</th>
                <th className="py-1.5 pr-2 font-medium">Type</th>
                <th className="py-1.5 pr-2 font-medium">Dokument / side</th>
                <th className="py-1.5 pr-2 font-medium">Hentet</th>
                <th className="py-1.5 pr-2 font-medium">Observert</th>
                <th className="py-1.5 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 align-top">
              {a.sources.map((s) => (
                <tr key={s.id}>
                  <td className="py-2 pr-2">
                    {s.url ? (
                      <a href={s.url} target="_blank" rel="noreferrer" className="text-pine-800 underline">
                        {s.title}
                      </a>
                    ) : (
                      s.title
                    )}
                  </td>
                  <td className="py-2 pr-2">{SOURCE_KIND_LABEL[s.kind]}</td>
                  <td className="py-2 pr-2 text-xs">
                    {s.documentName ?? '–'}
                    {s.page ? `, s. ${s.page}` : ''}
                  </td>
                  <td className="py-2 pr-2 text-xs whitespace-nowrap">{formatDateTime(s.fetchedAt, '–')}</td>
                  <td className="py-2 pr-2 text-xs whitespace-nowrap">{formatDateKey(s.observedAt, '–')}</td>
                  <td className="py-2">
                    <ProvenanceTag status={s.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title="Beregningsregler">
        <ul className="space-y-1 text-sm text-slate-700">
          <li>Kjøpskostnader K = dokumentavgiftsgrunnlag × sats + øvrige gebyrer. Grunnlaget følger kjøpsprisen du legger inn.</li>
          <li>Oppussing med reserve RB = R × (1 + reserve).</li>
          <li>Renter I = låneandel × ((P + K) + RB/2) × rente × måneder/12. Avdragsfritt prosjektlån; oppussing trekkes i snitt halvveis. Ingen renter av fellesgjelden.</li>
          <li>Drift O = månedlige kostnader × måneder. Inkluderer hele felleskostnaden – gjeldsbetjening legges ikke til på nytt.</li>
          <li>Kontantsalg S = salgspris − fellesgjeld ved salg (totalpris) eller salgspris (kontantpris). Provisjon beregnes av kontantsalget.</li>
          <li>Resultat før skatt og eget arbeid = S − C. Prosjektavkastning = (S − C) / (C + fellesgjeld ved kjøp).</li>
          <li>{RISK_RULE_TEXT}</li>
          <li>{DATA_QUALITY_RULE_TEXT}</li>
        </ul>
      </Panel>

      {a.history && Object.values(a.history).some((v) => v !== null) && (
        <Panel title="Historikk fra import" sub="Historiske tall fra den importerte filen. Ikke beregnet av motoren.">
          <ul className="num text-sm">
            {a.history.historicalMax != null && <li>Historisk maksbud: {formatNOK(a.history.historicalMax)}</li>}
            {a.history.historicalProfit != null && <li>Historisk fortjeneste: {formatNOK(a.history.historicalProfit)}</li>}
            {a.history.historicalSale != null && <li>Historisk salgspris: {formatNOK(a.history.historicalSale)}</li>}
          </ul>
        </Panel>
      )}
      {a.unmappedFields && Object.keys(a.unmappedFields).length > 0 && (
        <Panel title="Felt uten kjent mapping (bevart fra import)">
          <pre className="max-h-64 overflow-auto rounded-lg bg-slate-50 p-3 text-xs">{JSON.stringify(a.unmappedFields, null, 2)}</pre>
        </Panel>
      )}
    </div>
  );
}

const EMPTY_RISK: RiskFields = { title: '', category: RISK_CATEGORIES[0], level: null, costLow: null, costHigh: null, rationale: '', action: '' };

function RiskDialog({ open, initial, onClose, onSave, busy }: { open: boolean; initial: EffectiveRisk | null; onClose: () => void; onSave: (f: RiskFields) => void; busy: boolean }) {
  const [form, setForm] = useState<RiskFields>(EMPTY_RISK);
  const [submitted, setSubmitted] = useState(false);
  const [seed, setSeed] = useState<string | null>(null);
  const key = open ? (initial?.id ?? 'ny') : null;
  if (seed !== key) {
    setSeed(key);
    if (open) {
      setForm(initial ? { title: initial.title, category: initial.category, level: initial.level, costLow: initial.costLow, costHigh: initial.costHigh, rationale: initial.rationale, action: initial.action } : EMPTY_RISK);
      setSubmitted(false);
    }
  }
  const issues = useMemo(() => validateRisk(form), [form]);
  const err = (f: RiskIssue['field']) => (submitted ? issues.find((i) => i.field === f)?.message ?? null : null);
  const set = (p: Partial<RiskFields>) => setForm((f) => ({ ...f, ...p }));
  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="lg"
      title={initial ? 'Rediger risiko' : 'Legg til risiko'}
      description={
        initial?.origin === 'grunnlag' || initial?.origin === 'endret'
          ? 'Du endrer din egen kopi. Grunnlaget og andre brukere berøres ikke, og du kan tilbakestille når som helst. Tomt kostnadsfelt betyr ukjent – ikke 0 kr.'
          : 'Dette er dine private opplysninger. Tomt kostnadsfelt betyr ukjent – ikke 0 kr.'
      }
      footer={
        <>
          <Button onClick={onClose}>Avbryt</Button>
          <Button
            variant="primary"
            loading={busy}
            onClick={() => {
              setSubmitted(true);
              if (issues.length === 0) onSave(form);
            }}
          >
            Lagre
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Tittel" error={err('title')} className="sm:col-span-2">
          {(p) => <TextInput {...p} autoFocus value={form.title} onChange={(e) => set({ title: e.target.value })} placeholder="F.eks. Rørene er fra 1975" />}
        </Field>
        <Field label="Kategori">
          {(p) => (
            <Select {...p} value={form.category} onChange={(e) => set({ category: e.target.value as RiskFields['category'] })}>
              {RISK_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {RISK_CATEGORY_LABEL[c]}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Alvorlighet" error={err('level')} hint="1 = liten, 10 = svært alvorlig. «Ukjent» regnes aldri som lav.">
          {(p) => (
            <Select {...p} value={form.level === null ? '' : String(form.level)} onChange={(e) => set({ level: e.target.value === '' ? null : Number(e.target.value) })}>
              <option value="">Ukjent</option>
              {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Mulig kostnad – laveste" error={err('costLow')}>
          {(p) => <NumberInput {...p} unit="kr" value={form.costLow} onChange={(v) => set({ costLow: v })} />}
        </Field>
        <Field label="Mulig kostnad – høyeste" error={err('costHigh')}>
          {(p) => <NumberInput {...p} unit="kr" value={form.costHigh} onChange={(v) => set({ costHigh: v })} />}
        </Field>
        <Field label="Begrunnelse" className="sm:col-span-2">
          {(p) => <Textarea {...p} rows={2} value={form.rationale} onChange={(e) => set({ rationale: e.target.value })} />}
        </Field>
        <Field label="Tiltak" className="sm:col-span-2">
          {(p) => <Textarea {...p} rows={2} value={form.action} onChange={(e) => set({ action: e.target.value })} placeholder="Hva må avklares eller gjøres?" />}
        </Field>
      </div>
    </Dialog>
  );
}
