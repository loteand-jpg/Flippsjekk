import { Check, CreditCard, Download, FileJson, LogOut, Save } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { useLiveQuery } from '../app/hooks';
import { useServices } from '../app/services';
import { useSession } from '../app/session';
import { useToast } from '../app/toast';
import { Field, NumberInput, Select, TextInput } from '../components/ui/forms';
import { VippsCheckout } from '../components/account/VippsCheckout';
import { Dialog } from '../components/ui/overlay';
import { Alert, Badge, Button, buttonClass, Card, SectionTitle } from '../components/ui/primitives';
import { PRIMARY_PLAN } from '../config/plans';
import { BUYER_TYPE_LABEL, SUBSCRIPTION_STATUS_LABEL, USAGE_KIND_LABEL, type BuyerType } from '../domain/enums';
import type { ProfileDefaults } from '../domain/schemas';
import { formatDate, formatDateTime, formatNOK } from '../lib/format';

function downloadText(filename: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function UsageBar({ used, limit, label }: { used: number; limit: number; label: string }) {
  const pct = limit > 0 ? Math.min(100, (used / limit) * 100) : 0;
  return (
    <div>
      <div className="flex justify-between text-sm">
        <span>{label}</span>
        <span className="num font-medium">
          {used} av {limit}
        </span>
      </div>
      <div className="mt-1 h-2 rounded-full bg-slate-100" role="img" aria-label={`${label}: ${used} av ${limit}`}>
        <div className={`h-2 rounded-full ${pct >= 100 ? 'bg-red-700' : 'bg-[var(--color-series-1)]'}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function AccountPage() {
  const services = useServices();
  const { session, profile, subscription, entitlements } = useSession();
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const welcome = (location.state as { welcome?: boolean } | null)?.welcome;
  const usage = useLiveQuery(() => services.subscription.listUsage(), []);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [portalOpen, setPortalOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [name, setName] = useState(profile?.displayName ?? '');
  const [defaults, setDefaults] = useState<ProfileDefaults | null>(profile?.defaults ?? null);
  useEffect(() => {
    setName(profile?.displayName ?? '');
    setDefaults(profile?.defaults ?? null);
  }, [profile]);

  const run = async (key: string, fn: () => Promise<unknown>, ok?: string) => {
    setBusy(key);
    try {
      await fn();
      if (ok) toast({ tone: 'success', title: ok });
      return true;
    } catch (e) {
      toast({ tone: 'danger', title: 'Handlingen feilet', body: (e as Error).message });
      return false;
    } finally {
      setBusy(null);
    }
  };

  const openPortal = async () => {
    const r = await services.subscription.openCustomerPortal();
    if (r.kind === 'redirect') window.location.assign(r.url);
    else setPortalOpen(true);
  };

  const hasActive = entitlements?.access === 'full';
  const ended = subscription && !hasActive;
  const setD = <K extends keyof ProfileDefaults>(k: K, v: ProfileDefaults[K]) => setDefaults((d) => (d ? { ...d, [k]: v } : d));
  const defaultsDirty = defaults && profile && JSON.stringify(defaults) !== JSON.stringify(profile.defaults);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Konto</h1>
      {welcome && (
        <Alert tone="success" title="Kontoen er opprettet">
          Start abonnementet med Vipps for å analysere boliger.
        </Alert>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <Card className="p-5">
          <SectionTitle sub="Betales med Vipps. Simulert i demoen – ingen betaling behandles.">Abonnement</SectionTitle>
          {subscription ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-lg font-semibold">{entitlements?.plan?.name ?? subscription.planId}</p>
                <Badge tone={hasActive ? 'green' : subscription.status === 'past_due' ? 'amber' : 'neutral'}>
                  {entitlements?.reason === 'canceling' ? 'Oppsagt – aktiv ut perioden' : entitlements?.reason === 'expired' ? 'Utløpt' : SUBSCRIPTION_STATUS_LABEL[subscription.status]}
                </Badge>
                <Badge tone="outline">{subscription.interval === 'year' ? 'Årlig' : 'Månedlig'}</Badge>
              </div>
              <dl className="grid gap-2 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-slate-600">Betalingsmåte</dt>
                  <dd className="font-medium">{subscription.provider === 'vipps' ? 'Vipps' : 'Simulert'}</dd>
                </div>
                <div>
                  <dt className="text-slate-600">Gjeldende periode</dt>
                  <dd className="font-medium">
                    {formatDate(subscription.currentPeriodStart)} – {formatDate(subscription.currentPeriodEnd)}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-600">{subscription.cancelAtPeriodEnd ? 'Avsluttes' : hasActive ? 'Fornyes' : 'Tilgang'}</dt>
                  <dd className="font-medium">
                    {hasActive ? formatDate(subscription.currentPeriodEnd) : subscription.status === 'past_due' ? 'Lesemodus til betaling er ordnet' : 'Lesemodus'}
                  </dd>
                </div>
              </dl>
              {entitlements && entitlements.limits.newAnalyses > 0 && (
                <div className="space-y-3">
                  <UsageBar label="Nye analyser" used={entitlements.used.newAnalyses + entitlements.used.pendingNewAnalyses} limit={entitlements.limits.newAnalyses} />
                  <UsageBar label="Oppfriskinger av annonse" used={entitlements.used.refreshes} limit={entitlements.limits.refreshes} />
                  <p className="text-xs text-slate-600">
                    Gjenbruk av eksisterende analyser denne perioden: {entitlements.used.reuses} (belastes ikke). Endringer i egne scenarioer belastes aldri.
                  </p>
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                <Button variant="primary" icon={<CreditCard className="size-4" aria-hidden />} onClick={openPortal}>
                  Administrer abonnement
                </Button>
                {ended && subscription.status !== 'past_due' && <Button onClick={() => setCheckoutOpen(true)}>Start nytt abonnement</Button>}
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-slate-700">Du har ikke et abonnement. Du kan fortsatt administrere kontoen og se lagrede data.</p>
              <Button variant="primary" onClick={() => setCheckoutOpen(true)}>
                Velg abonnement
              </Button>
            </div>
          )}
          <section className="mt-5 border-t border-slate-100 pt-4" aria-labelledby="plan-innhold">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 id="plan-innhold" className="font-semibold">
                Dette får du med {PRIMARY_PLAN.name}
              </h3>
              <Badge tone="violet">Eksempelpris i demo</Badge>
            </div>
            <p className="mt-1 text-sm text-slate-600">{PRIMARY_PLAN.tagline}</p>
            <p className="mt-2 text-sm">
              <span className="num text-2xl font-semibold">{formatNOK(PRIMARY_PLAN.priceMonthly)}</span>
              <span className="text-slate-600"> / måned</span>
              <span className="mx-2 text-slate-400" aria-hidden>
                ·
              </span>
              <span className="num font-semibold">{formatNOK(PRIMARY_PLAN.priceYearly)}</span>
              <span className="text-slate-600"> / år (tilsvarer {formatNOK(PRIMARY_PLAN.priceMonthly * 12 - PRIMARY_PLAN.priceYearly)} lavere enn tolv måneder)</span>
            </p>
            <ul className="mt-3 space-y-1.5 text-sm">
              <li className="flex gap-2">
                <Check className="mt-0.5 size-4 shrink-0 text-pine-700" aria-hidden />
                <span>
                  <strong>{PRIMARY_PLAN.limits.newAnalysesPerPeriod} nye analyser</strong> per periode. Gjenbruk av en eksisterende analyse belastes ikke.
                </span>
              </li>
              <li className="flex gap-2">
                <Check className="mt-0.5 size-4 shrink-0 text-pine-700" aria-hidden />
                <span>{PRIMARY_PLAN.limits.refreshesPerPeriod} oppfriskinger av pris, visninger og salgsstatus per periode.</span>
              </li>
              {PRIMARY_PLAN.features.map((f) => (
                <li key={f} className="flex gap-2">
                  <Check className="mt-0.5 size-4 shrink-0 text-pine-700" aria-hidden />
                  <span>{f}</span>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-slate-600">Pris og grenser er eksempelverdier i demoen – ingen kommersiell pris er besluttet.</p>
          </section>
          <p className="mt-4 text-xs text-slate-500">
            I produksjon opprettes Vipps-avtalen av serveren, og tilgang oppdateres først når en signert bekreftelse fra Vipps er mottatt – ikke ved retur fra Vipps.
          </p>
        </Card>

        <Card className="p-5">
          <SectionTitle>Profil</SectionTitle>
          <div className="space-y-3">
            <Field label="Navn">{(p) => <TextInput {...p} value={name} onChange={(e) => setName(e.target.value)} />}</Field>
            <p className="text-sm text-slate-600">E-post: {session?.user.email}</p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" disabled={name === profile?.displayName} loading={busy === 'name'} onClick={() => run('name', () => services.profile.update({ displayName: name }), 'Navnet er lagret')}>
                Lagre navn
              </Button>
              <Button
                size="sm"
                icon={<LogOut className="size-4" aria-hidden />}
                onClick={async () => {
                  await services.auth.signOut();
                  navigate('/');
                }}
              >
                Logg ut
              </Button>
            </div>
          </div>
          <div className="mt-5 border-t border-slate-100 pt-4">
            <p className="text-sm font-semibold">Dine data</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button
                size="sm"
                icon={<Download className="size-4" aria-hidden />}
                onClick={async () => {
                  const f = await services.imports.exportScenarios();
                  downloadText(f.filename, f.content, 'application/json');
                }}
              >
                Eksporter scenarioer (JSON)
              </Button>
              <Link to="/import" className={buttonClass('secondary', 'sm')}>
                <FileJson className="size-4" aria-hidden /> Importer v1-fil
              </Link>
            </div>
          </div>
        </Card>
      </div>

      {defaults && (
        <Card className="p-5">
          <SectionTitle sub="Eksempelforutsetninger fra tidligere arbeid. De er redigerbare antakelser – ikke verifiserte markedsvilkår eller finansieringstilbud. Endringer gjelder nye scenarioer; lagrede scenarioer endres ikke.">
            Standardforutsetninger
          </SectionTitle>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {(['buyerTypeApartment', 'buyerTypeHouse'] as const).map((k) => (
              <Field key={k} label={k === 'buyerTypeApartment' ? 'Kjøpertype for leiligheter' : 'Kjøpertype for hus'} hint="Profilstandard – kan endres per scenario.">
                {(p) => (
                  <Select {...p} value={defaults[k]} onChange={(e) => setD(k, e.target.value as BuyerType)}>
                    <option value="privat">{BUYER_TYPE_LABEL.privat}</option>
                    <option value="as">{BUYER_TYPE_LABEL.as}</option>
                  </Select>
                )}
              </Field>
            ))}
            <Field label="Prosjektvarighet">{(p) => <NumberInput {...p} unit="mnd" decimals={1} value={defaults.months} onChange={(v) => v !== null && setD('months', v)} />}</Field>
            <Field label="Rente">{(p) => <NumberInput {...p} unit="%" decimals={2} value={defaults.interestPct} onChange={(v) => v !== null && setD('interestPct', v)} />}</Field>
            <Field label="Låneandel">{(p) => <NumberInput {...p} unit="%" value={defaults.financingPct} onChange={(v) => v !== null && setD('financingPct', v)} />}</Field>
            <Field label="Oppussingsreserve">{(p) => <NumberInput {...p} unit="%" value={defaults.reservePct} onChange={(v) => v !== null && setD('reservePct', v)} />}</Field>
            <Field label="Timeverdi eget arbeid">{(p) => <NumberInput {...p} unit="kr/t" value={defaults.hourValue} onChange={(v) => v !== null && setD('hourValue', v)} />}</Field>
            <Field label="Fortjenestemål">{(p) => <NumberInput {...p} unit="kr" value={defaults.profitTarget} onChange={(v) => v !== null && setD('profitTarget', v)} />}</Field>
            <Field label="Faste salgskostnader">{(p) => <NumberInput {...p} unit="kr" value={defaults.saleFixedCost} onChange={(v) => v !== null && setD('saleFixedCost', v)} />}</Field>
            <Field label="Meglerprovisjon">{(p) => <NumberInput {...p} unit="%" decimals={2} value={defaults.saleCommissionPct} onChange={(v) => v !== null && setD('saleCommissionPct', v)} />}</Field>
            <Field label="Øvrige kjøpsgebyrer">{(p) => <NumberInput {...p} unit="kr" value={defaults.buyFees} onChange={(v) => v !== null && setD('buyFees', v)} />}</Field>
            <Field label="Hjemområde">{(p) => <TextInput {...p} value={defaults.homeArea} onChange={(e) => setD('homeArea', e.target.value)} />}</Field>
          </div>
          <div className="mt-4 flex gap-2">
            <Button variant="primary" icon={<Save className="size-4" aria-hidden />} disabled={!defaultsDirty} loading={busy === 'defaults'} onClick={() => run('defaults', () => services.profile.update({ defaults }), 'Forutsetningene er lagret')}>
              Lagre forutsetninger
            </Button>
            {defaultsDirty && <Button onClick={() => setDefaults(profile!.defaults)}>Angre</Button>}
          </div>
        </Card>
      )}

      <Card className="p-5">
        <SectionTitle sub="Separate hendelser for ny analyse, oppfrisking og gjenbruk. Hver hendelse har en idempotensnøkkel, så samme handling telles aldri to ganger.">Forbrukshistorikk</SectionTitle>
        {(usage.data ?? []).length === 0 ? (
          <p className="text-sm text-slate-600">Ingen registrert bruk.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[32rem] text-sm">
              <thead className="text-left text-xs text-slate-600">
                <tr>
                  <th className="py-1.5 font-medium">Tidspunkt</th>
                  <th className="py-1.5 font-medium">Type</th>
                  <th className="py-1.5 font-medium">Belastet kvote</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {usage.data!.slice(0, 25).map((u) => (
                  <tr key={u.id}>
                    <td className="py-1.5">{formatDateTime(u.createdAt)}</td>
                    <td className="py-1.5">{USAGE_KIND_LABEL[u.kind]}</td>
                    <td className="py-1.5">{u.chargeable ? 'Ja' : 'Nei'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <VippsCheckout open={checkoutOpen} onClose={() => setCheckoutOpen(false)} />

      <Dialog open={portalOpen} onClose={() => setPortalOpen(false)} title="Simulert kundeportal" description="I produksjon administreres Vipps-avtalen i Vipps-appen og her. Dette er en simulering.">
        {subscription && (
          <div className="space-y-3 text-sm">
            <p>
              Status: <strong>{SUBSCRIPTION_STATUS_LABEL[subscription.status]}</strong>
              {subscription.cancelAtPeriodEnd && ' – avsluttes ved periodeslutt'}. Periode til {formatDate(subscription.currentPeriodEnd)}.
            </p>
            <div className="flex flex-wrap gap-2">
              {subscription.status === 'past_due' && services.demo && (
                <Button variant="primary" loading={busy === 'fix'} onClick={() => run('fix', () => services.demo!.billing.fixPayment(), 'Betalingen er registrert (simulert)')}>
                  Oppdater betalingsmåte (simulert)
                </Button>
              )}
              {hasActive && !subscription.cancelAtPeriodEnd && services.demo && (
                <Button variant="danger" loading={busy === 'cancel'} onClick={() => run('cancel', () => services.demo!.billing.cancelAtPeriodEnd(), 'Abonnementet avsluttes ved periodeslutt')}>
                  Si opp ved periodeslutt
                </Button>
              )}
              {hasActive && subscription.cancelAtPeriodEnd && services.demo && (
                <Button loading={busy === 'resume'} onClick={() => run('resume', () => services.demo!.billing.resume(), 'Oppsigelsen er angret')}>
                  Angre oppsigelse
                </Button>
              )}
              {hasActive && services.demo && (
                <Button
                  loading={busy === 'interval'}
                  onClick={() => run('interval', () => services.demo!.billing.changeInterval(subscription.interval === 'month' ? 'year' : 'month'), 'Betalingsintervall endret fra neste periode')}
                >
                  Bytt til {subscription.interval === 'month' ? 'årlig' : 'månedlig'}
                </Button>
              )}
            </div>
            <p className="text-xs text-slate-600">Ved oppsigelse beholder du full tilgang ut betalt periode. Lagrede objekter og scenarioer slettes ikke.</p>
          </div>
        )}
      </Dialog>
    </div>
  );
}
