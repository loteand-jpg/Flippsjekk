import { Check, CircleX, LoaderCircle, RefreshCw } from 'lucide-react';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { Button } from '../components/ui/primitives';
import { Dialog } from '../components/ui/overlay';
import { Alert } from '../components/ui/primitives';
import type { AnalysisJob } from '../domain/schemas';
import { formatRelative } from '../lib/format';
import { uuid } from '../lib/ids';
import { isServiceError, type AnalysisRequestResult, type ServiceErrorCode } from '../services/types';
import { useServices } from './services';
import { useToast } from './toast';

type Phase =
  | { kind: 'idle' }
  | { kind: 'checking'; url: string }
  | { kind: 'reused_stale'; result: Extract<AnalysisRequestResult, { outcome: 'reused' }> }
  | { kind: 'job'; jobId: string; propertyId: string; joined: boolean; joinedOther: boolean }
  | { kind: 'error'; code: ServiceErrorCode | 'unknown'; message: string };

interface FlowApi {
  start: (url: string) => Promise<{ ok: boolean; code?: string; message?: string }>;
  busy: boolean;
}

const Ctx = createContext<FlowApi>({ start: async () => ({ ok: false }), busy: false });

export function useAnalyzeFlow() {
  return useContext(Ctx);
}

const PRE_STEPS = ['Kontrollerer innlogging og abonnement', 'Slår opp FINN-koden'];

