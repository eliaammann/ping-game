/* eslint-disable @typescript-eslint/no-require-imports */
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
let adminPosition = null;
let gameArea = [];
let meetingPoint = null;

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

function emitMapState() {
  io.emit("mapState", {
    adminPosition,
    gameArea,
    meetingPoint,
  });
}

function emitAdminMessage(message) {
  io.emit("adminMessage", {
    id: "broadcast-" + Date.now(),
    message,
    createdAt: Date.now(),
  });
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

io.on("connection", (socket) => {
  console.log("Socket verbunden:", socket.id);

  emitPingState();
  emitCatchState();
  emitMapState();

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
      heading: existing.heading ?? null,
      locationStatus: existing.locationStatus || "checking",
      connected: true,
      lastUpdate: Date.now(),
    };

    emitPlayers();
    emitPingState();
    emitCatchState();
    emitMapState();
  });

  socket.on("updatePosition", (data) => {
    const playerId = data?.playerId;
    if (!playerId || !players[playerId]) return;

    players[playerId] = {
      ...players[playerId],
      socketId: socket.id,
      liveLat: data.lat,
      liveLng: data.lng,
      heading: Number.isFinite(Number(data.heading))
        ? Number(data.heading)
        : players[playerId].heading ?? null,
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

  socket.on("kickPlayer", (data) => {
    const playerId = data?.playerId;
    if (!playerId || !players[playerId]) return;

    const kickedSocketId = players[playerId].socketId;
    if (kickedSocketId) {
      io.to(kickedSocketId).emit("kicked");
    }

    delete players[playerId];

    if (pendingCatch?.reporterId === playerId || pendingCatch?.targetId === playerId) {
      pendingCatch = null;
      emitCatchState();
    }

    emitPlayers();
    emitAnnouncement("Ein Spieler wurde entfernt");
  });

  socket.on("autoAssignRoles", () => {
    const playerIds = Object.keys(players);
    if (playerIds.length === 0) return;

    const agentId = playerIds[Math.floor(Math.random() * playerIds.length)];

    playerIds.forEach((playerId) => {
      players[playerId] = {
        ...players[playerId],
        role: playerId === agentId ? "agent" : "hunter",
      };
    });

    emitPlayers();
    emitAnnouncement("Rollen wurden automatisch zugeordnet");
  });

  socket.on("updateAdminPosition", (data) => {
    const lat = Number(data?.lat);
    const lng = Number(data?.lng);

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

    adminPosition = {
      lat,
      lng,
      heading: Number.isFinite(Number(data?.heading)) ? Number(data.heading) : null,
      updatedAt: Date.now(),
    };

    emitMapState();
  });

  socket.on("setGameArea", (data) => {
    if (!Array.isArray(data?.points)) return;

    gameArea = data.points
      .map((point) => ({
        lat: Number(point?.lat),
        lng: Number(point?.lng),
      }))
      .filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lng))
      .slice(0, 30);

    emitMapState();
    emitAnnouncement(gameArea.length > 0 ? "Spielbereich aktualisiert" : "Spielbereich gelöscht");
  });

  socket.on("setMeetingPoint", (data) => {
    const lat = Number(data?.lat);
    const lng = Number(data?.lng);

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

    meetingPoint = {
      lat,
      lng,
      updatedAt: Date.now(),
    };

    emitMapState();
    emitAnnouncement("Treffpunkt gesetzt");
  });

  socket.on("clearMeetingPoint", () => {
    meetingPoint = null;
    emitMapState();
    emitAnnouncement("Treffpunkt gelöscht");
  });

  socket.on("sendBroadcastMessage", (data) => {
    const message = String(data?.message || "").trim();
    if (!message) return;

    emitAdminMessage(message);
    emitAnnouncement(message);
  });

  socket.on("sendPrivateMessage", (data, callback) => {
    const targetId = data?.targetId;
    const message = String(data?.message || "").trim();

    if (!targetId || !players[targetId] || !message) {
      if (callback) callback({ ok: false, reason: "Spieler oder Nachricht fehlt" });
      return;
    }

    const privateMessage = {
      id: "private-" + Date.now(),
      targetId,
      targetName: players[targetId].name,
      message,
      createdAt: Date.now(),
    };

    io.to(players[targetId].socketId).emit("privateMessage", privateMessage);
    io.emit("privateMessageSent", privateMessage);

    if (callback) callback({ ok: true });
  });

  socket.on("sendPrivateReply", (data) => {
    const playerId = data?.playerId;
    const messageId = data?.messageId;
    const reply = String(data?.reply || "").trim();

    if (!playerId || !players[playerId] || !messageId || !reply) return;

    io.emit("privateReply", {
      id: "reply-" + Date.now(),
      messageId,
      playerId,
      playerName: players[playerId].name,
      reply,
      createdAt: Date.now(),
    });
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

  socket.on("reportCatch", (data, callback) => {
    const reporterId = data?.reporterId;
    const targetId = data?.targetId;

    console.log("reportCatch erhalten:", {
      reporterId,
      targetId,
      reporterExists: !!players[reporterId],
      targetExists: !!players[targetId],
      reporterRole: players[reporterId]?.role,
      targetRole: players[targetId]?.role,
      pendingCatch,
    });

    if (!reporterId || !targetId) {
      console.log("Catch abgebrochen: reporterId oder targetId fehlt");
      if (callback) callback({ ok: false, reason: "reporterId oder targetId fehlt" });
      return;
    }

    if (!players[reporterId] || !players[targetId]) {
      console.log("Catch abgebrochen: Spieler nicht gefunden");
      if (callback) callback({ ok: false, reason: "Spieler nicht gefunden" });
      return;
    }

    if (players[reporterId].role !== "hunter") {
      console.log("Catch abgebrochen: Reporter ist kein Hunter");
      if (callback) callback({ ok: false, reason: "Reporter ist kein Hunter" });
      return;
    }

    if (players[targetId].role !== "agent") {
      console.log("Catch abgebrochen: Ziel ist kein Agent");
      if (callback) callback({ ok: false, reason: "Ziel ist kein Agent" });
      return;
    }

    if (pendingCatch) {
      console.log("Catch abgebrochen: Es gibt bereits einen offenen Catch");
      if (callback) callback({ ok: false, reason: "Es gibt bereits einen offenen Catch" });
      return;
    }

    pendingCatch = {
      reporterId,
      reporterName: players[reporterId].name,
      targetId,
      targetName: players[targetId].name,
      status: "pending",
      createdAt: Date.now(),
    };

    console.log("Catch gespeichert:", pendingCatch);

    emitCatchState();
    emitAnnouncement("Catch gemeldet, wird geprüft");

    if (callback) callback({ ok: true, reason: "Catch gespeichert" });
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

    nextPingAt = Date.now() + pingIntervalMs;
    emitPingState();
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
