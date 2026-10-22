import { FlaskConical, Mail, MailCheck } from 'lucide-react';
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router';
import { useHomePath, useServices } from '../app/services';
import { useSession } from '../app/session';
import { useLiveQuery } from '../app/hooks';
import { Logo } from '../components/layout/AppShell';
import { Field, TextInput } from '../components/ui/forms';
import { Dialog } from '../components/ui/overlay';
import { Alert, Button, Card } from '../components/ui/primitives';
import { EMAIL_CODE_LENGTH as CODE_LENGTH, type EmailChallenge, type SignInResult, type SimulatedGoogleAccount } from '../services/types';

function AuthLayout({ title, children, footer }: { title: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="flex min-h-[calc(100dvh-2rem)] flex-col items-center justify-center px-4 py-10">
      <div className="mb-6">
        <Logo />
      </div>
      <Card className="w-full max-w-md p-6">
        <h1 className="text-xl font-semibold">{title}</h1>
        <div className="mt-4">{children}</div>
      </Card>
      {footer && <div className="mt-4 text-sm text-slate-600">{footer}</div>}
    </div>
  );
}

function GoogleLogo() {
  return (
    <svg viewBox="0 0 48 48" className="size-5" aria-hidden>
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.6 5.9c4.4-4.1 7-10.1 7-17.6z" />
      <path fill="#FBBC05" d="M10.5 28.7A14.5 14.5 0 0 1 9.5 24c0-1.6.3-3.2.8-4.7l-7.9-6.1A24 24 0 0 0 0 24c0 3.9.9 7.5 2.6 10.8l7.9-6.1z" />
      <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.6-5.9c-2.1 1.4-4.9 2.3-8.3 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z" />
    </svg>
  );
}

