import { ExternalLink, Pencil, Plus, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useLiveQuery } from '../../app/hooks';
import { useServices } from '../../app/services';
import { useSession } from '../../app/session';
import { useToast } from '../../app/toast';
import { CASE_LABEL } from '../../calc/engine';
import { MARKET_MODEL_VERSION, QUALITY_TIER_LABEL, type WeightedReference } from '../../calc/market';
import { SALE_SOURCE_LABEL } from '../../calc/saleValue';
import { findAnalysisScenario, resolveAnalysisScenarios } from '../../domain/analysisScenarios';
import { PER_M2_BASIS_LABEL, pricePerM2, soldMedians, validateComparable, type ComparableFields, type ComparableIssue } from '../../domain/comparables';
import {
  COMPARABLE_KIND_LABEL,
  COMPARABLE_KINDS,
  DATA_QUALITY_LEVELS,
  LAYOUT_MATCHES,
  LAYOUT_MATCH_LABEL,
  LOCATION_LEVELS,
  LOCATION_LEVEL_LABEL,
  PROPERTY_TYPES,
  PROPERTY_TYPE_LABEL,
  REFERENCE_ROLE_LABEL,
  STANDARD_CLASSES,
  STANDARD_CLASS_LABEL,
  TENURES,
  TENURE_LABEL,
  type ComparableKind,
  type DataQualityLevel,
  type LayoutMatch,
  type LocationLevel,
  type PropertyType,
  type StandardClass,
  type Tenure,
} from '../../domain/enums';
import type { ComparableSale, UserComparable } from '../../domain/schemas';
import { formatArea, formatDateKey, formatNOK, NO_BASIS, UNKNOWN } from '../../lib/format';
import { Field, NumberInput, Select, TextInput, Textarea } from '../ui/forms';
import { Dialog } from '../ui/overlay';
import { Alert, Badge, Button } from '../ui/primitives';
import { resolveForScenario, scenarioFor, useMarketComparables } from './useMarket';
import { scenarioFields } from './ScenarioPanel';
import { BasisNote, Panel, type PropertyContext } from './shared';

type Row = ComparableFields & { id: string; source: 'grunnlag' | 'mine'; isDemo?: boolean };

const EMPTY: ComparableFields = { name: '', url: null, kind: 'solgt', askingPrice: null, soldPrice: null, commonCosts: null, soldTotalPrice: null, area: null, date: null, notes: '' };

function fromShared(c: ComparableSale): Row {
  return { ...c, source: 'grunnlag' };
}
function fromMine(c: UserComparable): Row {
  return { ...c, source: 'mine' };
}

