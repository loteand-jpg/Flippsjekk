import clsx from 'clsx';
import { CircleCheck, CircleX } from 'lucide-react';
import { Button } from '../../components/ui/primitives';
import { useCourse } from '../progress';
import type { QuizDef } from '../types';

export function Quiz({ q, store = 'quiz', label = 'Miniquiz' }: { q: QuizDef; store?: 'quiz' | 'final'; label?: string }) {
  const { state, update } = useCourse();
  const answered = state[store][q.id];
  const has = answered !== undefined;
  const ok = has && answered === q.correct;
  const choose = (i: number) => update((s) => ({ ...s, [store]: { ...s[store], [q.id]: i } }));
  const retry = () =>
    update((s) => {
      const next = { ...s[store] };
      delete next[q.id];
      return { ...s, [store]: next };
    });
  return (
    <fieldset className="rounded-xl border border-slate-200 bg-white p-4">
      <legend className="px-1 text-xs font-semibold tracking-wide text-pine-800 uppercase">{label}</legend>
      <p className="font-medium text-ink">{q.question}</p>
      <div className="mt-3 grid gap-2" role="radiogroup" aria-label={q.question}>
        {q.options.map((o, i) => {
          const chosen = answered === i;
          const showRight = has && i === q.correct;
          const showWrong = has && chosen && i !== q.correct;
          return (
            <button
              key={i}
              type="button"
              role="radio"
              aria-checked={chosen}
              disabled={has}
              onClick={() => choose(i)}
              className={clsx(
                'flex items-start gap-2 rounded-lg border px-3 py-2 text-left text-sm',
                !has && 'border-slate-300 bg-white hover:border-pine-500 hover:bg-pine-50',
                showRight && 'border-emerald-400 bg-emerald-50 text-emerald-950',
                showWrong && 'border-red-300 bg-red-50 text-red-950',
                has && !showRight && !showWrong && 'border-slate-200 text-slate-500',
              )}
            >
              {showRight ? <CircleCheck className="mt-0.5 size-4 shrink-0 text-emerald-700" aria-hidden /> : showWrong ? <CircleX className="mt-0.5 size-4 shrink-0 text-red-700" aria-hidden /> : <span className="mt-1 size-3 shrink-0 rounded-full border border-slate-400" />}
              <span>
                {o}
                {showRight && <span className="sr-only"> – riktig svar</span>}
                {showWrong && <span className="sr-only"> – ditt svar, feil</span>}
              </span>
            </button>
          );
        })}
      </div>
      {has && (
        <div role="status" className={clsx('mt-3 rounded-lg p-3 text-sm', ok ? 'bg-emerald-50 text-emerald-950' : 'bg-amber-50 text-amber-950')}>
          <p className="font-semibold">{ok ? 'Riktig' : `Ikke helt – riktig svar: «${q.options[q.correct]}»`}</p>
          <p className="mt-0.5">{q.explain}</p>
          <Button size="sm" variant="ghost" className="mt-2" onClick={retry}>
            Prøv igjen
          </Button>
        </div>
      )}
    </fieldset>
  );
}
