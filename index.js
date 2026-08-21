import express from "express";
import cors from "cors";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";

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

server.setRequestHandler("tools/call", async (request) => {
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
});

app.listen(process.env.PORT || 3000, "0.0.0.0", () => console.log("MCP Server running"));
