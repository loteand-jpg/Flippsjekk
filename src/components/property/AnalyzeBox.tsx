import clsx from 'clsx';
import { Link2, Sparkles } from 'lucide-react';
import { useId, useState } from 'react';
import { useAnalyzeFlow } from '../../app/analyzeFlow';
import { parseFinnUrl } from '../../lib/finn';
import { Button } from '../ui/primitives';
import { INPUT_CLS } from '../ui/forms';

export function AnalyzeBox({ autoFocus, compact, initialUrl = '', onDone }: { autoFocus?: boolean; compact?: boolean; initialUrl?: string; onDone?: () => void }) {
  const { start, busy } = useAnalyzeFlow();
  const [url, setUrl] = useState(initialUrl);
  const [error, setError] = useState<string | null>(null);
  const id = useId();
  const submit = async () => {
    const parsed = parseFinnUrl(url);
    if (!parsed.ok) {
      setError(parsed.message);
      return;
    }
    setError(null);
    const r = await start(url);
    if (r.ok) {
      setUrl('');
      onDone?.();
    } else if (r.code === 'invalid_url' && r.message) setError(r.message);
  };
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      noValidate
      className={clsx(!compact && 'w-full')}
    >
      <label htmlFor={id} className={clsx('mb-1.5 block text-sm font-medium', compact ? 'sr-only' : 'text-slate-800')}>
        FINN-lenke
      </label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative min-w-0 flex-1">
          <Link2 className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" aria-hidden />
          <input
            id={id}
            type="url"
            inputMode="url"
            autoFocus={autoFocus}
            autoComplete="off"
            spellCheck={false}
            placeholder="Lim inn FINN-lenke, f.eks. finn.no/478027403"
            value={url}
            onChange={(e) => {
              setUrl(e.target.value);
              if (error) setError(null);
            }}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${id}-err` : `${id}-hint`}
            className={clsx(INPUT_CLS, 'h-11 pl-9')}
          />
        </div>
        <Button type="submit" variant="primary" size="lg" className="h-11" loading={busy} icon={<Sparkles className="size-4" aria-hidden />}>
          Analyser bolig
        </Button>
      </div>
      {error ? (
        <p id={`${id}-err`} role="alert" className="mt-1.5 text-sm font-medium text-red-700">
          {error}
        </p>
      ) : (
        !compact && (
          <p id={`${id}-hint`} className="mt-1.5 text-xs text-slate-600">
            Finnes det allerede en analyse av boligen, hentes den uten å belaste kvoten. Ingen data leses fra FINN i demoen.
          </p>
        )
      )}
    </form>
  );
}
