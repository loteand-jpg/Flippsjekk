import clsx from 'clsx';
import { ArrowDown, ArrowUp, ArrowUpDown, Columns3, Eye, Gavel, SlidersHorizontal } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import type { QualityGrade, RiskBand } from '../../domain/assessment';
import { QUALITY_LABEL, RISK_BAND_LABEL } from '../../domain/assessment';
import {
  BUYER_TYPE_LABEL,
  BUYER_TYPES,
  PRICE_BASIS_SHORT,
  PROPERTY_TYPE_LABEL,
  PROPERTY_TYPES,
  RECOMMENDATION_LABEL,
  RECOMMENDATIONS,
  SALE_STATUS_LABEL,
  SALE_STATUSES,
  TENURE_LABEL,
  TENURES,
  WORK_STATUS_LABEL,
  WORK_STATUSES,
} from '../../domain/enums';
import { formatDateTime, formatNOK, NO_BASIS, roundBidDown } from '../../lib/format';
import type { SortDirection } from '../../lib/sort';
import { Checkbox, NumberInput } from '../ui/forms';
import { Button, Card } from '../ui/primitives';
import { QualityBadge, RecommendationBadge, RiskBadge, SaleStatusBadge, WorkStatusBadge } from './badges';
import { COLUMNS, DEFAULT_COLUMN_IDS, MoneyCell, RowFlags } from './columns';
import { EMPTY_FILTERS, type ListFilters, type SortKey } from './listLogic';
import type { PropertyRow } from './rowModel';

