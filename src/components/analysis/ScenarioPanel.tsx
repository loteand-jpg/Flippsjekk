import clsx from 'clsx';
import { analysisScenarioValues, buildBaseValues, renovationTotals } from '../../calc/scenario';
import { useEditAccess } from '../../app/access';
import { resolveAnalysisScenarios, type ResolvedAnalysisScenario } from '../../domain/analysisScenarios';
import { CHANGE_LEVEL_LABEL, FEASIBILITY_LABEL, RENOVATION_LEVEL_LABEL, SCENARIO_KIND_LABEL, SCENARIO_RISK_DIMENSIONS, SCENARIO_RISK_LABEL, STANDARD_CLASS_LABEL, UNCERTAINTY_LABEL, type FeasibilityStatus } from '../../domain/enums';
import { SALE_SOURCE_LABEL } from '../../calc/saleValue';
import { NEW_ACCOUNT_DEFAULTS } from '../../config/defaults';
import { formatHours, formatMonths, formatNOK, NO_BASIS } from '../../lib/format';
import { Badge, Button, type Tone } from '../ui/primitives';
import { Panel, type PropertyContext } from './shared';

const FEASIBILITY_TONE: Record<FeasibilityStatus, Tone> = { klar: 'green', betinget: 'amber', uavklart: 'outline', ikke_gjennomforbar: 'red' };

/** Verdier fra et agentscenario som overstyrer kalkylen når det tas i bruk. */
export function scenarioFields(ctx: PropertyContext, id: string) {
  const defaults = ctx.profile?.defaults ?? NEW_ACCOUNT_DEFAULTS;
  const snapshot = ctx.baseSnapshot ?? ctx.item.snapshot;
  if (!snapshot) return null;
  return buildBaseValues({ property: ctx.item.property, snapshot, analysis: ctx.analysis, defaults, analysisScenarioId: id });
}

/**
 * Tar et agentscenario (basis/alternativ) i bruk i brukerens kalkyle (ulagret). Brukerens økonomiske forutsetninger beholdes
 * (kjøpspris, kjøpskostnader, finansiering, rente, egenkapital, mål, timekrav, arbeidsmodus, oppgjørstid m.m.); bare det som er
 * scenariospesifikt byttes: tiltak, salgsverdi og oppussingstid. Samme overlay som rangeringen av scenarioene bruker.
 */
export function applyScenarioToDraft(ctx: PropertyContext, scenarioId: string): void {
  const snapshot = ctx.baseSnapshot ?? ctx.item.snapshot;
  if (!snapshot) return;
  const defaults = ctx.profile?.defaults ?? NEW_ACCOUNT_DEFAULTS;
  ctx.setDraft((d) => analysisScenarioValues({ property: ctx.item.property, snapshot, analysis: ctx.analysis, defaults, user: d, analysisScenarioId: scenarioId }).values);
}

export function activeScenarioId(ctx: PropertyContext): string {
  const all = resolveAnalysisScenarios(ctx.analysis);
  return all.find((s) => s.id === ctx.draft.analysisScenarioId)?.id ?? all.find((s) => s.kind === 'basis')?.id ?? all[0].id;
}

