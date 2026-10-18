import { Columns3, X } from 'lucide-react';
import { useMemo, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useLiveQuery, useNow } from '../app/hooks';
import { useServices } from '../app/services';
import { useSession } from '../app/session';
import { evaluateScenario } from '../calc/scenario';
import { QualityBadge, RecommendationBadge, RiskBadge } from '../components/property/badges';
import { buildRow, isArchiveRow, type PropertyRow } from '../components/property/rowModel';
import { Select } from '../components/ui/forms';
import { Badge, Card, EmptyState, PageLoading } from '../components/ui/primitives';
import { NEW_ACCOUNT_DEFAULTS } from '../config/defaults';
import { PRICE_BASIS_SHORT, PROPERTY_TYPE_LABEL, TENURE_LABEL } from '../domain/enums';
import { formatArea, formatDateTime, formatHours, formatMonths, formatNOK, formatPct, NO_BASIS, roundBidDown } from '../lib/format';

interface Metric {
  label: string;
  hint?: string;
  value: (r: PropertyRow, ev: ReturnType<typeof evaluateScenario> | null) => number | null;
  render?: (r: PropertyRow, ev: ReturnType<typeof evaluateScenario> | null) => ReactNode;
  format?: (v: number | null) => string;
  better?: 'high' | 'low';
}

const METRICS: Metric[] = [
  { label: 'Prisantydning (kontant)', value: (r) => r.askingCash },
  { label: 'Fellesgjeld', value: (r) => r.sharedDebt },
  { label: 'Min kjøpspris', value: (r) => r.purchase },
  { label: 'Oppussing inkl. reserve', value: (r) => r.renovationWithReserve },
  {
    label: 'Forventet salgspris',
    value: (r) => r.saleBase,
    render: (r) => (
      <>
        {formatNOK(r.saleBase, NO_BASIS)}
        {r.saleBasis && <span className="block text-[11px] text-slate-500">{PRICE_BASIS_SHORT[r.saleBasis]}</span>}
      </>
    ),
  },
  { label: 'Kontantsalg', value: (_r, ev) => ev?.evaluation.base?.S ?? null },
  { label: 'Samlede kontantkostnader', value: (_r, ev) => ev?.evaluation.base?.C ?? null },
  { label: 'Fortjeneste før skatt', hint: 'Normalt scenario', value: (r) => r.profit, better: 'high' },
  { label: 'Fortjeneste ved lavt salg', value: (_r, ev) => ev?.evaluation.cases.low?.profit ?? null, better: 'high' },
  {
    label: 'Fortjeneste per egeninnsatstime',
    hint: 'Egen tid er ikke en kostnad. Mot ditt minimumskrav.',
    value: (r) => r.profitPerOwnHour,
    format: (v) => (v === null ? 'Ingen egne timer' : `${formatNOK(v)}/t`),
    render: (r) =>
      r.profitPerOwnHour === null ? (
        'Ingen egne timer'
      ) : (
        <>
          {formatNOK(r.profitPerOwnHour)}/t
          {r.meetsHourlyRequirement !== null && <span className={`block text-[11px] ${r.meetsHourlyRequirement ? 'text-pine-800' : 'text-amber-800'}`}>{r.meetsHourlyRequirement ? 'Oppfyller timekravet' : 'Under timekravet'}</span>}
        </>
      ),
    better: 'high',
  },
  { label: 'Prosjektavkastning', value: (r) => r.projectReturn, format: (v) => formatPct(v, NO_BASIS), better: 'high' },
  {
    label: 'Modellert maksbud',
    value: (r) => r.maxBid,
    hint: 'Avrundet ned til hele tusen',
    render: (r) => (r.maxBidStatus === 'none' ? 'Ingen gjennomførbar pris' : formatNOK(roundBidDown(r.maxBid), NO_BASIS)),
  },
  { label: 'Maksbud minus kjøpspris', hint: 'Positivt = rom under maksbudet', value: (r) => (r.maxBid !== null && r.purchase !== null ? r.maxBid - r.purchase : null), better: 'high' },
  { label: 'Nullpunkt for salg', value: (_r, ev) => ev?.evaluation.breakEven?.salePrice ?? null },
  { label: 'Stresstest kombinert', hint: 'Salg −10 %, oppussing +100 000, +3 mnd', value: (_r, ev) => ev?.evaluation.stress.find((s) => s.id === 'combined')?.result.profit ?? null, better: 'high' },
  { label: 'Egenkapitalbehov', value: (r) => r.equityNeed, better: 'low' },
  {
    label: 'Finansieringsgap',
    hint: 'Egenkapitalbehov minus tilgjengelig egenkapital',
    value: (r) => r.equityGap,
    render: (r) => (r.equityGap === null ? 'Ikke avklart' : r.equityGap > 0 ? formatNOK(r.equityGap) : 'Ingen'),
    better: 'low',
  },
  { label: 'Prosjekttid', value: (r) => r.months, format: (v) => formatMonths(v) },
  { label: 'Egne timer', value: (r) => r.ownHours, format: (v) => formatHours(v) },
  { label: 'Risiko', value: (r) => r.riskScore, render: (r) => <RiskBadge score={r.riskScore} band={r.riskBand} unknown={r.riskUnknown} />, better: 'low' },
  { label: 'Datakvalitet', value: (r) => r.qualityCoverage, render: (r) => <QualityBadge grade={r.quality} coverage={r.qualityCoverage} />, better: 'high' },
  { label: 'Neste visning', value: () => null, render: (r) => (r.nextViewing ? formatDateTime(r.nextViewing) : 'Ingen kjent') },
  { label: 'Forventet buddag', value: () => null, render: (r) => (r.bidDay ? `${formatDateTime(r.bidDay)}${r.bidDayIsOverride ? ' (privat)' : ' (prognose)'}` : 'Ingen prognose') },
];

