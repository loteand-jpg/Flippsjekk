import { useMemo } from 'react';
import { CALC_MODEL_LABEL, CASE_LABEL, MAX_BID_LIMIT_LABEL, recommendedBidOf, sensitivity, SOLVER_TOLERANCE_KR, type Breakdown } from '../../calc/engine';
import { saleValuesAfterDebtChange, VALUE_ORIGIN_LABEL } from '../../calc/scenario';
import {
  BUYER_TYPE_LABEL,
  DUTY_BASIS_LABEL,
  DUTY_BASES,
  LABOR_CATEGORIES,
  LABOR_CATEGORY_LABEL,
  PRICE_BASIS_LABEL,
  isRegulatedLabor,
  WORK_MODE_LABEL,
  WORK_MODES,
  type DutyBasis,
  type WorkMode,
} from '../../domain/enums';
import type { ScenarioValues } from '../../domain/schemas';
import { formatHours, formatMonths, formatNOK, formatNOKSigned, formatPct, formatPctPoints, NO_BASIS, UNKNOWN } from '../../lib/format';
import { Field, ScenarioNumberField, Segmented, Select, Switch } from '../ui/forms';
import { InfoTip } from '../ui/overlay';
import { Alert } from '../ui/primitives';
import { BarList, SensitivityChart } from './charts';
import { ScenarioPanel } from './ScenarioPanel';
import { ScenarioRankingPanel } from './ScenarioRankingPanel';
import { BasisNote, EXPLAIN, Panel, type PropertyContext } from './shared';

type NumKey = { [K in keyof ScenarioValues]: ScenarioValues[K] extends number | null ? K : never }[keyof ScenarioValues];

function useField(ctx: PropertyContext) {
  return (key: NumKey) => ({
    value: ctx.draft[key] as number | null,
    // Fellesgjeld ved salg: salgsverdier avledet av en totalverdi følger med (se saleValuesAfterDebtChange), så totalverdien beholdes.
    onChange: (v: number | null) =>
      ctx.setDraft((d) =>
        key === 'debtAtSale'
          ? { ...d, ...saleValuesAfterDebtChange({ draft: d, nextDebt: v, baseSale: ctx.base ? { basis: ctx.base.values.saleBasis, low: ctx.base.values.saleLow, base: ctx.base.values.saleBase, high: ctx.base.values.saleHigh, debtBasis: ctx.base.saleResolution.sale.debtBasis } : null }) }
          : { ...d, [key]: v },
      ),
    baseValue: ctx.base ? (ctx.base.values[key] as number | null) : undefined,
    origin: ctx.base?.origins[key] ? VALUE_ORIGIN_LABEL[ctx.base.origins[key]!] : undefined,
    disabled: !ctx.editable,
    error: ctx.result.evaluation.errors.find((e) => e.field === fieldAlias[key])?.message ?? null,
  });
}

const fieldAlias: Partial<Record<NumKey, string>> = {
  purchasePrice: 'purchasePrice',
  debtAtPurchase: 'debtAtPurchase',
  debtAtSale: 'debtAtSale',
  dutyPct: 'dutyRate',
  dutyCustomBase: 'dutyCustomBase',
  buyFees: 'buyFees',
  reservePct: 'reserveRate',
  months: 'months',
  monthlyCost: 'monthlyCost',
  interestPct: 'interestRate',
  purchaseFinancingPct: 'purchaseFinancingShare',
  renovationFinancingPct: 'renovationFinancingShare',
  availableEquity: 'availableEquity',
  minProfitPerOwnHour: 'minProfitPerOwnHour',
  saleLow: 'saleLow',
  saleBase: 'saleBase',
  saleHigh: 'saleHigh',
  saleFixedCost: 'saleFixedCost',
  saleCommissionPct: 'saleCommissionRate',
  taxPct: 'taxRate',
};

const money = (v: number | null) => formatNOK(v);
const pct = (v: number | null) => formatPctPoints(v);