function ComparablesTable({ rows, onEdit, onDelete, caption }: { rows: Row[]; onEdit?: (r: Row) => void; onDelete?: (r: Row) => void; caption: string }) {
  const sorted = [...rows].sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));
  return (
    <div className="overflow-x-auto">
      <table className="num w-full min-w-[60rem] text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead className="text-left text-xs text-slate-600">
          <tr>
            <th className="py-1.5 pr-2 font-medium">Objekt</th>
            <th className="py-1.5 pr-2 font-medium">Type</th>
            <th className="py-1.5 pr-2 text-right font-medium">Prisantydning</th>
            <th className="py-1.5 pr-2 text-right font-medium">Solgt pris</th>
            <th className="py-1.5 pr-2 text-right font-medium">Felleskostn./mnd</th>
            <th className="py-1.5 pr-2 text-right font-medium">Solgt totalpris</th>
            <th className="py-1.5 pr-2 text-right font-medium">Areal</th>
            <th className="py-1.5 pr-2 text-right font-medium">kr/m²</th>
            <th className="py-1.5 pr-2 font-medium">Dato</th>
            <th className="py-1.5 font-medium">Merknad</th>
            {(onEdit || onDelete) && (
              <th className="py-1.5 pl-2">
                <span className="sr-only">Handlinger</span>
              </th>
            )}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 align-top">
          {sorted.map((c) => {
            const m2 = pricePerM2(c);
            const soldMissing = c.kind === 'solgt_uten_sum' ? 'Ikke dokumentert' : c.kind === 'prisantydning' ? '–' : UNKNOWN;
            return (
              <tr key={c.id}>
                <td className="py-2 pr-2">
                  {c.url ? (
                    <a href={c.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-pine-800 underline">
                      {c.name} <ExternalLink className="size-3" aria-hidden />
                    </a>
                  ) : (
                    c.name
                  )}
                  {c.isDemo && <span className="block text-[11px] text-violet-800">Demodata</span>}
                </td>
                <td className="py-2 pr-2">
                  <Badge tone={c.kind === 'solgt' ? 'pine' : c.kind === 'prisantydning' ? 'outline' : 'amber'}>{COMPARABLE_KIND_LABEL[c.kind]}</Badge>
                </td>
                <td className="py-2 pr-2 text-right">{formatNOK(c.askingPrice, c.kind === 'solgt' ? UNKNOWN : '–')}</td>
                <td className="py-2 pr-2 text-right">{formatNOK(c.soldPrice, soldMissing)}</td>
                <td className="py-2 pr-2 text-right">{formatNOK(c.commonCosts)}</td>
                <td className="py-2 pr-2 text-right">{formatNOK(c.soldTotalPrice, soldMissing)}</td>
                <td className="py-2 pr-2 text-right whitespace-nowrap">{formatArea(c.area)}</td>
                <td className="py-2 pr-2 text-right">
                  {m2 ? (
                    <>
                      {formatNOK(m2.value)}
                      <span className="block text-[11px] text-slate-500">{PER_M2_BASIS_LABEL[m2.basis]}</span>
                    </>
                  ) : (
                    '–'
                  )}
                </td>
                <td className="py-2 pr-2 text-xs whitespace-nowrap">{formatDateKey(c.date, '–')}</td>
                <td className="py-2 text-xs text-slate-700">{c.notes}</td>
                {(onEdit || onDelete) && (
                  <td className="py-2 pl-2 whitespace-nowrap">
                    {onEdit && (
                      <button type="button" className="rounded p-1 text-slate-600 hover:bg-slate-100" aria-label={`Rediger ${c.name}`} onClick={() => onEdit(c)}>
                        <Pencil className="size-4" aria-hidden />
                      </button>
                    )}
                    {onDelete && (
                      <button type="button" className="rounded p-1 text-slate-600 hover:bg-red-50 hover:text-red-800" aria-label={`Slett ${c.name}`} onClick={() => onDelete(c)}>
                        <Trash2 className="size-4" aria-hidden />
                      </button>
                    )}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ComparableDialog({ open, initial, onClose, onSave, busy }: { open: boolean; initial: (ComparableFields & { id?: string }) | null; onClose: () => void; onSave: (c: ComparableFields, id?: string) => void; busy: boolean }) {
  const [form, setForm] = useState<ComparableFields>(initial ?? EMPTY);
  const [submitted, setSubmitted] = useState(false);
  const [seed, setSeed] = useState<string | null>(null);
  const key = initial?.id ?? (initial ? 'ny' : null);
  if (open && seed !== key) {
    setSeed(key);
    setForm(initial ? { ...EMPTY, ...initial } : EMPTY);
    setSubmitted(false);
  }
  const issues = useMemo(() => validateComparable(form), [form]);
  const err = (f: ComparableIssue['field']) => (submitted ? issues.find((i) => i.field === f)?.message ?? null : null);
  const set = (p: Partial<ComparableFields>) => setForm((f) => ({ ...f, ...p }));
  const m2 = pricePerM2(form);
  const isSold = form.kind === 'solgt';
  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="lg"
      title={initial?.id ? 'Rediger sammenlignbart objekt' : 'Legg til sammenlignbart objekt'}
      description="Tomt felt betyr ukjent – ikke 0 kr. Dette er dine private opplysninger og deles ikke med andre."
      footer={
        <>
          <Button onClick={onClose}>Avbryt</Button>
          <Button
            variant="primary"
            loading={busy}
            onClick={() => {
              setSubmitted(true);
              if (issues.length === 0) onSave(form, initial?.id);
            }}
          >
            Lagre
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Objekt" error={err('name')} className="sm:col-span-2">
          {(p) => <TextInput {...p} autoFocus value={form.name} onChange={(e) => set({ name: e.target.value })} placeholder="Adresse eller navn" />}
        </Field>
        <Field label="Type" error={err('kind')} hint="Bare faktiske salg med dokumentert salgssum regnes som oppnådd pris.">
          {(p) => (
            <Select
              {...p}
              value={form.kind}
              onChange={(e) => {
                const kind = e.target.value as ComparableKind;
                set(kind === 'solgt' ? { kind } : { kind, soldPrice: null, soldTotalPrice: null });
              }}
            >
              {COMPARABLE_KINDS.map((k) => (
                <option key={k} value={k}>
                  {COMPARABLE_KIND_LABEL[k]}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Dato" error={err('date')} hint="Solgt- eller annonsedato.">
          {(p) => <TextInput {...p} type="date" value={form.date ?? ''} onChange={(e) => set({ date: e.target.value || null })} />}
        </Field>
        <Field label="Prisantydning" error={err('askingPrice')}>
          {(p) => <NumberInput {...p} unit="kr" value={form.askingPrice} onChange={(v) => set({ askingPrice: v })} />}
        </Field>
        <Field label="Felleskostnader per måned" error={err('commonCosts')}>
          {(p) => <NumberInput {...p} unit="kr" value={form.commonCosts} onChange={(v) => set({ commonCosts: v })} />}
        </Field>
        <Field label="Solgt pris" error={err('soldPrice')} hint="Kontantpris, uten fellesgjeld.">
          {(p) => <NumberInput {...p} unit="kr" disabled={!isSold} value={form.soldPrice} onChange={(v) => set({ soldPrice: v })} />}
        </Field>
        <Field label="Solgt totalpris" error={err('soldTotalPrice')} hint="Solgt pris inkl. fellesgjeld, uten kjøpskostnader.">
          {(p) => <NumberInput {...p} unit="kr" disabled={!isSold} value={form.soldTotalPrice} onChange={(v) => set({ soldTotalPrice: v })} />}
        </Field>
        <Field label="Areal" error={err('area')}>
          {(p) => <NumberInput {...p} unit="m²" decimals={1} value={form.area} onChange={(v) => set({ area: v })} />}
        </Field>
        <div>
          <p className="mb-1 text-sm font-medium text-slate-800">kr/m² (beregnes)</p>
          <p className="num rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm" aria-live="polite">
            {m2 ? `${formatNOK(m2.value)} (${PER_M2_BASIS_LABEL[m2.basis]})` : 'Fyll inn areal og pris'}
          </p>
        </div>
        <Field label="Merknad" className="sm:col-span-2">
          {(p) => <Textarea {...p} rows={2} value={form.notes} onChange={(e) => set({ notes: e.target.value })} placeholder="F.eks. standard, balkong, kilde" />}
        </Field>
        <Field label="Lenke (valgfritt)" className="sm:col-span-2">
          {(p) => <TextInput {...p} type="url" value={form.url ?? ''} onChange={(e) => set({ url: e.target.value || null })} placeholder="https://…" />}
        </Field>
        <details className="rounded-lg border border-slate-200 p-3 sm:col-span-2">
          <summary className="cursor-pointer text-sm font-medium">Flere egenskaper til markedsvektingen (valgfritt)</summary>
          <p className="mt-1 text-xs text-slate-600">Jo mer du fyller ut, desto bedre kan referansen vektes. Tomt felt betyr ukjent – ikke «nei» eller 0.</p>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Soverom" error={err('bedrooms')}>
              {(p) => <NumberInput {...p} decimals={0} value={form.bedrooms ?? null} onChange={(v) => set({ bedrooms: v })} />}
            </Field>
            <Field label="Standard">
              {(p) => (
                <Select {...p} value={form.standardClass ?? ''} onChange={(e) => set({ standardClass: (e.target.value || null) as StandardClass | null })}>
                  <option value="">Ukjent</option>
                  {STANDARD_CLASSES.map((c) => (
                    <option key={c} value={c}>
                      {STANDARD_CLASS_LABEL[c]}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="Lokasjon mot boligen" hint="Hvor nær ligger referansen?">
              {(p) => (
                <Select {...p} value={form.locationLevel ?? ''} onChange={(e) => set({ locationLevel: (e.target.value || null) as LocationLevel | null })}>
                  <option value="">Ukjent</option>
                  {LOCATION_LEVELS.map((c) => (
                    <option key={c} value={c}>
                      {LOCATION_LEVEL_LABEL[c]}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="Planløsning">
              {(p) => (
                <Select {...p} value={form.layoutMatch ?? ''} onChange={(e) => set({ layoutMatch: (e.target.value || null) as LayoutMatch | null })}>
                  <option value="">Ukjent</option>
                  {LAYOUT_MATCHES.map((c) => (
                    <option key={c} value={c}>
                      {LAYOUT_MATCH_LABEL[c]}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="Boligtype">
              {(p) => (
                <Select {...p} value={form.propertyType ?? ''} onChange={(e) => set({ propertyType: (e.target.value || null) as PropertyType | null })}>
                  <option value="">Ukjent</option>
                  {PROPERTY_TYPES.map((c) => (
                    <option key={c} value={c}>
                      {PROPERTY_TYPE_LABEL[c]}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="Eierform">
              {(p) => (
                <Select {...p} value={form.tenure ?? ''} onChange={(e) => set({ tenure: (e.target.value || null) as Tenure | null })}>
                  <option value="">Ukjent</option>
                  {TENURES.filter((t) => t !== 'ukjent').map((c) => (
                    <option key={c} value={c}>
                      {TENURE_LABEL[c]}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="Etasje">
              {(p) => <NumberInput {...p} decimals={0} value={form.floor ?? null} onChange={(v) => set({ floor: v })} />}
            </Field>
            {(['elevator', 'balcony', 'parking'] as const).map((k) => (
              <Field key={k} label={k === 'elevator' ? 'Heis' : k === 'balcony' ? 'Balkong/uteplass' : 'Parkering'}>
                {(p) => (
                  <Select {...p} value={form[k] === null || form[k] === undefined ? '' : form[k] ? 'ja' : 'nei'} onChange={(e) => set({ [k]: e.target.value === '' ? null : e.target.value === 'ja' } as Partial<ComparableFields>)}>
                    <option value="">Ukjent</option>
                    <option value="ja">Ja</option>
                    <option value="nei">Nei</option>
                  </Select>
                )}
              </Field>
            ))}
            <Field label="Fellesgjeld ved salget" error={err('sharedDebt')} hint="Brukes til å sammenligne kontantpris og totalpris.">
              {(p) => <NumberInput {...p} unit="kr" value={form.sharedDebt ?? null} onChange={(v) => set({ sharedDebt: v })} />}
            </Field>
            <Field label="Datakvalitet">
              {(p) => (
                <Select {...p} value={form.dataQuality ?? ''} onChange={(e) => set({ dataQuality: (e.target.value || null) as DataQualityLevel | null })}>
                  <option value="">Ukjent</option>
                  {DATA_QUALITY_LEVELS.map((c) => (
                    <option key={c} value={c}>
                      {c === 'hoy' ? 'Høy' : c === 'middels' ? 'Middels' : 'Lav'}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="Markedsjusteringsfaktor" error={err('marketAdjustment')} hint="1,00 = ingen justering. 1,05 = +5 % siden salget.">
              {(p) => <NumberInput {...p} decimals={2} value={form.marketAdjustment ?? null} onChange={(v) => set({ marketAdjustment: v })} />}
            </Field>
          </div>
        </details>
      </div>
      {submitted && issues.length > 0 && (
        <Alert tone="danger" className="mt-3" title="Kontroller opplysningene">
          <ul className="list-disc pl-4">
            {issues.map((i) => (
              <li key={i.field + i.message}>{i.message}</li>
            ))}
          </ul>
        </Alert>
      )}
    </Dialog>
  );
}

const ROLE_TONE = { primaer: 'pine', sekundaer: 'amber', markedsreferanse: 'outline' } as const;

function ReferenceRow({ r, mine }: { r: WeightedReference; mine: boolean }) {
  const isActive = r.role === 'markedsreferanse';
  return (
    <tr className={r.usedInAnchor ? undefined : 'text-slate-600'} data-testid="market-ref">
      <th scope="row" className="py-2 pr-2 text-left font-normal">
        <span className="font-medium text-ink">{r.name}</span>
        {mine && <span className="ml-1 text-[11px] text-violet-800">dine</span>}
        {isActive && <span className="block text-[11px] font-medium text-amber-900">Aktiv annonse – ikke faktisk salg</span>}
        {r.flags.includes('solgt_uten_sum') && <span className="block text-[11px] font-medium text-amber-900">Solgt uten dokumentert sum</span>}
        <details className="mt-0.5 text-[11px] text-slate-600">
          <summary className="cursor-pointer">Hvorfor {r.strength === 'sterk' ? 'sterk' : r.strength === 'middels' ? 'middels' : 'svak'}?</summary>
          <ul className="mt-1 list-disc pl-4">
            {r.reasons.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        </details>
      </th>
      <td className="py-2 pr-2">
        <Badge tone={ROLE_TONE[r.role]}>{REFERENCE_ROLE_LABEL[r.role]}</Badge>
      </td>
      <td className="py-2 pr-2 text-right">
        <span className="font-medium">{Math.round(r.physical.total)}</span>
        <span className="block text-[11px] text-slate-500" title="Lokasjon 25 · Standard 25 · BRA-i 15 · Soverom/planløsning 15 · Boligtype/eierform 10 · Øvrig 10">
          {r.physical.location}/{r.physical.standard}/{r.physical.area}/{r.physical.rooms}/{r.physical.type}/{r.physical.other}
        </span>
      </td>
      <td className="py-2 pr-2 text-right">{r.reliabilityFactor.toLocaleString('nb-NO')}</td>
      <td className="py-2 pr-2 text-right">
        {r.marketTimeFactor.toLocaleString('nb-NO')}
        <span className="block text-[11px] text-slate-500">{r.ageMonths === null ? 'dato ukjent' : `${Math.round(r.ageMonths)} mnd`}</span>
      </td>
      <td className="py-2 pr-2 text-right">
        {isActive ? <span className="text-xs text-slate-500">Signal</span> : <span className="font-semibold">{r.effectiveWeight.toLocaleString('nb-NO', { minimumFractionDigits: 2 })}</span>}
      </td>
      <td className="py-2 pr-2 text-right">
        {isActive ? (
          <>
            {r.askingPerM2 === null ? '–' : `${formatNOK(r.askingPerM2)}`}
            <span className="block text-[11px] text-slate-500">prisantydning/m²</span>
          </>
        ) : r.adjustedTotalPerM2 === null ? (
          '–'
        ) : (
          <>
            {formatNOK(r.adjustedTotalPerM2)}
            <span className="block text-[11px] text-slate-500">{r.marketAdjusted ? `justert ×${r.marketAdjustmentFactor.toLocaleString('nb-NO')}` : 'ikke markedsjustert'}</span>
          </>
        )}
      </td>
      <td className="py-2 text-center">{isActive ? '–' : r.usedInAnchor ? 'Ja' : 'Nei'}</td>
    </tr>
  );
}

/** Verdivurdering fra sammenlignbare objekter (markedsvekting V1). Aktive annonser er aldri oppnådd salgspris. */
function MarketValuation({ ctx, canEdit }: { ctx: PropertyContext; canEdit: boolean }) {
  const comps = useMarketComparables(ctx);
  const defs = useMemo(() => resolveAnalysisScenarios(ctx.analysis), [ctx.analysis]);
  const [scenarioId, setScenarioId] = useState<string | null>(null);
  // Privat overstyring av sluttstandard (gjelder bare din visning). Tom = bruk scenarioets egen sluttstandard.
  const [standard, setStandard] = useState<StandardClass | ''>('');
  const def = scenarioFor(ctx, scenarioId ?? ctx.draft.analysisScenarioId);
  // Samme flyt som grunnverdiene bruker (markedsmotoren). Dine egne referanser og din standardoverstyring gir en privat vurdering.
  const res = useMemo(() => resolveForScenario({ ctx, scenario: def, values: ctx.draft, own: comps.own, standardOverride: standard || null }), [ctx, comps.own, def, standard]);
  const est = res.market!;
  const [applied, setApplied] = useState(false);
  const E = est.estimate;
  const hasOwn = comps.own.length > 0 || standard !== '';
  const tierTone = est.quality.tier === 'svaert_godt' ? 'green' : est.quality.tier === 'normalt' ? 'pine' : est.quality.tier === 'svakt' ? 'amber' : 'red';
  const apply = () => {
    if (res.source !== 'markedsmotor') return;
    ctx.setDraft((d) => ({ ...d, saleBasis: res.sale.basis, saleLow: res.sale.low, saleBase: res.sale.base, saleHigh: res.sale.high }));
    setApplied(true);
  };
  return (
    <Panel
      title="Verdivurdering fra sammenlignbare objekter"
      sub={`Markedsvekting (modell ${MARKET_MODEL_VERSION}). Hver referanse vektes etter fysisk likhet, pålitelighet og alder. Ukjente opplysninger er ikke «middels»: de gir lav likhet og lavere pålitelighet. Aktive annonser brukes bare som begrenset markedssignal.`}
    >
      <div className="mb-3 flex flex-wrap items-end gap-3">
        {defs.length > 1 && (
          <label className="block text-xs">
            <span className="mb-1 block font-medium text-slate-800">Scenario</span>
            <Select aria-label="Scenario for verdivurdering" value={def.id} onChange={(e) => { setScenarioId(e.target.value); setApplied(false); }}>
              {defs.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.title}
                </option>
              ))}
            </Select>
          </label>
        )}
        <label className="block text-xs">
          <span className="mb-1 block font-medium text-slate-800">Standard etter oppussing</span>
          <Select aria-label="Standard etter oppussing" value={standard} onChange={(e) => { setStandard(e.target.value as StandardClass | ''); setApplied(false); }}>
            <option value="">
              Fra scenarioet: {STANDARD_CLASS_LABEL[res.standardClass].toLowerCase()}
              {res.standardDocumented ? '' : ' (antatt)'}
            </option>
            {STANDARD_CLASSES.map((c) => (
              <option key={c} value={c}>
                {STANDARD_CLASS_LABEL[c]}
              </option>
            ))}
          </Select>
        </label>
        <Badge tone={tierTone}>
          {QUALITY_TIER_LABEL[est.quality.tier]} · {est.quality.score}/100
        </Badge>
      </div>

      {E ? (
        <div className="mb-3 rounded-lg border border-slate-200 p-3">
          <p className="text-xs text-slate-600">
            Estimert salgsverdi for «{def.title}» ({E.basis === 'total' ? 'totalpris inkl. fellesgjeld' : 'kontantpris'}) · intervall ±{(est.halfWidthPct ?? 0).toLocaleString('nb-NO')} %
          </p>
          <div className="num mt-1 grid grid-cols-3 gap-2 text-center">
            {(['low', 'base', 'high'] as const).map((k) => (
              <div key={k} className={k === 'base' ? 'rounded-lg bg-pine-50 p-2' : 'p-2'}>
                <p className="text-[11px] text-slate-600">{CASE_LABEL[k]}</p>
                <p className="text-lg font-semibold">{formatNOK(E[k])}</p>
              </div>
            ))}
          </div>
          <p className="num mt-2 text-xs text-slate-600">
            Dine nåværende tall: {formatNOK(ctx.draft.saleLow, NO_BASIS)} / {formatNOK(ctx.draft.saleBase, NO_BASIS)} / {formatNOK(ctx.draft.saleHigh, NO_BASIS)}.
            {hasOwn ? ' Vurderingen over inkluderer dine egne referanser eller din standardoverstyring og er privat.' : ''}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Button size="sm" variant="secondary" disabled={!ctx.editable || res.source !== 'markedsmotor'} onClick={apply}>
              Bruk som salgsverdi i scenarioet
            </Button>
            {applied && <span className="text-xs text-pine-800" role="status">Salgsverdien er lagt inn i scenarioet (ulagret til du lagrer).</span>}
            {!ctx.editable && <span className="text-xs text-slate-600">Scenarioet kan ikke redigeres nå.</span>}
          </div>
        </div>
      ) : (
        <Alert tone="warning" title="For usikkert grunnlag – ingen salgsverdi foreslås" className="mb-3">
          <p>{est.reason}</p>
          <p>Legg inn flere faktiske, dokumenterte salg (under «Mine sammenlignbare objekter») med areal, standard og lokasjon. Du kan fortsatt bruke egne salgstall i scenarioet.</p>
        </Alert>
      )}

      <ul className="mb-3 list-disc space-y-0.5 pl-5 text-xs text-slate-700">
        {est.quality.notes.map((n) => (
          <li key={n}>{n}</li>
        ))}
        {est.anchor.weightedMedianPerM2 !== null && (
          <li className="num">
            Anker (robust vektet median): {formatNOK(est.anchor.weightedMedianPerM2)}/m² totalpris. Kontroll (vektet snitt): {formatNOK(est.anchor.weightedMeanPerM2)}/m². Spredning {est.anchor.spreadPct === null ? NO_BASIS : `${est.anchor.spreadPct.toLocaleString('nb-NO')} %`}. {est.anchor.used} referanser i ankeret.
          </li>
        )}
        {est.activeSignals.count > 0 && (
          <li className="num">
            {est.activeSignals.count} {est.activeSignals.count === 1 ? "aktiv annonse" : "aktive annonser"} (ikke faktiske salg){est.activeSignals.medianAskingPerM2 !== null ? `, median prisantydning ${formatNOK(est.activeSignals.medianAskingPerM2)}/m²` : ''}.
            {est.activeSignals.competingBelowAnchor ? ' En nærliggende annonse ligger under ankerprisen.' : ''}
          </li>
        )}
        {est.positioning.notes.map((n) => (
          <li key={n} data-testid="market-positioning">
            {n}
          </li>
        ))}
      </ul>

      {est.references.length === 0 ? (
        <p className="text-sm text-slate-600">Ingen sammenlignbare objekter å vekte ennå.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="num w-full min-w-[56rem] text-sm">
            <caption className="sr-only">Referanser i markedsvektingen</caption>
            <thead className="text-left text-xs text-slate-600">
              <tr>
                <th className="py-1.5 pr-2 font-medium">Referanse</th>
                <th className="py-1.5 pr-2 font-medium">Rolle</th>
                <th className="py-1.5 pr-2 text-right font-medium" title="Lokasjon/standard/BRA/soverom/type/øvrig">
                  Fysisk likhet
                </th>
                <th className="py-1.5 pr-2 text-right font-medium">Pålitelighet</th>
                <th className="py-1.5 pr-2 text-right font-medium">Markedstid</th>
                <th className="py-1.5 pr-2 text-right font-medium">Effektiv vekt</th>
                <th className="py-1.5 pr-2 text-right font-medium">Pris per m²</th>
                <th className="py-1.5 text-center font-medium">I anker</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 align-top">
              {est.references.map((r) => (
                <ReferenceRow key={r.id} r={r} mine={comps.ownIds.has(r.id)} />
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-3 text-xs text-slate-600">
        Fysisk likhet 0–100: lokasjon 25, standard mot sluttproduktet 25, BRA-i 15, soverom og planløsning 15, boligtype og eierform 10, øvrige egenskaper 10. Effektiv vekt = fysisk likhet × pålitelighet × markedstid. Markedsjustert pris = salgspris × indeks nå / indeks ved salg. Områdeprofil med prisutvikling er forberedt, men ikke koblet til – uten indeks justeres ikke prisene, og eldre salg mister vekt raskere.
        {!canEdit && ' Du trenger aktivt abonnement for å legge inn egne referanser.'}
      </p>
    </Panel>
  );
}

export function MarketTab({ ctx }: { ctx: PropertyContext }) {
  const services = useServices();
  const toast = useToast();
  const { entitlements } = useSession();
  const canEdit = entitlements?.canEditScenarios ?? false;
  const { analysis: a, item } = ctx;
  const scen = findAnalysisScenario(a, ctx.draft.analysisScenarioId);
  // Én autoritativ flyt: koden (markedsmotoren) fastsetter salgsverdien. Agentens estimat er historisk referanse, og din kalkyle kan overstyre privat.
  const resolution = scenarioFields(ctx, scen.id)?.saleResolution ?? null;
  const s = resolution?.sale ?? null;
  const agent = scen.sale ?? null;
  const draft = ctx.draft;
  const sameAsFinal = s !== null && draft.saleLow === s.low && draft.saleBase === s.base && draft.saleHigh === s.high && draft.saleBasis === s.basis;
  const mine = useLiveQuery(() => services.comparables.list(item.property.id), [item.property.id]);
  const [dialog, setDialog] = useState<null | { initial: (ComparableFields & { id?: string }) | null }>(null);
  const [del, setDel] = useState<Row | null>(null);
  const [busy, setBusy] = useState(false);

  const shared = a.comparables.map(fromShared);
  const own = (mine.data ?? []).map(fromMine);
  const med = soldMedians([...shared, ...own]);

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

  return (
    <div className="space-y-5">
      <Panel
        title={scen.saleSource === 'scenario' ? `Salgsverdi etter oppussing – ${scen.title}` : 'Salgsverdi etter oppussing'}
        sub={
          <>
            <BasisNote basis={s?.basis ?? draft.saleBasis} />
            <span className="block text-xs text-slate-600">
              {scen.saleSource === 'scenario'
                ? `Vurdert for dette sluttproduktet (${scen.endProduct.bedrooms === null ? 'soverom ikke avklart' : `${scen.endProduct.bedrooms} soverom`}${resolution ? `, ${STANDARD_CLASS_LABEL[resolution.standardClass].toLowerCase()}${resolution.standardDocumented ? '' : ' – antatt, ikke dokumentert'}` : ''}). Usikkerhet: ${scen.uncertainty.level === 'uavklart' ? 'uavklart' : scen.uncertainty.level === 'hoy' ? 'høy' : scen.uncertainty.level}. ${scen.uncertainty.note}`
                : 'Eldre analyse: dette er analysens ene salgsverdi, ikke vurdert for et bestemt sluttprodukt.'}
            </span>
          </>
        }
      >
        {s && resolution ? (
          <>
            <p className="mb-2 text-sm" data-testid="sale-source">
              <Badge tone={resolution.source === 'markedsmotor' ? 'green' : resolution.source === 'ingen' ? 'red' : 'amber'}>{SALE_SOURCE_LABEL[resolution.source]}</Badge>
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {(['low', 'base', 'high'] as const).map((k) => (
                <div key={k} className="rounded-lg border border-slate-200 p-3">
                  <p className="text-xs font-medium text-slate-600">{CASE_LABEL[k]} scenario</p>
                  <p className="num text-lg font-semibold">{formatNOK(s[k], NO_BASIS)}</p>
                  <p className="mt-1 text-xs text-slate-700">{k === 'low' ? s.rationaleLow : k === 'base' ? s.rationaleBase : s.rationaleHigh}</p>
                </div>
              ))}
            </div>
            <div className="mt-3 overflow-x-auto">
              <table className="num w-full min-w-[32rem] text-sm" data-testid="sale-values">
                <caption className="mb-1 text-left text-xs font-medium text-slate-700">Tre verdier som holdes adskilt</caption>
                <thead className="text-left text-xs text-slate-600">
                  <tr>
                    <th className="py-1 pr-2 font-medium">Kilde</th>
                    <th className="py-1 pr-2 text-right font-medium">Lav</th>
                    <th className="py-1 pr-2 text-right font-medium">Normal</th>
                    <th className="py-1 text-right font-medium">Høy</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  <tr className={resolution.source === 'markedsmotor' ? 'bg-pine-50/60 font-semibold' : ''}>
                    <th scope="row" className="py-1.5 pr-2 text-left font-normal">
                      Markedsmotoren {resolution.source === 'markedsmotor' ? '(fasit i kalkylen)' : ''}
                      {resolution.source !== 'markedsmotor' && <span className="block text-[11px] text-slate-600">Kunne ikke regne en verdi</span>}
                    </th>
                    {(['low', 'base', 'high'] as const).map((k) => (
                      <td key={k} className="py-1.5 pr-2 text-right">
                        {resolution.source === 'markedsmotor' ? formatNOK(s[k], NO_BASIS) : '–'}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <th scope="row" className="py-1.5 pr-2 text-left font-normal">
                      {scen.saleSource === 'global' ? 'Analysens salgsverdi (eldre analyse)' : "Agentens historiske estimat"}
                      <span className="block text-[11px] text-slate-600">{scen.saleSource === 'global' ? 'Brukes som grunnverdi for eldre analyser' : 'Referanse – ikke fasit når markedsmotoren kan regne'}</span>
                    </th>
                    <td className="py-1.5 pr-2 text-right">{formatNOK(agent?.low ?? null, NO_BASIS)}</td>
                    <td className="py-1.5 pr-2 text-right">{formatNOK(agent?.base ?? null, NO_BASIS)}</td>
                    <td className="py-1.5 text-right">{formatNOK(agent?.high ?? null, NO_BASIS)}</td>
                  </tr>
                  <tr>
                    <th scope="row" className="py-1.5 pr-2 text-left font-normal">
                      Din kalkyle (privat)
                      <span className="block text-[11px] text-slate-600">{sameAsFinal ? 'Ikke endret av deg' : 'Endret av deg – skrives aldri til analysen'}</span>
                    </th>
                    <td className="py-1.5 pr-2 text-right">{formatNOK(draft.saleLow, NO_BASIS)}</td>
                    <td className="py-1.5 pr-2 text-right">{formatNOK(draft.saleBase, NO_BASIS)}</td>
                    <td className="py-1.5 text-right">{formatNOK(draft.saleHigh, NO_BASIS)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            {resolution.notes.length > 0 && (
              <ul className="mt-2 list-disc space-y-0.5 pl-5 text-xs text-slate-700">
                {resolution.notes.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            )}
          </>
        ) : (
          <p className="text-sm text-slate-700">Salgsverdien kan ikke vises uten annonsegrunnlag.</p>
        )}
        <p className="mt-3 text-xs text-slate-600">Ingen udokumentert markedsvekst er lagt inn. Verdi av uavklart soverom, utleiedel eller seksjonering er ikke innregnet.</p>
      </Panel>

      <MarketValuation ctx={ctx} canEdit={canEdit} />

      <Panel
        title="Sammenlignbare objekter fra analysen"
        sub="Sammenlignbare objekter i analysen din. Prisantydninger og salg uten dokumentert sum teller ikke som oppnådd pris."
      >
        {shared.length === 0 ? <Alert tone="warning">Ingen sammenligningsobjekter i analysen.</Alert> : <ComparablesTable rows={shared} caption="Sammenlignbare objekter fra analysen" />}
      </Panel>

      <Panel
        title="Mine sammenlignbare objekter"
        sub="Dine egne funn. De kommer i tillegg til de som ligger i analysen."
        action={
          <Button size="sm" variant="primary" icon={<Plus className="size-4" aria-hidden />} disabled={!canEdit} onClick={() => setDialog({ initial: null })}>
            Legg til objekt
          </Button>
        }
      >
        {own.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-600">
            Du har ikke lagt inn egne sammenlignbare objekter ennå.{canEdit ? ' Trykk «Legg til objekt».' : ' Du trenger aktivt abonnement for å legge til.'}
          </p>
        ) : (
          <ComparablesTable rows={own} caption="Mine sammenlignbare objekter" onEdit={canEdit ? (r) => setDialog({ initial: r }) : undefined} onDelete={canEdit ? setDel : undefined} />
        )}
      </Panel>

      <Panel title="Median kr/m² for faktiske salg" sub="Grunnlag og egne objekter samlet. Prisgrunnlagene blandes ikke.">
        {med.total || med.cash ? (
          <dl className="num grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
            <div className="rounded-lg bg-slate-50 p-3">
              <dt className="text-xs text-slate-600">Solgt totalpris (inkl. fellesgjeld)</dt>
              <dd className="font-semibold">{med.total ? `${formatNOK(med.total.value)}/m² · ${med.total.n} salg` : 'Mangler grunnlag'}</dd>
            </div>
            <div className="rounded-lg bg-slate-50 p-3">
              <dt className="text-xs text-slate-600">Solgt pris (kontant)</dt>
              <dd className="font-semibold">{med.cash ? `${formatNOK(med.cash.value)}/m² · ${med.cash.n} salg` : 'Mangler grunnlag'}</dd>
            </div>
          </dl>
        ) : (
          <p className="text-sm text-slate-700">Ingen faktiske salg med dokumentert salgssum og areal ennå.</p>
        )}
      </Panel>

      <ComparableDialog
        open={dialog !== null}
        initial={dialog?.initial ?? null}
        busy={busy}
        onClose={() => setDialog(null)}
        onSave={async (c, id) => {
          const ok = await run(() => (id ? services.comparables.update(id, c) : services.comparables.create(item.property.id, c)), id ? 'Objektet er oppdatert' : 'Objektet er lagt til');
          if (ok) setDialog(null);
        }}
      />
      <Dialog
        open={del !== null}
        onClose={() => setDel(null)}
        size="sm"
        title={`Slette «${del?.name ?? ''}»?`}
        footer={
          <>
            <Button onClick={() => setDel(null)}>Avbryt</Button>
            <Button
              variant="danger"
              loading={busy}
              onClick={async () => {
                if (del && (await run(() => services.comparables.remove(del.id), 'Objektet er slettet'))) setDel(null);
              }}
            >
              Slett
            </Button>
          </>
        }
      >
        <p className="text-sm">Bare det sammenlignbare objektet du la inn selv slettes. Objektene i analysen beholdes.</p>
      </Dialog>
    </div>
  );
}
