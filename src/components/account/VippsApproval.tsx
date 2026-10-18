export const VIPPS_BUTTON = 'bg-[#ff5b24] text-white hover:bg-[#e8501f] disabled:opacity-55';

/** Simulert Vipps-app der brukeren godkjenner eller avviser. I produksjon skjer dette i Vipps-appen. */
export function VippsApprovalCard({ phoneMasked, title, rows, busy, onApprove, onReject }: { phoneMasked: string; title: string; rows: [string, string][]; busy: boolean; onApprove: () => void; onReject: () => void }) {
  return (
    <div className="mx-auto max-w-xs rounded-2xl border-4 border-slate-800 bg-white p-4 shadow-lg" aria-label="Simulert Vipps-app">
      <p className="text-center text-lg font-bold text-[#ff5b24]">vipps</p>
      <p className="mt-2 text-center text-xs text-slate-600">Til {phoneMasked}</p>
      <p className="mt-3 font-semibold">{title}</p>
      <dl className="mt-2 space-y-1 text-xs">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-2">
            <dt className="text-slate-600">{k}</dt>
            <dd className="num font-medium">{v}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-4 grid gap-2">
        <button type="button" className={`h-10 rounded-lg px-4 text-sm font-semibold ${VIPPS_BUTTON}`} disabled={busy} onClick={onApprove}>
          Godkjenn
        </button>
        <button type="button" className="h-10 rounded-lg border border-slate-300 px-4 text-sm font-medium hover:bg-slate-50 disabled:opacity-55" disabled={busy} onClick={onReject}>
          Avvis
        </button>
      </div>
    </div>
  );
}
