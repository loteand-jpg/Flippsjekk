import { CalendarPlus, Eye, Gavel, Trash2, UserRound } from 'lucide-react';
import { useState } from 'react';
import { useServices } from '../../app/services';
import { useToast } from '../../app/toast';
import { MAX_BID_LIMIT_LABEL, recommendedBidOf } from '../../calc/engine';
import { capFirst, formatDateKey, formatDateKeyLong, formatDateTime, formatNOK, formatRelative, formatTime } from '../../lib/format';
import { addDaysToKey, isoToOsloInput, localDateKey, osloInputToIso } from '../../lib/time';
import { Field, TextInput } from '../ui/forms';
import { Alert, Badge, Button } from '../ui/primitives';
import { Panel, type PropertyContext } from './shared';

export function ViewingsTab({ ctx }: { ctx: PropertyContext }) {
  const services = useServices();
  const toast = useToast();
  const { item, analysis, editable } = ctx;
  const pid = item.property.id;
  const prog = item.bidDay;
  const override = item.bidOverride;
  const [ovStart, setOvStart] = useState(override ? isoToOsloInput(override.start) : prog ? isoToOsloInput(prog.start) : '');
  const [ovNote, setOvNote] = useState(override?.note ?? '');
  const tomorrow = addDaysToKey(localDateKey(ctx.now), 1);
  const [pv, setPv] = useState({ start: `${tomorrow}T17:00`, end: `${tomorrow}T17:45`, note: '' });
  const [busy, setBusy] = useState<string | null>(null);
  const ev = ctx.result.evaluation;
  const bid = recommendedBidOf(ev);

  const act = async (key: string, fn: () => Promise<unknown>, ok: string) => {
    setBusy(key);
    try {
      await fn();
      toast({ tone: 'success', title: ok });
    } catch (e) {
      toast({ tone: 'danger', title: 'Kunne ikke lagre', body: (e as Error).message });
    } finally {
      setBusy(null);
    }
  };

  const official = [...item.viewings].sort((a, b) => a.start.localeCompare(b.start));
  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
      <div className="space-y-5">
        <Panel title="Annonserte visninger" sub={item.snapshot ? `Sist kontrollert ${formatRelative(item.snapshot.observedAt, ctx.now)}` : undefined}>
          {official.length === 0 ? (
            <p className="text-sm text-slate-700">Ingen annonsert fellesvisning er kjent. Uten kjent offisiell visning lages ingen automatisk buddag.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {official.map((v) => {
                const past = Date.parse(v.end ?? v.start) < ctx.now.getTime();
                return (
                  <li key={v.id} className="flex items-start justify-between gap-3 py-2.5 text-sm">
                    <div className="flex gap-2">
                      <Eye className="mt-0.5 size-4 text-sky-700" aria-hidden />
                      <div>
                        <p className={v.status === 'avlyst' ? 'font-medium text-slate-500 line-through' : 'font-medium'}>
                          {formatDateTime(v.start)}
                          {v.end && `–${formatTime(v.end)}`}
                        </p>
                        <p className="text-xs text-slate-600">
                          {v.sourceLabel} · verifisert {formatRelative(v.verifiedAt, ctx.now)}
                          {v.note && ` · ${v.note}`}
                        </p>
                      </div>
                    </div>
                    {v.status === 'avlyst' ? <Badge tone="neutral">Avlyst</Badge> : past ? <Badge tone="outline">Passert</Badge> : <Badge tone="blue">Visning</Badge>}
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>

        <Panel title="Mine private visninger" sub="Private avtaler endrer ikke den forventede buddagen.">
          {item.privateEvents.length > 0 && (
            <ul className="mb-3 divide-y divide-slate-100">
              {item.privateEvents.map((e) => (
                <li key={e.id} className="flex items-start justify-between gap-3 py-2 text-sm">
                  <div className="flex gap-2">
                    <UserRound className="mt-0.5 size-4 text-slate-600" aria-hidden />
                    <div>
                      <p className="font-medium">
                        {formatDateTime(e.start)}
                        {e.end && `–${formatTime(e.end)}`}
                      </p>
                      <p className="text-xs text-slate-600">
                        {e.kind === 'imported_viewing' ? (e.confirmed ? 'Importert (markert bekreftet)' : 'Importert – ikke bekreftet') : 'Privat avtale'}
                        {e.note && ` · ${e.note}`}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="rounded p-1 text-slate-500 hover:bg-red-50 hover:text-red-800"
                    aria-label="Fjern privat visning"
                    onClick={() => act(`rm-${e.id}`, () => services.calendar.removePrivateEvent(e.id), 'Privat visning fjernet')}
                  >
                    <Trash2 className="size-4" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <form
            className="grid grid-cols-1 gap-3 sm:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault();
              const start = osloInputToIso(pv.start);
              const end = pv.end ? osloInputToIso(pv.end) : null;
              if (!start) return toast({ tone: 'warning', title: 'Velg starttidspunkt' });
              void act('add-pv', () => services.calendar.addPrivateViewing(pid, { start, end, note: pv.note }), 'Privat visning lagt til');
            }}
          >
            <Field label="Start (norsk tid)">{(p) => <TextInput {...p} type="datetime-local" value={pv.start} onChange={(e) => setPv({ ...pv, start: e.target.value })} />}</Field>
            <Field label="Slutt (norsk tid)">{(p) => <TextInput {...p} type="datetime-local" value={pv.end} onChange={(e) => setPv({ ...pv, end: e.target.value })} />}</Field>
            <Field label="Notat" className="sm:col-span-2">
              {(p) => <TextInput {...p} value={pv.note} placeholder="F.eks. avtalt med megler" onChange={(e) => setPv({ ...pv, note: e.target.value })} />}
            </Field>
            <div className="sm:col-span-2">
              <Button type="submit" size="sm" icon={<CalendarPlus className="size-4" aria-hidden />} loading={busy === 'add-pv'}>
                Legg til privat visning
              </Button>
            </div>
          </form>
        </Panel>
      </div>

      <div className="space-y-5">
        <Panel
          title={
            <span className="inline-flex items-center gap-2">
              <Gavel className="size-4 text-amber-700" aria-hidden /> Forventet buddag
            </span>
          }
          sub="Planleggingsprognose: kl. 12:00 dagen etter siste kjente, ikke avlyste annonserte visning. Ikke en bekreftet budstart eller juridisk akseptfrist."
        >
          {prog ? (
            <div className="space-y-2 text-sm">
              <p className="text-base font-semibold">
                {capFirst(formatDateKeyLong(prog.dateKey))} kl. 12:00 <Badge tone="amber">Prognose</Badge>
              </p>
              <p className="text-slate-700">Basert på visningen {formatDateTime(prog.basedOnViewingStart)} (kilde verifisert {formatRelative(prog.basedOnVerifiedAt, ctx.now)}).</p>
              {prog.nonBusinessDay && (
                <Alert tone="warning" title={`Dagen etter visning er ${prog.nonBusinessDay}`}>
                  Kontroller budfristen med megler. Første virkedag etter siste visning er {formatDateKey(prog.firstBusinessDayAfterViewing)}. I forbrukerforhold gjelder reglene om tidligste akseptfrist ut fra første virkedag etter siste annonserte visning.
                </Alert>
              )}
            </div>
          ) : (
            <p className="text-sm text-slate-700">Ingen prognose: det finnes ingen kjent, ikke avlyst offisiell visning.</p>
          )}

          <div className="mt-4 border-t border-slate-100 pt-4">
            <p className="text-sm font-medium">Privat overstyring</p>
            {override && (
              <Alert tone="info" className="mt-2" title={`Din overstyring: ${formatDateTime(override.start)}`}>
                <p>{override.note || 'Uten notat.'}</p>
                <p className="text-xs">
                  {override.origin === 'import_v1' ? 'Fra import – ikke kildebekreftet. ' : ''}Kildeprognose da du overstyrte: {override.derivedStartAtOverride ? formatDateTime(override.derivedStartAtOverride) : 'ingen'}. Nå:{' '}
                  {prog ? formatDateTime(prog.start) : 'ingen'}.
                </p>
              </Alert>
            )}
            <form
              className="mt-2 grid gap-3 sm:grid-cols-2"
              onSubmit={(e) => {
                e.preventDefault();
                const start = osloInputToIso(ovStart);
                if (!start) return toast({ tone: 'warning', title: 'Velg tidspunkt' });
                void act('ov', () => services.calendar.setPersonalOverride(pid, { start, note: ovNote }), 'Privat overstyring lagret');
              }}
            >
              <Field label="Mitt tidspunkt (norsk tid)">{(p) => <TextInput {...p} type="datetime-local" value={ovStart} onChange={(e) => setOvStart(e.target.value)} />}</Field>
              <Field label="Begrunnelse">{(p) => <TextInput {...p} value={ovNote} placeholder="F.eks. bekreftet av megler" onChange={(e) => setOvNote(e.target.value)} />}</Field>
              <div className="flex flex-wrap gap-2 sm:col-span-2">
                <Button type="submit" size="sm" loading={busy === 'ov'} disabled={!editable}>
                  Lagre overstyring
                </Button>
                {override && (
                  <Button size="sm" variant="ghost" loading={busy === 'ov-rm'} onClick={() => act('ov-rm', () => services.calendar.setPersonalOverride(pid, null), 'Overstyring fjernet')}>
                    Fjern overstyring
                  </Button>
                )}
              </div>
            </form>
          </div>
        </Panel>

        <Panel title="Budstrategi" sub="Betingelser fra grunnanalysen og tall fra ditt scenario.">
          <dl className="num mb-3 grid grid-cols-2 gap-2 text-sm">
            <div className="rounded-lg bg-slate-50 p-2">
              <dt className="text-xs text-slate-600">Modellert maksbud</dt>
              <dd className="font-semibold">{bid.price !== null ? formatNOK(bid.price) : bid.status === 'none' ? 'Ingen løsning' : 'Mangler grunnlag'}</dd>
              {bid.limitedBy && <dd className="text-[11px] text-slate-600">Begrenset av {MAX_BID_LIMIT_LABEL[bid.limitedBy].toLowerCase()}</dd>}
            </div>
            <div className="rounded-lg bg-slate-50 p-2">
              <dt className="text-xs text-slate-600">Min smertegrense</dt>
              <dd className="font-semibold">{formatNOK(ctx.draft.walkAway, 'Ikke satt')}</dd>
            </div>
            <div className="rounded-lg bg-slate-50 p-2">
              <dt className="text-xs text-slate-600">Mitt startbud</dt>
              <dd className="font-semibold">{formatNOK(ctx.draft.startBid, 'Ikke satt')}</dd>
            </div>
            <div className="rounded-lg bg-slate-50 p-2">
              <dt className="text-xs text-slate-600">Maksbud ved lavt salg</dt>
              <dd className="font-semibold">{ev.maxBidLow?.price != null ? formatNOK(ev.maxBidLow.price) : '–'}</dd>
            </div>
          </dl>
          {ctx.draft.walkAway !== null && bid.price !== null && ctx.draft.walkAway > bid.price && (
            <Alert tone="warning" className="mb-3">
              Smertegrensen er høyere enn modellert maksbud.
            </Alert>
          )}
          <ol className="space-y-2 text-sm">
            {analysis.bidSteps.map((s, i) => (
              <li key={s.title + i} className="rounded-lg border border-slate-200 p-3">
                <p className="font-medium">
                  {i + 1}. {s.title}
                </p>
                {s.detail && <p className="text-slate-700">{s.detail}</p>}
                {s.condition && <p className="mt-1 text-xs text-amber-900">Betingelse: {s.condition}</p>}
              </li>
            ))}
          </ol>
          <p className="mt-3 text-xs text-slate-600">Et modellert maksbud er ikke en budfullmakt eller garanti. Gå aldri over din egen smertegrense.</p>
        </Panel>
      </div>
    </div>
  );
}
