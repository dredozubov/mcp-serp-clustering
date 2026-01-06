/**
 * SERP Clustering Module
 *
 * Clusters keywords by SERP overlap (shared URLs in top 10 results).
 * Keywords with 3+ shared URLs in top 10 should target the same page.
 */

import { readFileSync, writeFileSync } from "fs";
import { parse } from "csv-parse/sync";

export interface OverlapData {
  sharedUrls: string[];
  count: number;
  overlapScore: number;
}

export interface ClusterOutput {
  cluster_id: number;
  primary_keyword: string;
  cluster_keywords: string;
  keyword_count: number;
  shared_urls: string;
  shared_url_count: number;
  recommended_slug: string;
}

export interface ClusteringResult {
  success: boolean;
  message: string;
  clusters_created: number;
  output_files: {
    clusters: string;
    overlap: string;
  };
}

type SerpData = Map<string, string[]>;
type OverlapMatrix = Map<string, OverlapData>;

/**
 * Load SERP data from CSV file.
 * Expected columns: keyword, position, url
 */
export function loadSerpData(filepath: string): SerpData {
  const content = readFileSync(filepath, "utf-8");
  const records = parse(content, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  }) as Array<{ keyword: string; position: string; url: string }>;

  const serpData: SerpData = new Map();

  for (const row of records) {
    const keyword = row.keyword.trim();
    const url = row.url.trim();
    const position = parseInt(row.position, 10) || 0;

    // Only consider top 10 positions
    if (position <= 10) {
      if (!serpData.has(keyword)) {
        serpData.set(keyword, []);
      }
      serpData.get(keyword)!.push(url);
    }
  }

  return serpData;
}

/**
 * Generate all unique pairs from an array (combinations of 2).
 */
function* combinations<T>(items: T[]): Generator<[T, T]> {
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      yield [items[i], items[j]];
    }
  }
}

/**
 * Calculate URL overlap between all keyword pairs.
 */
export function calculateUrlOverlap(serpData: SerpData): OverlapMatrix {
  const overlapMatrix: OverlapMatrix = new Map();
  const keywords = Array.from(serpData.keys());

  for (const [kw1, kw2] of combinations(keywords)) {
    const urls1 = new Set(serpData.get(kw1)!);
    const urls2 = new Set(serpData.get(kw2)!);

    const shared = [...urls1].filter((url) => urls2.has(url));
    const sharedCount = shared.length;

    if (sharedCount > 0) {
      const key = `${kw1}|${kw2}`;
      overlapMatrix.set(key, {
        sharedUrls: shared,
        count: sharedCount,
        overlapScore: sharedCount / Math.min(urls1.size, urls2.size),
      });
    }
  }

  return overlapMatrix;
}

/**
 * Cluster keywords by SERP overlap.
 *
 * Keywords with >= minOverlap shared URLs should be in the same cluster.
 * Uses greedy clustering: largest overlap pairs first.
 */
export function clusterKeywords(
  serpData: SerpData,
  overlapMatrix: OverlapMatrix,
  minOverlap = 3
): Set<string>[] {
  const clusters: Set<string>[] = [];
  const assigned = new Set<string>();
  const keywords = Array.from(serpData.keys());

  // Sort pairs by overlap count (descending)
  const sortedPairs = Array.from(overlapMatrix.entries()).sort(
    (a, b) => b[1].count - a[1].count
  );

  // Build clusters greedily
  for (const [key, data] of sortedPairs) {
    if (data.count < minOverlap) {
      break;
    }

    const [kw1, kw2] = key.split("|");

    // Find if either keyword is already in a cluster
    let clusterIdx = -1;
    for (let i = 0; i < clusters.length; i++) {
      if (clusters[i].has(kw1) || clusters[i].has(kw2)) {
        clusterIdx = i;
        break;
      }
    }

    if (clusterIdx !== -1) {
      // Add to existing cluster
      clusters[clusterIdx].add(kw1);
      clusters[clusterIdx].add(kw2);
    } else {
      // Create new cluster
      clusters.push(new Set([kw1, kw2]));
    }

    assigned.add(kw1);
    assigned.add(kw2);
  }

  // Add unassigned keywords as single-keyword clusters
  for (const kw of keywords) {
    if (!assigned.has(kw)) {
      clusters.push(new Set([kw]));
    }
  }

  return clusters;
}

/**
 * Generate URL slug from text.
 */
export function generateSlug(text: string): string {
  let slug = text.toLowerCase();
  slug = slug.replace(/ /g, "-");
  slug = slug.replace(/[^a-z0-9-]/g, "");
  slug = slug
    .split("-")
    .filter((s) => s)
    .join("-"); // Remove multiple dashes
  return slug.slice(0, 60); // Limit length
}

