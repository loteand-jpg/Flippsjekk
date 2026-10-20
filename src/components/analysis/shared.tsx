import { Gavel, Hammer, ShieldAlert, ShieldCheck, TrendingUp } from 'lucide-react';
import type { ReactNode } from 'react';
import type { BaseValues, ScenarioEvaluation } from '../../calc/scenario';
import { MAX_BID_LIMIT_LABEL, recommendedBidOf } from '../../calc/engine';
import { effectiveRisks } from '../../domain/risks';
import { aggregateRisk, dataQuality, DATA_QUALITY_RULE_TEXT, QUALITY_LABEL, RISK_BAND_LABEL, RISK_RULE_TEXT } from '../../domain/assessment';
import { PRICE_BASIS_LABEL } from '../../domain/enums';
import type { Profile, PropertySnapshot, Scenario, ScenarioValues, SharedAnalysis } from '../../domain/schemas';
import { formatNOK, formatNOKSigned, formatPct, NO_BASIS } from '../../lib/format';
import type { MyPropertyItem } from '../../services/types';
import { InfoTip } from '../ui/overlay';
import { Stat } from '../ui/primitives';

export interface PropertyContext {
  item: MyPropertyItem;
  analysis: SharedAnalysis;
  baseSnapshot: PropertySnapshot | null;
  scenario: Scenario;
  scenarios: Scenario[];
  base: BaseValues | null;
  draft: ScenarioValues;
  setDraft: (v: ScenarioValues | ((prev: ScenarioValues) => ScenarioValues)) => void;
  result: ScenarioEvaluation;
  baseResult: ScenarioEvaluation | null;
  editable: boolean;
  /** Valgt scenario er det låste «Nettsidens vurdering». */
  locked?: boolean;
  profile: Profile | null;
  now: Date;
  /** Oppretter et nytt privat scenario (kalkyle) basert på et agentscenario (basis eller alternativ). */
  createScenarioFrom?: (analysisScenarioId: string, name: string) => Promise<void>;
}

export const EXPLAIN = {
  profit: 'Kontantsalg minus alle kontantkostnader i prosjektet: kjøpspris, kjøpskostnader, oppussing med reserve, renter på prosjektlånene, månedlige kostnader og salgskostnader. Før skatt. Egen tid er ikke trukket som kostnad – den vises som fortjeneste per egeninnsatstime.',
  maxBid: 'Høyeste kontante kjøpspris som oppfyller ALLE dine mål i normalt scenario: fortjenestemålet og (når du har egne timer) minimum fortjeneste per egeninnsatstime. Hver grense beregnes for seg baklengs med samme motor (biseksjon, toleranse 1 kr) – kjøpsavgift og renter beregnes på nytt for hver pris – og anbefalt maksbud er den laveste. Det vises hva som begrenser. Ikke en budfullmakt eller garanti.',
  renovation: 'Valgt oppussingssum pluss reserve. Anslag er ikke pristilbud.',
  basis: 'Kontantpris er prisen uten fellesgjeld. Totalpris er inkludert fellesgjeld, men uten kjøpskostnader. Ved totalpris trekkes fellesgjeld ved salg fra nøyaktig én gang for å finne kontantsalget.',
  projectReturn: 'Resultat før skatt delt på samlede kontantkostnader pluss fellesgjeld ved kjøp. Dette er prosjektavkastning – ikke avkastning på egenkapital.',
  risk: RISK_RULE_TEXT,
  quality: DATA_QUALITY_RULE_TEXT,
};