function ScenarioCard({ ctx, def, active, onCreate }: { ctx: PropertyContext; def: ResolvedAnalysisScenario; active: boolean; onCreate?: (def: ResolvedAnalysisScenario) => void }) {
  const { canEdit } = useEditAccess('scenarios');
  const totals = renovationTotals({ renovationMode: 'tiltak', renovationItems: def.items, renovationLumpSum: null, lumpSumHours: null, laborModes: ctx.draft.laborModes, maxOwnWork: ctx.draft.maxOwnWork, regulatedCompetence: ctx.draft.regulatedCompetence });
  const months = def.suggestedMonths === null ? null : def.suggestedMonths;
  // Salgsverdien er fastsatt av koden (markedsmotoren). Agentens estimat vises som historisk referanse, ikke som fasit.
  const resolution = scenarioFields(ctx, def.id)?.saleResolution ?? null;
  const sale = resolution?.sale ?? null;
  const apply = () => applyScenarioToDraft(ctx, def.id);
  return (
    <div className={clsx('flex flex-col rounded-xl border bg-white p-4', active ? 'border-pine-700 ring-2 ring-pine-700/20' : 'border-slate-200')} data-testid="scenario-card">
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge tone={def.kind === 'basis' ? 'pine' : 'blue'}>{SCENARIO_KIND_LABEL[def.kind]}</Badge>
        <Badge tone={FEASIBILITY_TONE[def.feasibility]}>{FEASIBILITY_LABEL[def.feasibility]}</Badge>
        {def.saleSource === 'scenario' && <Badge tone="outline">Usikkerhet: {UNCERTAINTY_LABEL[def.uncertainty.level].toLowerCase()}</Badge>}
        {active && <Badge tone="green">Brukt i dette scenarioet</Badge>}
      </div>
      <p className="mt-2 font-semibold">{def.title}</p>
      <p className="text-xs text-slate-600">{RENOVATION_LEVEL_LABEL[def.level]}</p>
      <p className="mt-1 text-sm text-slate-700">{def.description}</p>
      <dl className="num mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
        <dt className="text-slate-600">Oppussing før reserve</dt>
        <dd className="text-right font-medium">{totals.total === null ? NO_BASIS : formatNOK(totals.total)}</dd>
        <dt className="text-slate-600">Egne timer</dt>
        <dd className="text-right">{formatHours(totals.hours)}</dd>
        <dt className="text-slate-600">Oppussingstid</dt>
        <dd className="text-right">{def.monthsAreTotal ? `Totalt ${formatMonths(def.suggestedMonths)}` : formatMonths(months)}</dd>
        <dt className="text-slate-600">Salgsverdi normal</dt>
        <dd className="text-right font-medium">{formatNOK(sale?.base ?? null, NO_BASIS)}</dd>
        <dt className="text-slate-600">Lav – høy</dt>
        <dd className="text-right text-xs">
          {formatNOK(sale?.low ?? null, NO_BASIS)} – {formatNOK(sale?.high ?? null, NO_BASIS)}
        </dd>
      </dl>
      {resolution && (
        <p className="mt-1 text-[11px] text-slate-600" data-testid="sale-source">
          {SALE_SOURCE_LABEL[resolution.source]}
          {resolution.source === 'markedsmotor' && def.sale?.base ? ` · agentens historiske estimat ${formatNOK(def.sale.base)}` : ''}
        </p>
      )}
      {def.saleSource === 'global' ? (
        <p className="mt-2 text-xs text-slate-600">Eldre analyse: salgsverdien er analysens ene vurdering og ikke vurdert for et bestemt sluttprodukt.</p>
      ) : (
        <p className="mt-2 text-xs text-slate-700">
          <span className="font-medium">Sluttprodukt:</span> {def.endProduct.bedrooms === null ? 'soverom ikke avklart' : `${def.endProduct.bedrooms} soverom`}. {def.endProduct.layoutNote} Kjøkken: {CHANGE_LEVEL_LABEL[def.endProduct.kitchenChange].toLowerCase()}. Bad: {CHANGE_LEVEL_LABEL[def.endProduct.bathChange].toLowerCase()}.
          {resolution && (
            <>
              {' '}
              Sluttstandard: <strong>{STANDARD_CLASS_LABEL[resolution.standardClass].toLowerCase()}</strong>
              {resolution.standardDocumented ? '' : ' (antatt ut fra oppussingsnivået – ikke dokumentert)'}.
            </>
          )}
        </p>
      )}
      {def.risk && (
        <p className="mt-2 text-xs text-slate-700" data-testid="scenario-risk">
          <span className="font-medium">Scenariorisiko:</span>{' '}
          {SCENARIO_RISK_DIMENSIONS.map((d) => `${SCENARIO_RISK_LABEL[d].toLowerCase()} ${UNCERTAINTY_LABEL[def.risk![d]].toLowerCase()}`).join(' · ')}.
          {def.risk.note ? ` ${def.risk.note}` : ''}
        </p>
      )}
      {def.saleSource === 'scenario' && !def.risk && <p className="mt-2 text-xs text-amber-900">Scenariorisiko er ikke vurdert og regnes som uavklart i sammenligningen.</p>}
      <p className="mt-2 text-xs text-slate-700">
        <span className="font-medium">Gjennomførbarhet:</span> {def.feasibilityRationale}
      </p>
      {def.requirements.length > 0 && (
        <ul className="mt-1 list-disc pl-5 text-xs text-amber-900">
          {def.requirements.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      )}
      {def.saleSource === 'scenario' && def.referenceNote && <p className="mt-2 text-xs text-slate-600">Referanser: {def.referenceNote}</p>}
      <div className="mt-auto flex flex-wrap gap-2 pt-3">
        <Button size="sm" variant={active ? 'subtle' : 'secondary'} disabled={!ctx.editable || active} onClick={apply} aria-pressed={active}>
          {active ? 'I bruk' : 'Bruk i dette scenarioet'}
        </Button>
        {onCreate && (
          <Button size="sm" variant="ghost" disabled={!canEdit} onClick={() => onCreate(def)}>
            Lag eget scenario
          </Button>
        )}
      </div>
    </div>
  );
}

/** Basis og inntil to alternative planløsninger fra analysen – hver med egne oppussingstiltak og egen salgsverdi. */
export function ScenarioPanel({ ctx, onCreate, compact, stack }: { ctx: PropertyContext; onCreate?: (def: ResolvedAnalysisScenario) => void; compact?: boolean; stack?: boolean }) {
  const all = resolveAnalysisScenarios(ctx.analysis);
  const activeId = activeScenarioId(ctx);
  const hasAlternatives = all.some((s) => s.kind === 'alternativ');
  if (!hasAlternatives && compact) return null;
  return (
    <Panel
      title={hasAlternatives ? 'Basis og alternative planløsninger' : 'Scenario fra analysen'}
      sub={
        hasAlternatives
          ? 'Hvert alternativ har egne oppussingstiltak og egen salgsverdi. Du kan endre alle verdier privat etter at du har tatt et alternativ i bruk.'
          : 'Denne analysen har ett scenario. Alle verdier kan endres privat i kalkylen din.'
      }
    >
      <div className={clsx('grid grid-cols-1 gap-3', all.length > 1 && !stack && 'md:grid-cols-3')}>
        {all.map((d) => (
          <ScenarioCard key={d.id} ctx={ctx} def={d} active={d.id === activeId} onCreate={hasAlternatives ? onCreate : undefined} />
        ))}
      </div>
      {hasAlternatives && <p className="mt-3 text-xs text-slate-600">«Bruk i dette scenarioet» erstatter tiltak, salgsverdi og oppussingstid (ulagret til du lagrer). Dine øvrige valg, som kjøpspris, finansiering og egeninnsats, beholdes.</p>}
    </Panel>
  );
}