export function PropertyTable({
  rows,
  columns,
  sort,
  onSort,
}: {
  rows: PropertyRow[];
  columns: string[];
  sort: { key: SortKey; dir: SortDirection };
  onSort: (key: SortKey) => void;
}) {
  const cols = COLUMNS.filter((c) => columns.includes(c.id));
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
      <table className="w-full text-sm">
        <caption className="sr-only">Mine objekter. Økonomi fra primært scenario; klikk kolonneoverskrift for å sortere.</caption>
        <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium text-slate-600">
          <tr>
            {cols.map((c) => {
              const active = c.sortKey && sort.key === c.sortKey;
              return (
                <th
                  key={c.id}
                  scope="col"
                  aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}
                  className={clsx('px-2 py-2.5 leading-tight', c.align === 'right' && 'text-right', c.id === 'address' && 'sticky left-0 z-10 bg-slate-50')}
                  title={c.help}
                >
                  {c.sortKey ? (
                    <button type="button" onClick={() => onSort(c.sortKey!)} className={clsx('inline-flex items-center gap-1 text-left hover:text-ink', c.align === 'right' && 'justify-end text-right', active && 'text-ink')}>
                      {c.label}
                      {active ? sort.dir === 'asc' ? <ArrowUp className="size-3" aria-hidden /> : <ArrowDown className="size-3" aria-hidden /> : <ArrowUpDown className="size-3 opacity-40" aria-hidden />}
                    </button>
                  ) : (
                    c.label
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((r) => (
            <tr key={r.id} className="group hover:bg-pine-50/40">
              {cols.map((c, i) => (
                <td key={c.id} className={clsx('num px-2 py-3 align-top', c.align === 'right' && 'text-right whitespace-nowrap', i === 0 && 'sticky left-0 z-10 bg-white group-hover:bg-pine-50')}>
                  {i === 0 ? (
                    <>
                      <Link to={`/objekter/${r.id}`} className="block rounded focus-visible:outline-2">
                        {c.render(r)}
                      </Link>
                      <RowFlags r={r} />
                    </>
                  ) : (
                    c.render(r)
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function PropertyCards({ rows }: { rows: PropertyRow[] }) {
  return (
    <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {rows.map((r) => (
        <li key={r.id}>
          <Link to={`/objekter/${r.id}`} className="block rounded-xl focus-visible:outline-2">
            <Card className="p-4 transition-shadow hover:shadow-md">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-semibold">{r.address}</p>
                  <p className="text-xs text-slate-600">
                    {[r.district, PROPERTY_TYPE_LABEL[r.propertyType], TENURE_LABEL[r.tenure]].filter(Boolean).join(' · ')}
                    {r.isDemo && <span className="text-violet-800"> · demo</span>}
                  </p>
                </div>
                <RecommendationBadge value={r.recommendation} />
              </div>
              <RowFlags r={r} />
              <dl className="num mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
                <div>
                  <dt className="text-xs text-slate-600">Fortjeneste før skatt</dt>
                  <dd className="font-semibold">
                    <MoneyCell value={r.profit} row={r} />
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-600">Maksbud</dt>
                  <dd className="font-medium">{r.maxBidStatus === 'none' ? <span className="text-xs text-red-800">Ingen gjennomførbar pris</span> : <MoneyCell value={roundBidDown(r.maxBid)} row={r} />}</dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-600">Min kjøpspris</dt>
                  <dd>{formatNOK(r.purchase)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-600">Salgspris ({r.saleBasis ? PRICE_BASIS_SHORT[r.saleBasis] : '–'})</dt>
                  <dd>{formatNOK(r.saleBase, NO_BASIS)}</dd>
                </div>
              </dl>
              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                <RiskBadge score={r.riskScore} band={r.riskBand} unknown={r.riskUnknown} />
                <QualityBadge grade={r.quality} />
                <WorkStatusBadge value={r.workStatus} />
                {r.saleStatus && r.saleStatus !== 'aktiv' && <SaleStatusBadge value={r.saleStatus} />}
              </div>
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
                <span className="inline-flex items-center gap-1">
                  <Eye className="size-3" aria-hidden /> {r.nextViewing ? formatDateTime(r.nextViewing) : 'Ingen kjent visning'}
                </span>
                {r.bidDay && (
                  <span className="inline-flex items-center gap-1">
                    <Gavel className="size-3" aria-hidden /> Buddag (prognose) {formatDateTime(r.bidDay)}
                  </span>
                )}
              </div>
            </Card>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function usePopover() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  return { open, setOpen, ref };
}

export function ColumnPicker({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const { open, setOpen, ref } = usePopover();
  return (
    <div ref={ref} className="relative">
      <Button size="sm" icon={<Columns3 className="size-4" aria-hidden />} aria-expanded={open} onClick={() => setOpen(!open)}>
        Kolonner
      </Button>
      {open && (
        <div className="absolute right-0 z-30 mt-2 max-h-[70vh] w-72 overflow-y-auto rounded-xl border border-slate-200 bg-white p-3 shadow-lg" role="group" aria-label="Synlige kolonner">
          <div className="space-y-2">
            {COLUMNS.map((c) => (
              <Checkbox
                key={c.id}
                label={c.label}
                description={c.help}
                checked={value.includes(c.id)}
                disabled={c.id === 'address'}
                onChange={(on) => onChange(on ? COLUMNS.filter((x) => value.includes(x.id) || x.id === c.id).map((x) => x.id) : value.filter((x) => x !== c.id))}
              />
            ))}
          </div>
          <Button size="sm" variant="ghost" className="mt-3" onClick={() => onChange(DEFAULT_COLUMN_IDS)}>
            Standardkolonner
          </Button>
        </div>
      )}
    </div>
  );
}

function ChipGroup<T extends string>({ label, options, value, onChange }: { label: string; options: { value: T; label: string }[]; value: T[]; onChange: (v: T[]) => void }) {
  return (
    <fieldset>
      <legend className="mb-1.5 text-xs font-medium text-slate-700">{label}</legend>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => {
          const on = value.includes(o.value);
          return (
            <button
              key={o.value}
              type="button"
              aria-pressed={on}
              onClick={() => onChange(on ? value.filter((v) => v !== o.value) : [...value, o.value])}
              className={clsx('rounded-full border px-2.5 py-1 text-xs font-medium', on ? 'border-pine-700 bg-pine-50 text-pine-900' : 'border-slate-300 bg-white text-slate-700 hover:border-slate-400')}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

export function FilterPanel({ filters, onChange, view }: { filters: ListFilters; onChange: (f: ListFilters) => void; view: 'active' | 'archive' }) {
  const set = <K extends keyof ListFilters>(k: K, v: ListFilters[K]) => onChange({ ...filters, [k]: v });
  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
        <SlidersHorizontal className="size-4" aria-hidden /> Filtre
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        <ChipGroup label="Boligtype" options={PROPERTY_TYPES.map((t) => ({ value: t, label: PROPERTY_TYPE_LABEL[t] }))} value={filters.types} onChange={(v) => set('types', v)} />
        <ChipGroup label="Eierform" options={TENURES.map((t) => ({ value: t, label: TENURE_LABEL[t] }))} value={filters.tenures} onChange={(v) => set('tenures', v)} />
        <ChipGroup label="Kjøpertype" options={BUYER_TYPES.map((t) => ({ value: t, label: BUYER_TYPE_LABEL[t] }))} value={filters.buyerTypes} onChange={(v) => set('buyerTypes', v)} />
        <ChipGroup
          label="Risiko"
          options={(['lav', 'middels', 'hoy', 'uavklart'] as RiskBand[]).map((b) => ({ value: b, label: RISK_BAND_LABEL[b] }))}
          value={filters.riskBands}
          onChange={(v) => set('riskBands', v)}
        />
        <ChipGroup
          label="Datakvalitet"
          options={(['hoy', 'middels', 'lav'] as QualityGrade[]).map((q) => ({ value: q, label: QUALITY_LABEL[q] }))}
          value={filters.qualities}
          onChange={(v) => set('qualities', v)}
        />
        <ChipGroup label="Anbefaling" options={RECOMMENDATIONS.map((r) => ({ value: r, label: RECOMMENDATION_LABEL[r] }))} value={filters.recommendations} onChange={(v) => set('recommendations', v)} />
        <ChipGroup label="Min status" options={WORK_STATUSES.map((s) => ({ value: s, label: WORK_STATUS_LABEL[s] }))} value={filters.workStatuses} onChange={(v) => set('workStatuses', v)} />
        <ChipGroup label="Salgsstatus" options={SALE_STATUSES.map((s) => ({ value: s, label: SALE_STATUS_LABEL[s] }))} value={filters.saleStatuses} onChange={(v) => set('saleStatuses', v)} />
        <fieldset>
          <legend className="mb-1.5 text-xs font-medium text-slate-700">Prisantydning (kontant)</legend>
          <div className="grid grid-cols-2 gap-2">
            <NumberInput aria-label="Prisantydning fra" placeholder="Fra" unit="kr" value={filters.priceMin} onChange={(v) => set('priceMin', v)} />
            <NumberInput aria-label="Prisantydning til" placeholder="Til" unit="kr" value={filters.priceMax} onChange={(v) => set('priceMax', v)} />
          </div>
        </fieldset>
        <fieldset>
          <legend className="mb-1.5 text-xs font-medium text-slate-700">Fortjeneste minst</legend>
          <NumberInput aria-label="Fortjeneste minst" placeholder="Alle" unit="kr" value={filters.profitMin} onChange={(v) => set('profitMin', v)} />
          <p className="mt-1 text-[11px] text-slate-500">Objekter uten komplett kalkyle utelates.</p>
        </fieldset>
        <div className="space-y-2">
          <Checkbox label="Bare favoritter" checked={filters.favoritesOnly} onChange={(v) => set('favoritesOnly', v)} />
          {view === 'active' && (
            <Checkbox label="Vis solgte og trukne i aktiv liste" description="Ellers ligger de i arkivet." checked={filters.showClosed} onChange={(v) => set('showClosed', v)} />
          )}
        </div>
      </div>
      <div className="mt-4">
        <Button size="sm" variant="ghost" onClick={() => onChange({ ...EMPTY_FILTERS, query: filters.query })}>
          Fjern filtre
        </Button>
      </div>
    </Card>
  );
}
