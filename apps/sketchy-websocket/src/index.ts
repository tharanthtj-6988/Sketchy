// apps/sketchy-websocket/src/index.ts
import { WebSocketServer } from "ws";
import fs from "fs";
import path from "path";

const PORT = Number(process.env.WS_PORT || 8081);
const DATA_DIR = path.resolve(process.cwd(), "data");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

// boardId -> array of raw messages (we store shape messages so new clients can replay)
const boards = new Map<string, any[]>();

function saveBoardToDisk(boardId: string) {
  try {
    const data = boards.get(boardId) || [];
    fs.writeFileSync(path.join(DATA_DIR, `${boardId}.json`), JSON.stringify(data));
  } catch (err) {
    console.warn('saveBoardToDisk error', err);
  }
}

function loadBoardFromDisk(boardId: string) {
  try {
    const file = path.join(DATA_DIR, `${boardId}.json`);
    if (fs.existsSync(file)) {
      const raw = fs.readFileSync(file, "utf8");
      const parsed = JSON.parse(raw);
      boards.set(boardId, parsed);
      return parsed;
    }
  } catch (err) {
    console.warn('loadBoardFromDisk err', err);
  }
  boards.set(boardId, []);
  return [];
}

const wss = new WebSocketServer({ port: PORT }, () => {
  console.log(`WebSocket server running on ws://localhost:${PORT}`);
});

wss.on("connection", (ws) => {
  let joinedBoardId: string | null = null;

  ws.on("message", (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      if (!msg || !msg.type) return;

      // JOIN - send back init state
      if (msg.type === "join") {
        const boardId = msg.boardId || "default";
        joinedBoardId = boardId;
        // load if necessary
        if (!boards.has(boardId)) loadBoardFromDisk(boardId);
        const state = boards.get(boardId) || [];
        ws.send(JSON.stringify({ type: "init", state }));
        return;
      }

      // shape messages - store and broadcast
      if (msg.type === "shape") {
        const boardId = msg.boardId || joinedBoardId || "default";
        if (!boards.has(boardId)) loadBoardFromDisk(boardId);
        const arr = boards.get(boardId) || [];
        // store this event
        arr.push(msg);
        boards.set(boardId, arr);

        // broadcast to others
        wss.clients.forEach((client) => {
          if (client !== ws && client.readyState === ws.OPEN) {
            client.send(JSON.stringify(msg));
          }
        });
        return;
      }

      // for any other event types (image add, presence etc.) just rebroadcast & store
      if (msg.boardId || joinedBoardId) {
        const boardId = msg.boardId || joinedBoardId || 'default';
        if (!boards.has(boardId)) loadBoardFromDisk(boardId);
        boards.get(boardId)!.push(msg);
        wss.clients.forEach((client) => {
          if (client !== ws && client.readyState === ws.OPEN) client.send(JSON.stringify(msg));
        });
      }
    } catch (err) {
      console.error("Invalid message", err);
    }
  });

  ws.on("close", () => {
    if (joinedBoardId) saveBoardToDisk(joinedBoardId);
  });

  ws.on("error", (err) => {
    console.warn("ws error", err);
  });
});

// periodic flush to disk
setInterval(() => {
  for (const boardId of boards.keys()) {
    try { saveBoardToDisk(boardId); } catch {}
  }
}, 30000);
