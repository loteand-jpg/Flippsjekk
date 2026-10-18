import { Smartphone } from 'lucide-react';
import { useState } from 'react';
import { useServices } from '../../app/services';
import { useSession } from '../../app/session';
import { useToast } from '../../app/toast';
import { PRIMARY_PLAN } from '../../config/plans';
import { formatDate, formatNOK } from '../../lib/format';
import type { VippsPending } from '../../services/types';
import { Field, Segmented, TextInput } from '../ui/forms';
import { Dialog } from '../ui/overlay';
import { Alert, Button } from '../ui/primitives';
import { VIPPS_BUTTON, VippsApprovalCard } from './VippsApproval';


/** Abonnement betales med Vipps: velg intervall, oppgi mobilnummer og godkjenn avtalen i Vipps. */
export function VippsCheckout({ open, onClose }: { open: boolean; onClose: () => void }) {
  const services = useServices();
  const { subscription, refresh } = useSession();
  const toast = useToast();
  const plan = PRIMARY_PLAN;
  const [interval, setBillingInterval] = useState<'month' | 'year'>('month');
  const [phone, setPhone] = useState('');
  const [pending, setPending] = useState<VippsPending | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const trial = !subscription && plan.trialDays > 0;
  const price = interval === 'month' ? plan.priceMonthly : plan.priceYearly;
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
      const r = await services.subscription.startCheckout({ planId: plan.id, interval, phone });
      if (r.kind === 'redirect') {
        window.location.assign(r.url);
        return;
      }
      setPending(r);
    });
  const decide = (outcome: 'approved' | 'rejected') =>
    guard(async () => {
      if (!pending || !services.demo) return;
      const r = await services.demo.vipps.decide(pending.agreementId, outcome);
      await refresh();
      if (r.status === 'approved') {
        toast({ tone: 'success', title: trial ? 'Prøveperioden er startet' : 'Abonnementet er aktivert', body: 'Betalingsavtalen er godkjent i Vipps (simulert).' });
        close();
      } else {
        setPending(null);
        setError('Avtalen ble avvist i Vipps. Du er ikke belastet og har ikke fått abonnement.');
      }
    });

  return (
    <Dialog
      open={open}
      onClose={close}
      title={pending ? 'Godkjenn i Vipps' : 'Start abonnement med Vipps'}
      description={pending ? 'Simulert Vipps-app. Ingen ekte betaling gjennomføres.' : 'Du betaler med Vipps. Ingen kortopplysninger samles inn.'}
      footer={
        pending ? (
          <Button onClick={close}>Avbryt</Button>
        ) : (
          <>
            <Button onClick={close}>Avbryt</Button>
            <button type="button" className={`inline-flex h-10 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold ${VIPPS_BUTTON}`} disabled={busy || !phone.trim()} onClick={start}>
              <Smartphone className="size-4" aria-hidden /> Fortsett med Vipps
            </button>
          </>
        )
      }
    >
      {!pending ? (
        <div className="space-y-4 text-sm">
          <Segmented
            label="Betalingsintervall"
            value={interval}
            onChange={setBillingInterval}
            options={[
              { value: 'month', label: 'Månedlig' },
              { value: 'year', label: 'Årlig' },
            ]}
          />
          <div className="rounded-lg border border-slate-200 p-3">
            <p className="font-semibold">{plan.name}</p>
            {trial ? (
              <>
                <p className="mt-1 text-amber-900">{plan.campaign}</p>
                <p className="num mt-1">
                  <strong>0 kr</strong> første {plan.trialDays} dager, deretter <strong>{formatNOK(price)}</strong> per {interval === 'month' ? 'måned' : 'år'}.
                </p>
              </>
            ) : (
              <p className="num mt-1">
                <strong>{formatNOK(price)}</strong> per {interval === 'month' ? 'måned' : 'år'}.
              </p>
            )}
            <p className="mt-1 text-xs text-slate-600">Du kan si opp når som helst i Vipps eller her. Pris og kampanje er eksempelverdier i demoen.</p>
          </div>
          <Field label="Mobilnummer i Vipps" hint="Norsk mobilnummer med 8 siffer. Du godkjenner avtalen i Vipps-appen.">
            {(p) => <TextInput {...p} type="tel" inputMode="tel" autoComplete="tel" placeholder="912 34 567" value={phone} onChange={(e) => setPhone(e.target.value)} />}
          </Field>
          {error && <Alert tone="danger">{error}</Alert>}
        </div>
      ) : (
        <div className="space-y-3 text-sm">
          <VippsApprovalCard
            phoneMasked={pending.phoneMasked}
            title="Godkjenn betalingsavtale"
            rows={[
              ['Mottaker', 'Flippsjekk'],
              ['Beløp', `${formatNOK(pending.amount)} / ${pending.interval === 'month' ? 'måned' : 'år'}`],
              ['Første trekk', formatDate(pending.firstChargeAt)],
            ]}
            busy={busy}
            onApprove={() => decide('approved')}
            onReject={() => decide('rejected')}
          />
          {error && <Alert tone="danger">{error}</Alert>}
          <p className="text-xs text-slate-600">I produksjon åpner du Vipps-appen eller sendes til Vipps, og tilgangen aktiveres først når Vipps har bekreftet avtalen til serveren.</p>
        </div>
      )}
    </Dialog>
  );
}
