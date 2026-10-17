import clsx from 'clsx';
import { Plus, Trash2 } from 'lucide-react';
import { itemCost } from '../../calc/scenario';
import { PRIORITIES, PRIORITY_LABEL, RENOVATION_LEVEL_LABEL, type Priority } from '../../domain/enums';
import type { RenovationItem } from '../../domain/schemas';
import { formatHours, formatNOK, NO_BASIS } from '../../lib/format';
import { uuid } from '../../lib/ids';
import { NumberInput, ScenarioNumberField, Segmented, Select, Switch, TextInput } from '../ui/forms';
import { Alert, Badge, Button } from '../ui/primitives';
import { BarList } from './charts';
import { Panel, type PropertyContext } from './shared';

const CAT_LABEL = { materials: 'Materialer', electrician: 'Elektriker', plumber: 'Rørlegger', other: 'Andre fag' } as const;

export function RenovationTab({ ctx }: { ctx: PropertyContext }) {
  const { draft, setDraft, editable, analysis } = ctx;
  const options = analysis.estimates.renovationOptions;
  const reno = ctx.result.renovation;
  const b = ctx.result.evaluation.base;
  const setItems = (fn: (items: RenovationItem[]) => RenovationItem[]) => setDraft((d) => ({ ...d, renovationItems: fn(d.renovationItems) }));
  const updateItem = (id: string, patch: Partial<RenovationItem>) => setItems((items) => items.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  const chooseOption = (id: string) => {
    const o = options.find((x) => x.id === id);
    if (!o) return;
    setDraft((d) => ({ ...d, renovationOptionId: o.id, renovationMode: 'tiltak', renovationItems: o.items.map((i) => ({ ...i })), months: o.suggestedMonths ?? d.months, vatIncluded: o.vatIncluded }));
  };
  const reserve = draft.reservePct;
  return (
    <div className="space-y-5">
      <Alert tone="info">
        Oppussingsanslag er grove anslag – ikke pristilbud. Påkrevde utbedringer bør ikke tas ut for å få et lønnsomt scenario. Innhent tilbud før bud der det er mulig.
      </Alert>

      {options.length > 0 && (
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
                  {o.requiresApproval && (
                    <p className="mt-1 text-xs font-medium text-amber-800">Krever godkjenning som ikke er avklart – verdiøkning er ikke innregnet i salgsprisen.</p>
                  )}
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
        title="Oppussing i mitt scenario"
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
        sub="Enten summering av tiltak eller én eksplisitt rundsum – aldri begge samtidig."
      >
        <div className="mb-4 flex flex-wrap items-center gap-4">
          <Switch checked={draft.vatIncluded} disabled={!editable} onChange={(v) => setDraft((d) => ({ ...d, vatIncluded: v }))} label="Anslagene er inkl. mva." />
          <span className="text-xs text-slate-600">Standard er inkl. mva. Ikke anta at mva. kan trekkes fra bare fordi kjøper er AS.</span>
        </div>

        {draft.renovationMode === 'rundsum' ? (
          <div className="grid max-w-xl gap-4 sm:grid-cols-2">
            <ScenarioNumberField label="Oppussing (rundsum, før reserve)" unit="kr" value={draft.renovationLumpSum} onChange={(v) => setDraft((d) => ({ ...d, renovationLumpSum: v }))} disabled={!editable} />
            <ScenarioNumberField label="Egne timer" unit="t" value={draft.lumpSumHours} onChange={(v) => setDraft((d) => ({ ...d, lumpSumHours: v }))} disabled={!editable} />
            <p className="text-xs text-slate-600 sm:col-span-2">Tiltakslisten under beholdes, men summeres ikke mens rundsum er valgt.</p>
          </div>
        ) : null}

        <div className={clsx('overflow-x-auto', draft.renovationMode === 'rundsum' && 'opacity-60')}>
          <table className="num w-full min-w-[56rem] text-sm">
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
                <th className="py-2 pr-2 text-right font-medium">Egne timer</th>
                <th className="py-2 pr-2 font-medium">Prioritet</th>
                <th className="py-2 text-right font-medium">Sum</th>
                <th className="py-2">
                  <span className="sr-only">Fjern</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 align-top">
              {draft.renovationItems.map((i) => {
                const cost = itemCost(i);
                const requiredOff = !i.included && i.priority === 'pakrevd';
                return (
                  <tr key={i.id} className={clsx(!i.included && 'text-slate-500', requiredOff && 'bg-amber-50')}>
                    <td className="py-2 pr-2">
                      <input
                        type="checkbox"
                        className="mt-2 size-4 accent-pine-700"
                        aria-label={`Inkluder ${i.title}`}
                        checked={i.included}
                        disabled={!editable || draft.renovationMode === 'rundsum'}
                        onChange={(e) => updateItem(i.id, { included: e.target.checked })}
                      />
                    </td>
                    <td className="w-28 py-2 pr-2">
                      <TextInput aria-label="Rom" value={i.room} disabled={!editable} onChange={(e) => updateItem(i.id, { room: e.target.value })} />
                    </td>
                    <td className="min-w-[14rem] py-2 pr-2">
                      <TextInput aria-label="Tiltak" value={i.title} disabled={!editable} onChange={(e) => updateItem(i.id, { title: e.target.value })} />
                      {requiredOff && <p className="mt-1 text-xs font-medium text-amber-900">Påkrevd utbedring er tatt ut av kalkylen.</p>}
                    </td>
                    {(['materials', 'electrician', 'plumber', 'other'] as const).map((k) => (
                      <td key={k} className="w-32 py-2 pr-2">
                        <NumberInput aria-label={`${CAT_LABEL[k]} for ${i.title}`} value={i[k]} disabled={!editable} onChange={(v) => updateItem(i.id, { [k]: v })} />
                      </td>
                    ))}
                    <td className="w-24 py-2 pr-2">
                      <NumberInput aria-label={`Egne timer for ${i.title}`} value={i.hours} disabled={!editable} onChange={(v) => updateItem(i.id, { hours: v })} />
                    </td>
                    <td className="w-32 py-2 pr-2">
                      <Select aria-label={`Prioritet for ${i.title}`} value={i.priority} disabled={!editable} onChange={(e) => updateItem(i.id, { priority: e.target.value as Priority })}>
                        {PRIORITIES.map((p) => (
                          <option key={p} value={p}>
                            {PRIORITY_LABEL[p]}
                          </option>
                        ))}
                      </Select>
                    </td>
                    <td className="py-2 pt-4 text-right font-medium whitespace-nowrap">{cost === null ? <span className="text-xs text-amber-800">Ikke avklart</span> : formatNOK(cost)}</td>
                    <td className="py-2 pl-2">
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
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
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
              <dt>Verdi av eget arbeid ({formatNOK(draft.hourValue)}/t)</dt>
              <dd>{formatNOK(b?.ownWorkValue ?? null)}</dd>
            </div>
          </dl>
          <p className="mt-2 text-xs text-slate-600">Eget arbeid verdsettes separat og trekkes ikke fra hovedresultatet.</p>
        </Panel>
        {draft.renovationMode === 'tiltak' && (
          <Panel title="Fordeling på fag">
            <BarList
              total={reno.total ?? undefined}
              rows={[
                { label: 'Materialer', value: reno.byCategory.materials },
                { label: 'Elektriker', value: reno.byCategory.electrician },
                { label: 'Rørlegger', value: reno.byCategory.plumber },
                { label: 'Andre fag', value: reno.byCategory.other },
              ]}
            />
            {reno.unknownItems.length > 0 && <p className="mt-2 text-xs text-amber-800">Fordelingen viser bare kjente beløp. {reno.unknownItems.length} tiltak mangler kostnad.</p>}
          </Panel>
        )}
      </div>
    </div>
  );
}
