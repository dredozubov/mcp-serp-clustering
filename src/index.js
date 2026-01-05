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
import { spawn } from "child_process";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { existsSync, readFileSync } from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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
          type: "object",
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

// Execute tool
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (name !== "cluster_keywords") {
    throw new Error(`Unknown tool: ${name}`);
  }

  const { input_file, output_clusters, output_overlap } = args;

  // Validate input file exists
  if (!existsSync(input_file)) {
    return {
      content: [
        {
          type: "text",
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

  // Get path to Python script (in scripts/ directory)
  const scriptPath = join(__dirname, "..", "scripts", "serp_cluster.py");

  if (!existsSync(scriptPath)) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            { error: `Python script not found: ${scriptPath}` },
            null,
            2
          ),
        },
      ],
      isError: true,
    };
  }

  // Execute Python script
  try {
    const result = await new Promise((resolve, reject) => {
      const proc = spawn("python3", [
        scriptPath,
        input_file,
        output_clusters,
        output_overlap,
      ]);

      let stdout = "";
      let stderr = "";

      proc.stdout.on("data", (data) => {
        stdout += data.toString();
      });

      proc.stderr.on("data", (data) => {
        stderr += data.toString();
      });

      proc.on("close", (code) => {
        if (code !== 0) {
          reject(new Error(`Clustering failed with code ${code}\n${stderr}`));
          return;
        }

        // Read and return summary
        try {
          const clusterData = readFileSync(output_clusters, "utf-8");
          const lines = clusterData.trim().split("\n");
          const clusterCount = lines.length - 1; // Subtract header

          resolve({
            success: true,
            message: stdout.trim(),
            clusters_created: clusterCount,
            output_files: {
              clusters: output_clusters,
              overlap: output_overlap,
            },
          });
        } catch (err) {
          reject(new Error(`Failed to read output: ${err.message}`));
        }
      });

      proc.on("error", (err) => {
        reject(new Error(`Failed to execute Python script: ${err.message}`));
      });
    });

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ error: error.message }, null, 2),
        },
      ],
      isError: true,
    };
  }
});

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("SERP Clustering MCP server running on stdio");
}

main().catch(console.error);
