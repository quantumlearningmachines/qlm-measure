/**
 * OntologyClient — Typed wrapper over the QLM dataset export API.
 *
 * Zero-auth. Queries the public misconception ontology, learning graph,
 * and standards alignment datasets.
 */
export type DatasetName = "misconceptions" | "learning-graph" | "standards" | "assistments-alignment";
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
export declare class OntologyClient {
    private readonly baseUrl;
    constructor(config?: OntologyClientConfig);
    /**
     * Fetch a dataset from the public export API.
     *
     * @param dataset The dataset name to fetch.
     * @param options Optional query parameters (domain, format).
     * @returns Parsed JSON response.
     */
    fetchDataset<T = unknown>(dataset: DatasetName, options?: {
        domain?: string;
        format?: string;
    }): Promise<T>;
    /** Fetch the misconception ontology. */
    getMisconceptions(domain?: string): Promise<MisconceptionEntry[]>;
    /** Fetch the learning graph. */
    getLearningGraph(domain?: string): Promise<LearningGraphNode[]>;
    /** Fetch standards alignment data. */
    getStandards(domain?: string): Promise<StandardAlignment[]>;
    /** Fetch ASSISTments skill-to-standard alignment data. */
    getASSISTmentsAlignment(domain?: string): Promise<ASSISTmentsAlignment[]>;
}
//# sourceMappingURL=ontology-client.d.ts.map