export function KeyFigures({ ctx }: { ctx: PropertyContext }) {
  const { result, analysis, baseSnapshot } = ctx;
  const ev = result.evaluation;
  const b = ev.base;
  const risk = aggregateRisk(effectiveRisks(analysis.risks, ctx.item.riskEdits).active);
  const quality = dataQuality(analysis, baseSnapshot);
  const missing = result.missing.length;
  const rec = ev.recommendedMaxBid;
  const bid = recommendedBidOf(ev);
  const floorK = (n: number) => formatNOK(Math.floor(n / 1000) * 1000);
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
      <Stat
        className="col-span-2 lg:col-span-1"
        label={
          <>
            <TrendingUp className="size-3.5" aria-hidden /> Forventet fortjeneste
          </>
        }
        info={<InfoTip label="Fortjeneste før skatt og eget arbeid">{EXPLAIN.profit}</InfoTip>}
        value={b ? formatNOK(b.profit) : NO_BASIS}
        emphasis={b ? (b.profit < 0 ? 'negative' : 'positive') : 'unknown'}
        sub={
          b
            ? `${formatPct(b.projectReturn)} prosjektavkastning · ${
                b.profitPerOwnHour !== null ? `${formatNOK(b.profitPerOwnHour)} per egeninnsatstime${b.meetsHourlyRequirement === false ? ' (under kravet)' : ''}` : b.ownHours === 0 ? 'ingen egne timer' : 'egne timer ikke avklart'
              }`
            : `${missing} inngangsverdi${missing === 1 ? '' : 'er'} mangler`
        }
      />
      <Stat
        label={
          <>
            <Gavel className="size-3.5" aria-hidden /> Maksbud
          </>
        }
        info={<InfoTip label="Modellert maksbud">{EXPLAIN.maxBid}</InfoTip>}
        value={bid.status === 'none' ? 'Ingen løsning' : bid.price !== null ? floorK(bid.price) : NO_BASIS}
        emphasis={bid.status === 'none' ? 'negative' : bid.status ? null : 'unknown'}
        sub={
          bid.status === 'none'
            ? 'Ingen gjennomførbar pris innen søkeområdet'
            : rec && bid.limitedBy
              ? `Begrenset av ${MAX_BID_LIMIT_LABEL[bid.limitedBy].toLowerCase()}${rec.limits.length > 1 ? ` · ${rec.limits.map((l) => `${l.id === 'profit' ? 'fortjenestemål' : 'timekrav'} ${l.result.price === null ? 'ingen pris' : floorK(l.result.price)}`).join(' · ')}` : ''} · ${b && bid.price !== null ? formatNOKSigned(bid.price - b.P) + ' mot din kjøpspris' : ''}`
              : ctx.draft.profitTarget === null
                ? 'Fortjenestemål er ikke satt'
                : 'Kalkylen er ufullstendig'
        }
      />
      <Stat
        label={
          <>
            <Hammer className="size-3.5" aria-hidden /> Oppussingsramme
          </>
        }
        info={<InfoTip label="Oppussing inkl. reserve">{EXPLAIN.renovation}</InfoTip>}
        value={b ? formatNOK(b.RB) : result.renovation.total !== null ? formatNOK(result.renovation.total) : NO_BASIS}
        emphasis={b || result.renovation.total !== null ? null : 'unknown'}
        sub={b ? `${formatNOK(b.R)} + ${formatNOK(b.reserve)} reserve${b.equityGap !== null && b.equityGap > 0 ? ` · finansieringsgap ${formatNOK(b.equityGap)}` : ''}` : result.renovation.unknownItems.length ? 'Kostnad mangler for minst ett tiltak' : undefined}
      />
      <Stat
        label={
          <>
            <ShieldAlert className="size-3.5" aria-hidden /> Risiko
          </>
        }
        info={<InfoTip label="Samlet risiko">{EXPLAIN.risk}</InfoTip>}
        value={risk.score === null ? 'Uavklart' : `${risk.score}/10`}
        emphasis={risk.score === null ? 'unknown' : risk.band === 'hoy' ? 'negative' : null}
        sub={`${RISK_BAND_LABEL[risk.band]}${risk.unknownCount ? ` · ${risk.unknownCount} med ukjent alvorlighet` : ''}`}
      />
      <Stat
        label={
          <>
            <ShieldCheck className="size-3.5" aria-hidden /> Datakvalitet
          </>
        }
        info={<InfoTip label="Datadekning">{EXPLAIN.quality}</InfoTip>}
        value={`${Math.round(quality.coverage * 100)} %`}
        sub={`${QUALITY_LABEL[quality.grade]} dekning · ${quality.missingChecks.length} punkter mangler`}
      />
    </div>
  );
}

export function BasisNote({ basis }: { basis: ScenarioValues['saleBasis'] }) {
  return (
    <span className="inline-flex items-center gap-1 text-xs text-slate-600">
      Prisgrunnlag: {PRICE_BASIS_LABEL[basis]}
      <InfoTip label="Prisgrunnlag">{EXPLAIN.basis}</InfoTip>
    </span>
  );
}

export function Panel({ title, children, action, sub }: { title: ReactNode; children: ReactNode; action?: ReactNode; sub?: ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-base font-semibold">{title}</h3>
          {sub && <p className="mt-0.5 text-sm text-slate-600">{sub}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
