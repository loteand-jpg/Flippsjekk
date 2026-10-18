import clsx from 'clsx';
import { ChevronDown, ChevronRight, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { itemCost, itemEconomics } from '../../calc/scenario';
import { resolveAnalysisScenarios } from '../../domain/analysisScenarios';
import {
  LABOR_CATEGORIES,
  LABOR_CATEGORY_LABEL,
  PRIORITIES,
  PRIORITY_LABEL,
  REGULATED_LABOR,
  RENOVATION_LEVEL_LABEL,
  WORK_MODE_LABEL,
  WORK_MODES,
  type LaborCategory,
  type Priority,
  type WorkMode,
} from '../../domain/enums';
import type { RenovationItem } from '../../domain/schemas';
import { formatHours, formatNOK, NO_BASIS } from '../../lib/format';
import { uuid } from '../../lib/ids';
import { NumberInput, ScenarioNumberField, Segmented, Select, Switch, TextInput } from '../ui/forms';
import { Alert, Badge, Button } from '../ui/primitives';
import { BarList } from './charts';
import { ScenarioPanel } from './ScenarioPanel';
import { Panel, type PropertyContext } from './shared';

const CAT_LABEL = { materials: 'Materialer', electrician: 'Elektriker', plumber: 'Rørlegger', other: 'Andre fag' } as const;

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Eldre tiltak → tiltak med arbeidsmodell. Fagene (elektriker, rørlegger, andre) blir innleid arbeidskostnad. */
function withLaborCategory(i: RenovationItem, cat: LaborCategory | null): RenovationItem {
  if (cat === null) {
    if (!i.laborCategory) return i;
    // Tilbake til eldre modell: innleid arbeidskostnad legges i «andre fag», og arbeidstimene blir egne timer.
    return { ...i, laborCategory: null, laborHours: null, laborCostHired: null, workMode: null, selfShare: null, other: i.laborCostHired ?? null, hours: i.laborHours ?? null };
  }
  if (i.laborCategory) return { ...i, laborCategory: cat };
  const buckets = [i.electrician, i.plumber, i.other];
  const hired = buckets.some((b) => b === null) ? null : (buckets as number[]).reduce((s, b) => s + b, 0);
  return { ...i, laborCategory: cat, laborHours: i.hours, laborCostHired: hired, electrician: 0, plumber: 0, other: 0, hours: null, workMode: null, selfShare: null };
}

export function RenovationTab({ ctx }: { ctx: PropertyContext }) {
  const { draft, setDraft, editable, analysis } = ctx;
  const options = analysis.estimates.renovationOptions;
  const isLegacy = !analysis.estimates.scenarios || analysis.estimates.scenarios.length === 0;
  const reno = ctx.result.renovation;
  const b = ctx.result.evaluation.base;
  const labor = { laborModes: draft.laborModes, maxOwnWork: draft.maxOwnWork, regulatedSelfWorkConfirmed: draft.regulatedSelfWorkConfirmed };
  const [open, setOpen] = useState<Set<string>>(new Set());
  const toggle = (id: string) =>
    setOpen((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const setItems = (fn: (items: RenovationItem[]) => RenovationItem[]) => setDraft((d) => ({ ...d, renovationItems: fn(d.renovationItems) }));
  const updateItem = (id: string, patch: Partial<RenovationItem>) => setItems((items) => items.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  const chooseOption = (id: string) => {
    const o = options.find((x) => x.id === id);
    if (!o) return;
    setDraft((d) => ({ ...d, renovationOptionId: o.id, renovationMode: 'tiltak', renovationItems: o.items.map((i) => ({ ...i })), months: o.suggestedMonths ?? d.months, vatIncluded: o.vatIncluded }));
  };
  const reserve = draft.reservePct;
  const baseItems = ctx.base?.values.renovationItems ?? [];
  const itemsChanged = ctx.base ? !same(baseItems, draft.renovationItems) : false;
  const removedFromBase = baseItems.filter((bi) => !draft.renovationItems.some((i) => i.id === bi.id));
  const resetItems = () => ctx.base && setDraft((d) => ({ ...d, renovationItems: structuredClone(ctx.base!.values.renovationItems), renovationMode: ctx.base!.values.renovationMode, renovationOptionId: ctx.base!.values.renovationOptionId, vatIncluded: ctx.base!.values.vatIncluded }));
  const scenarioTitle = resolveAnalysisScenarios(analysis).find((s) => s.id === draft.analysisScenarioId)?.title;

  return (
    <div className="space-y-5">
      <Alert tone="info">
        Oppussingsanslag er grove anslag – ikke pristilbud. Påkrevde utbedringer bør ikke tas ut for å få et lønnsomt scenario. Innhent tilbud før bud der det er mulig.
      </Alert>

      <ScenarioPanel ctx={ctx} compact onCreate={ctx.createScenarioFrom ? (d) => ctx.createScenarioFrom!(d.id, d.title) : undefined} />

      {isLegacy && options.length > 0 && (
        <section aria-labelledby="opt-title">
          <h3 id="opt-title" className="mb-2 text-base font-semibold">
            Alternativer fra grunnanalysen
          </h3>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            {options.map((o) => {
              const total = o.items.filter((i) => i.included).reduce<number | null>((s, i) => (s === null || itemCost(i) === null ? null : s + (itemCost(i) as number)), 0);
              const selected = draft.renovationOptionId === o.id && draft.renovationMode === 'tiltak';
              return (
                <div key={o.id} className={clsx('rounded-xl border bg-white p-4', selected ? 'border-pine-700 ring-2 ring-pine-700/20' : 'border-slate-200')}>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-xs font-medium text-slate-500">{RENOVATION_LEVEL_LABEL[o.level]}</p>
                      <p className="font-semibold">{o.title}</p>
                    </div>
                    {o.id === analysis.estimates.defaultRenovationOptionId && <Badge tone="pine">Analysens hovedvalg</Badge>}
                  </div>
                  <p className="mt-2 text-sm text-slate-700">{o.description}</p>
                  <p className="num mt-2 text-sm">
                    <strong>{formatNOK(total, NO_BASIS)}</strong> <span className="text-slate-600">før reserve{o.suggestedMonths ? ` · ca. ${o.suggestedMonths} mnd` : ''}</span>
                  </p>
                  <p className="mt-1 text-xs text-slate-600">{o.saleEffectNote}</p>
                  {o.requiresApproval && <p className="mt-1 text-xs font-medium text-amber-800">Krever godkjenning som ikke er avklart – verdiøkning er ikke innregnet i salgsprisen.</p>}
                  <Button size="sm" className="mt-3" variant={selected ? 'subtle' : 'secondary'} disabled={!editable} onClick={() => chooseOption(o.id)} aria-pressed={selected}>
                    {selected ? 'Valgt i scenarioet' : 'Bruk dette alternativet'}
                  </Button>
                </div>
              );
            })}
          </div>
          <p className="mt-2 text-xs text-slate-600">Å velge et alternativ erstatter tiltakslisten i scenarioet ditt (ulagret til du lagrer).</p>
        </section>
      )}

      <Panel
        title={scenarioTitle ? `Oppussing i mitt scenario – ${scenarioTitle}` : 'Oppussing i mitt scenario'}
        action={
          <Segmented
            label="Metode for oppussingssum"
            value={draft.renovationMode}
            disabled={!editable}
            onChange={(v) => setDraft((d) => ({ ...d, renovationMode: v }))}
            options={[
              { value: 'tiltak', label: 'Summer tiltak' },
              { value: 'rundsum', label: 'Rundsum' },
            ]}
          />
        }
        sub="Enten summering av tiltak eller én eksplisitt rundsum – aldri begge samtidig. Materialer og arbeid holdes adskilt for tiltak med arbeidskategori."
      >
        <div className="mb-4 flex flex-wrap items-center gap-4">
          <Switch checked={draft.vatIncluded} disabled={!editable} onChange={(v) => setDraft((d) => ({ ...d, vatIncluded: v }))} label="Anslagene er inkl. mva." />
          <span className="text-xs text-slate-600">Standard er inkl. mva. Ikke anta at mva. kan trekkes fra bare fordi kjøper er AS.</span>
        </div>

        {itemsChanged && (
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-violet-50 px-3 py-2 text-sm text-violet-950">
            <span className="font-medium">Tiltakene er endret av deg fra grunnverdien.</span>
            {editable && (
              <button type="button" onClick={resetItems} className="inline-flex items-center gap-1 text-pine-800 hover:underline">
                <RotateCcw className="size-3.5" aria-hidden /> Tilbakestill alle tiltak til grunnverdi
              </button>
            )}
          </div>
        )}

        {draft.renovationMode === 'rundsum' ? (
          <div className="grid max-w-xl gap-4 sm:grid-cols-2">
            <ScenarioNumberField label="Oppussing (rundsum, før reserve)" unit="kr" value={draft.renovationLumpSum} onChange={(v) => setDraft((d) => ({ ...d, renovationLumpSum: v }))} disabled={!editable} />
            <ScenarioNumberField label="Egne timer" unit="t" value={draft.lumpSumHours} onChange={(v) => setDraft((d) => ({ ...d, lumpSumHours: v }))} disabled={!editable} />
            <p className="text-xs text-slate-600 sm:col-span-2">Tiltakslisten under beholdes, men summeres ikke mens rundsum er valgt.</p>
          </div>
        ) : null}

        <div className={clsx('overflow-x-auto', draft.renovationMode === 'rundsum' && 'opacity-60')}>
          <table className="num w-full min-w-[64rem] text-sm">
            <caption className="sr-only">Oppussingstiltak. Tomt beløpsfelt betyr ikke avklart.</caption>
            <thead className="text-left text-xs text-slate-600">
              <tr>
                <th className="py-2 pr-2 font-medium">Med</th>
                <th className="py-2 pr-2 font-medium">Rom</th>
                <th className="py-2 pr-2 font-medium">Tiltak</th>
                <th className="py-2 pr-2 text-right font-medium">Materialer</th>
                <th className="py-2 pr-2 text-right font-medium">Elektriker</th>
                <th className="py-2 pr-2 text-right font-medium">Rørlegger</th>
                <th className="py-2 pr-2 text-right font-medium">Andre fag</th>
                <th className="py-2 pr-2 text-right font-medium">Innleid arbeid</th>
                <th className="py-2 pr-2 text-right font-medium">Egne timer</th>
                <th className="py-2 pr-2 font-medium">Prioritet</th>
                <th className="py-2 text-right font-medium">Sum</th>
                <th className="py-2">
                  <span className="sr-only">Handlinger</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 align-top">
              {draft.renovationItems.map((i) => {
                const e = itemEconomics(i, labor);
                const requiredOff = !i.included && i.priority === 'pakrevd';
                const baseItem = baseItems.find((x) => x.id === i.id);
                const isMine = ctx.base !== null && !baseItem;
                const changed = Boolean(baseItem) && !same(baseItem, i);
                const expanded = open.has(i.id);
                const newStyle = Boolean(i.laborCategory);
                return [
                  <tr key={i.id} className={clsx(!i.included && 'text-slate-500', requiredOff && 'bg-amber-50')}>
                    <td className="py-2 pr-2">
                      <input
                        type="checkbox"
                        className="mt-2 size-4 accent-pine-700"
                        aria-label={`Inkluder ${i.title}`}
                        checked={i.included}
                        disabled={!editable || draft.renovationMode === 'rundsum'}
                        onChange={(ev) => updateItem(i.id, { included: ev.target.checked })}
                      />
                    </td>
                    <td className="w-28 py-2 pr-2">
                      <TextInput aria-label="Rom" value={i.room} disabled={!editable} onChange={(ev) => updateItem(i.id, { room: ev.target.value })} />
                    </td>
                    <td className="min-w-[14rem] py-2 pr-2">
                      <TextInput aria-label="Tiltak" value={i.title} disabled={!editable} onChange={(ev) => updateItem(i.id, { title: ev.target.value })} />
                      {requiredOff && <p className="mt-1 text-xs font-medium text-amber-900">Påkrevd utbedring er tatt ut av kalkylen.</p>}
                      {(changed || isMine) && (
                        <p className="mt-1 flex items-center gap-2 text-xs font-medium text-violet-800">
                          {isMine ? 'Ditt tiltak' : 'Endret av deg'}
                          {changed && editable && (
                            <button type="button" className="inline-flex items-center gap-1 font-normal text-pine-800 hover:underline" onClick={() => setItems((items) => items.map((x) => (x.id === i.id ? structuredClone(baseItem!) : x)))}>
                              <RotateCcw className="size-3" aria-hidden /> Tilbakestill
                            </button>
                          )}
                        </p>
                      )}
                    </td>
                    <td className="w-32 py-2 pr-2">
                      <NumberInput aria-label={`${CAT_LABEL.materials} for ${i.title}`} value={i.materials} disabled={!editable} onChange={(v) => updateItem(i.id, { materials: v })} />
                    </td>
                    {(['electrician', 'plumber', 'other'] as const).map((k) => (
                      <td key={k} className="w-28 py-2 pr-2">
                        <NumberInput aria-label={`${CAT_LABEL[k]} for ${i.title}`} value={i[k]} disabled={!editable} onChange={(v) => updateItem(i.id, { [k]: v })} />
                      </td>
                    ))}
                    <td className="w-28 py-2 pt-4 pr-2 text-right whitespace-nowrap">
                      {newStyle ? (
                        e.hiredLabor === null ? (
                          <span className="text-xs text-amber-800">Ikke avklart</span>
                        ) : (
                          formatNOK(e.hiredLabor)
                        )
                      ) : (
                        <span className="text-slate-400">–</span>
                      )}
                    </td>
                    <td className="w-24 py-2 pr-2">
                      {newStyle ? (
                        <p className="pt-2 text-right" title="Beregnet fra arbeidsmodellen">
                          {e.ownHours === null ? <span className="text-xs text-amber-800">Ikke avklart</span> : formatHours(e.ownHours)}
                        </p>
                      ) : (
                        <NumberInput aria-label={`Egne timer for ${i.title}`} value={i.hours} disabled={!editable} onChange={(v) => updateItem(i.id, { hours: v })} />
                      )}
                    </td>
                    <td className="w-32 py-2 pr-2">
                      <Select aria-label={`Prioritet for ${i.title}`} value={i.priority} disabled={!editable} onChange={(ev) => updateItem(i.id, { priority: ev.target.value as Priority })}>
                        {PRIORITIES.map((p) => (
                          <option key={p} value={p}>
                            {PRIORITY_LABEL[p]}
                          </option>
                        ))}
                      </Select>
                    </td>
                    <td className="py-2 pt-4 text-right font-medium whitespace-nowrap">{e.cost === null ? <span className="text-xs text-amber-800">Ikke avklart</span> : formatNOK(e.cost)}</td>
                    <td className="py-2 pl-2 whitespace-nowrap">
                      <button
                        type="button"
                        className="mt-1.5 inline-flex items-center rounded p-1 text-slate-600 hover:bg-slate-100"
                        aria-expanded={expanded}
                        aria-label={`Arbeid og egeninnsats for ${i.title}`}
                        onClick={() => toggle(i.id)}
                      >
                        {expanded ? <ChevronDown className="size-4" aria-hidden /> : <ChevronRight className="size-4" aria-hidden />}
                        <span className="ml-0.5 text-xs">Arbeid</span>
                      </button>
                      <button
                        type="button"
                        className="mt-1.5 rounded p-1 text-slate-500 hover:bg-red-50 hover:text-red-800 disabled:opacity-40"
                        aria-label={`Fjern ${i.title}`}
                        disabled={!editable}
                        onClick={() => setItems((items) => items.filter((x) => x.id !== i.id))}
                      >
                        <Trash2 className="size-4" aria-hidden />
                      </button>
                    </td>
                  </tr>,
                  expanded && (
                    <tr key={`${i.id}-arbeid`} className="bg-slate-50/70">
                      <td />
                      <td colSpan={11} className="py-3 pr-2">
                        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                          <label className="block text-xs">
                            <span className="mb-1 block font-medium text-slate-800">Arbeidskategori</span>
                            <Select
                              aria-label={`Arbeidskategori for ${i.title}`}
                              value={i.laborCategory ?? ''}
                              disabled={!editable}
                              onChange={(ev) => updateItem(i.id, withLaborCategory(i, ev.target.value === '' ? null : (ev.target.value as LaborCategory)))}
                            >
                              <option value="">Ikke angitt (eldre modell)</option>
                              {LABOR_CATEGORIES.map((c) => (
                                <option key={c} value={c}>
                                  {LABOR_CATEGORY_LABEL[c]}
                                  {REGULATED_LABOR.includes(c) ? ' (regulert)' : ''}
                                </option>
                              ))}
                            </Select>
                          </label>
                          {newStyle ? (
                            <>
                              <label className="block text-xs">
                                <span className="mb-1 block font-medium text-slate-800">Hvem utfører</span>
                                <Select
                                  aria-label={`Hvem utfører ${i.title}`}
                                  value={i.workMode ?? ''}
                                  disabled={!editable}
                                  onChange={(ev) => updateItem(i.id, { workMode: ev.target.value === '' ? null : (ev.target.value as WorkMode) })}
                                >
                                  <option value="">Fra profil ({e.mode ? WORK_MODE_LABEL[e.mode].toLowerCase() : '–'})</option>
                                  {WORK_MODES.map((m) => (
                                    <option key={m} value={m}>
                                      {WORK_MODE_LABEL[m]}
                                    </option>
                                  ))}
                                </Select>
                              </label>
                              {e.mode === 'delvis' && (
                                <label className="block text-xs">
                                  <span className="mb-1 block font-medium text-slate-800">Egenandel</span>
                                  <NumberInput
                                    aria-label={`Egenandel for ${i.title}`}
                                    unit="%"
                                    value={i.selfShare === null || i.selfShare === undefined ? 50 : Math.round(i.selfShare * 100)}
                                    disabled={!editable}
                                    onChange={(v) => updateItem(i.id, { selfShare: v === null ? null : Math.min(100, Math.max(0, v)) / 100 })}
                                  />
                                </label>
                              )}
                              <label className="block text-xs">
                                <span className="mb-1 block font-medium text-slate-800">Arbeidstimer totalt</span>
                                <NumberInput aria-label={`Arbeidstimer for ${i.title}`} unit="t" value={i.laborHours ?? null} disabled={!editable} onChange={(v) => updateItem(i.id, { laborHours: v })} />
                              </label>
                              <label className="block text-xs">
                                <span className="mb-1 block font-medium text-slate-800">Arbeidskostnad hvis innleid</span>
                                <NumberInput aria-label={`Arbeidskostnad hvis innleid for ${i.title}`} unit="kr" value={i.laborCostHired ?? null} disabled={!editable} onChange={(v) => updateItem(i.id, { laborCostHired: v })} />
                              </label>
                            </>
                          ) : (
                            <p className="self-end text-xs text-slate-600 sm:col-span-3">Velg en arbeidskategori for å skille materialer og arbeid, og for å la profilens arbeidsmodell avgjøre hva som er egeninnsats og hva som er innleid.</p>
                          )}
                        </div>
                        {newStyle && (
                          <p className="mt-2 text-xs text-slate-700">
                            Brukt modus: <strong>{e.mode ? WORK_MODE_LABEL[e.mode].toLowerCase() : '–'}</strong>
                            {e.downgraded && <span className="font-medium text-amber-900"> – regulert arbeid regnes som innleid til kompetanse og ansvar er bekreftet (Min kalkyle → Egeninnsats).</span>}
                            {i.priceSource && <span className="text-slate-500"> · Priskilde: {i.priceSource.kind === 'agent' ? 'agent' : i.priceSource.kind === 'prisbank' ? `prisbank${i.priceSource.version ? ` ${i.priceSource.version}` : ''}` : 'deg'}</span>}
                          </p>
                        )}
                      </td>
                    </tr>
                  ),
                ];
              })}
            </tbody>
          </table>
        </div>
        {removedFromBase.length > 0 && (
          <div className="mt-3 rounded-lg border border-dashed border-slate-300 p-3 text-sm">
            <p className="font-medium">Fjernet fra grunnverdien ({removedFromBase.length})</p>
            <ul className="mt-1 space-y-1">
              {removedFromBase.map((bi) => (
                <li key={bi.id} className="flex items-center justify-between gap-2">
                  <span className="text-slate-700">
                    {bi.room ? `${bi.room}: ` : ''}
                    {bi.title}
                  </span>
                  {editable && (
                    <button type="button" className="inline-flex items-center gap-1 text-xs text-pine-800 hover:underline" aria-label={`Legg tilbake ${bi.title}`} onClick={() => setItems((items) => [...items, structuredClone(bi)])}>
                      <RotateCcw className="size-3" aria-hidden /> Legg tilbake
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
        <Button
          size="sm"
          className="mt-3"
          icon={<Plus className="size-4" aria-hidden />}
          disabled={!editable}
          onClick={() =>
            setItems((items) => [...items, { id: uuid(), room: '', title: 'Nytt tiltak', materials: null, electrician: 0, plumber: 0, other: 0, hours: 0, priority: 'anbefalt', included: true }])
          }
        >
          Legg til tiltak
        </Button>
      </Panel>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Panel title="Sum oppussing">
          <dl className="num space-y-1.5 text-sm">
            <div className="flex justify-between">
              <dt>Oppussing før reserve ({draft.renovationMode === 'tiltak' ? `${reno.includedCount} tiltak` : 'rundsum'})</dt>
              <dd className="font-medium">{formatNOK(reno.total, NO_BASIS)}</dd>
            </div>
            <div className="flex justify-between">
              <dt>Reserve ({reserve === null ? 'ikke avklart' : `${reserve} %`})</dt>
              <dd>{formatNOK(b?.reserve ?? null, NO_BASIS)}</dd>
            </div>
            <div className="flex justify-between border-t border-slate-200 pt-1.5 font-semibold">
              <dt>Oppussing inkl. reserve</dt>
              <dd>{formatNOK(b?.RB ?? null, NO_BASIS)}</dd>
            </div>
            <div className="flex justify-between pt-2">
              <dt>Egne timer</dt>
              <dd>{formatHours(reno.hours)}</dd>
            </div>
            <div className="flex justify-between">
              <dt>Fortjeneste per egeninnsatstime</dt>
              <dd>{b?.profitPerOwnHour == null ? (b?.ownHours === 0 ? 'Ingen egne timer' : NO_BASIS) : `${formatNOK(b.profitPerOwnHour)}/t`}</dd>
            </div>
            {b?.minProfitPerOwnHour != null && b.profitPerOwnHour != null && (
              <div className="flex justify-between text-xs text-slate-600">
                <dt>Ditt minimumskrav</dt>
                <dd className={b.meetsHourlyRequirement ? 'text-pine-800' : 'text-amber-900'}>
                  {formatNOK(b.minProfitPerOwnHour)}/t – {b.meetsHourlyRequirement ? 'oppfylt' : 'ikke oppfylt'}
                </dd>
              </div>
            )}
          </dl>
          <p className="mt-2 text-xs text-slate-600">Egen tid er ikke en kostnad og trekkes ikke fra resultatet. Den vises som fortjeneste per time mot kravet ditt.</p>
          {reno.downgradedRegulated.length > 0 && <p className="mt-2 text-xs font-medium text-amber-900">Regulert arbeid er regnet som innleid for: {reno.downgradedRegulated.map((i) => `«${i.title}»`).join(', ')}.</p>}
        </Panel>
        {draft.renovationMode === 'tiltak' && (
          <Panel title="Fordeling på kostnadstype" sub="Materialer og arbeid hver for seg.">
            <BarList
              total={reno.total ?? undefined}
              rows={[
                { label: 'Materialer', value: reno.byCategory.materials },
                { label: 'Innleid arbeid (per kategori)', value: reno.byCategory.hiredLabor },
                { label: 'Elektriker (eldre modell)', value: reno.byCategory.electrician },
                { label: 'Rørlegger (eldre modell)', value: reno.byCategory.plumber },
                { label: 'Andre fag (eldre modell)', value: reno.byCategory.other },
              ]}
            />
            {reno.unknownItems.length > 0 && <p className="mt-2 text-xs text-amber-800">Fordelingen viser bare kjente beløp. {reno.unknownItems.length} tiltak mangler kostnad.</p>}
          </Panel>
        )}
      </div>

      {draft.renovationMode === 'tiltak' && Object.keys(reno.byLabor).length > 0 && (
        <Panel title="Egeninnsats og innleid arbeid per kategori" sub="Fra profilens arbeidsmodell, med dine endringer per tiltak. Maks egeninnsats og regulert arbeid styres under Min kalkyle.">
          <div className="overflow-x-auto">
            <table className="num w-full min-w-[28rem] text-sm">
              <thead className="text-left text-xs text-slate-600">
                <tr>
                  <th className="py-1 font-medium">Kategori</th>
                  <th className="py-1 text-right font-medium">Egne timer</th>
                  <th className="py-1 text-right font-medium">Innleid arbeid</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {LABOR_CATEGORIES.filter((c) => reno.byLabor[c]).map((c) => (
                  <tr key={c}>
                    <th scope="row" className="py-1.5 text-left font-normal">
                      {LABOR_CATEGORY_LABEL[c]}
                      {REGULATED_LABOR.includes(c) && <span className="ml-2 text-[11px] text-amber-800">regulert</span>}
                    </th>
                    <td className="py-1.5 text-right">{formatHours(reno.byLabor[c]!.ownHours)}</td>
                    <td className="py-1.5 text-right">{formatNOK(reno.byLabor[c]!.hiredCost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}
    </div>
  );
}

