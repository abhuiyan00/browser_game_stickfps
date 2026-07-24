import "dotenv/config";
import express from "express";
import cors from "cors";
import http from "http";
import { attachWsServer } from "./net/wsServer";

const PORT = Number(process.env.PORT) || 9090;
const CORS_ORIGIN = process.env.CORS_ORIGIN || "*";

const app = express();
app.use(cors({ origin: CORS_ORIGIN }));

app.get("/healthz", (_req, res) => {
  res.status(200).json({ status: "ok" });
});

const httpServer = http.createServer(app);
// WebSocket-over-TCP transport on /ws (coexists with the /healthz route above).
attachWsServer(httpServer, { corsOrigin: CORS_ORIGIN });

httpServer.listen(PORT, () => {
  console.log(`stickfps server listening on :${PORT} (WebSocket /ws, CORS origin: ${CORS_ORIGIN})`);
});
