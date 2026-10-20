import { Copy, Pencil, RotateCcw, Save, Trash2 } from "lucide-react";
import { Select } from "../../../components/ui/forms";
import { Badge, Button } from "../../../components/ui/primitives";
import type { PropertyViewProps } from "../../../pages/PropertyPage";

/** Brukerens private kalkyle («Mitt scenario»): velg, lagre, gi nytt navn, tilbakestill eller slett. Samme handlinger som i Original. */
export function MyScenarioBar({ p }: { p: PropertyViewProps }) {
  const { it, selected, scenarios, state, actions, ctx } = p;
  const { dirty, busy, canEdit, editable, locked } = state;
  return (
    <>
      {dirty && (
        <div
          className="sticky top-14 z-20 -mx-4 flex items-center justify-between gap-3 border-b border-[var(--fin-line)] bg-white px-4 py-2 md:hidden"
          role="status"
        >
          <span className="text-sm font-semibold text-[var(--fin-warn)]">
            Ulagrede endringer
          </span>
          <Button
            size="sm"
            variant="primary"
            className="min-h-11"
            icon={<Save className="size-4" aria-hidden />}
            disabled={!editable}
            loading={busy === "save"}
            onClick={() => void actions.save()}
          >
            Lagre
          </Button>
        </div>
      )}
      <section
        aria-label="Mitt scenario"
        className="-mx-4 border-y border-[var(--fin-line)] bg-white/95 px-4 py-2.5 sm:mx-0 sm:rounded-xl sm:border md:sticky md:top-14 md:z-20 md:backdrop-blur"
      >
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <label htmlFor="scenario-select" className="text-sm font-semibold">
            Min kalkyle
          </label>
          <div className="w-full sm:w-72">
            <Select
              id="scenario-select"
              className="h-10"
              value={selected.id}
              onChange={(e) => actions.switchTo(e.target.value)}
            >
              {scenarios.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                  {s.locked ? " (låst)" : ""}
                  {s.id === it.link.primaryScenarioId ? " (primært)" : ""}
                </option>
              ))}
            </Select>
          </div>
          {selected.id === it.link.primaryScenarioId ? (
            <Badge tone="pine">Primært – brukes i oversikt og kalender</Badge>
          ) : (
            <Button
              size="sm"
              variant="ghost"
              className="min-h-11 md:min-h-9"
              onClick={() => void actions.setPrimary()}
            >
              Sett som primært
            </Button>
          )}
          <span className="ml-auto flex flex-wrap items-center gap-2">
            {dirty && (
              <span className="hidden text-xs font-semibold text-[var(--fin-warn)] md:inline">
                Ulagrede endringer
              </span>
            )}
            <Button
              size="sm"
              variant="primary"
              className="min-h-11 md:min-h-9"
              icon={<Save className="size-4" aria-hidden />}
              disabled={!dirty || !editable}
              loading={busy === "save"}
              onClick={() => void actions.save()}
            >
              Lagre
            </Button>
            <Button
              size="sm"
              className="min-h-11 md:min-h-9"
              variant={locked ? "primary" : "secondary"}
              icon={<Copy className="size-4" aria-hidden />}
              disabled={!canEdit}
              onClick={actions.openSaveAs}
            >
              Lagre som nytt
            </Button>
            <Button
              size="sm"
              className="min-h-11 md:min-h-9"
              icon={<Pencil className="size-4" aria-hidden />}
              disabled={!editable}
              onClick={actions.openRename}
              aria-label="Gi nytt navn"
            >
              <span className="hidden sm:inline">Navn</span>
            </Button>
            <Button
              size="sm"
              className="min-h-11 md:min-h-9"
              icon={<RotateCcw className="size-4" aria-hidden />}
              disabled={!editable || !ctx.base}
              onClick={actions.resetToBase}
              title="Sett alle forutsetninger til grunnlaget i analysen"
            >
              <span className="hidden sm:inline">
                Tilbakestill<span className="sr-only"> til grunnlag</span>
              </span>
              <span className="sr-only sm:hidden">
                Tilbakestill til grunnlag
              </span>
            </Button>
            <Button
              size="sm"
              className="min-h-11 md:min-h-9"
              variant="danger"
              icon={<Trash2 className="size-4" aria-hidden />}
              disabled={!editable || scenarios.length < 2}
              onClick={actions.openDelete}
              aria-label="Slett scenario"
            />
          </span>
        </div>
      </section>
    </>
  );
}
