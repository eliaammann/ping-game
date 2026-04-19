const { createServer } = require("http");
const { Server } = require("socket.io");

const httpServer = createServer();

const io = new Server(httpServer, {
  cors: {
    origin: "*",
  },
});

let players = {};
let pendingCatch = null;

// Standard: 5 Minuten
let pingIntervalMs = 5 * 60 * 1000;
let nextPingAt = Date.now() + pingIntervalMs;

function emitPlayers() {
  io.emit("playersUpdate", players);
}

function emitPingState() {
  io.emit("pingState", {
    nextPingAt,
    pingIntervalMs,
  });
}

function emitCatchState() {
  io.emit("catchState", pendingCatch);
}

function emitAnnouncement(message) {
  io.emit("announcement", { message, at: Date.now() });
}

function runPing() {
  Object.keys(players).forEach((playerId) => {
    const player = players[playerId];

    players[playerId] = {
      ...player,
      pingLat: player.liveLat,
      pingLng: player.liveLng,
    };
  });

  io.emit("pingTriggered", {
    triggeredAt: Date.now(),
    nextPingAt,
    pingIntervalMs,
  });

  emitPlayers();
}

function resetGameCycle() {
  nextPingAt = Date.now() + pingIntervalMs;
  emitPingState();
}

io.on("connection", (socket) => {
  console.log("Socket verbunden:", socket.id);

  emitPingState();
  emitCatchState();

  socket.on("registerPlayer", (data) => {
    const playerId = data?.playerId;
    if (!playerId) return;

    const existing = players[playerId] || {};

    players[playerId] = {
      playerId,
      socketId: socket.id,
      name: data.name || existing.name || "Spieler",
      role: existing.role || "unassigned",

      liveLat: existing.liveLat ?? null,
      liveLng: existing.liveLng ?? null,

      pingLat: existing.pingLat ?? null,
      pingLng: existing.pingLng ?? null,

      locationStatus: existing.locationStatus || "checking",
      connected: true,
      lastUpdate: Date.now(),
    };

    emitPlayers();
    emitPingState();
    emitCatchState();
  });

  socket.on("updatePosition", (data) => {
    const playerId = data?.playerId;
    if (!playerId || !players[playerId]) return;

    players[playerId] = {
      ...players[playerId],
      socketId: socket.id,
      liveLat: data.lat,
      liveLng: data.lng,
      locationStatus: data.locationStatus || "active",
      connected: true,
      lastUpdate: Date.now(),
    };

    emitPlayers();
  });

  socket.on("locationStatus", (data) => {
    const playerId = data?.playerId;
    if (!playerId || !players[playerId]) return;

    players[playerId] = {
      ...players[playerId],
      socketId: socket.id,
      locationStatus: data.locationStatus || "error",
      connected: true,
      lastUpdate: Date.now(),
    };

    emitPlayers();
  });

  socket.on("setRole", (data) => {
    const playerId = data?.playerId;
    const role = data?.role;

    if (!playerId || !players[playerId]) return;
    if (!["unassigned", "agent", "hunter"].includes(role)) return;

    players[playerId] = {
      ...players[playerId],
      role,
    };

    emitPlayers();
  });

  socket.on("setPingInterval", (data) => {
    const seconds = Number(data?.seconds);

    if (!Number.isFinite(seconds)) return;
    if (seconds < 5 || seconds > 3600) return;

    pingIntervalMs = seconds * 1000;
    nextPingAt = Date.now() + pingIntervalMs;

    console.log("Neue Pingdauer:", seconds, "Sekunden");

    emitPingState();
  });

  socket.on("reportCatch", (data) => {
    const reporterId = data?.reporterId;
    const targetId = data?.targetId;

    if (!reporterId || !targetId) return;
    if (!players[reporterId] || !players[targetId]) return;
    if (players[reporterId].role !== "hunter") return;
    if (players[targetId].role !== "agent") return;
    if (pendingCatch) return;

    pendingCatch = {
      reporterId,
      reporterName: players[reporterId].name,
      targetId,
      targetName: players[targetId].name,
      status: "pending",
      createdAt: Date.now(),
    };

    emitCatchState();
    emitAnnouncement("Catch gemeldet, wird geprüft");
  });

  socket.on("confirmCatch", () => {
    if (!pendingCatch) return;

    const { targetId } = pendingCatch;

    if (players[targetId]) {
      players[targetId] = {
        ...players[targetId],
        role: "hunter",
      };
    }

    // Spiel neu starten: Ping-Zyklus zurücksetzen und Ping-Positionen leeren
    Object.keys(players).forEach((playerId) => {
      players[playerId] = {
        ...players[playerId],
        pingLat: null,
        pingLng: null,
      };
    });

    pendingCatch = null;

    emitPlayers();
    emitCatchState();
    emitAnnouncement("Catch bestätigt, Rollen werden aktualisiert, Spiel startet neu");

    resetGameCycle();
  });

  socket.on("rejectCatch", () => {
    if (!pendingCatch) return;

    pendingCatch = null;
    emitCatchState();
    emitAnnouncement("Catch abgelehnt");
  });

  socket.on("disconnect", () => {
    console.log("Socket getrennt:", socket.id);

    Object.keys(players).forEach((playerId) => {
      if (players[playerId].socketId === socket.id) {
        players[playerId] = {
          ...players[playerId],
          connected: false,
        };
      }
    });

    emitPlayers();
  });
});

setInterval(() => {
  const now = Date.now();

  if (now >= nextPingAt) {
    runPing();
    nextPingAt = now + pingIntervalMs;
    emitPingState();
  }

  Object.keys(players).forEach((playerId) => {
    const player = players[playerId];

    if (player.connected && player.lastUpdate && now - player.lastUpdate > 30000) {
      players[playerId] = {
        ...player,
        locationStatus: "stale",
      };
    }
  });

  emitPlayers();
}, 1000);

const PORT = Number(process.env.PORT) || 4000;
const HOST = "0.0.0.0";

httpServer.listen(PORT, HOST, () => {
  console.log(`Server läuft auf http://${HOST}:${PORT}`);
});