export function AnalyzeFlowProvider({ children }: { children: ReactNode }) {
  const services = useServices();
  const navigate = useNavigate();
  const toast = useToast();
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const [job, setJob] = useState<AnalysisJob | null>(null);
  const busyRef = useRef(false);
  const [busy, setBusy] = useState(false);

  const open = (propertyId: string) => navigate(`/objekter/${propertyId}`);

  const start = useCallback<FlowApi['start']>(
    async (url) => {
      // Forhindrer dobbeltklikk på klientsiden; tjenesten dedupliserer uansett.
      if (busyRef.current) return { ok: false, code: 'busy' };
      busyRef.current = true;
      setBusy(true);
      setPhase({ kind: 'checking', url });
      try {
        const r = await services.analysis.requestAnalysis({ url, idempotencyKey: uuid() });
        if (r.outcome === 'reused') {
          if (r.staleness.analysisStale || r.staleness.volatileStale) {
            setPhase({ kind: 'reused_stale', result: r });
          } else {
            setPhase({ kind: 'idle' });
            toast({
              tone: 'success',
              title: r.alreadyInList ? 'Objektet ligger allerede i listen din' : 'Eksisterende analyse hentet',
              body: 'Ingen ny analyse er belastet kvoten din.',
            });
            open(r.propertyId);
          }
        } else {
          setJob(r.job);
          setPhase({ kind: 'job', jobId: r.job.id, propertyId: r.propertyId, joined: r.outcome === 'job_joined', joinedOther: r.outcome === 'job_joined' && r.joinedOtherUser });
        }
        return { ok: true };
      } catch (e) {
        const code = isServiceError(e) ? e.code : 'unknown';
        const message = e instanceof Error ? e.message : 'Noe gikk galt.';
        // Ugyldig lenke vises ved feltet; tilgang/kvote vises i dialog med vei videre.
        if (code === 'invalid_url') setPhase({ kind: 'idle' });
        else setPhase({ kind: 'error', code, message });
        return { ok: false, code, message };
      } finally {
        busyRef.current = false;
        setBusy(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [services, toast],
  );

  // Følg jobben
  useEffect(() => {
    if (phase.kind !== 'job') return;
    let alive = true;
    const poll = async () => {
      const j = await services.analysis.getJob(phase.jobId);
      if (!alive || !j) return;
      setJob(j);
      if (j.status === 'succeeded') {
        alive = false;
        setPhase({ kind: 'idle' });
        toast({ tone: 'success', title: 'Analysen er klar', body: phase.joined ? 'Felles analyse – du ble ikke belastet.' : 'Én ny analyse er registrert i forbruket ditt.' });
        open(phase.propertyId);
      }
    };
    void poll();
    const t = window.setInterval(poll, 350);
    return () => {
      alive = false;
      window.clearInterval(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, services]);

  const close = () => {
    setPhase({ kind: 'idle' });
    setJob(null);
  };

  const retry = async () => {
    if (!job) return;
    try {
      const j = await services.analysis.retryJob(job.id);
      setJob(j);
      if (phase.kind === 'job') setPhase({ ...phase });
    } catch (e) {
      setPhase({ kind: 'error', code: isServiceError(e) ? e.code : 'unknown', message: (e as Error).message });
    }
  };

  const refresh = async (kind: 'light' | 'full') => {
    if (phase.kind !== 'reused_stale') return;
    const pid = phase.result.propertyId;
    try {
      const r = await services.analysis.requestRefresh(pid, kind, uuid());
      if (r.outcome === 'already_fresh') {
        toast({ tone: 'info', title: 'Annonseopplysningene er allerede ferske' });
        close();
        open(pid);
      } else {
        setJob(r.job);
        setPhase({ kind: 'job', jobId: r.job.id, propertyId: pid, joined: r.outcome === 'job_joined', joinedOther: false });
      }
    } catch (e) {
      setPhase({ kind: 'error', code: isServiceError(e) ? e.code : 'unknown', message: (e as Error).message });
    }
  };

  const now = services.clock.now();
  const dialogOpen = phase.kind !== 'idle' && phase.kind !== 'checking';

  return (
    <Ctx.Provider value={{ start, busy }}>
      {children}
      <Dialog
        open={dialogOpen}
        onClose={close}
        title={
          phase.kind === 'job'
            ? job?.type === 'light_refresh'
              ? 'Oppfrisker annonseopplysninger'
              : phase.joined
                ? 'Analyse pågår allerede'
                : 'Analyserer bolig'
            : phase.kind === 'reused_stale'
              ? 'Eksisterende analyse hentet'
              : 'Kunne ikke starte analysen'
        }
        footer={
          phase.kind === 'job' ? (
            job?.status === 'failed' ? (
              <>
                <Button onClick={close}>Lukk</Button>
                <Button variant="primary" icon={<RefreshCw className="size-4" aria-hidden />} onClick={retry}>
                  Prøv igjen
                </Button>
              </>
            ) : (
              <Button onClick={close}>Lukk – analysen fortsetter</Button>
            )
          ) : phase.kind === 'reused_stale' ? (
            <>
              <Button onClick={() => refresh('light')}>Lett oppfrisking</Button>
              <Button onClick={() => refresh('full')}>Full ny analyse</Button>
              <Button
                variant="primary"
                onClick={() => {
                  const pid = phase.result.propertyId;
                  close();
                  open(pid);
                }}
              >
                Åpne analysen
              </Button>
            </>
          ) : phase.kind === 'error' ? (
            <>
              <Button onClick={close}>Lukk</Button>
              {(phase.code === 'subscription_inactive' || phase.code === 'quota_exceeded') && (
                <Button
                  variant="primary"
                  onClick={() => {
                    close();
                    navigate('/konto');
                  }}
                >
                  Gå til abonnement
                </Button>
              )}
              {phase.code === 'not_authenticated' && (
                <Button
                  variant="primary"
                  onClick={() => {
                    close();
                    navigate('/logg-inn');
                  }}
                >
                  Logg inn
                </Button>
              )}
            </>
          ) : null
        }
      >
        {phase.kind === 'job' && job && (
          <div className="space-y-4">
            {phase.joined && (
              <Alert tone="info" title={phase.joinedOther ? 'Du er koblet til en felles analyse' : 'Du er koblet til samme jobb'}>
                {phase.joinedOther
                  ? 'En annen abonnent har allerede startet analyse av denne boligen. Du får samme grunnanalyse, men egne private scenarioer. Dette belastes ikke kvoten din.'
                  : 'Analysen er allerede i gang. Det startes ingen ny jobb og belastes ikke på nytt.'}
              </Alert>
            )}
            <ol className="space-y-2" aria-label="Fremdrift">
              {[...(job.type === 'full_analysis' ? PRE_STEPS : []), ...job.steps].map((label, i) => {
                const offset = job.type === 'full_analysis' ? PRE_STEPS.length : 0;
                const idx = i - offset;
                const done = idx < 0 || idx < job.stepIndex || job.status === 'succeeded';
                const failedHere = job.status === 'failed' && idx === job.stepIndex;
                const active = !done && !failedHere && idx === job.stepIndex && job.status === 'running';
                return (
                  <li key={label} className="flex items-center gap-3 text-sm">
                    <span className="flex size-6 items-center justify-center rounded-full border border-slate-200 bg-white">
                      {failedHere ? (
                        <CircleX className="size-4 text-red-700" aria-hidden />
                      ) : done ? (
                        <Check className="size-4 text-pine-700" aria-hidden />
                      ) : active ? (
                        <LoaderCircle className="size-4 animate-spin text-pine-700" aria-hidden />
                      ) : (
                        <span className="size-1.5 rounded-full bg-slate-300" />
                      )}
                    </span>
                    <span className={failedHere ? 'font-medium text-red-800' : done ? 'text-ink' : active ? 'font-medium text-ink' : 'text-slate-500'}>
                      {label}
                      <span className="sr-only">{failedHere ? ' – feilet' : done ? ' – ferdig' : active ? ' – pågår' : ' – venter'}</span>
                    </span>
                  </li>
                );
              })}
            </ol>
            {job.status === 'failed' ? (
              <Alert tone="danger" title="Analysen ble ikke fullført">
                <p>{job.error?.message}</p>
                <p>Et nytt forsøk er trygt: lykkes det, registreres bare én analyse.</p>
              </Alert>
            ) : (
              <p className="text-xs text-slate-600">
                Objektet er lagt i listen din og vises som «Analyse pågår». Du kan lukke vinduet – analysen fortsetter i demoen. Ingen data hentes fra FINN; resultatet er demodata.
              </p>
            )}
          </div>
        )}
        {phase.kind === 'reused_stale' && (
          <div className="space-y-3 text-sm">
            <p>
              Det finnes allerede en grunnanalyse for denne boligen (versjon {phase.result.analysis.version}, publisert{' '}
              {formatRelative(phase.result.analysis.publishedAt, now)}). Den er lagt i listen din uten å belaste kvoten.
            </p>
            {phase.result.staleness.analysisStale && (
              <Alert tone="warning" title={`Grunnanalysen er ${Math.floor(phase.result.staleness.analysisAgeDays)} dager gammel`}>
                Oppussing, salgsverdi og risiko kan ha endret seg. En full ny analyse belastes som én ny analyse.
              </Alert>
            )}
            {phase.result.staleness.volatileStale && (
              <Alert tone="info" title="Pris, visninger og salgsstatus bør sjekkes">
                Annonseopplysningene ble sist kontrollert{' '}
                {phase.result.staleness.volatileAgeHours === null ? 'aldri' : `for ${Math.round(phase.result.staleness.volatileAgeHours)} timer siden`}. En lett oppfrisking
                oppdaterer bare disse og endrer ikke dine lagrede forutsetninger.
              </Alert>
            )}
          </div>
        )}
        {phase.kind === 'error' && (
          <Alert tone={phase.code === 'quota_exceeded' || phase.code === 'subscription_inactive' ? 'warning' : 'danger'}>
            <p>{phase.message}</p>
          </Alert>
        )}
      </Dialog>
    </Ctx.Provider>
  );
}
