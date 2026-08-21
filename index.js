import express from "express";
import cors from "cors";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
// 【關鍵修正】載入最新版 SDK 要求的 Schema 定義檔
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

const app = express();
app.use(cors());
app.use(express.json());

const server = new Server(
  { name: "github-mobile-updater", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

let transport;

app.get("/mcp", async (req, res) => {
  transport = new SSEServerTransport("/message", res);
  await server.connect(transport);
});

app.post("/message", async (req, res) => {
  if (!transport) return res.status(500).send("No transport");
  await transport.handlePostMessage(req, res);
});

// 【關鍵修正 1】使用 ListToolsRequestSchema 註冊工具清單，讓 Gemini 知道有這個技能
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "update_github_file",
        description: "Update a file in a GitHub repository",
        inputSchema: {
          type: "object",
          properties: {
            owner: { type: "string" },
            repo: { type: "string" },
            path: { type: "string" },
            newContent: { type: "string" },
            commitMessage: { type: "string" }
          },
          required: ["owner", "repo", "path", "newContent"]
        }
      }
    ]
  };
});

// 【關鍵修正 2】使用 CallToolRequestSchema 取代舊的 "tools/call" 字串
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name === "update_github_file") {
    const { owner, repo, path, newContent, commitMessage } = request.params.arguments;
    const githubToken = process.env.GITHUB_TOKEN;
    const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
    
    const getRes = await fetch(apiUrl, { headers: { 'Authorization': `Bearer ${githubToken}`, 'Accept': 'application/vnd.github.v3+json', 'User-Agent': 'Spark-MCP' } });
    let sha = getRes.ok ? (await getRes.json()).sha : undefined;

    const putRes = await fetch(apiUrl, {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${githubToken}`, 'Accept': 'application/vnd.github.v3+json', 'User-Agent': 'Spark-MCP' },
      body: JSON.stringify({ message: commitMessage || "Auto update", content: Buffer.from(newContent).toString('base64'), sha: sha })
    });
    
    if (!putRes.ok) return { content: [{ type: "text", text: `Error: ${await putRes.text()}` }] };
    return { content: [{ type: "text", text: `Successfully updated ${path}` }] };
  }
  throw new Error("Unknown tool");
});

app.listen(process.env.PORT || 3000, "0.0.0.0", () => console.log("MCP Server running"));
