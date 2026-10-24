/**
 * QLM's public LabPath datasets, read from play.quantumlearningmachines.com: GET only, one host, a
 * timeout, no redirects, and each dataset fetched at most once per process (kept in memory).
 * Source: qlm-games src/app/api/labpath/dataset-export/route.ts.
 */
import { Refusal } from "../files.js";

export const DATASET_URL = "https://play.quantumlearningmachines.com/api/labpath/dataset-export";
export const ARCHIVE = "QLM LabPath Dataset v1.0, Zenodo, https://doi.org/10.5281/zenodo.21800324 (CC BY 4.0; the archived v1.0 holds the 423 released misconceptions)";
export type Dataset = "misconceptions" | "learning-graph" | "standards";

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const LIST: Record<Dataset, string> = { misconceptions: "misconceptions", "learning-graph": "learningGraph", standards: "standardsAlignment" };

export class DatasetClient {
  private readonly cache = new Map<Dataset, Promise<Obj>>();
  constructor(private readonly fetchImpl: typeof fetch = fetch) {}

  get(dataset: Dataset): Promise<Obj> {
    let p = this.cache.get(dataset);
    if (!p) {
      p = this.load(dataset);
      this.cache.set(dataset, p);
      p.catch(() => this.cache.delete(dataset));
    }
    return p;
  }

  private async load(dataset: Dataset): Promise<Obj> {
    const url = `${DATASET_URL}?dataset=${dataset}`;
    let res: Response;
    try {
      res = await this.fetchImpl(url, { method: "GET", redirect: "error", headers: { accept: "application/json" }, signal: AbortSignal.timeout(30_000) });
    } catch (e) {
      throw new Refusal(`Couldn't reach play.quantumlearningmachines.com: ${e instanceof Error ? e.message : String(e)}`);
    }
    if (res.status !== 200) throw new Refusal(`The LabPath dataset service answered HTTP ${res.status}.`);
    const text = await res.text();
    if (text.length > 50_000_000) throw new Refusal("The LabPath dataset service's answer was too large.");
    let body: unknown = null;
    try {
      body = JSON.parse(text);
    } catch {
      // checked below
    }
    if (!isObj(body) || !isObj(body._meta) || !Array.isArray(body[LIST[dataset]])) throw new Refusal(`The service's answer wasn't the ${dataset} export this tool expects.`);
    return body;
  }
}

/** The dataset's own description, for citing it. */
export function datasetInfo(body: Obj, dataset: Dataset): Obj {
  const meta = body._meta as Obj;
  return { source: `${DATASET_URL}?dataset=${dataset}`, version: meta.version, license: meta.license, citation: meta.citation, exported_at: meta.exportedAt, archived: ARCHIVE };
}
