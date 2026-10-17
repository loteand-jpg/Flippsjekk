import { Plus, RotateCcw, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Field, NumberInput, TextInput } from '../../components/ui/forms';
import { Alert, Button } from '../../components/ui/primitives';
import { formatNOK, UNKNOWN } from '../../lib/format';
import { uuid } from '../../lib/ids';
import { EVIDENCE, EvidenceTag, type EvidenceKind } from '../components';
import { MARKET_CHECKED_AT, MARKET_ROWS, PLANNING_ROWS } from '../marketData';
import { DEFAULT_RISK, useCourse } from '../progress';

export function EvidenceLegend() {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {(Object.keys(EVIDENCE) as EvidenceKind[]).map((k) => (
        <div key={k} className="rounded-xl border border-slate-200 bg-white p-3">
          <EvidenceTag kind={k} />
          <p className="mt-1.5 text-sm text-slate-700">{EVIDENCE[k].help}</p>
        </div>
      ))}
    </div>
  );
}

export function MarketBox() {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4" aria-label="Dagsaktuelt marked">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="font-semibold">Dagsaktuelt marked</h4>
        <span className="text-xs font-medium text-slate-700">Faglig kontrollert: {MARKET_CHECKED_AT}</span>
      </div>
      <p className="text-xs text-slate-600">Per siste tilgjengelige offentlige data. Renter, priser og markedsforhold kan endres.</p>
      <dl className="mt-2 divide-y divide-slate-100 text-sm">
        {MARKET_ROWS.map((r) => (
          <div key={r.label} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 py-2">
            <dt className="text-slate-700">{r.label}</dt>
            <dd className="num flex items-center gap-2 font-semibold">
              {r.value} <EvidenceTag kind="dokumentert" />
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export function PlanningNumbers() {
  return (
    <section className="overflow-x-auto rounded-xl border border-slate-200 bg-white p-4" aria-label="2026-planleggingstall">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="font-semibold">2026-planleggingstall</h4>
        <span className="text-xs font-medium text-slate-700">Faglig kontrollert: {MARKET_CHECKED_AT} · <EvidenceTag kind="analyse" /></span>
      </div>
      <table className="mt-2 w-full min-w-[34rem] text-sm">
        <caption className="sr-only">Grove markedsindikasjoner for oppussingsposter. Ikke pristilbud.</caption>
        <thead className="text-left text-xs text-slate-600">
          <tr>
            <th className="py-1 pr-3 font-medium">Post</th>
            <th className="py-1 pr-3 font-medium">Grov indikasjon</th>
            <th className="py-1 font-medium">Merknad</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 align-top">
          {PLANNING_ROWS.map((r) => (
            <tr key={r.post}>
              <th scope="row" className="py-2 pr-3 text-left font-semibold">
                {r.post}
              </th>
              <td className="num py-2 pr-3">{r.indication}</td>
              <td className="py-2 text-xs text-slate-700">{r.note}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

export function PaakostningEffect() {
  const [amount, setAmount] = useState<number | null>(100_000);
  const [rate, setRate] = useState<number | null>(22);
  const effect = amount !== null && rate !== null ? (amount * rate) / 100 : null;
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4" aria-label="Påkostning og skatteeffekt">
      <h4 className="font-semibold">Prøv selv: hva er en påkostning verdt skattemessig?</h4>
      <div className="mt-2 grid max-w-md grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Påkostning">{(p) => <NumberInput {...p} unit="kr" value={amount} onChange={setAmount} />}</Field>
        <Field label="Illustrativ sats" hint="22 % brukes i kursets eksempel.">{(p) => <NumberInput {...p} unit="%" value={rate} onChange={setRate} />}</Field>
      </div>
      <p className="mt-3 text-sm" aria-live="polite">
        {effect === null ? (
          'Fyll inn begge feltene.'
        ) : (
          <>
            Potensiell skatteeffekt i et forenklet eksempel: <strong className="num">{formatNOK(effect)}</strong>. Du har fortsatt brukt <strong className="num">{formatNOK(amount)}</strong>.
          </>
        )}
      </p>
      <p className="mt-1 text-xs text-slate-600">Forutsetter at beløpet lovlig øker inngangsverdien og at gevinsten ellers er skattepliktig – noe som må avklares.</p>
    </section>
  );
}

export function RiskBudget() {
  const { state, update } = useCourse();
  const rows = state.risk;
  const set = (id: string, patch: Partial<(typeof rows)[number]>) => update((s) => ({ ...s, risk: s.risk.map((r) => (r.id === id ? { ...r, ...patch } : r)) }));
  const likely = rows.reduce((s, r) => s + (r.likely ?? 0), 0);
  const hidden = rows.reduce((s, r) => s + (r.hidden ?? 0), 0);
  const unknownRows = rows.filter((r) => r.likely === null || r.hidden === null).length;
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4" aria-label="Risikobudsjett">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="font-semibold">Ditt risikobudsjett</h4>
        <Button size="sm" variant="ghost" icon={<RotateCcw className="size-4" aria-hidden />} onClick={() => update((s) => ({ ...s, risk: structuredClone(DEFAULT_RISK) }))}>
          Tilbakestill
        </Button>
      </div>
      <p className="text-xs text-slate-600">Eksempel i første rad: bad, sannsynlig kostnad 280 000 kr og mulig skjult tillegg 80 000 kr. Tomt felt = uavklart, ikke 0 kr.</p>
      <div className="mt-3 overflow-x-auto">
        <table className="num w-full min-w-[34rem] text-sm">
          <thead className="text-left text-xs text-slate-600">
            <tr>
              <th className="py-1 pr-2 font-medium">Post</th>
              <th className="py-1 pr-2 font-medium">Kjent/sannsynlig kostnad</th>
              <th className="py-1 pr-2 font-medium">Identifisert risiko (mulig tillegg)</th>
              <th className="py-1">
                <span className="sr-only">Fjern</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 align-top">
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="w-[28%] py-1.5 pr-2">
                  <TextInput aria-label="Post" value={r.label} onChange={(e) => set(r.id, { label: e.target.value })} />
                </td>
                <td className="py-1.5 pr-2">
                  <NumberInput aria-label={`Sannsynlig kostnad ${r.label}`} unit="kr" value={r.likely} onChange={(v) => set(r.id, { likely: v })} />
                </td>
                <td className="py-1.5 pr-2">
                  <NumberInput aria-label={`Mulig skjult tillegg ${r.label}`} unit="kr" value={r.hidden} onChange={(v) => set(r.id, { hidden: v })} />
                </td>
                <td className="py-1.5">
                  <button type="button" className="mt-2 rounded p-1 text-slate-500 hover:bg-red-50 hover:text-red-800" aria-label={`Fjern ${r.label || 'post'}`} onClick={() => update((s) => ({ ...s, risk: s.risk.filter((x) => x.id !== r.id) }))}>
                    <Trash2 className="size-4" aria-hidden />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Button size="sm" className="mt-2" icon={<Plus className="size-4" aria-hidden />} onClick={() => update((s) => ({ ...s, risk: [...s.risk, { id: uuid(), label: '', likely: null, hidden: null }] }))}>
        Legg til post
      </Button>
      <dl className="mt-4 grid grid-cols-1 gap-2 text-sm sm:grid-cols-3">
        <div className="rounded-lg bg-slate-50 p-2">
          <dt className="text-xs text-slate-600">Kjente/sannsynlige kostnader</dt>
          <dd className="num font-semibold">{formatNOK(likely)}</dd>
        </div>
        <div className="rounded-lg bg-slate-50 p-2">
          <dt className="text-xs text-slate-600">Identifisert risiko (tillegg)</dt>
          <dd className="num font-semibold">{formatNOK(hidden)}</dd>
        </div>
        <div className="rounded-lg bg-slate-50 p-2">
          <dt className="text-xs text-slate-600">Samlet bilde</dt>
          <dd className="num font-semibold">{formatNOK(likely + hidden)}</dd>
        </div>
      </dl>
      {unknownRows > 0 && (
        <Alert tone="warning" className="mt-3">
          {unknownRows} post{unknownRows === 1 ? '' : 'er'} har uavklarte felt ({UNKNOWN.toLowerCase()}). Summene er «minst» disse beløpene – uavklart er ikke satt til 0 kroner.
        </Alert>
      )}
    </section>
  );
}

export function SelfSave() {
  const { state } = useCourse();
  const [saved, setSaved] = useState<number | null>(30_000);
  const [hours, setHours] = useState<number | null>(40);
  const per = saved !== null && hours ? saved / hours : null;
  const min = state.hurdle.minHourValue;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm">
          <p className="font-semibold">Eksempel 1 – maling</p>
          <p>Håndverkerkostnad du sparer: 30 000 kr. Din tid: 40 timer.</p>
          <p className="mt-1">
            Besparelse: <strong className="num">750 kr/time</strong>. Interessant.
          </p>
        </div>
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm">
          <p className="font-semibold">Eksempel 2 – komplisert sparkling</p>
          <p>Du bruker 80 timer og resultatet blir dårligere enn en fagmann til 25 000 kr.</p>
          <p className="mt-1">
            Reell «besparelse»: <strong>negativ</strong>.
          </p>
        </div>
      </div>
      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h4 className="font-semibold">Prøv selv: hva er timen din verdt?</h4>
        <div className="mt-2 grid max-w-md grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Håndverkerkostnad du sparer">{(p) => <NumberInput {...p} unit="kr" value={saved} onChange={setSaved} />}</Field>
          <Field label="Din tid">{(p) => <NumberInput {...p} unit="t" value={hours} onChange={setHours} />}</Field>
        </div>
        <p className="mt-3 text-sm" aria-live="polite">
          {per === null ? (
            'Fyll inn begge feltene.'
          ) : (
            <>
              Besparelse: <strong className="num">{formatNOK(per)} per time</strong>
              {min !== null && <> – {per >= min ? 'over' : 'under'} din hurdle på {formatNOK(min)}/time.</>}
            </>
          )}
        </p>
        <p className="mt-1 text-xs text-slate-600">Forutsetter at resultatet holder samme kvalitet som en fagmann. Dårligere kvalitet kan gjøre besparelsen negativ.</p>
      </section>
    </div>
  );
}

export function KitchenPlan() {
  const stroke = '#235444';
  const room = (x: number, y: number, w: number, h: number, label: string, dashed = false) => (
    <g key={label + x + y}>
      <rect x={x} y={y} width={w} height={h} fill={dashed ? '#fff8e6' : '#f1f7f4'} stroke={stroke} strokeWidth={1.5} strokeDasharray={dashed ? '5 3' : undefined} />
      <text x={x + w / 2} y={y + h / 2 + 4} textAnchor="middle" fontSize="11" fill="#13222b">
        {label}
      </text>
    </g>
  );
  return (
    <figure className="rounded-xl border border-slate-200 bg-white p-4">
      <figcaption className="mb-2 font-semibold">Flytte kjøkkenet og lage soverom – før og etter</figcaption>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <p className="mb-1 text-sm font-medium">Før</p>
          <svg viewBox="0 0 240 180" className="w-full" role="img" aria-label="Plantegning før: separat kjøkken, stue, ett soverom og bad/entré.">
            {room(10, 10, 80, 70, 'Kjøkken')}
            {room(10, 80, 80, 90, 'Soverom')}
            {room(90, 10, 140, 90, 'Stue')}
            {room(90, 100, 140, 70, 'Bad/entré')}
          </svg>
          <ul className="mt-1 list-disc pl-5 text-xs text-slate-700">
            <li>separat kjøkken</li>
            <li>stue</li>
            <li>ett soverom</li>
          </ul>
        </div>
        <div>
          <p className="mb-1 text-sm font-medium">Etter</p>
          <svg viewBox="0 0 240 180" className="w-full" role="img" aria-label="Plantegning etter: kjøkken flyttet inn i stuen, gammelt kjøkken er blitt soverom, totalt to soverom.">
            {room(10, 10, 80, 70, 'Soverom 2 (nytt)', true)}
            {room(10, 80, 80, 90, 'Soverom 1')}
            {room(90, 10, 140, 90, '')}
            <text x={160} y={70} textAnchor="middle" fontSize="11" fill="#13222b">
              Stue
            </text>
            <rect x={150} y={14} width={76} height={20} fill="#fff8e6" stroke={stroke} strokeWidth={1.5} strokeDasharray="5 3" />
            <text x={188} y={28} textAnchor="middle" fontSize="10" fill="#13222b">
              Kjøkken (flyttet)
            </text>
            {room(90, 100, 140, 70, 'Bad/entré')}
          </svg>
          <ul className="mt-1 list-disc pl-5 text-xs text-slate-700">
            <li>kjøkken flyttet inn i stue</li>
            <li>gammelt kjøkken blir soverom</li>
            <li>totalt to soverom</li>
          </ul>
        </div>
      </div>
      <p className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
        <strong>Potensiell verdiøkning – men bare dersom løsningen er teknisk og juridisk gjennomførbar.</strong> Stiplede rom og kjøkken er det som er nytt i planen.
      </p>
    </figure>
  );
}
