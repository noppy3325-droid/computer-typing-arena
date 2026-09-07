import express from "express";
import { createServer } from "http";
import path from "path";
import { fileURLToPath } from "url";
import { handleRecordScore } from "../scoreApi";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = createServer(app);
const isProduction = process.env.NODE_ENV === "production";
const staticPath = isProduction
  ? path.resolve(__dirname, "public")
  : path.resolve(process.cwd(), "dist", "public");

app.use(express.json({ limit: "16kb" }));
app.post("/api/record-score", handleRecordScore);
app.use(express.static(staticPath));
app.get("*", (_req, res) => {
  res.sendFile(path.join(staticPath, "index.html"));
});

const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || "0.0.0.0";
server.listen(port, host, () => {
  console.log(`Server running on http://${host}:${port}/`);
});
