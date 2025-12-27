
import { WebSocketServer } from "ws";
import fs from "fs";
import path from "path";
import http from "http";

const PORT = Number(process.env.WS_PORT ?? 8081);

// simple in-memory boards storage with optional disk persistence
const boards = new Map<string, any[]>();
const DATA_DIR = path.resolve(process.cwd(), "data");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

function saveBoardToDisk(boardId: string) {
  try {
    const data = boards.get(boardId) ?? [];
    fs.writeFileSync(path.join(DATA_DIR, `${boardId}.json`), JSON.stringify(data));
  } catch (err) {
    console.warn("Failed to save board:", err);
  }
}

function loadBoardFromDisk(boardId: string) {
  try {
    const file = path.join(DATA_DIR, `${boardId}.json`);
    if (fs.existsSync(file)) {
      const raw = fs.readFileSync(file, "utf8");
      const parsed = JSON.parse(raw);
      boards.set(boardId, parsed);
    } else {
      boards.set(boardId, []);
    }
  } catch (err) {
    boards.set(boardId, []);
  }
}

// create a minimal http server because some environments need it (ws can attach to it)
const server = http.createServer();
const wss = new WebSocketServer({ server });

wss.on("connection", (ws, req) => {
  console.log("WS client connected");

  let joinedBoardId: string | null = null;

  ws.on("message", (raw) => {
    try {
      const txt = raw.toString();
      const msg = JSON.parse(txt);
      const type = msg.type;

      // JOIN: send full board state
      if (type === "join") {
        const boardId = String(msg.boardId ?? "default");
        joinedBoardId = boardId;
        loadBoardFromDisk(boardId);
        const state = boards.get(boardId) ?? [];
        // send init with full list of previously stored events
        ws.send(JSON.stringify({ type: "init", state }));
        return;
      }

      // Accept these message types and store them
      if (type === "shape" || type === "draw" || type === "clear" || type === "delete") {
        const boardId = String(msg.boardId ?? joinedBoardId ?? "default");
        const arr = boards.get(boardId) ?? [];
        arr.push(msg);
        boards.set(boardId, arr);

        // broadcast to other clients
        wss.clients.forEach((client) => {
          if (client !== ws && client.readyState === (ws as any).OPEN) {
            client.send(txt);
          }
        });
      }

      // you can extend for presence/cursor events (not storing those)
    } catch (err) {
      console.warn("Invalid WS message:", err);
    }
  });

  ws.on("close", () => {
    if (joinedBoardId) {
      saveBoardToDisk(joinedBoardId);
    }
    console.log("WS client disconnected");
  });

  ws.on("error", (err) => {
    console.warn("WS error:", err);
  });
});

// Periodic persistence (every 30s)
setInterval(() => {
  for (const boardId of boards.keys()) {
    saveBoardToDisk(boardId);
  }
}, 30000);

// start server
server.listen(PORT, () => {
  console.log(`WebSocket server running on ws://127.0.0.1:${PORT}`);
});
