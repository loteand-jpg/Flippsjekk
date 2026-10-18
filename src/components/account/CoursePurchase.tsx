import { Smartphone } from 'lucide-react';
import { useState } from 'react';
import { useServices } from '../../app/services';
import { useToast } from '../../app/toast';
import type { CourseOffer } from '../../config/courses';
import { formatNOK } from '../../lib/format';
import type { VippsCoursePending } from '../../services/types';
import { Field, TextInput } from '../ui/forms';
import { Dialog } from '../ui/overlay';
import { Alert, Button } from '../ui/primitives';
import { VIPPS_BUTTON, VippsApprovalCard } from './VippsApproval';

/** Kjøp av kurs: engangsbetaling med Vipps som gir varig tilgang. */
export function CoursePurchaseDialog({ course, open, onClose, onPurchased }: { course: CourseOffer; open: boolean; onClose: () => void; onPurchased?: () => void }) {
  const services = useServices();
  const toast = useToast();
  const [phone, setPhone] = useState('');
  const [pending, setPending] = useState<VippsCoursePending | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const close = () => {
    setPending(null);
    setError(null);
    onClose();
  };
  const guard = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const start = () =>
    guard(async () => {
      const r = await services.courses.startPurchase({ courseId: course.id, phone });
      if (r.kind === 'redirect') window.location.assign(r.url);
      else setPending(r);
    });
  const decide = (outcome: 'approved' | 'rejected') =>
    guard(async () => {
      if (!pending || !services.demo) return;
      const r = await services.demo.vipps.decide(pending.paymentId, outcome);
      if (r.status === 'approved') {
        toast({ tone: 'success', title: 'Kurset er ditt', body: `Betalingen er godkjent i Vipps (simulert). Du har varig tilgang til ${course.title}.` });
        onPurchased?.();
        close();
      } else {
        setPending(null);
        setError('Betalingen ble avvist i Vipps. Du er ikke belastet og har ikke fått tilgang.');
      }
    });

  return (
    <Dialog
      open={open}
      onClose={close}
      title={pending ? 'Godkjenn i Vipps' : `Kjøp ${course.title}`}
      description={pending ? 'Simulert Vipps-app. Ingen ekte betaling gjennomføres.' : 'Engangsbetaling med Vipps. Du kjøper kurset én gang og beholder tilgangen.'}
      footer={
        pending ? (
          <Button onClick={close}>Avbryt</Button>
        ) : (
          <>
            <Button onClick={close}>Avbryt</Button>
            <button type="button" className={`inline-flex h-10 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold ${VIPPS_BUTTON}`} disabled={busy || !phone.trim()} onClick={start}>
              <Smartphone className="size-4" aria-hidden /> Betal {formatNOK(course.price)} med Vipps
            </button>
          </>
        )
      }
    >
      {!pending ? (
        <div className="space-y-4 text-sm">
          <div className="rounded-lg border border-slate-200 p-3">
            <p className="font-semibold">{course.title}</p>
            <p className="num mt-1 text-2xl font-semibold">{formatNOK(course.price)}</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-5 text-slate-700">
              <li>Engangsbeløp – ingen abonnement eller fornyelse</li>
              <li>Varig tilgang når du har kjøpt kurset</li>
              <li>Tilgangen er uavhengig av om du har abonnement</li>
            </ul>
            <p className="mt-2 text-xs text-slate-600">Pris er et eksempel i demoen. Ingen ekte betaling gjennomføres.</p>
          </div>
          <Field label="Mobilnummer i Vipps" hint="Norsk mobilnummer med 8 siffer. Du godkjenner betalingen i Vipps-appen.">
            {(p) => <TextInput {...p} type="tel" inputMode="tel" autoComplete="tel" placeholder="912 34 567" value={phone} onChange={(e) => setPhone(e.target.value)} />}
          </Field>
          {error && <Alert tone="danger">{error}</Alert>}
        </div>
      ) : (
        <div className="space-y-3 text-sm">
          <VippsApprovalCard
            phoneMasked={pending.phoneMasked}
            title="Godkjenn betaling"
            rows={[
              ['Mottaker', 'Flippsjekk'],
              ['Kurs', course.title],
              ['Beløp', `${formatNOK(pending.amount)} (engangs)`],
            ]}
            busy={busy}
            onApprove={() => decide('approved')}
            onReject={() => decide('rejected')}
          />
          {error && <Alert tone="danger">{error}</Alert>}
          <p className="text-xs text-slate-600">I produksjon åpner du Vipps-appen eller sendes til Vipps, og tilgangen aktiveres først når Vipps har bekreftet betalingen til serveren.</p>
        </div>
      )}
    </Dialog>
  );
}