/**
 * Create structured cluster output.
 */
export function createClusterOutput(
  clusters: Set<string>[],
  serpData: SerpData
): ClusterOutput[] {
  const clusterOutput: ClusterOutput[] = [];

  for (let i = 0; i < clusters.length; i++) {
    const cluster = clusters[i];
    const clusterList = Array.from(cluster).sort();

    // Primary keyword = first alphabetically
    const primaryKw = clusterList[0];

    // Get shared URLs for this cluster
    let sharedUrls = new Set(serpData.get(primaryKw)!);
    for (const kw of clusterList.slice(1)) {
      const kwUrls = new Set(serpData.get(kw)!);
      sharedUrls = new Set([...sharedUrls].filter((url) => kwUrls.has(url)));
    }

    clusterOutput.push({
      cluster_id: i + 1,
      primary_keyword: primaryKw,
      cluster_keywords: clusterList.join(", "),
      keyword_count: clusterList.length,
      shared_urls: Array.from(sharedUrls).slice(0, 3).join(", "), // Top 3
      shared_url_count: sharedUrls.size,
      recommended_slug: generateSlug(primaryKw),
    });
  }

  return clusterOutput;
}

/**
 * Escape a value for CSV output.
 */
function escapeCSV(value: string | number): string {
  const str = String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Save cluster data to CSV.
 */
export function saveClusters(
  clustersData: ClusterOutput[],
  filepath: string
): void {
  const fieldnames = [
    "cluster_id",
    "primary_keyword",
    "cluster_keywords",
    "keyword_count",
    "shared_urls",
    "shared_url_count",
    "recommended_slug",
  ] as const;

  const header = fieldnames.join(",");
  const rows = clustersData.map((row) =>
    fieldnames.map((field) => escapeCSV(row[field])).join(",")
  );

  writeFileSync(filepath, [header, ...rows].join("\n"), "utf-8");
}

/**
 * Save overlap matrix to CSV.
 */
export function saveOverlapMatrix(
  overlapMatrix: OverlapMatrix,
  filepath: string
): void {
  const fieldnames = [
    "keyword1",
    "keyword2",
    "shared_urls",
    "overlap_count",
    "overlap_score",
  ];

  const header = fieldnames.join(",");
  const rows: string[] = [];

  for (const [key, data] of overlapMatrix.entries()) {
    const [kw1, kw2] = key.split("|");
    rows.push(
      [
        escapeCSV(kw1),
        escapeCSV(kw2),
        escapeCSV(data.sharedUrls.slice(0, 3).join(", ")),
        data.count,
        data.overlapScore.toFixed(3),
      ].join(",")
    );
  }

  writeFileSync(filepath, [header, ...rows].join("\n"), "utf-8");
}

/**
 * Run the complete clustering pipeline.
 */
export function runClustering(
  inputFile: string,
  outputClusters: string,
  outputOverlap: string
): ClusteringResult {
  const messages: string[] = [];

  messages.push(`Loading SERP data from ${inputFile}...`);
  const serpData = loadSerpData(inputFile);
  messages.push(`  Loaded ${serpData.size} keywords`);

  messages.push("Calculating URL overlap...");
  const overlapMatrix = calculateUrlOverlap(serpData);
  messages.push(`  Found ${overlapMatrix.size} keyword pairs with overlap`);

  messages.push("Clustering keywords (min 3 shared URLs)...");
  const clusters = clusterKeywords(serpData, overlapMatrix, 3);
  messages.push(`  Created ${clusters.length} clusters`);

  messages.push("Generating cluster output...");
  const clustersData = createClusterOutput(clusters, serpData);

  messages.push(`Saving clusters to ${outputClusters}...`);
  saveClusters(clustersData, outputClusters);

  messages.push(`Saving overlap matrix to ${outputOverlap}...`);
  saveOverlapMatrix(overlapMatrix, outputOverlap);

  const multiKeywordClusters = clustersData.filter(
    (c) => c.keyword_count > 1
  ).length;
  const singleKeywordClusters = clustersData.filter(
    (c) => c.keyword_count === 1
  ).length;

  messages.push("\nClustering complete!");
  messages.push(`  Total keywords: ${serpData.size}`);
  messages.push(`  Clusters created: ${clusters.length}`);
  messages.push(`  Multi-keyword clusters: ${multiKeywordClusters}`);
  messages.push(`  Single-keyword clusters: ${singleKeywordClusters}`);

  return {
    success: true,
    message: messages.join("\n"),
    clusters_created: clusters.length,
    output_files: {
      clusters: outputClusters,
      overlap: outputOverlap,
    },
  };
}
