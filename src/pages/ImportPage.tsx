import { CheckCircle2, FileJson, Upload, XCircle } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { useServices } from '../app/services';
import { useSession } from '../app/session';
import { useToast } from '../app/toast';
import { evaluateScenario } from '../calc/scenario';
import { Select, Textarea } from '../components/ui/forms';
import { Alert, Badge, Button, Card, SectionTitle } from '../components/ui/primitives';
import { EXAMPLE_V1_IMPORT } from '../import/example';
import type { ImportChoice, ImportPreview, ImportResult } from '../import/types';
import { V1_LIMITS } from '../import/v1Adapter';
import { formatNOK } from '../lib/format';

export function ImportPage() {
  const services = useServices();
  const { entitlements } = useSession();
  const toast = useToast();
  const [text, setText] = useState('');
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [choices, setChoices] = useState<Record<number, ImportChoice>>({});
  const [result, setResult] = useState<ImportResult | null>(null);
  const [busy, setBusy] = useState(false);

  const doPreview = async (content = text) => {
    setBusy(true);
    setResult(null);
    try {
      const bytes = new TextEncoder().encode(content).length;
      const p = await services.imports.preview(content, bytes);
      setPreview(p);
      setChoices(Object.fromEntries(p.objects.map((o) => [o.index, { action: o.mapped ? 'new_scenario' : 'skip' } as ImportChoice])));
    } catch (e) {
      toast({ tone: 'danger', title: 'Forhåndsvisning feilet', body: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const onFile = async (file: File) => {
    if (file.size > V1_LIMITS.maxBytes) {
      toast({ tone: 'warning', title: 'Filen er for stor', body: 'Maks 1 MB per import.' });
      return;
    }
    const content = await file.text(); // leses som UTF-8
    setText(content);
    await doPreview(content);
  };

  const commit = async () => {
    if (!preview) return;
    setBusy(true);
    try {
      const r = await services.imports.commit(preview, choices);
      setResult(r);
      setPreview(null);
      toast({ tone: 'success', title: `${r.imported.length} objekt${r.imported.length === 1 ? '' : 'er'} importert som private data` });
    } catch (e) {
      toast({ tone: 'danger', title: 'Importen ble ikke lagret', body: `${(e as Error).message} Ingenting er endret.` });
    } finally {
      setBusy(false);
    }
  };

  const importable = preview?.objects.filter((o) => o.mapped && choices[o.index]?.action !== 'skip').length ?? 0;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Importer analyser (Flippsjekk v1)</h1>
        <p className="text-sm text-slate-600">
          UTF-8 JSON med roten <code className="rounded bg-slate-100 px-1">{'{"format":"flipprom-analysis","version":1,"objects":[]}'}</code>. Maks {V1_LIMITS.maxObjects} objekter og 1 MB.
        </p>
      </div>
      <Alert tone="info" title="Importen blir private data">
        Importerte analyser lagres som dine private utkast og scenarioer. Importerte buddager og visninger merkes som ikke kildebekreftet.
      </Alert>
      {entitlements?.access !== 'full' && <Alert tone="warning">Import krever aktivt abonnement. Du kan forhåndsvise filen, men ikke lagre.</Alert>}

      <Card className="space-y-3 p-5">
        <div className="flex flex-wrap gap-2">
          <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium hover:bg-slate-50 focus-within:outline-2 focus-within:outline-pine-600">
            <Upload className="size-4" aria-hidden /> Velg fil
            <input type="file" accept="application/json,.json" className="sr-only" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
          </label>
          <Button
            icon={<FileJson className="size-4" aria-hidden />}
            onClick={() => {
              const t = JSON.stringify(EXAMPLE_V1_IMPORT, null, 2);
              setText(t);
              void doPreview(t);
            }}
          >
            Last inn eksempel
          </Button>
        </div>
        <label htmlFor="import-text" className="block text-sm font-medium">
          …eller lim inn JSON
        </label>
        <Textarea id="import-text" rows={8} className="font-mono text-xs" value={text} onChange={(e) => setText(e.target.value)} spellCheck={false} />
        <Button variant="primary" loading={busy} disabled={!text.trim()} onClick={() => doPreview()}>
          Forhåndsvis
        </Button>
      </Card>

      {preview && (
        <section className="space-y-3" aria-label="Forhåndsvisning av import">
          <SectionTitle sub="Ingenting er lagret ennå. Kontroller meldingene og velg hva som skal skje med hvert objekt.">Forhåndsvisning</SectionTitle>
          {preview.rootErrors.map((e) => (
            <Alert key={e.path + e.message} tone="danger" title={`Feil i ${e.path}`}>
              {e.message}
            </Alert>
          ))}
          {preview.rootWarnings.map((e) => (
            <Alert key={e.path + e.message} tone="warning">
              {e.path}: {e.message}
            </Alert>
          ))}
          {preview.objects.map((o) => {
            const ev = o.mapped ? evaluateScenario(o.mapped.values, { detailed: false }) : null;
            return (
              <Card key={o.index} className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="flex items-center gap-2 font-semibold">
                      {o.mapped ? <CheckCircle2 className="size-4 text-pine-700" aria-hidden /> : <XCircle className="size-4 text-red-700" aria-hidden />}
                      objects[{o.index}] · {o.name}
                    </p>
                    <p className="text-xs text-slate-600">
                      FINN-kode {o.finnId ?? 'ukjent'} · {o.existingPropertyId ? (o.alreadyInList ? 'Finnes i listen din' : 'Kjent eiendom – kobles uten duplisering') : 'Ny eiendom (bare identitet)'}
                    </p>
                    {ev && (
                      <p className="num mt-1 text-sm">
                        Kalkyle:{' '}
                        {ev.evaluation.base ? (
                          <strong>{formatNOK(ev.evaluation.base.profit)}</strong>
                        ) : (
                          <span className="text-amber-800">ufullstendig – mangler {ev.missing.map((m) => m.label).join(', ')}</span>
                        )}
                      </p>
                    )}
                  </div>
                  {o.mapped && (
                    <div className="w-64">
                      <label htmlFor={`choice-${o.index}`} className="mb-1 block text-xs font-medium">
                        Handling
                      </label>
                      <Select
                        id={`choice-${o.index}`}
                        value={(() => {
                          const c = choices[o.index];
                          return c?.action === 'replace' ? `replace:${c.scenarioId}` : c?.action ?? 'new_scenario';
                        })()}
                        onChange={(e) => {
                          const v = e.target.value;
                          setChoices({ ...choices, [o.index]: v.startsWith('replace:') ? { action: 'replace', scenarioId: v.slice(8) } : { action: v as 'new_scenario' | 'skip' } });
                        }}
                      >
                        <option value="new_scenario">Lagre som nytt privat scenario</option>
                        {o.existingScenarios.map((s) => (
                          <option key={s.id} value={`replace:${s.id}`}>
                            Erstatt «{s.name}»
                          </option>
                        ))}
                        <option value="skip">Hopp over</option>
                      </Select>
                    </div>
                  )}
                </div>
                {o.errors.length > 0 && (
                  <ul className="mt-3 space-y-1 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-950">
                    {o.errors.map((e) => (
                      <li key={e.path + e.message}>
                        <code className="text-xs font-semibold">{e.path}</code>: {e.message}
                      </li>
                    ))}
                  </ul>
                )}
                {o.warnings.length > 0 && (
                  <details className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
                    <summary className="cursor-pointer font-medium">{o.warnings.length} merknader</summary>
                    <ul className="mt-2 space-y-1">
                      {o.warnings.map((e, i) => (
                        <li key={i}>
                          <code className="text-xs font-semibold">{e.path}</code>: {e.message}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
                {Object.keys(o.unmapped).length > 0 && (
                  <p className="mt-2 text-xs text-slate-600">
                    Bevares uten mapping: {Object.keys(o.unmapped).map((k) => <Badge key={k} tone="outline" className="mr-1">{k}</Badge>)}
                  </p>
                )}
              </Card>
            );
          })}
          {preview.objects.length > 0 && (
            <div className="flex flex-wrap items-center gap-3">
              <Button variant="primary" loading={busy} disabled={importable === 0 || entitlements?.access !== 'full'} onClick={commit}>
                Importer {importable} objekt{importable === 1 ? '' : 'er'}
              </Button>
              <span className="text-sm text-slate-600">Hele importen lagres samlet – feiler noe, lagres ingenting.</span>
            </div>
          )}
        </section>
      )}

      {result && (
        <Alert tone="success" title="Importen er lagret">
          <ul className="list-disc pl-4">
            {result.imported.map((r) => (
              <li key={r.index}>
                objects[{r.index}]: {r.action === 'replace' ? 'erstattet scenario' : 'nytt scenario'} –{' '}
                <Link to={`/objekter/${r.propertyId}`} className="underline">
                  åpne objektet
                </Link>
              </li>
            ))}
          </ul>
          {result.skipped.length > 0 && <p>Hoppet over: {result.skipped.map((i) => `objects[${i}]`).join(', ')}.</p>}
        </Alert>
      )}
    </div>
  );
}
