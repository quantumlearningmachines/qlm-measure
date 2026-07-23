/**
 * Example 01: Query the misconception ontology
 *
 * Fetches the public misconception dataset from QLM's open API.
 * No authentication required.
 *
 * Run: npx tsx examples/01-query-ontology.ts
 */

import { OntologyClient } from "../src/clients/ontology-client";

async function main() {
  const client = new OntologyClient();

  console.log("Fetching misconception ontology...\n");

  try {
    const misconceptions = await client.getMisconceptions("math");
    console.log(`Found ${misconceptions.length} math misconceptions.\n`);

    // Show first 3
    for (const m of misconceptions.slice(0, 3)) {
      console.log(`  ${m.id}: ${m.label}`);
      console.log(`    Domain: ${m.domain} | Topic: ${m.topic}`);
      console.log(`    ${m.description.slice(0, 100)}...`);
      console.log();
    }
  } catch (error) {
    console.error("Failed to fetch ontology:", error);
    console.log("\nNote: This example requires the QLM API to be reachable.");
    console.log("Visit https://play.quantumlearningmachines.com/developer for details.");
  }
}

main();
