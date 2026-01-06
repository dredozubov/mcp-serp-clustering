#!/usr/bin/env node

/**
 * MCP Server for SERP Clustering
 *
 * Clusters keywords by SERP overlap (shared URLs in top 10 results).
 * Keywords with 3+ shared URLs should target the same page.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { existsSync } from "fs";
import { runClustering } from "./cluster.js";

const server = new Server(
  {
    name: "mcp-serp-clustering",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "cluster_keywords",
        description:
          "Cluster keywords by SERP overlap. Groups keywords that share 3+ URLs in top 10 results, indicating they should target the same page. Input must be a CSV file with columns: keyword, position, url",
        inputSchema: {
          type: "object" as const,
          properties: {
            input_file: {
              type: "string",
              description:
                "Path to input CSV file with SERP data (keyword, position, url columns)",
            },
            output_clusters: {
              type: "string",
              description: "Path where cluster results will be saved",
            },
            output_overlap: {
              type: "string",
              description: "Path where URL overlap matrix will be saved",
            },
          },
          required: ["input_file", "output_clusters", "output_overlap"],
        },
      },
    ],
  };
});

interface ClusterKeywordsArgs {
  input_file: string;
  output_clusters: string;
  output_overlap: string;
}

// Execute tool
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (name !== "cluster_keywords") {
    throw new Error(`Unknown tool: ${name}`);
  }

  const { input_file, output_clusters, output_overlap } =
    args as unknown as ClusterKeywordsArgs;

  // Validate input file exists
  if (!existsSync(input_file)) {
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            { error: `Input file not found: ${input_file}` },
            null,
            2
          ),
        },
      ],
      isError: true,
    };
  }

  // Execute clustering
  try {
    const result = runClustering(input_file, output_clusters, output_overlap);

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({ error: message }, null, 2),
        },
      ],
      isError: true,
    };
  }
});

// Start server
async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("SERP Clustering MCP server running on stdio");
}

main().catch(console.error);
