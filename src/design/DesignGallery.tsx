import { ArrowRight, Check, Clock } from 'lucide-react';
import { Logo } from '../components/layout/AppShell';
import { VARIANTS, variantHref, type DesignVariant } from './variants';

function Swatches({ colors }: { colors: string[] }) {
  if (colors.length === 0) return <div className="h-10 rounded-md border border-dashed border-slate-300" aria-hidden />;
  return (
    <div className="flex h-10 overflow-hidden rounded-md border border-slate-200" aria-hidden>
      {colors.map((c) => (
        <span key={c} className="flex-1" style={{ background: c }} />
      ))}
    </div>
  );
}

function VariantCard({ v }: { v: DesignVariant }) {
  const available = v.status === 'available';
  return (
    <li className="flex flex-col rounded-xl border border-slate-200 bg-white p-5" data-testid={`variant-${v.id}`}>
      <Swatches colors={v.swatches} />
      <div className="mt-4 flex items-center gap-2">
        <h2 className="text-lg font-semibold">{v.name}</h2>
        {available ? (
          <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-900 ring-1 ring-emerald-200 ring-inset">
            <Check className="size-3" aria-hidden /> Tilgjengelig
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700 ring-1 ring-slate-200 ring-inset">
            <Clock className="size-3" aria-hidden /> Kommer senere
          </span>
        )}
      </div>
      <p className="mt-1 text-sm text-slate-700">{v.tagline}</p>
      <ul className="mt-3 space-y-1 text-sm text-slate-600">
        {v.points.map((p) => (
          <li key={p} className="flex gap-2">
            <span aria-hidden className="mt-2 size-1 shrink-0 rounded-full bg-slate-400" />
            {p}
          </li>
        ))}
      </ul>
      {/* Vanlig lenke (ikke <Link>): hver variant har sin egen ruter, og bare en ekte adresseendring får appen til å bytte ruter. */}
      <div className="mt-auto pt-5">
        {available ? (
          <a href={v.id === 'original' ? '#/design/original' : variantHref(v.id)} className="inline-flex h-11 items-center gap-2 rounded-lg bg-pine-800 px-4 text-sm font-medium text-white hover:bg-pine-900">
            Åpne {v.name} <ArrowRight className="size-4" aria-hidden />
          </a>
        ) : (
          <span className="inline-flex h-10 items-center rounded-lg border border-dashed border-slate-300 px-4 text-sm text-slate-500" aria-disabled="true">
            Ikke bygget ennå
          </span>
        )}
      </div>
    </li>
  );
}

/** Inngang for å sammenligne designvariantene. Kun for testing og demonstrasjon. */
export function DesignGallery() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <Logo />
      <h1 className="mt-8 text-3xl font-semibold tracking-tight">Designforslag</h1>
      <p className="mt-2 max-w-2xl text-slate-700">
        Flippsjekk i flere visuelle retninger. Alle bruker samme beregningsmotor, data, tjenester og forretningsregler – de skiller seg i layout, informasjonsarkitektur og uttrykk. Dette er en
        testside for sammenligning, ikke en del av produktet.
      </p>
      <ul className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
        {VARIANTS.map((v) => (
          <VariantCard key={v.id} v={v} />
        ))}
      </ul>
      <p className="mt-8 text-xs text-slate-600">
        Dagens versjon er bevart i Git: grenen <code>main</code> og tag <code>pre-design-baseline</code>. Finance ligger på grenen <code>design-finance</code> (tag <code>design-finance-v1</code>),
        Investment på <code>design-investment</code> (tagger <code>design-investment-v1</code> og <code>design-investment-v2</code>), Property på <code>design-property</code>. Direktelenker: <code>#/design/original</code>, <code>#/design/finance</code>,{' '}
        <code>#/design/investment</code> og <code>#/design/property</code>.
      </p>
    </div>
  );
}
