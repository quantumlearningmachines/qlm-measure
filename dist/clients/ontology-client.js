/**
 * OntologyClient — Typed wrapper over the QLM dataset export API.
 *
 * Zero-auth. Queries the public misconception ontology, learning graph,
 * and standards alignment datasets.
 */
export class OntologyClient {
    baseUrl;
    constructor(config) {
        this.baseUrl = config?.baseUrl ?? "https://play.quantumlearningmachines.com";
    }
    /**
     * Fetch a dataset from the public export API.
     *
     * @param dataset The dataset name to fetch.
     * @param options Optional query parameters (domain, format).
     * @returns Parsed JSON response.
     */
    async fetchDataset(dataset, options) {
        const params = new URLSearchParams({ dataset });
        if (options?.domain)
            params.set("domain", options.domain);
        if (options?.format)
            params.set("format", options.format);
        const url = `${this.baseUrl}/api/labpath/dataset-export?${params.toString()}`;
        const response = await fetch(url, {
            headers: { Accept: "application/json" },
        });
        if (!response.ok) {
            throw new Error(`OntologyClient: ${response.status} ${response.statusText} for ${dataset}`);
        }
        return response.json();
    }
    /** Fetch the misconception ontology. */
    async getMisconceptions(domain) {
        return this.fetchDataset("misconceptions", { domain });
    }
    /** Fetch the learning graph. */
    async getLearningGraph(domain) {
        return this.fetchDataset("learning-graph", { domain });
    }
    /** Fetch standards alignment data. */
    async getStandards(domain) {
        return this.fetchDataset("standards", { domain });
    }
}
//# sourceMappingURL=ontology-client.js.map