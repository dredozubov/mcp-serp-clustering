/**
 * Comparison tests to verify TypeScript implementation matches Python implementation.
 *
 * These tests run both implementations on the same input data and compare outputs.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execSync } from "child_process";
import { readFileSync, existsSync, mkdirSync, rmSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import {
  runClustering,
  loadSerpData,
  calculateUrlOverlap,
  clusterKeywords,
  generateSlug,
} from "../src/cluster.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const FIXTURES_DIR = join(__dirname, "fixtures");
const OUTPUT_DIR = join(__dirname, "output");
const SAMPLE_CSV = join(FIXTURES_DIR, "sample-serp.csv");
const PYTHON_SCRIPT = join(__dirname, "serp_cluster.py");

// Output paths
const PY_CLUSTERS = join(OUTPUT_DIR, "py-clusters.csv");
const PY_OVERLAP = join(OUTPUT_DIR, "py-overlap.csv");
const TS_CLUSTERS = join(OUTPUT_DIR, "ts-clusters.csv");
const TS_OVERLAP = join(OUTPUT_DIR, "ts-overlap.csv");

/**
 * Parse a CSV file into an array of objects.
 */
function parseCSV(filepath: string): Record<string, string>[] {
  const content = readFileSync(filepath, "utf-8").trim();
  const lines = content.split("\n");
  const headers = lines[0].split(",").map((h) => h.trim());

  return lines.slice(1).map((line) => {
    // Handle quoted values with commas
    const values: string[] = [];
    let current = "";
    let inQuotes = false;

    for (const char of line) {
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === "," && !inQuotes) {
        values.push(current.trim());
        current = "";
      } else {
        current += char;
      }
    }
    values.push(current.trim());

    const obj: Record<string, string> = {};
    headers.forEach((header, i) => {
      obj[header] = values[i] || "";
    });
    return obj;
  });
}

/**
 * Normalize cluster data for comparison.
 * Sorts keywords within clusters and normalizes formatting.
 */
function normalizeClusters(
  clusters: Record<string, string>[]
): Record<string, string | number>[] {
  return clusters
    .map((c) => ({
      cluster_id: parseInt(c.cluster_id),
      primary_keyword: c.primary_keyword,
      cluster_keywords: c.cluster_keywords
        .split(",")
        .map((k) => k.trim())
        .sort()
        .join(", "),
      keyword_count: parseInt(c.keyword_count),
      shared_url_count: parseInt(c.shared_url_count),
      recommended_slug: c.recommended_slug,
    }))
    .sort((a, b) => a.primary_keyword.localeCompare(b.primary_keyword));
}

/**
 * Normalize overlap data for comparison.
 */
function normalizeOverlap(
  overlap: Record<string, string>[]
): Record<string, string | number>[] {
  return overlap
    .map((o) => {
      // Normalize keyword order (alphabetically)
      const [kw1, kw2] = [o.keyword1, o.keyword2].sort();
      return {
        keyword1: kw1,
        keyword2: kw2,
        overlap_count: parseInt(o.overlap_count),
        overlap_score: parseFloat(o.overlap_score).toFixed(3),
      };
    })
    .sort((a, b) => {
      const cmp1 = (a.keyword1 as string).localeCompare(b.keyword1 as string);
      if (cmp1 !== 0) return cmp1;
      return (a.keyword2 as string).localeCompare(b.keyword2 as string);
    });
}

