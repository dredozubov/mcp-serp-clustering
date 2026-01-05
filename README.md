# mcp-serp-clustering

An MCP (Model Context Protocol) server for clustering keywords by SERP overlap. Groups keywords that share URLs in Google's top 10 results, indicating they should target the same page.

## What is SERP Clustering?

SERP (Search Engine Results Page) clustering is an SEO technique that groups keywords based on shared search results. If two keywords have 3+ URLs in common in their top 10 results, Google considers them the same search intent - they should be targeted on a single page rather than separate pages.

This approach is more accurate than semantic clustering because it uses Google's actual ranking signals rather than keyword similarity.

## Installation

```bash
npx mcp-serp-clustering
```

Or install globally:

```bash
npm install -g mcp-serp-clustering
```

### Requirements

- Node.js 18+
- Python 3.8+ (for the clustering algorithm)

## Claude Desktop Configuration

Add to your Claude Desktop config (`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):

```json
{
  "mcpServers": {
    "serp-clustering": {
      "command": "npx",
      "args": ["-y", "mcp-serp-clustering"]
    }
  }
}
```

## Tool: cluster_keywords

Clusters keywords by analyzing URL overlap in SERP data.

### Input

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `input_file` | string | Yes | Path to CSV file with SERP data |
| `output_clusters` | string | Yes | Path where cluster results will be saved |
| `output_overlap` | string | Yes | Path where URL overlap matrix will be saved |

### Input CSV Format

```csv
keyword,position,url
best crm software,1,https://example.com/crm
best crm software,2,https://another.com/crm-guide
enterprise crm,1,https://example.com/crm
enterprise crm,2,https://different.com/enterprise
```

### Output

**Clusters CSV** (`output_clusters`):
```csv
cluster_id,primary_keyword,cluster_keywords,keyword_count,shared_urls,shared_url_count,recommended_slug
1,best crm software,"best crm software, enterprise crm",2,"https://example.com/crm",1,best-crm-software
```

**Overlap Matrix CSV** (`output_overlap`):
```csv
keyword1,keyword2,shared_urls,overlap_count,overlap_score
best crm software,enterprise crm,https://example.com/crm,3,0.3
```

## Algorithm

1. Load SERP data (top 10 URLs for each keyword)
2. Calculate URL intersection for all keyword pairs
3. Build clusters greedily (highest overlap first)
4. Keywords with 3+ shared URLs join the same cluster
5. Unmatched keywords become single-keyword clusters

## Example Usage

Given a file with SERP data from 100 keywords, the tool might produce:
- 35 clusters (some with multiple keywords targeting same intent)
- 65 single-keyword clusters (unique search intents)

This tells you: instead of 100 pages, you may only need 35 to cover all search intents.

## Integration with SEO Workflows

This tool is designed to work with keyword research pipelines:

1. **Discovery**: Generate keyword list with volumes
2. **SERP Fetch**: Get top 10 URLs for each keyword (via Serper, DataForSEO, etc.)
3. **Clustering**: Use this tool to group by intent
4. **Content Planning**: One page per cluster, targeting all cluster keywords

## License

MIT