function Inputs({ ctx }: { ctx: PropertyContext }) {
  const f = useField(ctx);
  const d = ctx.draft;
  const asking = ctx.item.snapshot?.askingPrice ?? ctx.base?.values.purchasePrice ?? d.purchasePrice ?? 0;
  const sliderFor = (center: number | null, spread = 0.3, step = 10_000) =>
    center ? { min: Math.round((center * (1 - spread)) / step) * step, max: Math.round((center * (1 + spread)) / step) * step, step } : undefined;
  const rule = ctx.analysis.estimates.dutyRule;
  const b = ctx.result.evaluation.base;
  return (
    <div className="space-y-4">
      <Panel title="Kjøp">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <ScenarioNumberField label="Kjøpspris (kontant)" unit="kr" formatBase={money} slider={sliderFor(asking, 0.25)} {...f('purchasePrice')} hint="Uten fellesgjeld og kjøpskostnader." />
          <ScenarioNumberField label="Fellesgjeld ved kjøp" unit="kr" formatBase={money} {...f('debtAtPurchase')} hint="Legges ikke til kontantkjøpet. Inngår i kapitalgrunnlaget." />
          <Field label="Grunnlag for dokumentavgift" hint={rule.note}>
            {(p) => (
              <Select {...p} value={d.dutyBasis} disabled={!ctx.editable} onChange={(e) => ctx.setDraft((x) => ({ ...x, dutyBasis: e.target.value as DutyBasis }))}>
                {DUTY_BASES.map((k) => (
                  <option key={k} value={k}>
                    {DUTY_BASIS_LABEL[k]}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          {d.dutyBasis !== 'ingen' && (
            <ScenarioNumberField label="Dokumentavgift" unit="%" decimals={2} formatBase={pct} {...f('dutyPct')} hint={b ? `Grunnlag ${formatNOK(b.dutyBase)} → avgift ${formatNOK(b.duty)}` : undefined} />
          )}
          {d.dutyBasis === 'egendefinert' && <ScenarioNumberField label="Eget avgiftsgrunnlag" unit="kr" formatBase={money} {...f('dutyCustomBase')} hint="Følger ikke kjøpsprisen automatisk." />}
          <ScenarioNumberField label="Øvrige kjøpsgebyrer" unit="kr" formatBase={money} {...f('buyFees')} hint="Tinglysing, attester o.l." />
          <div className="sm:col-span-2">
            <p className="mb-1 text-sm font-medium text-slate-800">Kjøpertype</p>
            <Segmented
              label="Kjøpertype"
              value={d.buyerType}
              disabled={!ctx.editable}
              onChange={(v) => ctx.setDraft((x) => ({ ...x, buyerType: v }))}
              options={[
                { value: 'privat', label: BUYER_TYPE_LABEL.privat },
                { value: 'as', label: BUYER_TYPE_LABEL.as },
              ]}
            />
            <p className="mt-1 text-xs text-slate-600">
              Kjøpertype er hvem som kjøper – ikke boligens eierform. Å bytte kjøpertype gjør ikke skattebehandlingen avklart, og mva. trekkes ikke automatisk fra for AS.
            </p>
          </div>
        </div>
      </Panel>

      <Panel title="Salg etter oppussing" action={<BasisNote basis={d.saleBasis} />}>
        <div className="mb-4">
          <Segmented
            label="Prisgrunnlag for salgspris"
            value={d.saleBasis}
            disabled={!ctx.editable}
            onChange={(v) => ctx.setDraft((x) => ({ ...x, saleBasis: v }))}
            options={[
              { value: 'kontant', label: 'Kontantpris' },
              { value: 'total', label: 'Totalpris inkl. fellesgjeld' },
            ]}
          />
          <p className="mt-1 text-xs text-slate-600">{PRICE_BASIS_LABEL[d.saleBasis]}. Bytte av grunnlag regner ikke om beløpene – kontroller dem.</p>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <ScenarioNumberField label="Lav" unit="kr" formatBase={money} {...f('saleLow')} />
          <ScenarioNumberField label="Normal" unit="kr" formatBase={money} slider={sliderFor(ctx.base?.values.saleBase ?? d.saleBase, 0.2)} {...f('saleBase')} />
          <ScenarioNumberField label="Høy" unit="kr" formatBase={money} {...f('saleHigh')} />
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <ScenarioNumberField
            label="Fellesgjeld ved salg"
            unit="kr"
            formatBase={money}
            {...f('debtAtSale')}
            hint={d.saleBasis === 'total' ? 'Trekkes fra totalprisen én gang. Avdrag som allerede inngår i månedlige kostnader skal ikke trekkes på nytt.' : 'Påvirker ikke kalkylen når salgsprisen er kontantpris.'}
          />
          <ScenarioNumberField label="Faste salgskostnader" unit="kr" formatBase={money} {...f('saleFixedCost')} hint="Markedsføring, takst, styling, oppgjør." />
          <ScenarioNumberField label="Meglerprovisjon" unit="%" decimals={2} formatBase={pct} {...f('saleCommissionPct')} hint="Av kontantsalget." />
        </div>
      </Panel>

      <Panel title="Prosjekt og finansiering" sub="Forutsetninger – ikke finansieringstilbud. Kjøpslån og oppussingslån er adskilt.">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <ScenarioNumberField
            label="Oppussingstid"
            unit="mnd"
            decimals={1}
            formatBase={(v) => formatMonths(v)}
            value={d.months === null ? null : Math.max(0, d.months - (d.settlementMonths ?? 0))}
            onChange={(v) => ctx.setDraft((x) => ({ ...x, months: v === null ? null : v + (x.settlementMonths ?? 0) }))}
            baseValue={ctx.base?.values.months == null ? undefined : Math.max(0, ctx.base.values.months - (ctx.base.values.settlementMonths ?? 0))}
            origin={ctx.base?.origins.months ? VALUE_ORIGIN_LABEL[ctx.base.origins.months] : undefined}
            disabled={!ctx.editable}
            error={ctx.result.evaluation.errors.find((e) => e.field === 'months')?.message ?? null}
            hint="Selve oppussingen, uten tiden til økonomisk oppgjør."
          />
          <ScenarioNumberField
            label="Tid fra ferdig oppussing til økonomisk oppgjør"
            unit="mnd"
            decimals={1}
            formatBase={(v) => formatMonths(v)}
            value={d.settlementMonths}
            onChange={(v) => ctx.setDraft((x) => ({ ...x, months: x.months === null ? null : x.months - (x.settlementMonths ?? 0) + (v ?? 0), settlementMonths: v }))}
            baseValue={ctx.base?.values.settlementMonths}
            origin={ctx.base?.origins.settlementMonths ? VALUE_ORIGIN_LABEL[ctx.base.origins.settlementMonths] : undefined}
            disabled={!ctx.editable}
            hint={`Total prosjektvarighet: ${formatMonths(d.months)}. Typisk 3–4 måneder.`}
          />
          <ScenarioNumberField
            label="Månedlige kostnader"
            unit="kr"
            formatBase={money}
            {...f('monthlyCost')}
            hint="Hele felleskostnaden (også renter/avdrag på fellesgjeld), strøm, forsikring og kommunale avgifter."
          />
          <ScenarioNumberField label="Rente" unit="%" decimals={2} formatBase={pct} slider={{ min: 0, max: 15, step: 0.05 }} {...f('interestPct')} />
          <ScenarioNumberField label="Låneandel kjøpesum" unit="%" decimals={0} formatBase={pct} slider={{ min: 0, max: 100, step: 5 }} {...f('purchaseFinancingPct')} hint="Andel av kjøpesummen som lånefinansieres. Kjøpskostnader (avgift, gebyrer) dekkes av egenkapital." />
          <ScenarioNumberField label="Låneandel oppussing" unit="%" decimals={0} formatBase={pct} slider={{ min: 0, max: 100, step: 5 }} {...f('renovationFinancingPct')} hint="Trekkes gradvis – renter beregnes på snitt halvveis uttrekk." />
          <div>
            <p className="mb-1 text-sm font-medium text-slate-800">Lånefinansiere øvrige løpende utgifter</p>
            <Segmented
              label="Lånefinansiere øvrige løpende utgifter"
              value={d.financeRunningCosts ? 'ja' : 'nei'}
              disabled={!ctx.editable}
              onChange={(v) => ctx.setDraft((x) => ({ ...x, financeRunningCosts: v === 'ja' }))}
              options={[
                { value: 'nei', label: 'Nei' },
                { value: 'ja', label: 'Ja' },
              ]}
            />
            <p className="mt-1 text-xs text-slate-600">Nei: drift og renter dekkes av egenkapital. Ja: de lånefinansieres (forenklet halvveis uttrekk, ingen rente på rente).</p>
          </div>
          <ScenarioNumberField label="Tilgjengelig egenkapital" unit="kr" formatBase={money} {...f('availableEquity')} hint="Sammenlignes med egenkapitalbehovet (finansieringsgap)." />
          <ScenarioNumberField label="Oppussingsreserve" unit="%" decimals={0} formatBase={pct} slider={{ min: 0, max: 60, step: 1 }} {...f('reservePct')} />
          <ScenarioNumberField label="Fortjenestemål" unit="kr" formatBase={money} {...f('profitTarget')} hint="Brukes for modellert maksbud." />
        </div>
      </Panel>

      <Panel title="Egeninnsats" sub="Egen tid er ikke en kostnad. Du setter i stedet et krav til fortjeneste per egeninnsatstime.">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {d.renovationMode === 'tiltak' ? (
            <div>
              <p className="mb-1 text-sm font-medium text-slate-800">Egne timer</p>
              <p className="num rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">{formatHours(ctx.result.renovation.hours)}</p>
              <p className="mt-1 text-xs text-slate-600">Summert fra tiltakene etter arbeidsmodus. Endres under «Oppussing».</p>
            </div>
          ) : (
            <ScenarioNumberField label="Egne timer" unit="t" formatBase={(v) => formatHours(v)} {...f('lumpSumHours')} />
          )}
          <ScenarioNumberField label="Egeninnsats per uke (samlet team)" unit="t/uke" formatBase={(v) => formatHours(v)} {...f('weeklyOwnHours')} />
          <ScenarioNumberField label="Minimum fortjeneste per egeninnsatstime" unit="kr/t" formatBase={money} {...f('minProfitPerOwnHour')} hint="Lønnsomhetskrav – ikke en kostnad i kalkylen." />
          <div className="space-y-2">
            <Switch checked={d.maxOwnWork} disabled={!ctx.editable} onChange={(v) => ctx.setDraft((x) => ({ ...x, maxOwnWork: v }))} label="Maks egeninnsats" />
            <p className="text-xs text-slate-600">
              Rør, elektro og bad/våtrom regnes som innleid til relevant kompetanse/ansvar er bekreftet for det aktuelle arbeidsområdet (se tabellen under). Kompetanse alene betyr ikke at arbeidet lovlig kan gjøres på alle objekter. Maks egeninnsats oppgraderer aldri regulert arbeid.
            </p>
          </div>
        </div>
        <details className="mt-4 rounded-lg border border-slate-200 p-3">
          <summary className="cursor-pointer text-sm font-medium">Hvem utfører arbeidet? (per kategori)</summary>
          <table className="mt-2 w-full text-sm">
            <caption className="sr-only">Hvem som utfører hvilket arbeid i dette scenarioet</caption>
            <tbody className="divide-y divide-slate-100">
              {LABOR_CATEGORIES.map((c) => {
                const baseMode = ctx.base?.values.laborModes?.[c];
                const changed = baseMode !== undefined && baseMode !== d.laborModes[c];
                return (
                  <tr key={c}>
                    <th scope="row" className="py-1.5 pr-3 text-left font-normal">
                      {LABOR_CATEGORY_LABEL[c]}
                      {isRegulatedLabor(c) && <span className="ml-2 text-[11px] text-amber-800">regulert</span>}
                      {changed && <span className="block text-[11px] font-medium text-violet-800">Endret av deg · grunnverdi {WORK_MODE_LABEL[baseMode!]}</span>}
                    </th>
                    <td className="py-1.5">
                      <Select
                        aria-label={`Hvem utfører ${LABOR_CATEGORY_LABEL[c].toLowerCase()}`}
                        className="max-w-40"
                        value={d.laborModes[c]}
                        disabled={!ctx.editable}
                        onChange={(e) => ctx.setDraft((x) => ({ ...x, laborModes: { ...x.laborModes, [c]: e.target.value as WorkMode } }))}
                      >
                        {WORK_MODES.map((m) => (
                          <option key={m} value={m}>
                            {WORK_MODE_LABEL[m]}
                          </option>
                        ))}
                      </Select>
                    </td>
                    <td className="py-1.5 pr-3">
                      {isRegulatedLabor(c) ? (
                        <Switch
                          checked={d.regulatedCompetence[c]}
                          disabled={!ctx.editable}
                          onChange={(v) => ctx.setDraft((x) => ({ ...x, regulatedCompetence: { ...x.regulatedCompetence, [c]: v } }))}
                          label={<span className="text-xs">Relevant kompetanse/ansvar bekreftet for {LABOR_CATEGORY_LABEL[c].toLowerCase()}</span>}
                        />
                      ) : null}
                      {isRegulatedLabor(c) && ctx.base && ctx.base.values.regulatedCompetence?.[c] !== d.regulatedCompetence[c] && (
                        <span className="block text-[11px] font-medium text-violet-800">Endret av deg</span>
                      )}
                    </td>
                    <td className="w-24 py-1.5 text-right">
                      {changed && ctx.editable && (
                        <button type="button" className="text-xs text-pine-800 hover:underline" onClick={() => ctx.setDraft((x) => ({ ...x, laborModes: { ...x.laborModes, [c]: baseMode! } }))}>
                          Tilbakestill
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </details>
      </Panel>

      <Panel title="Skatt" sub="Uavklart som standard og vist utenfor hovedresultatet.">
        <Segmented
          label="Skatteforutsetning"
          value={d.taxMode}
          disabled={!ctx.editable}
          onChange={(v) => ctx.setDraft((x) => ({ ...x, taxMode: v }))}
          options={[
            { value: 'uavklart', label: 'Uavklart' },
            { value: 'antatt', label: 'Egen forutsetning' },
          ]}
        />
        {d.taxMode === 'antatt' && (
          <div className="mt-3 max-w-xs">
            <ScenarioNumberField label="Antatt skattesats" unit="%" decimals={1} formatBase={pct} {...f('taxPct')} hint="Din egen forutsetning. Ikke skatteråd." />
          </div>
        )}
      </Panel>

      <Panel title="Min budplan" sub="Private tall som ikke påvirker kalkylen.">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <ScenarioNumberField label="Mitt startbud" unit="kr" formatBase={money} {...f('startBid')} />
          <ScenarioNumberField label="Min smertegrense" unit="kr" formatBase={money} {...f('walkAway')} hint="Høyeste bud du vil gi, uansett hva modellen sier." />
        </div>
      </Panel>
    </div>
  );
}

function Line({ label, value, strong, sub, indent }: { label: string; value: string; strong?: boolean; sub?: string; indent?: boolean }) {
  return (
    <tr className={strong ? 'font-semibold' : undefined}>
      <th scope="row" className={`py-1.5 pr-3 text-left font-normal ${indent ? 'pl-4 text-slate-600' : ''} ${strong ? 'font-semibold text-ink' : ''}`}>
        {label}
        {sub && <span className="block text-[11px] font-normal text-slate-500">{sub}</span>}
      </th>
      <td className="num py-1.5 text-right">{value}</td>
    </tr>
  );
}

export function BreakdownTable({ b }: { b: Breakdown }) {
  const pctTxt = (x: number) => `${(x * 100).toLocaleString('nb-NO', { maximumFractionDigits: 2 })} %`;
  return (
    <table className="w-full text-sm">
      <tbody className="divide-y divide-slate-100">
        <Line label="Kontant kjøpspris (P)" value={formatNOK(b.P)} />
        <Line label="Dokumentavgift" indent sub={`Grunnlag ${formatNOK(b.dutyBase)}`} value={formatNOK(b.duty)} />
        <Line label="Øvrige kjøpsgebyrer" indent value={formatNOK(b.F)} />
        <Line label="Kjøpskostnader (K)" value={formatNOK(b.K)} />
        <Line label="Oppussing (R)" indent value={formatNOK(b.R)} />
        <Line label="Reserve" indent value={formatNOK(b.reserve)} />
        <Line label="Oppussing med reserve (RB)" value={formatNOK(b.RB)} />
        <Line label="Renter prosjektlån (I)" sub="r × m/12 × (kjøpslån + oppussingslån/2) – oppussingslånet trekkes i snitt halvveis" value={formatNOK(b.I)} />
        <Line label="Månedlige kostnader (O)" sub={`${formatMonths(b.months)}`} value={formatNOK(b.O)} />
        <Line label={`Salgspris (${b.basis === 'total' ? 'totalpris' : 'kontantpris'})`} value={formatNOK(b.V)} />
        {b.basis === 'total' && <Line label="− Fellesgjeld ved salg (én gang)" indent value={formatNOK(b.D1 === null ? null : -b.D1)} />}
        <Line label="Kontantsalg (S)" value={formatNOK(b.S)} />
        <Line label="Salgskostnader" sub="Fast + provisjon av kontantsalget" value={formatNOK(b.Csale)} />
        <Line label="Samlede kontantkostnader (C)" value={formatNOK(b.C)} />
        <Line label="Resultat før skatt og eget arbeid (S − C)" strong value={formatNOK(b.profit)} />
        <Line label="Kapitalgrunnlag (C + fellesgjeld ved kjøp)" value={formatNOK(b.capitalBase)} />
        <Line label="Prosjektavkastning" sub="Ikke egenkapitalavkastning" value={b.projectReturn === null ? NO_BASIS : pctTxt(b.projectReturn)} />
        <Line label="Kjøpslån" indent value={formatNOK(b.purchaseLoan)} />
        <Line label="Oppussingslån" indent value={formatNOK(b.renovationLoan)} />
        {b.runningLoan > 0 && <Line label="Lånefinansierte løpende kostnader" indent value={formatNOK(b.runningLoan)} />}
        <Line label="Høyeste prosjektlån" value={formatNOK(b.loanPeak)} />
        <Line label="Egenkapitalbehov" sub="Ufinansiert del av kjøp og oppussing + ikke lånefinansierte renter og drift. Salgskostnader er ikke med." value={formatNOK(b.equityNeed)} />
        <Line label="Tilgjengelig egenkapital" indent value={formatNOK(b.availableEquity, UNKNOWN)} />
        <Line label="Finansieringsgap" strong value={b.equityGap === null ? UNKNOWN : b.equityGap > 0 ? formatNOK(b.equityGap) : 'Ingen – egenkapitalen dekker behovet'} />
        <Line label="Egne timer" value={b.ownHours === null ? UNKNOWN : formatHours(b.ownHours)} />
        <Line
          label="Fortjeneste per egeninnsatstime"
          sub={b.minProfitPerOwnHour === null ? 'Minimumskrav er ikke satt' : `Minimumskrav ${formatNOK(b.minProfitPerOwnHour)}/t – ${b.meetsHourlyRequirement === null ? 'ikke vurdert' : b.meetsHourlyRequirement ? 'oppfylt' : 'ikke oppfylt'}`}
          strong
          value={b.profitPerOwnHour === null ? (b.ownHours === 0 ? 'Ingen egne timer' : UNKNOWN) : `${formatNOK(b.profitPerOwnHour)}/t`}
        />
      </tbody>
    </table>
  );
}

function HourlyAndEquity({ ctx }: { ctx: PropertyContext }) {
  const b = ctx.result.evaluation.base;
  if (!b) return null;
  const hourly =
    b.profitPerOwnHour === null ? (
      <p className="text-sm text-slate-700">{b.ownHours === 0 ? 'Ingen egne timer i dette scenarioet, så fortjeneste per time kan ikke beregnes.' : 'Egne timer er ikke avklart, så fortjeneste per time kan ikke beregnes.'}</p>
    ) : (
      <p className="text-sm">
        Fortjeneste per egeninnsatstime: <strong className="num">{formatNOK(b.profitPerOwnHour)}/t</strong>
        {b.minProfitPerOwnHour !== null ? (
          <>
            {' '}
            mot ditt krav på <span className="num">{formatNOK(b.minProfitPerOwnHour)}/t</span> –{' '}
            <strong className={b.meetsHourlyRequirement ? 'text-pine-800' : 'text-amber-900'}>{b.meetsHourlyRequirement ? 'kravet er oppfylt' : 'kravet er ikke oppfylt'}</strong>.
          </>
        ) : (
          '. Du har ikke satt et minimumskrav.'
        )}
      </p>
    );
  return (
    <Panel title="Egeninnsats og finansiering" sub="Egen tid er ikke en kostnad i kalkylen. Egenkapitalbehovet er uten salgskostnader.">
      <div className="space-y-2">
        {hourly}
        <p className="text-sm">
          Egenkapitalbehov: <strong className="num">{formatNOK(b.equityNeed)}</strong> mot tilgjengelig <span className="num">{formatNOK(b.availableEquity, UNKNOWN)}</span>
          {b.equityGap === null ? ' – tilgjengelig egenkapital er ikke avklart.' : b.equityGap > 0 ? '' : ' – egenkapitalen dekker behovet.'}
        </p>
        {b.equityGap !== null && b.equityGap > 0 && (
          <Alert tone="warning" title={`Finansieringsgap ${formatNOK(b.equityGap)}`}>
            Egenkapitalen dekker ikke behovet. Vurder lavere kjøpspris, høyere låneandel på oppussing, delt innsats eller mer egenkapital. Dette er en forutsetning – ikke et finansieringstilbud.
          </Alert>
        )}
      </div>
    </Panel>
  );
}

function Results({ ctx }: { ctx: PropertyContext }) {
  const r = ctx.result;
  const ev = r.evaluation;
  const b = ev.base;
  const bb = ctx.baseResult?.evaluation.base ?? null;
  const sens = useMemo(() => {
    if (!ev.resolved || !b) return null;
    return {
      purchase: sensitivity(ev.resolved, b.P, b.V, 'purchase'),
      sale: sensitivity(ev.resolved, b.P, b.V, 'sale'),
    };
  }, [ev.resolved, b]);

  if (ev.status !== 'complete' || !b) {
    return (
      <div className="space-y-3">
        {ev.status === 'invalid' ? (
          <Alert tone="danger" title="Kalkylen har ugyldige verdier">
            <ul className="list-disc pl-4">
              {ev.errors.map((e) => (
                <li key={e.field + e.message}>{e.message}</li>
              ))}
            </ul>
          </Alert>
        ) : (
          <Alert tone="warning" title="Kalkylen er ufullstendig – ingen fortjeneste vises">
            <p>Disse inngangsverdiene er ikke avklart. Ukjent er ikke det samme som 0 kr.</p>
            <ul className="list-disc pl-4">
              {r.missing.map((m) => (
                <li key={m.field + m.label}>{m.label}</li>
              ))}
            </ul>
          </Alert>
        )}
        {r.warnings.map((w) => (
          <Alert key={w.message} tone="warning">
            {w.message}
          </Alert>
        ))}
      </div>
    );
  }

  const compareRows: { label: string; mine: number | null; base: number | null; fmt?: (v: number | null) => string }[] = [
    { label: 'Kjøpspris', mine: b.P, base: bb?.P ?? null },
    { label: 'Oppussing med reserve', mine: b.RB, base: bb?.RB ?? null },
    { label: 'Kontantsalg', mine: b.S, base: bb?.S ?? null },
    { label: 'Samlede kostnader', mine: b.C, base: bb?.C ?? null },
    { label: 'Resultat før skatt', mine: b.profit, base: bb?.profit ?? null },
    { label: 'Maksbud', mine: recommendedBidOf(ev).price, base: ctx.baseResult ? recommendedBidOf(ctx.baseResult.evaluation).price : null },
  ];

  return (
    <div className="space-y-4">
      {r.warnings.map((w) => (
        <Alert key={w.message} tone="warning">
          {w.message}
        </Alert>
      ))}

      <HourlyAndEquity ctx={ctx} />

      <ScenarioRankingPanel ctx={ctx} />

      <Panel title="Grunnanalyse og mitt scenario">
        <table className="num w-full text-sm">
          <thead className="text-left text-xs text-slate-600">
            <tr>
              <th className="py-1 font-medium">Nøkkeltall</th>
              <th className="py-1 text-right font-medium">Grunnanalyse</th>
              <th className="py-1 text-right font-medium">Mitt scenario</th>
              <th className="py-1 text-right font-medium">Differanse</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {compareRows.map((row) => (
              <tr key={row.label}>
                <th scope="row" className="py-1.5 text-left font-normal">
                  {row.label}
                </th>
                <td className="py-1.5 text-right text-slate-600">{formatNOK(row.base, NO_BASIS)}</td>
                <td className="py-1.5 text-right font-medium">{formatNOK(row.mine, NO_BASIS)}</td>
                <td className="py-1.5 text-right">{row.base !== null && row.mine !== null ? formatNOKSigned(row.mine - row.base) : '–'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>

      <Panel title="Kalkyle, normalt scenario" sub={<BasisNote basis={b.basis} />}>
        <BreakdownTable b={b} />
      </Panel>

      <Panel title="Lavt, normalt og høyt salg" sub="Hvert scenario har egen salgskostnad.">
        <table className="num w-full text-sm">
          <thead className="text-left text-xs text-slate-600">
            <tr>
              <th className="py-1 font-medium">Scenario</th>
              <th className="py-1 text-right font-medium">Salgspris</th>
              <th className="py-1 text-right font-medium">Salgskostn.</th>
              <th className="py-1 text-right font-medium">Resultat</th>
              <th className="hidden py-1 text-right font-medium sm:table-cell">Avkastning</th>
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
                  <td className="py-1.5 text-right">{c ? formatNOK(c.Csale) : '–'}</td>
                  <td className={`py-1.5 text-right font-semibold ${c && c.profit < 0 ? 'text-red-800' : ''}`}>{c ? formatNOK(c.profit) : NO_BASIS}</td>
                  <td className="hidden py-1.5 text-right sm:table-cell">{c ? formatPct(c.projectReturn) : '–'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="mt-4">
          <BarList rows={(['low', 'base', 'high'] as const).map((k) => ({ label: `${CASE_LABEL[k]} salg`, value: ev.cases[k]?.profit ?? null }))} />
        </div>
      </Panel>

      <Panel
        title={
          <span className="inline-flex items-center gap-1">
            Modellert maksbud <InfoTip label="Maksbud">{EXPLAIN.maxBid}</InfoTip>
          </span>
        }
        sub={`Normalt scenario. Toleranse ${SOLVER_TOLERANCE_KR} kr. Ikke budfullmakt eller garanti.`}
      >
        <table className="num w-full text-sm">
          <thead className="text-left text-xs text-slate-600">
            <tr>
              <th className="py-1 font-medium">Mål</th>
              <th className="py-1 text-right font-medium">Høyeste kjøpspris</th>
              <th className="py-1 text-right font-medium">Mot din kjøpspris</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {ev.recommendedMaxBid && ev.recommendedMaxBid.limits.length > 0 && (
              <tr className="bg-pine-50/60 font-semibold" data-testid="recommended-maxbid">
                <th scope="row" className="py-1.5 text-left">
                  Anbefalt maksbud (laveste grense)
                  {ev.recommendedMaxBid.limitedBy && <span className="block text-[11px] font-normal text-slate-700">Begrenset av: {MAX_BID_LIMIT_LABEL[ev.recommendedMaxBid.limitedBy].toLowerCase()}</span>}
                </th>
                <td className="py-1.5 text-right">{ev.recommendedMaxBid.price === null ? 'Ingen gjennomførbar pris innen søkeområdet' : formatNOK(ev.recommendedMaxBid.price)}</td>
                <td className="py-1.5 text-right">{ev.recommendedMaxBid.price === null ? '–' : formatNOKSigned(ev.recommendedMaxBid.price - b.P)}</td>
              </tr>
            )}
            {ev.maxBid && (
              <tr>
                <th scope="row" className="py-1.5 text-left font-normal">
                  Grense: fortjenestemål {formatNOK(ev.maxBid.target)}
                </th>
                <td className="py-1.5 text-right">{ev.maxBid.price === null ? 'Ingen gjennomførbar pris innen søkeområdet' : formatNOK(ev.maxBid.price)}</td>
                <td className="py-1.5 text-right">{ev.maxBid.price === null ? '–' : formatNOKSigned(ev.maxBid.price - b.P)}</td>
              </tr>
            )}
            {ev.maxBidHourly && (
              <tr>
                <th scope="row" className="py-1.5 text-left font-normal">
                  Grense: minimum {formatNOK(ev.maxBidHourly.target)} per egeninnsatstime ({formatHours(b.ownHours)})
                </th>
                <td className="py-1.5 text-right">{ev.maxBidHourly.price === null ? 'Ingen gjennomførbar pris' : formatNOK(ev.maxBidHourly.price)}</td>
                <td className="py-1.5 text-right">{ev.maxBidHourly.price === null ? '–' : formatNOKSigned(ev.maxBidHourly.price - b.P)}</td>
              </tr>
            )}
            {ev.maxBidLow && (
              <tr>
                <th scope="row" className="py-1.5 text-left font-normal">
                  Ditt mål ved lavt salg
                </th>
                <td className="py-1.5 text-right">{ev.maxBidLow.price === null ? 'Ingen gjennomførbar pris' : formatNOK(ev.maxBidLow.price)}</td>
                <td className="py-1.5 text-right">{ev.maxBidLow.price === null ? '–' : formatNOKSigned(ev.maxBidLow.price - b.P)}</td>
              </tr>
            )}
            {ev.maxBidTable.map((m) => (
              <tr key={`${m.kind}-${m.target}`}>
                <th scope="row" className="py-1.5 text-left font-normal">
                  {m.kind === 'profit' ? `Resultat ${formatNOK(m.target)}` : `Prosjektavkastning ${formatPct(m.target)}`}
                </th>
                <td className="py-1.5 text-right">{m.price === null ? 'Ingen gjennomførbar pris' : formatNOK(m.price)}</td>
                <td className="py-1.5 text-right">{m.price === null ? '–' : formatNOKSigned(m.price - b.P)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2 text-xs text-slate-600">
          Grensene er regnet hver for seg og blandes ikke. Timekravet er et mål for kjøpsprisen og en faktor i scenariorangeringen – ikke en kostnad, og ikke en grense for om et scenario kan velges.
          {ev.recommendedMaxBid?.notApplicable.map((n) => ` ${n.reason}`).join('')}
        </p>
        <p className="mt-3 text-sm">
          <strong>Nullpunkt for salg:</strong>{' '}
          {ev.breakEven?.salePrice != null ? (
            <>
              {formatNOK(ev.breakEven.salePrice)} ({b.basis === 'total' ? 'totalpris inkl. fellesgjeld' : 'kontantpris'}) gir resultat 0 kr med din kjøpspris.
            </>
          ) : (
            NO_BASIS
          )}
        </p>
      </Panel>

      <Panel title="Stresstester" sub="Hver test endrer én forutsetning (eller kombinasjonen) og regner hele kalkylen på nytt.">
        <div className="overflow-x-auto">
          <table className="num w-full min-w-[32rem] text-sm">
            <thead className="text-left text-xs text-slate-600">
              <tr>
                <th className="py-1 font-medium">Test</th>
                <th className="py-1 text-right font-medium">Resultat</th>
                <th className="py-1 text-right font-medium">Endring</th>
                <th className="py-1 text-right font-medium">Avkastning</th>
                <th className="py-1 text-right font-medium">Maksbud</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {ev.stress.map((s) => (
                <tr key={s.id}>
                  <th scope="row" className="py-1.5 pr-2 text-left font-normal">
                    {s.label}
                    <span className="block text-[11px] text-slate-500">{s.detail}</span>
                  </th>
                  <td className={`py-1.5 text-right font-medium ${s.result.profit < 0 ? 'text-red-800' : ''}`}>{formatNOK(s.result.profit)}</td>
                  <td className="py-1.5 text-right">{s.noEffect ? 'Ingen effekt' : formatNOKSigned(s.deltaProfit)}</td>
                  <td className="py-1.5 text-right">{formatPct(s.result.projectReturn)}</td>
                  <td className="py-1.5 text-right">{s.maxBid ? (s.maxBid.price === null ? 'Ingen' : formatNOK(s.maxBid.price)) : '–'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      {sens && (
        <Panel title="Følsomhet" sub="Resultat før skatt når én pris endres og alt annet holdes likt.">
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            <SensitivityChart title="Resultat etter kjøpspris" xLabel="Kjøpspris" points={sens.purchase} current={b.P} target={ctx.draft.profitTarget} />
            <SensitivityChart title={`Resultat etter salgspris (${b.basis === 'total' ? 'totalpris' : 'kontant'})`} xLabel="Salgspris" points={sens.sale} current={b.V} target={ctx.draft.profitTarget} />
          </div>
        </Panel>
      )}

      <Panel title="Kostnadsfordeling" sub={`Samlede kontantkostnader ${formatNOK(b.C)}`}>
        <BarList
          total={b.C}
          rows={[
            { label: 'Kjøpspris', value: b.P },
            { label: 'Kjøpskostnader', value: b.K },
            { label: 'Oppussing inkl. reserve', value: b.RB },
            { label: 'Renter', value: b.I },
            { label: 'Månedlige kostnader', value: b.O },
            { label: 'Salgskostnader', value: b.Csale },
          ]}
        />
      </Panel>

      <Panel title="Skatt (separat illustrasjon)">
        {ev.tax?.mode === 'antatt' ? (
          <div className="space-y-1 text-sm">
            <p>
              Med din forutsetning på {formatPctPoints(ctx.draft.taxPct)}: skatt {formatNOK(ev.tax.taxAmount)}, resultat etter antatt skatt{' '}
              <strong className="num">{formatNOK(ev.tax.profitAfterTax)}</strong>.
            </p>
            <p className="text-xs text-slate-600">{ev.tax.note}</p>
          </div>
        ) : (
          <p className="text-sm text-slate-700">
            Skattebehandling er ikke avklart (kjøpertype: {BUYER_TYPE_LABEL[ctx.draft.buyerType]}). Hovedresultatet er før skatt. Legg inn en egen forutsetning for en separat illustrasjon.
          </p>
        )}
      </Panel>
      <p className="text-xs text-slate-500">Beregnet med {CALC_MODEL_LABEL}. Beløp regnes i hele øre og vises avrundet til hele kroner.</p>
    </div>
  );
}

export function CalculatorTab({ ctx }: { ctx: PropertyContext }) {
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div>
        {ctx.locked ? (
          <Alert tone="info" className="mb-4" title="Låst scenario">
            Dette er nettsidens vurdering og kan ikke redigeres. Bruk «Lagre som nytt» for å lage din egen versjon.
          </Alert>
        ) : (
          !ctx.editable && (
            <Alert tone="warning" className="mb-4" title="Lesemodus">
              Abonnementet gir ikke tilgang til å endre og lagre scenarioer nå. Lagrede verdier vises uendret.
            </Alert>
          )
        )}
        <div className="mb-4">
          <ScenarioPanel ctx={ctx} stack onCreate={ctx.createScenarioFrom ? (d) => ctx.createScenarioFrom!(d.id, d.title) : undefined} />
        </div>
        <fieldset disabled={!ctx.editable} className="min-w-0">
          <legend className="sr-only">Forutsetninger i mitt scenario</legend>
          <Inputs ctx={ctx} />
        </fieldset>
      </div>
      <div role="region" aria-label="Resultater for mitt scenario" tabIndex={0} className="lg:sticky lg:top-32 lg:max-h-[calc(100dvh-9rem)] lg:overflow-y-auto lg:pr-1">
        <Results ctx={ctx} />
      </div>
    </div>
  );
}
