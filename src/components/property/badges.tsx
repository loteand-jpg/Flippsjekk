import { AlertTriangle, Ban, CheckCircle2, CircleDot, Eye, FlaskConical, Gavel, Hourglass, ShieldAlert, ShieldCheck, UserRound } from 'lucide-react';
import type { ReactNode } from 'react';
import { QUALITY_LABEL, RISK_BAND_LABEL, type QualityGrade, type RiskBand } from '../../domain/assessment';
import {
  FACT_STATUS_LABEL,
  RECOMMENDATION_LABEL,
  SALE_STATUS_LABEL,
  WORK_STATUS_LABEL,
  type FactStatus,
  type Recommendation,
  type SaleStatus,
  type WorkStatus,
} from '../../domain/enums';
import { Badge, type Tone } from '../ui/primitives';

const REC_TONE: Record<Recommendation, Tone> = { interessant: 'green', folg_med: 'blue', avklar_forst: 'amber', avsta: 'neutral' };
const REC_ICON: Record<Recommendation, ReactNode> = {
  interessant: <CheckCircle2 className="size-3" aria-hidden />,
  folg_med: <Eye className="size-3" aria-hidden />,
  avklar_forst: <AlertTriangle className="size-3" aria-hidden />,
  avsta: <Ban className="size-3" aria-hidden />,
};

export function RecommendationBadge({ value }: { value: Recommendation | null }) {
  if (!value) return <Badge tone="outline">Ikke vurdert</Badge>;
  return (
    <Badge tone={REC_TONE[value]} icon={REC_ICON[value]}>
      {RECOMMENDATION_LABEL[value]}
    </Badge>
  );
}

export function RiskBadge({ score, band, unknown }: { score: number | null; band: RiskBand; unknown?: number }) {
  const tone: Tone = band === 'hoy' ? 'red' : band === 'middels' ? 'amber' : band === 'lav' ? 'green' : 'outline';
  return (
    <Badge tone={tone} icon={band === 'uavklart' ? <ShieldAlert className="size-3" aria-hidden /> : undefined} title={unknown ? `${unknown} risiko(er) med ukjent alvorlighet` : undefined}>
      {score === null ? 'Uavklart' : `${score}/10 ${RISK_BAND_LABEL[band].toLowerCase()}`}
      {unknown ? <span className="font-normal"> +{unknown} ukjent</span> : null}
    </Badge>
  );
}

export function QualityBadge({ grade, coverage }: { grade: QualityGrade | null; coverage?: number | null }) {
  if (!grade) return <Badge tone="outline">Mangler grunnlag</Badge>;
  const tone: Tone = grade === 'hoy' ? 'pine' : grade === 'middels' ? 'neutral' : 'amber';
  return (
    <Badge tone={tone} icon={<ShieldCheck className="size-3" aria-hidden />}>
      {QUALITY_LABEL[grade]}
      {coverage != null && <span className="font-normal"> · {Math.round(coverage * 100)} %</span>}
    </Badge>
  );
}

export function SaleStatusBadge({ value, note }: { value: SaleStatus | null; note?: string | null }) {
  if (!value) return <Badge tone="outline">Ikke hentet</Badge>;
  const tone: Tone = value === 'aktiv' ? 'outline' : value === 'solgt' ? 'neutral' : value === 'trukket' ? 'neutral' : 'amber';
  return (
    <Badge tone={tone} title={note ?? undefined} icon={value === 'ukjent' ? <CircleDot className="size-3" aria-hidden /> : undefined}>
      {SALE_STATUS_LABEL[value]}
    </Badge>
  );
}

export function WorkStatusBadge({ value }: { value: WorkStatus }) {
  const tone: Tone = value === 'kjopt' ? 'green' : value === 'avvist' ? 'neutral' : value === 'bud_vurderes' ? 'violet' : 'outline';
  return <Badge tone={tone}>{WORK_STATUS_LABEL[value]}</Badge>;
}

export function DemoBadge({ synthetic }: { synthetic?: boolean }) {
  return (
    <Badge tone="violet" icon={<FlaskConical className="size-3" aria-hidden />}>
      {synthetic ? 'Demodata – ingen annonse hentet' : 'Demodata – fiktivt objekt'}
    </Badge>
  );
}

export function PreliminaryBadge({ reasons }: { reasons: string[] }) {
  if (reasons.length === 0) return null;
  return (
    <Badge tone="amber" icon={<Hourglass className="size-3" aria-hidden />} title={reasons.join(' · ')}>
      Foreløpig
    </Badge>
  );
}

/** Synlig skille mellom dokumentert fakta, analyseanslag, uavklart og brukerens egne endringer. */
export function ProvenanceTag({ status }: { status: FactStatus | 'mine' }) {
  if (status === 'mine')
    return (
      <span className="inline-flex items-center rounded border border-violet-300 bg-violet-50 px-1.5 text-[11px] font-medium text-violet-900">Mitt valg</span>
    );
  const cls =
    status === 'dokumentert'
      ? 'border-slate-300 bg-slate-100 text-slate-800'
      : status === 'anslag'
        ? 'border-dashed border-sky-400 bg-white text-sky-900'
        : 'border-amber-300 bg-amber-50 text-amber-900';
  return <span className={`inline-flex items-center rounded border px-1.5 text-[11px] font-medium ${cls}`}>{FACT_STATUS_LABEL[status]}</span>;
}

export function EventKindTag({ kind }: { kind: 'visning' | 'buddag' | 'privat_visning' | 'importert_visning' }) {
  if (kind === 'buddag')
    return (
      <Badge tone="amber" icon={<Gavel className="size-3" aria-hidden />}>
        Forventet buddag
      </Badge>
    );
  if (kind === 'visning')
    return (
      <Badge tone="blue" icon={<Eye className="size-3" aria-hidden />}>
        Visning
      </Badge>
    );
  return (
    <Badge tone="outline" icon={<UserRound className="size-3" aria-hidden />}>
      {kind === 'privat_visning' ? 'Privat visning' : 'Importert visning'}
    </Badge>
  );
}