/** Kontovelger i demoen. I produksjon sendes brukeren til Google i stedet. */
function GoogleChooser({ open, onClose, onPick, busy }: { open: boolean; onClose: () => void; onPick: (a: SimulatedGoogleAccount) => void; busy: boolean }) {
  const services = useServices();
  const [email, setEmail] = useState('');
  const accounts = services.demo?.googleAccounts() ?? [];
  return (
    <Dialog open={open} onClose={onClose} size="sm" title="Velg en Google-konto" description="Simulert Google-innlogging i demoen. Ingen ekte Google-konto brukes.">
      <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
        {accounts.map((a) => (
          <li key={a.email}>
            <button type="button" disabled={busy} onClick={() => onPick(a)} className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-slate-50 disabled:opacity-55">
              <span className="flex size-8 items-center justify-center rounded-full bg-slate-200 text-sm font-semibold text-slate-700">{a.name.charAt(0)}</span>
              <span className="min-w-0">
                <span className="block text-sm font-medium">{a.name}</span>
                <span className="block truncate text-xs text-slate-600">{a.email}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      <form
        className="mt-3 space-y-2"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          onPick({ email, name: '' });
        }}
      >
        <Field label="Annen (fiktiv) Google-konto">{(p) => <TextInput {...p} type="email" placeholder="navn@gmail.com" value={email} onChange={(e) => setEmail(e.target.value)} />}</Field>
        <Button type="submit" size="sm" loading={busy} disabled={!email.trim()}>
          Fortsett
        </Button>
      </form>
    </Dialog>
  );
}

function SimulatedMail({ mail }: { mail: NonNullable<EmailChallenge['simulatedEmail']> }) {
  return (
    <div className="rounded-lg border border-dashed border-violet-300 bg-violet-50 p-3 text-sm" aria-label="Simulert e-post">
      <p className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-violet-900 uppercase">
        <MailCheck className="size-4" aria-hidden /> Simulert e-post (demo)
      </p>
      <p className="mt-1 text-xs text-slate-600">Til: {mail.to}</p>
      <p className="text-sm font-medium">{mail.subject}</p>
      <p className="mt-2 text-center">
        <span className="num inline-block rounded-md bg-white px-4 py-1.5 text-2xl font-semibold tracking-[0.3em] text-ink ring-1 ring-violet-200" data-testid="demo-code">
          {mail.code}
        </span>
      </p>
      <p className="mt-2 text-xs text-slate-600">I demoen sendes ingen ekte e-post. I produksjon får du koden i innboksen.</p>
    </div>
  );
}

function AuthFlow({ mode }: { mode: 'login' | 'signup' }) {
  const services = useServices();
  const { ready, session, refresh } = useSession();
  const navigate = useNavigate();
  const location = useLocation();
  const home = useHomePath();
  const nav = location.state as { from?: string; authError?: string; authReturned?: boolean } | null;
  const from = nav?.from ?? home;
  const [email, setEmail] = useState('');
  const [challenge, setChallenge] = useState<EmailChallenge | null>(null);
  const [code, setCode] = useState('');
  // Feil fra en avbrutt innlogging med Google (retur fra Supabase, se AuthReturn i App.tsx).
  const [error, setError] = useState<string | null>(nav?.authError ?? null);
  const [busy, setBusy] = useState(false);
  const [googleOpen, setGoogleOpen] = useState(false);
  const [newUser, setNewUser] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const accounts = useLiveQuery(() => (services.demo ? services.demo.listAccounts() : Promise.resolve([])), []);

  useEffect(() => {
    if (!challenge) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [challenge]);

  if (session) return <Navigate to={newUser ? '/konto' : from} replace state={newUser ? { welcome: true } : undefined} />;

  const wait = challenge ? Math.max(0, Math.ceil((Date.parse(challenge.resendAfter) - now) / 1000)) : 0;

  const done = async (r: SignInResult) => {
    // Sett før sesjonen oppdateres, så riktig side velges når «innlogget» slår inn.
    setNewUser(r.isNewUser);
    await refresh();
  };
  const guard = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const sendCode = (e?: FormEvent) => {
    e?.preventDefault();
    return guard(async () => {
      setChallenge(await services.auth.requestEmailCode(email));
      setCode('');
      setNow(Date.now());
    });
  };
  const verify = (e: FormEvent) => {
    e.preventDefault();
    return guard(async () => {
      if (!challenge) return;
      try {
        await done(await services.auth.verifyEmailCode({ challengeId: challenge.challengeId, code }));
      } catch (err) {
        const c = (err as { code?: string }).code;
        if (c === 'code_expired' || c === 'too_many_attempts') {
          setChallenge(null);
          setCode('');
        }
        throw err;
      }
    });
  };
  const google = (account?: SimulatedGoogleAccount) =>
    guard(async () => {
      const r = await services.auth.signInWithGoogle(account);
      if (r.kind === 'redirect') window.location.assign(r.url);
      else {
        setGoogleOpen(false);
        await done(r);
      }
    });
  const profile = (mail: string) =>
    guard(async () => {
      await services.demo!.signInAsProfile(mail);
      await refresh();
      navigate(from, { replace: true });
    });

  const signup = mode === 'signup';
  return (
    <AuthLayout
      title={signup ? 'Opprett konto' : 'Logg inn'}
      footer={
        signup ? (
          <>
            Har du konto? <Link to="/logg-inn" className="font-medium text-pine-800 underline">Logg inn</Link>
          </>
        ) : (
          <>
            Ny her? <Link to="/registrer" className="font-medium text-pine-800 underline">Opprett konto</Link>
          </>
        )
      }
    >
      <div className="space-y-4">
        {services.demo && (
          <Alert tone="info" title="Simulert innlogging">
            Dette er en demo. Ingen e-post sendes – koden vises på skjermen. Ikke bruk ekte personopplysninger.
          </Alert>
        )}

        {nav?.authReturned && ready && !session && !error && <Alert tone="danger">Innloggingen ble ikke fullført. Prøv igjen.</Alert>}

        {!challenge ? (
          <>
            <p className="text-sm text-slate-700">{signup ? 'Velg hvordan du vil opprette kontoen. Det finnes ingen passord.' : 'Logg inn med Google, eller få en engangskode på e-post. Det finnes ingen passord.'}</p>
            <Button className="w-full" size="lg" icon={<GoogleLogo />} loading={busy && googleOpen} onClick={() => (services.demo ? setGoogleOpen(true) : google())}>
              Fortsett med Google
            </Button>
            <div className="flex items-center gap-3 text-xs text-slate-500" aria-hidden>
              <span className="h-px flex-1 bg-slate-200" /> eller <span className="h-px flex-1 bg-slate-200" />
            </div>
            <form onSubmit={sendCode} className="space-y-3" noValidate>
              <Field label="E-post" hint={signup ? 'Vi oppretter kontoen når du har bekreftet koden.' : 'Du får en 6-sifret kode på e-post.'}>
                {(p) => <TextInput {...p} type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="navn@eksempel.no" />}
              </Field>
              {error && <Alert tone="danger">{error}</Alert>}
              <Button type="submit" variant="primary" className="w-full" loading={busy && !googleOpen} icon={<Mail className="size-4" aria-hidden />}>
                Send kode på e-post
              </Button>
            </form>
            <p className="text-xs text-slate-600">Vipps, mobilnummer og Apple kommer som innloggingsmetoder senere.</p>
          </>
        ) : (
          <form onSubmit={verify} className="space-y-3" noValidate>
            <p className="text-sm text-slate-700">
              Vi har sendt en kode til <strong>{challenge.email}</strong>. Skriv den inn for å bekrefte innloggingen.
            </p>
            {challenge.simulatedEmail && <SimulatedMail mail={challenge.simulatedEmail} />}
            <Field label="Bekreftelseskode" hint={services.demo ? `${CODE_LENGTH} siffer. Koden varer i 10 minutter.` : `${CODE_LENGTH} siffer fra e-posten vi har sendt.`}>
              {(p) => (
                <TextInput {...p} inputMode="numeric" autoComplete="one-time-code" autoFocus maxLength={CODE_LENGTH + 2} value={code} onChange={(e) => setCode(e.target.value.replace(/[^\d\s]/g, ''))} placeholder="123456" />
              )}
            </Field>
            {error && <Alert tone="danger">{error}</Alert>}
            <Button type="submit" variant="primary" className="w-full" loading={busy} disabled={code.replace(/\s/g, '').length !== CODE_LENGTH}>
              Bekreft og logg inn
            </Button>
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <button type="button" className="text-pine-800 underline disabled:text-slate-500 disabled:no-underline" disabled={wait > 0 || busy} onClick={() => sendCode()}>
                {wait > 0 ? `Send ny kode om ${wait} s` : 'Send ny kode'}
              </button>
              <button
                type="button"
                className="text-pine-800 underline"
                onClick={() => {
                  setChallenge(null);
                  setError(null);
                }}
              >
                Bruk en annen e-post
              </button>
            </div>
          </form>
        )}

        {services.demo && (accounts.data?.length ?? 0) > 0 && !challenge && (
          <details open className="rounded-lg border border-slate-200 p-3">
            <summary className="cursor-pointer text-sm font-medium">Testprofiler (hopper over kode)</summary>
            <div className="mt-2 grid gap-2">
              {accounts.data!.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => profile(a.email)}
                  disabled={busy}
                  className="flex w-full items-start gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-left text-sm hover:border-slate-400 hover:bg-slate-50 disabled:opacity-55"
                >
                  <FlaskConical className="mt-0.5 size-4 shrink-0 text-violet-800" aria-hidden />
                  <span className="min-w-0">
                    <span className="font-medium">{a.displayName}</span> <span className="text-slate-600">· {a.label}</span>
                    <span className="block truncate text-xs text-slate-500">{a.email}</span>
                  </span>
                </button>
              ))}
            </div>
          </details>
        )}
      </div>
      <GoogleChooser open={googleOpen} onClose={() => setGoogleOpen(false)} onPick={(a) => google(a)} busy={busy} />
    </AuthLayout>
  );
}

export function LoginPage() {
  return <AuthFlow mode="login" />;
}

export function SignupPage() {
  return <AuthFlow mode="signup" />;
}
