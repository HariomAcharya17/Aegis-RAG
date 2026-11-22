import { LAYER_INFO, OUTCOME_LABEL } from "@/lib/layers";

export type Layer = { name: string; outcome: "pass" | "block" | "flag" | "skip"; detail?: string };

/** The step-by-step record of what each safety layer decided. */
export function LayerTrace({ layers }: { layers: Layer[] }) {
  return (
    <ol className="trace">
      {layers.map((l, i) => {
        const info = LAYER_INFO[l.name];
        return (
          <li key={i} className={`trace-step ${l.outcome}`}>
            <span className="trace-dot" aria-hidden />
            <div>
              <div className="trace-head">
                <strong>{info?.plain ?? l.name}</strong>
                <span className={`o ${l.outcome}`}>{OUTCOME_LABEL[l.outcome] ?? l.outcome}</span>
                {info && <span className="faint mono small">{l.name}</span>}
              </div>
              <p className="small muted">{l.detail ?? info?.what}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