export function ComparePage() {
  const services = useServices();
  const { profile } = useSession();
  const now = useNow();
  const [params, setParams] = useSearchParams();
  const items = useLiveQuery(() => services.properties.listMine(), []);
  const rows = useMemo(() => (items.data ?? []).map((i) => buildRow(i, profile?.defaults ?? NEW_ACCOUNT_DEFAULTS, now)).filter((r) => !isArchiveRow(r)), [items.data, profile, now]);
  const ids = (params.get('ids') ?? '').split(',').filter(Boolean).slice(0, 3);
  const chosen = ids.map((id) => rows.find((r) => r.id === id)).filter((r): r is PropertyRow => Boolean(r));
  const evals = useMemo(() => chosen.map((r) => (r.values ? evaluateScenario(r.values) : null)), [chosen]);
  const setIds = (next: string[]) =>
    setParams((p) => {
      if (next.length) p.set('ids', next.join(','));
      else p.delete('ids');
      return p;
    });

  if (items.loading && !items.data) return <PageLoading />;
  const available = rows.filter((r) => !ids.includes(r.id));

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Sammenligning</h1>
        <p className="text-sm text-slate-600">Inntil tre objekter med de samme nøkkeltallene, beregnet fra primært scenario med samme motor som objektsiden.</p>
      </div>
      <Card className="flex flex-wrap items-end gap-3 p-4">
        {chosen.map((r) => (
          <span key={r.id} className="inline-flex items-center gap-1 rounded-full border border-pine-200 bg-pine-50 py-1 pr-1 pl-3 text-sm font-medium text-pine-900">
            {r.address}
            <button type="button" className="rounded-full p-1 hover:bg-pine-100" aria-label={`Fjern ${r.address} fra sammenligningen`} onClick={() => setIds(ids.filter((x) => x !== r.id))}>
              <X className="size-3.5" aria-hidden />
            </button>
          </span>
        ))}
        {chosen.length < 3 && (
          <div className="min-w-[16rem]">
            <label htmlFor="add-compare" className="mb-1 block text-xs font-medium text-slate-700">
              Legg til objekt ({chosen.length}/3)
            </label>
            <Select id="add-compare" value="" onChange={(e) => e.target.value && setIds([...ids, e.target.value])}>
              <option value="">Velg objekt …</option>
              {available.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.address} – {r.district}
                </option>
              ))}
            </Select>
          </div>
        )}
      </Card>

      {chosen.length === 0 ? (
        <EmptyState icon={<Columns3 className="size-10" aria-hidden />} title="Velg objekter å sammenligne">
          Velg inntil tre aktive objekter fra listen din.
        </EmptyState>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="num w-full min-w-[40rem] text-sm">
            <caption className="sr-only">Sammenligning av nøkkeltall</caption>
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left">
                <th scope="col" className="sticky left-0 z-10 bg-slate-50 px-3 py-3 text-xs font-medium text-slate-600">
                  Nøkkeltall
                </th>
                {chosen.map((r) => (
                  <th key={r.id} scope="col" className="min-w-[13rem] px-3 py-3 align-top">
                    <Link to={`/objekter/${r.id}`} className="font-semibold text-ink hover:underline">
                      {r.address}
                    </Link>
                    <p className="text-xs font-normal text-slate-600">
                      {[r.district, PROPERTY_TYPE_LABEL[r.propertyType], TENURE_LABEL[r.tenure], formatArea(r.areaBRAi)].filter(Boolean).join(' · ')}
                    </p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      <RecommendationBadge value={r.recommendation} />
                      {r.scenarioSource === 'mitt_scenario' && <Badge tone="violet">Mitt scenario</Badge>}
                    </div>
                    <p className="mt-1 text-[11px] font-normal text-slate-500">Scenario: {r.scenarioName ?? 'grunnanalyse'}</p>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {METRICS.map((m) => {
                const vals = chosen.map((r, i) => m.value(r, evals[i]));
                const known = vals.filter((v): v is number => v !== null);
                const best = m.better && known.length > 1 ? (m.better === 'high' ? Math.max(...known) : Math.min(...known)) : null;
                return (
                  <tr key={m.label}>
                    <th scope="row" className="sticky left-0 z-10 bg-white px-3 py-2 text-left font-normal text-slate-700">
                      {m.label}
                      {m.hint && <span className="block text-[11px] text-slate-500">{m.hint}</span>}
                    </th>
                    {chosen.map((r, i) => {
                      const v = vals[i];
                      const isBest = best !== null && v === best;
                      return (
                        <td key={r.id} className={`px-3 py-2 ${isBest ? 'font-semibold' : ''}`}>
                          {m.render ? m.render(r, evals[i]) : m.format ? m.format(v) : <span className={v !== null && v < 0 ? 'text-red-800' : undefined}>{formatNOK(v, NO_BASIS)}</span>}
                          {isBest && (
                            <span className="ml-1.5 rounded bg-pine-50 px-1 text-[10px] font-medium text-pine-900 ring-1 ring-pine-200">{m.better === 'high' ? 'Høyest' : 'Lavest'}</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-slate-600">Fortjenester summeres ikke på tvers av objekter. «Høyest/Lavest» markerer bare tallverdien – ikke en samlet anbefaling.</p>
    </div>
  );
}
