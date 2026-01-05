#!/usr/bin/env python3
"""
SERP Clustering Script

Clusters keywords by SERP overlap (shared URLs in top 10 results).
Keywords with 3+ shared URLs in top 10 should target the same page.

Usage:
    python serp_cluster.py input.csv output_clusters.csv output_overlap.csv

Input CSV format:
    keyword, position, url

Output clusters CSV format:
    cluster_id, primary_keyword, cluster_keywords, total_volume, shared_urls, recommended_slug

Output overlap CSV format:
    keyword1, keyword2, shared_urls, overlap_score
"""

import sys
import csv
from collections import defaultdict
from itertools import combinations
import json

def load_serp_data(filepath):
    """Load SERP data from CSV."""
    serp_data = defaultdict(list)

    with open(filepath, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            keyword = row['keyword'].strip()
            url = row['url'].strip()
            position = int(row.get('position', 0))

            # Only consider top 10 positions
            if position <= 10:
                serp_data[keyword].append(url)

    return serp_data

def calculate_url_overlap(serp_data):
    """Calculate URL overlap between all keyword pairs."""
    overlap_matrix = {}
    keywords = list(serp_data.keys())

    for kw1, kw2 in combinations(keywords, 2):
        urls1 = set(serp_data[kw1])
        urls2 = set(serp_data[kw2])

        shared = urls1.intersection(urls2)
        shared_count = len(shared)

        if shared_count > 0:
            overlap_matrix[(kw1, kw2)] = {
                'shared_urls': list(shared),
                'count': shared_count,
                'overlap_score': shared_count / min(len(urls1), len(urls2))
            }

    return overlap_matrix

def cluster_keywords(serp_data, overlap_matrix, min_overlap=3):
    """
    Cluster keywords by SERP overlap.

    Keywords with >= min_overlap shared URLs should be in the same cluster.
    Uses greedy clustering: largest overlap pairs first.
    """
    clusters = []
    assigned = set()
    keywords = list(serp_data.keys())

    # Sort pairs by overlap count (descending)
    sorted_pairs = sorted(
        overlap_matrix.items(),
        key=lambda x: x[1]['count'],
        reverse=True
    )

    # Build clusters greedily
    for (kw1, kw2), data in sorted_pairs:
        if data['count'] < min_overlap:
            break

        # Find if either keyword is already in a cluster
        cluster_idx = None
        for i, cluster in enumerate(clusters):
            if kw1 in cluster or kw2 in cluster:
                cluster_idx = i
                break

        if cluster_idx is not None:
            # Add to existing cluster
            clusters[cluster_idx].add(kw1)
            clusters[cluster_idx].add(kw2)
        else:
            # Create new cluster
            clusters.append({kw1, kw2})

        assigned.add(kw1)
        assigned.add(kw2)

    # Add unassigned keywords as single-keyword clusters
    for kw in keywords:
        if kw not in assigned:
            clusters.append({kw})

    return clusters

def generate_slug(text):
    """Generate URL slug from text."""
    # Simple slug generation
    slug = text.lower()
    slug = slug.replace(' ', '-')
    slug = ''.join(c for c in slug if c.isalnum() or c == '-')
    slug = '-'.join(filter(None, slug.split('-')))  # Remove multiple dashes
    return slug[:60]  # Limit length

def create_cluster_output(clusters, serp_data, overlap_matrix):
    """Create structured cluster output."""
    cluster_output = []

    for i, cluster in enumerate(clusters, 1):
        cluster_list = sorted(list(cluster))

        # Primary keyword = first alphabetically (could be improved with volume data)
        primary_kw = cluster_list[0]

        # Get shared URLs for this cluster
        shared_urls = set(serp_data[primary_kw])
        for kw in cluster_list[1:]:
            shared_urls = shared_urls.intersection(set(serp_data[kw]))

        cluster_output.append({
            'cluster_id': i,
            'primary_keyword': primary_kw,
            'cluster_keywords': ', '.join(cluster_list),
            'keyword_count': len(cluster_list),
            'shared_urls': ', '.join(list(shared_urls)[:3]),  # Top 3
            'shared_url_count': len(shared_urls),
            'recommended_slug': generate_slug(primary_kw)
        })

    return cluster_output

def save_clusters(clusters_data, filepath):
    """Save cluster data to CSV."""
    with open(filepath, 'w', newline='', encoding='utf-8') as f:
        fieldnames = ['cluster_id', 'primary_keyword', 'cluster_keywords',
                      'keyword_count', 'shared_urls', 'shared_url_count',
                      'recommended_slug']
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(clusters_data)

def save_overlap_matrix(overlap_matrix, filepath):
    """Save overlap matrix to CSV."""
    with open(filepath, 'w', newline='', encoding='utf-8') as f:
        fieldnames = ['keyword1', 'keyword2', 'shared_urls', 'overlap_count', 'overlap_score']
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()

        for (kw1, kw2), data in overlap_matrix.items():
            writer.writerow({
                'keyword1': kw1,
                'keyword2': kw2,
                'shared_urls': ', '.join(data['shared_urls'][:3]),
                'overlap_count': data['count'],
                'overlap_score': round(data['overlap_score'], 3)
            })

def main():
    if len(sys.argv) != 4:
        print("Usage: python serp_cluster.py input.csv output_clusters.csv output_overlap.csv")
        sys.exit(1)

    input_file = sys.argv[1]
    output_clusters = sys.argv[2]
    output_overlap = sys.argv[3]

    print(f"Loading SERP data from {input_file}...")
    serp_data = load_serp_data(input_file)
    print(f"  Loaded {len(serp_data)} keywords")

    print("Calculating URL overlap...")
    overlap_matrix = calculate_url_overlap(serp_data)
    print(f"  Found {len(overlap_matrix)} keyword pairs with overlap")

    print("Clustering keywords (min 3 shared URLs)...")
    clusters = cluster_keywords(serp_data, overlap_matrix, min_overlap=3)
    print(f"  Created {len(clusters)} clusters")

    print("Generating cluster output...")
    clusters_data = create_cluster_output(clusters, serp_data, overlap_matrix)

    print(f"Saving clusters to {output_clusters}...")
    save_clusters(clusters_data, output_clusters)

    print(f"Saving overlap matrix to {output_overlap}...")
    save_overlap_matrix(overlap_matrix, output_overlap)

    print("\n✅ Clustering complete!")
    print(f"  Total keywords: {len(serp_data)}")
    print(f"  Clusters created: {len(clusters)}")
    print(f"  Multi-keyword clusters: {sum(1 for c in clusters_data if c['keyword_count'] > 1)}")
    print(f"  Single-keyword clusters: {sum(1 for c in clusters_data if c['keyword_count'] == 1)}")

    return 0

if __name__ == '__main__':
    sys.exit(main())
