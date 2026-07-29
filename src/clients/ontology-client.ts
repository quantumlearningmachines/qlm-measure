/**
 * OntologyClient — Typed wrapper over the QLM dataset export API.
 *
 * Zero-auth. Queries the public misconception ontology, learning graph,
 * and standards alignment datasets.
 */

export type DatasetName =
  | "misconceptions"
  | "learning-graph"
  | "standards"
  | "assistments-alignment";

export interface OntologyClientConfig {
  /** Base URL of the QLM API. Default: https://play.quantumlearningmachines.com */
  baseUrl?: string;
}

export interface MisconceptionEntry {
  id: string;
  domain: string;
  topic: string;
  label: string;
  description: string;
  triggerPatterns: string[];
  correctivePrompts: string[];
  gradeRange?: string;
  severity?: string;
}

export interface LearningGraphNode {
  id: string;
  label: string;
  domain: string;
  prerequisites: string[];
  relatedMisconceptions: string[];
}

export interface StandardAlignment {
  standardCode: string;
  framework: string;
  description: string;
  mappedConstructIds: string[];
}

export interface ASSISTmentsAlignment {
  assistmentsSkillId: string;
  skillName: string;
  commonCoreStandard: string;
  domain: string;
  gradeLevel: number;
  mappedMisconceptionIds: string[];
}

export class OntologyClient {
  private readonly baseUrl: string;

  constructor(config?: OntologyClientConfig) {
    this.baseUrl = config?.baseUrl ?? "https://play.quantumlearningmachines.com";
  }

  /**
   * Fetch a dataset from the public export API.
   *
   * @param dataset The dataset name to fetch.
   * @param options Optional query parameters (domain, format).
   * @returns Parsed JSON response.
   */
  async fetchDataset<T = unknown>(
    dataset: DatasetName,
    options?: { domain?: string; format?: string },
  ): Promise<T> {
    const params = new URLSearchParams({ dataset });
    if (options?.domain) params.set("domain", options.domain);
    if (options?.format) params.set("format", options.format);

    const url = `${this.baseUrl}/api/labpath/dataset-export?${params.toString()}`;
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
    });

    if (!response.ok) {
      throw new Error(`OntologyClient: ${response.status} ${response.statusText} for ${dataset}`);
    }

    return response.json() as Promise<T>;
  }

  /** Fetch the misconception ontology. */
  async getMisconceptions(domain?: string): Promise<MisconceptionEntry[]> {
    return this.fetchDataset<MisconceptionEntry[]>("misconceptions", { domain });
  }

  /** Fetch the learning graph. */
  async getLearningGraph(domain?: string): Promise<LearningGraphNode[]> {
    return this.fetchDataset<LearningGraphNode[]>("learning-graph", { domain });
  }

  /** Fetch standards alignment data. */
  async getStandards(domain?: string): Promise<StandardAlignment[]> {
    return this.fetchDataset<StandardAlignment[]>("standards", { domain });
  }

  /** Fetch ASSISTments skill-to-standard alignment data. */
  async getASSISTmentsAlignment(domain?: string): Promise<ASSISTmentsAlignment[]> {
    return this.fetchDataset<ASSISTmentsAlignment[]>("assistments-alignment", { domain });
  }
}