describe("Python vs TypeScript Implementation Comparison", () => {
  beforeAll(() => {
    // Create output directory
    if (!existsSync(OUTPUT_DIR)) {
      mkdirSync(OUTPUT_DIR, { recursive: true });
    }

    // Run Python implementation
    execSync(`python3 "${PYTHON_SCRIPT}" "${SAMPLE_CSV}" "${PY_CLUSTERS}" "${PY_OVERLAP}"`, {
      stdio: "pipe",
    });

    // Run TypeScript implementation
    runClustering(SAMPLE_CSV, TS_CLUSTERS, TS_OVERLAP);
  });

  afterAll(() => {
    // Clean up output files
    if (existsSync(OUTPUT_DIR)) {
      rmSync(OUTPUT_DIR, { recursive: true });
    }
  });

  it("should produce the same number of clusters", () => {
    const pyClusters = parseCSV(PY_CLUSTERS);
    const tsClusters = parseCSV(TS_CLUSTERS);

    expect(tsClusters.length).toBe(pyClusters.length);
  });

  it("should produce the same cluster groupings", () => {
    const pyClusters = normalizeClusters(parseCSV(PY_CLUSTERS));
    const tsClusters = normalizeClusters(parseCSV(TS_CLUSTERS));

    // Compare cluster keywords (the actual groupings)
    const pyGroupings = pyClusters.map((c) => c.cluster_keywords).sort();
    const tsGroupings = tsClusters.map((c) => c.cluster_keywords).sort();

    expect(tsGroupings).toEqual(pyGroupings);
  });

  it("should produce the same keyword counts per cluster", () => {
    const pyClusters = normalizeClusters(parseCSV(PY_CLUSTERS));
    const tsClusters = normalizeClusters(parseCSV(TS_CLUSTERS));

    const pyCounts = pyClusters.map((c) => c.keyword_count).sort((a, b) => (a as number) - (b as number));
    const tsCounts = tsClusters.map((c) => c.keyword_count).sort((a, b) => (a as number) - (b as number));

    expect(tsCounts).toEqual(pyCounts);
  });

  it("should produce the same shared URL counts", () => {
    const pyClusters = normalizeClusters(parseCSV(PY_CLUSTERS));
    const tsClusters = normalizeClusters(parseCSV(TS_CLUSTERS));

    // Match by cluster_keywords to compare shared_url_count
    for (const pyCluster of pyClusters) {
      const tsCluster = tsClusters.find(
        (c) => c.cluster_keywords === pyCluster.cluster_keywords
      );
      expect(tsCluster).toBeDefined();
      expect(tsCluster!.shared_url_count).toBe(pyCluster.shared_url_count);
    }
  });

  it("should produce the same overlap matrix size", () => {
    const pyOverlap = parseCSV(PY_OVERLAP);
    const tsOverlap = parseCSV(TS_OVERLAP);

    expect(tsOverlap.length).toBe(pyOverlap.length);
  });

  it("should produce the same overlap counts", () => {
    const pyOverlap = normalizeOverlap(parseCSV(PY_OVERLAP));
    const tsOverlap = normalizeOverlap(parseCSV(TS_OVERLAP));

    for (const pyEntry of pyOverlap) {
      const tsEntry = tsOverlap.find(
        (e) => e.keyword1 === pyEntry.keyword1 && e.keyword2 === pyEntry.keyword2
      );
      expect(tsEntry).toBeDefined();
      expect(tsEntry!.overlap_count).toBe(pyEntry.overlap_count);
    }
  });

  it("should produce the same overlap scores", () => {
    const pyOverlap = normalizeOverlap(parseCSV(PY_OVERLAP));
    const tsOverlap = normalizeOverlap(parseCSV(TS_OVERLAP));

    for (const pyEntry of pyOverlap) {
      const tsEntry = tsOverlap.find(
        (e) => e.keyword1 === pyEntry.keyword1 && e.keyword2 === pyEntry.keyword2
      );
      expect(tsEntry).toBeDefined();
      expect(tsEntry!.overlap_score).toBe(pyEntry.overlap_score);
    }
  });

  it("should generate the same slugs", () => {
    const pyClusters = parseCSV(PY_CLUSTERS);
    const tsClusters = parseCSV(TS_CLUSTERS);

    const pySlugs = pyClusters.map((c) => c.recommended_slug).sort();
    const tsSlugs = tsClusters.map((c) => c.recommended_slug).sort();

    expect(tsSlugs).toEqual(pySlugs);
  });
});

describe("TypeScript Unit Tests", () => {
  it("loadSerpData should parse CSV correctly", () => {
    const data = loadSerpData(SAMPLE_CSV);

    expect(data.size).toBeGreaterThan(0);
    expect(data.has("best running shoes")).toBe(true);
    expect(data.get("best running shoes")!.length).toBe(10);
  });

  it("loadSerpData should only include top 10 positions", () => {
    const data = loadSerpData(SAMPLE_CSV);

    for (const [, urls] of data) {
      expect(urls.length).toBeLessThanOrEqual(10);
    }
  });

  it("calculateUrlOverlap should find overlapping keywords", () => {
    const serpData = loadSerpData(SAMPLE_CSV);
    const overlap = calculateUrlOverlap(serpData);

    expect(overlap.size).toBeGreaterThan(0);

    // Check that running shoes keywords have high overlap
    const runningKey1 = "best running shoes|running shoes reviews";
    const runningKey2 = "running shoes reviews|best running shoes";

    const hasOverlap = overlap.has(runningKey1) || overlap.has(runningKey2);
    expect(hasOverlap).toBe(true);
  });

  it("clusterKeywords should group keywords with 3+ shared URLs", () => {
    const serpData = loadSerpData(SAMPLE_CSV);
    const overlap = calculateUrlOverlap(serpData);
    const clusters = clusterKeywords(serpData, overlap, 3);

    expect(clusters.length).toBeGreaterThan(0);

    // Find the running shoes cluster
    const runningCluster = clusters.find(
      (c) => c.has("best running shoes") || c.has("running shoes reviews")
    );
    expect(runningCluster).toBeDefined();

    // All three running keywords should be in the same cluster
    if (runningCluster) {
      expect(runningCluster.has("best running shoes")).toBe(true);
      expect(runningCluster.has("running shoes reviews")).toBe(true);
      expect(runningCluster.has("top running shoes 2024")).toBe(true);
    }
  });

  it("clusterKeywords should keep standalone keywords separate", () => {
    const serpData = loadSerpData(SAMPLE_CSV);
    const overlap = calculateUrlOverlap(serpData);
    const clusters = clusterKeywords(serpData, overlap, 3);

    // Find standalone keyword cluster
    const standaloneCluster = clusters.find((c) =>
      c.has("unique keyword alone")
    );
    expect(standaloneCluster).toBeDefined();
    expect(standaloneCluster!.size).toBe(1);
  });

  it("generateSlug should create valid URL slugs", () => {
    expect(generateSlug("Best Running Shoes")).toBe("best-running-shoes");
    expect(generateSlug("top 10 products!")).toBe("top-10-products");
    expect(generateSlug("hello   world")).toBe("hello-world");
    expect(generateSlug("special@chars#here")).toBe("specialcharshere");
  });

  it("generateSlug should limit length to 60 characters", () => {
    const longText =
      "this is a very long keyword that should be truncated to sixty characters maximum";
    const slug = generateSlug(longText);
    expect(slug.length).toBeLessThanOrEqual(60);
  });
});
