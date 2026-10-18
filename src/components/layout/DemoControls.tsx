import { Database, FlaskConical, Play, RotateCcw, TriangleAlert, UserRound } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useAnalyzeFlow } from '../../app/analyzeFlow';
import { useLiveQuery } from '../../app/hooks';
import { useServices } from '../../app/services';
import { useSession } from '../../app/session';
import { useToast } from '../../app/toast';
import { DEMO_FINN } from '../../data/seedProperties';
import { formatDateTime } from '../../lib/format';
import type { SubscriptionPreset } from '../../services/types';
import { Dialog } from '../ui/overlay';
import { Alert, Button, Card } from '../ui/primitives';
import { Select } from '../ui/forms';

const PRESETS: { id: SubscriptionPreset; label: string; detail: string }[] = [
  { id: 'active', label: 'Aktivt abonnement', detail: 'Full tilgang' },
  { id: 'trialing', label: 'Prøveperiode', detail: 'Full tilgang i prøveperioden' },
  { id: 'canceling', label: 'Oppsagt ved periodeslutt', detail: 'Full tilgang til perioden er over' },
  { id: 'past_due', label: 'Betalingsproblem', detail: 'Lesetilgang til lagrede data' },
  { id: 'expired', label: 'Avsluttet / utløpt', detail: 'Lesetilgang til lagrede data' },
  { id: 'none', label: 'Ingen abonnement', detail: 'Vei til abonnement' },
  { id: 'low_quota', label: 'Aktivt – lav kvote', detail: '1 ny analyse per periode' },
];

const TRY_LINKS: { label: string; url: string; note: string }[] = [
  { label: 'Cachetreff', url: `finn.no/${DEMO_FINN.cacheHit}`, note: 'Analyse finnes – gjenbrukes uten belastning' },
  { label: 'Samme objekt, annet format', url: `https://www.finn.no/realestate/homes/ad.html?finnkode=${DEMO_FINN.cacheHit}&utm_source=delt`, note: 'Normaliseres til samme FINN-ID' },
  { label: 'Cachemiss', url: `finn.no/${DEMO_FINN.synthetic}`, note: 'Ny simulert analyse (syntetisk demodata)' },
  { label: 'Gammel analyse', url: `finn.no/${DEMO_FINN.stale}`, note: 'Over 30 dager – tilbyr grundig markedsoppfriskning' },
  { label: 'Feil og nytt forsøk', url: `finn.no/${DEMO_FINN.failing}`, note: 'Første forsøk feiler, retry lykkes' },
  { label: 'Ugyldig lenke', url: 'https://www.hjem.no/bolig/123456', note: 'Forståelig feilmelding' },
];

/**
 * Testkontroller for demoen. Finnes bare når mocktjenestene er i bruk (services.demo),
 * og kan ikke slås på via URL eller localStorage i produksjonsmodus.
 */
