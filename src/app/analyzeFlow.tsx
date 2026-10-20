import { Check, CircleX, LoaderCircle, RefreshCw } from 'lucide-react';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { Button } from '../components/ui/primitives';
import { Dialog } from '../components/ui/overlay';
import { Alert } from '../components/ui/primitives';
import type { AnalysisJob } from '../domain/schemas';
import { uuid } from '../lib/ids';
import { isServiceError, type ServiceErrorCode } from '../services/types';
import { useServices } from './services';
import { useToast } from './toast';

type Phase =
  | { kind: 'idle' }
  | { kind: 'checking'; url: string }
  | { kind: 'job'; jobId: string; propertyId: string }
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

/** Markedsoppfriskning av en analyse brukeren allerede har (belastes som oppfriskning, ikke som ny analyse). */
const isMarketRefreshOfOwn = (j: Pick<AnalysisJob, 'type' | 'charges' | 'createdBy'>) => j.type === 'market_refresh' && j.charges?.[j.createdBy] === 'refresh';
/** Oppfriskingsjobber har egne trinn og viser ikke «innlogging/oppslag»-trinnene. */
const isRefreshJob = (j: Pick<AnalysisJob, 'type' | 'charges' | 'createdBy'>) => j.type === 'light_refresh' || isMarketRefreshOfOwn(j);

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
        // Brukeren skal se det samme enten analysen er ny eller allerede finnes: eldre grunnlag følges opp av
        // varselet på objektsiden. Vi forteller ikke at en analyse «finnes fra før».
        if (r.outcome === 'reused') {
          setPhase({ kind: 'idle' });
          if (r.alreadyInList) toast({ tone: 'info', title: 'Objektet ligger allerede i listen din' });
          else toast({ tone: 'success', title: 'Analysen er klar' });
          open(r.propertyId);
        } else {
          setJob(r.job);
          setPhase({ kind: 'job', jobId: r.job.id, propertyId: r.propertyId });
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
        toast({ tone: 'success', title: j.type === 'light_refresh' ? 'Annonsen er oppfrisket' : isMarketRefreshOfOwn(j) ? 'Markedsdataene er oppdatert' : 'Analysen er klar' });
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
              : job && isMarketRefreshOfOwn(job)
                ? 'Oppdaterer markedsdata'
                : 'Analyserer bolig'
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
            <ol className="space-y-2" aria-label="Fremdrift">
              {[...(!isRefreshJob(job) ? PRE_STEPS : []), ...job.steps].map((label, i) => {
                const offset = !isRefreshJob(job) ? PRE_STEPS.length : 0;
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
        {phase.kind === 'error' && (
          <Alert tone={phase.code === 'quota_exceeded' || phase.code === 'subscription_inactive' ? 'warning' : 'danger'}>
            <p>{phase.message}</p>
          </Alert>
        )}
      </Dialog>
    </Ctx.Provider>
  );
}
