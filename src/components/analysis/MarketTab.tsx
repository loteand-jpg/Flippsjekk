import { ExternalLink, Pencil, Plus, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useLiveQuery } from '../../app/hooks';
import { useServices } from '../../app/services';
import { useSession } from '../../app/session';
import { useToast } from '../../app/toast';
import { CASE_LABEL } from '../../calc/engine';
import { PER_M2_BASIS_LABEL, pricePerM2, soldMedians, validateComparable, type ComparableFields, type ComparableIssue } from '../../domain/comparables';
import { COMPARABLE_KIND_LABEL, COMPARABLE_KINDS, type ComparableKind } from '../../domain/enums';
import type { ComparableSale, UserComparable } from '../../domain/schemas';
import { formatArea, formatDateKey, formatNOK, NO_BASIS, UNKNOWN } from '../../lib/format';
import { Field, NumberInput, Select, TextInput, Textarea } from '../ui/forms';
import { Dialog } from '../ui/overlay';
import { Alert, Badge, Button } from '../ui/primitives';
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

export function MarketTab({ ctx }: { ctx: PropertyContext }) {
  const services = useServices();
  const toast = useToast();
  const { entitlements } = useSession();
  const canEdit = entitlements?.canEditScenarios ?? false;
  const { analysis: a, item } = ctx;
  const s = a.estimates.sale;
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
      <Panel title="Salgsverdi etter oppussing" sub={<BasisNote basis={s.basis} />}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {(['low', 'base', 'high'] as const).map((k) => (
            <div key={k} className="rounded-lg border border-slate-200 p-3">
              <p className="text-xs font-medium text-slate-600">{CASE_LABEL[k]} scenario</p>
              <p className="num text-lg font-semibold">{formatNOK(s[k], NO_BASIS)}</p>
              <p className="mt-1 text-xs text-slate-700">{k === 'low' ? s.rationaleLow : k === 'base' ? s.rationaleBase : s.rationaleHigh}</p>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-slate-600">Ingen udokumentert markedsvekst er lagt inn. Verdi av uavklart soverom, utleiedel eller seksjonering er ikke innregnet.</p>
      </Panel>

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