export function DemoControls({ open, onClose }: { open: boolean; onClose: () => void }) {
  const services = useServices();
  const demo = services.demo;
  const session = useSession();
  const toast = useToast();
  const navigate = useNavigate();
  const { start } = useAnalyzeFlow();
  const [busy, setBusy] = useState<string | null>(null);
  const accounts = useLiveQuery(() => (demo ? demo.listAccounts() : Promise.resolve([])), []);
  const failNext = useLiveQuery(() => (demo ? demo.getFailNextJob() : Promise.resolve(null)), []);
  const seededAt = useLiveQuery(() => (demo ? demo.seededAt() : Promise.resolve('')), []);
  if (!demo) return null;

  const run = async (key: string, fn: () => Promise<unknown>, msg?: string) => {
    setBusy(key);
    try {
      await fn();
      if (msg) toast({ tone: 'success', title: msg });
    } catch (e) {
      toast({ tone: 'danger', title: 'Demohandlingen feilet', body: (e as Error).message });
    } finally {
      setBusy(null);
    }
  };
  const currentPreset = (() => {
    const e = session.entitlements;
    const s = session.subscription;
    if (!s) return 'none';
    if (s.planId === 'demo-lav-kvote') return 'low_quota';
    if (e?.reason === 'canceling') return 'canceling';
    if (e?.reason === 'trialing') return 'trialing';
    if (e?.reason === 'past_due') return 'past_due';
    if (e?.reason === 'canceled' || e?.reason === 'expired') return 'expired';
    return 'active';
  })();

  return (
    <Dialog open={open} onClose={onClose} size="lg" title="Testkontroller for demo" description="Simulerer brukere, abonnement og analysejobber. Finnes ikke i produksjonsmodus.">
      <div className="space-y-5">
        <section aria-labelledby="demo-user">
          <h3 id="demo-user" className="mb-2 flex items-center gap-2 text-sm font-semibold">
            <UserRound className="size-4" aria-hidden /> Bruker
          </h3>
          <div className="flex flex-wrap gap-2">
            {(accounts.data ?? []).map((a) => (
              <Button
                key={a.id}
                size="sm"
                variant={session.session?.user.id === a.id ? 'primary' : 'secondary'}
                loading={busy === a.id}
                onClick={() => run(a.id, () => demo.switchUser(a.id), `Byttet til ${a.displayName}`)}
              >
                {a.displayName} <span className="font-normal opacity-80">({a.label})</span>
              </Button>
            ))}
          </div>
          <p className="mt-1 text-xs text-slate-600">Bruker A og B har lagret samme objekter (f.eks. Elvekanten 17 B) med ulike private scenarioer.</p>
        </section>

        {session.session && (
          <section aria-labelledby="demo-sub">
            <h3 id="demo-sub" className="mb-2 text-sm font-semibold">
              Abonnementstilstand for {session.session.user.displayName}
            </h3>
            <Select
              aria-label="Abonnementstilstand"
              value={currentPreset}
              onChange={(e) => run('preset', () => demo.setSubscriptionPreset(e.target.value as SubscriptionPreset), 'Abonnementstilstand endret')}
            >
              {PRESETS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label} – {p.detail}
                </option>
              ))}
            </Select>
            <p className="mt-1 text-xs text-slate-600">Lagrede objekter og scenarioer slettes aldri ved bytte av tilstand.</p>
          </section>
        )}

        {session.session && (
          <section aria-labelledby="demo-try">
            <h3 id="demo-try" className="mb-2 text-sm font-semibold">
              Prøv analyseflyten
            </h3>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {TRY_LINKS.map((l) => (
                <Card key={l.label} className="flex items-start justify-between gap-2 p-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{l.label}</p>
                    <p className="text-xs text-slate-600">{l.note}</p>
                  </div>
                  <Button
                    size="sm"
                    icon={<Play className="size-3.5" aria-hidden />}
                    onClick={() => {
                      onClose();
                      void start(l.url).then((r) => {
                        if (!r.ok && r.message) toast({ tone: 'warning', title: 'Lenken ble avvist', body: r.message });
                      });
                    }}
                  >
                    Kjør
                  </Button>
                </Card>
              ))}
              <Card className="flex items-start justify-between gap-2 p-3 sm:col-span-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium">Pågående felles jobb</p>
                  <p className="text-xs text-slate-600">Den andre testbrukeren starter en analyse. Du kobles til samme jobb uten belastning.</p>
                </div>
                <Button
                  size="sm"
                  loading={busy === 'shared'}
                  icon={<Play className="size-3.5" aria-hidden />}
                  onClick={() =>
                    run('shared', async () => {
                      const r = await demo.startSharedJobAsOtherUser();
                      onClose();
                      toast({ tone: 'info', title: `${r.byUser} har startet en analyse`, body: `FINN-kode ${r.finnId}. Henter samme objekt for deg …` });
                      await start(r.url);
                    })
                  }
                >
                  Kjør
                </Button>
              </Card>
            </div>
          </section>
        )}

        <section aria-labelledby="demo-fail" className="space-y-2">
          <h3 id="demo-fail" className="text-sm font-semibold">
            Feilsimulering
          </h3>
          <Select
            aria-label="Neste analysejobb"
            value={failNext.data ?? ''}
            onChange={(e) => run('fail', () => demo.setFailNextJob((e.target.value || null) as 'fetch_error' | 'invalid_result' | null))}
          >
            <option value="">Neste analysejobb går normalt</option>
            <option value="fetch_error">Neste analysejobb: annonsen kan ikke hentes</option>
            <option value="invalid_result">Neste analysejobb: resultatet feiler kvalitetskontrollen</option>
          </Select>
        </section>

        <section aria-labelledby="demo-data" className="space-y-2">
          <h3 id="demo-data" className="flex items-center gap-2 text-sm font-semibold">
            <Database className="size-4" aria-hidden /> Demodata
          </h3>
          <p className="text-xs text-slate-600">
            Generert {seededAt.data ? formatDateTime(seededAt.data) : '–'}. Datoer for visninger er relative til dette tidspunktet. Data lagres bare i denne nettleseren.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="danger"
              icon={<RotateCcw className="size-4" aria-hidden />}
              loading={busy === 'reset'}
              onClick={() =>
                run('reset', async () => {
                  await demo.reset();
                  onClose();
                  navigate('/logg-inn');
                }, 'Demodata er tilbakestilt')
              }
            >
              Tilbakestill demodata
            </Button>
            <Button icon={<TriangleAlert className="size-4" aria-hidden />} onClick={() => demo.corruptStorageAndReload()}>
              Simuler skadet lokal lagring
            </Button>
          </div>
          <Alert tone="info">
            <p>
              Tilgangskontrollen i demoen kjører i nettleseren og er ikke sikkerhet. I produksjon håndheves eierskap, abonnement og kvoter av database og server.
            </p>
          </Alert>
        </section>
      </div>
    </Dialog>
  );
}

export function DemoBar({ onOpen }: { onOpen: () => void }) {
  return (
    <div className="bg-violet-900 text-violet-50">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2 px-4 py-1.5 text-xs">
        <p className="flex items-center gap-1.5">
          <FlaskConical className="size-3.5" aria-hidden />
          <span>
            <strong>Demo:</strong> simulert innlogging, abonnement og analyse. Fiktive data – ingen data hentes fra FINN.
          </span>
        </p>
        <button type="button" onClick={onOpen} className="rounded-md bg-violet-800 px-2 py-0.5 font-medium hover:bg-violet-700">
          Testkontroller
        </button>
      </div>
    </div>
  );
}
