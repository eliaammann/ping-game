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
let targetArea = [];
let targetPassword = "";
let playerStartPoints = {};
let savedMarkings = [];
let loadedMarkings = [];
let adminSockets = new Set();
let targetUnlockedPlayers = new Set();

// Standard: 5 Minuten
let pingIntervalMs = 5 * 60 * 1000;
let nextPingAt = null;
let remainingPingMs = pingIntervalMs;
let isPingRunning = false;

function emitPlayers() {
  adminSockets.forEach((socketId) => {
    io.to(socketId).emit("playersUpdate", players);
  });

  Object.values(players).forEach((recipient) => {
    const visiblePlayers = Object.fromEntries(
      Object.entries(players).map(([playerId, player]) => {
        if (isPingRunning || playerId === recipient.playerId) {
          return [playerId, player];
        }

        return [
          playerId,
          {
            ...player,
            liveLat: null,
            liveLng: null,
            pingLat: null,
            pingLng: null,
            heading: null,
          },
        ];
      })
    );

    io.to(recipient.socketId).emit("playersUpdate", visiblePlayers);
  });
}

function emitPingState() {
  const currentRemainingMs =
    isPingRunning && nextPingAt
      ? Math.max(0, nextPingAt - Date.now())
      : remainingPingMs;

  io.emit("pingState", {
    nextPingAt,
    pingIntervalMs,
    remainingPingMs: currentRemainingMs,
    isPingRunning,
  });
}

function emitCatchState() {
  io.emit("catchState", pendingCatch);
}

function emitMapState() {
  Object.values(players).forEach((player) => {
    io.to(player.socketId).emit("mapState", {
      gameArea,
      meetingPoint,
      startPoint: playerStartPoints[player.playerId] || null,
      loadedMarkings: loadedMarkings.map((marking) => ({
        id: marking.id,
        name: marking.name,
        gameArea: marking.gameArea,
        meetingPoint: marking.meetingPoint,
        startPoint: marking.playerStartPoints[player.playerId] || null,
      })),
    });
  });

  adminSockets.forEach((socketId) => {
    io.to(socketId).emit("adminMapState", {
      adminPosition,
      gameArea,
      meetingPoint,
      targetArea,
      playerStartPoints,
      savedMarkings,
      loadedMarkings,
      hasTargetPassword: Boolean(targetPassword),
    });
  });
}

function emitInitialMapState(socket) {
  socket.emit("mapState", {
    gameArea,
    meetingPoint,
    startPoint: null,
    loadedMarkings: [],
  });
}

function emitAdminMapState(socket) {
  socket.emit("adminMapState", {
    adminPosition,
    gameArea,
    meetingPoint,
    targetArea,
    playerStartPoints,
    savedMarkings,
    loadedMarkings,
    hasTargetPassword: Boolean(targetPassword),
  });
}

function emitTargetAreaToUnlockedPlayers() {
  Object.values(players).forEach((player) => {
    if (targetUnlockedPlayers.has(player.playerId)) {
      io.to(player.socketId).emit("targetAreaState", { targetArea });
    }
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

function resetGameState() {
  pendingCatch = null;
  adminPosition = null;
  gameArea = [];
  meetingPoint = null;
  targetArea = [];
  targetPassword = "";
  playerStartPoints = {};
  loadedMarkings = [];
  targetUnlockedPlayers = new Set();
  nextPingAt = null;
  remainingPingMs = pingIntervalMs;
  isPingRunning = false;

  Object.keys(players).forEach((playerId) => {
    players[playerId] = {
      ...players[playerId],
      role: "unassigned",
      pingLat: null,
      pingLng: null,
    };
  });

  emitPlayers();
  emitPingState();
  emitCatchState();
  emitMapState();
  io.emit("targetAreaState", { targetArea: [] });
}

function clonePoints(points) {
  return points.map((point) => ({
    lat: Number(point.lat),
    lng: Number(point.lng),
  }));
}

function cloneStartPoints(pointsByPlayer) {
  return Object.fromEntries(
    Object.entries(pointsByPlayer).map(([playerId, point]) => [
      playerId,
      {
        lat: Number(point.lat),
        lng: Number(point.lng),
      },
    ])
  );
}

function createMarkingSnapshot(name) {
  return {
    id: "marking-" + Date.now() + "-" + Math.random().toString(36).slice(2),
    name,
    createdAt: Date.now(),
    gameArea: clonePoints(gameArea),
    meetingPoint: meetingPoint
      ? {
          lat: Number(meetingPoint.lat),
          lng: Number(meetingPoint.lng),
        }
      : null,
    targetArea: clonePoints(targetArea),
    playerStartPoints: cloneStartPoints(playerStartPoints),
  };
}

function clearActiveMapMarkings() {
  gameArea = [];
  meetingPoint = null;
  targetArea = [];
  targetPassword = "";
  playerStartPoints = {};
  loadedMarkings = [];
  targetUnlockedPlayers = new Set();

  emitMapState();
  io.emit("targetAreaState", { targetArea: [] });
}

io.on("connection", (socket) => {
  console.log("Socket verbunden:", socket.id);

  emitPingState();
  emitCatchState();
  emitInitialMapState(socket);

  socket.on("requestState", (callback) => {
    emitPlayers();
    emitPingState();
    emitCatchState();
    emitInitialMapState(socket);
    if (adminSockets.has(socket.id)) {
      emitAdminMapState(socket);
    }
    if (callback) callback({ ok: true });
  });

  socket.on("registerAdmin", (callback) => {
    adminSockets.add(socket.id);
    socket.emit("playersUpdate", players);
    emitPingState();
    emitCatchState();
    emitAdminMapState(socket);
    if (callback) callback({ ok: true });
  });

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
    io.to(socket.id).emit("mapState", {
      gameArea,
      meetingPoint,
      startPoint: playerStartPoints[playerId] || null,
      loadedMarkings: loadedMarkings.map((marking) => ({
        id: marking.id,
        name: marking.name,
        gameArea: marking.gameArea,
        meetingPoint: marking.meetingPoint,
        startPoint: marking.playerStartPoints[playerId] || null,
      })),
    });
    if (targetUnlockedPlayers.has(playerId)) {
      io.to(socket.id).emit("targetAreaState", { targetArea });
    }
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

  socket.on("kickPlayer", (data, callback) => {
    const playerId = data?.playerId;
    if (!playerId || !players[playerId]) {
      if (callback) callback({ ok: false, reason: "Spieler nicht gefunden" });
      return;
    }

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
    if (callback) callback({ ok: true });
  });

  socket.on("autoAssignRoles", (callback) => {
    const playerIds = Object.keys(players);
    if (playerIds.length === 0) {
      if (callback) callback({ ok: false, reason: "Keine Spieler vorhanden" });
      return;
    }

    const agentId = playerIds[Math.floor(Math.random() * playerIds.length)];

    playerIds.forEach((playerId) => {
      players[playerId] = {
        ...players[playerId],
        role: playerId === agentId ? "agent" : "hunter",
      };
    });

    emitPlayers();
    emitAnnouncement("Rollen wurden automatisch zugeordnet");
    if (callback) callback({ ok: true, agentId });
  });

  socket.on("triggerPingNow", (callback) => {
    runPing();
    if (isPingRunning) {
      nextPingAt = Date.now() + pingIntervalMs;
      remainingPingMs = pingIntervalMs;
    }
    emitPingState();
    emitAnnouncement("Ping wurde manuell ausgelöst");
    if (callback) callback({ ok: true });
  });

  socket.on("setPingRunning", (data, callback) => {
    const shouldRun = Boolean(data?.isRunning);

    if (shouldRun) {
      isPingRunning = true;
      nextPingAt = Date.now() + (remainingPingMs || pingIntervalMs);
    } else {
      remainingPingMs = nextPingAt ? Math.max(0, nextPingAt - Date.now()) : remainingPingMs;
      isPingRunning = false;
      nextPingAt = null;
    }

    emitPingState();
    emitPlayers();
    emitAnnouncement(shouldRun ? "Ping-Countdown gestartet" : "Ping-Countdown angehalten");
    if (callback) callback({ ok: true });
  });

  socket.on("resetGame", (callback) => {
    resetGameState();
    emitAnnouncement("Spiel wurde zurückgesetzt");
    if (callback) callback({ ok: true });
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

  socket.on("setStartPoint", (data, callback) => {
    const playerId = data?.playerId;
    const lat = Number(data?.point?.lat);
    const lng = Number(data?.point?.lng);

    if (!playerId || !players[playerId]) {
      if (callback) callback({ ok: false, reason: "Spieler nicht gefunden" });
      return;
    }

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      if (callback) callback({ ok: false, reason: "Startpunkt fehlt" });
      return;
    }

    playerStartPoints[playerId] = {
      lat,
      lng,
      updatedAt: Date.now(),
    };

    emitMapState();
    emitAnnouncement("Startpunkt gesetzt");
    if (callback) callback({ ok: true });
  });

  socket.on("clearStartPoint", (data, callback) => {
    const playerId = data?.playerId;
    if (!playerId || !players[playerId]) {
      if (callback) callback({ ok: false, reason: "Spieler nicht gefunden" });
      return;
    }

    delete playerStartPoints[playerId];
    emitMapState();
    emitAnnouncement("Startpunkt geloescht");
    if (callback) callback({ ok: true });
  });

  socket.on("saveCurrentMarkings", (data, callback) => {
    const name = String(data?.name || "").trim();

    if (!name) {
      if (callback) callback({ ok: false, reason: "Name fehlt" });
      return;
    }

    const hasAnyMarking =
      gameArea.length > 0 ||
      Boolean(meetingPoint) ||
      targetArea.length > 0 ||
      Object.keys(playerStartPoints).length > 0;

    if (!hasAnyMarking) {
      if (callback) callback({ ok: false, reason: "Es gibt keine Markierungen zum Speichern" });
      return;
    }

    const snapshot = createMarkingSnapshot(name);
    savedMarkings = [snapshot, ...savedMarkings].slice(0, 30);

    emitMapState();
    emitAnnouncement("Markierungen gespeichert");
    if (callback) callback({ ok: true, savedMarkings });
  });

  socket.on("loadSavedMarking", (data, callback) => {
    const markingId = data?.id;
    const marking = savedMarkings.find((entry) => entry.id === markingId);

    if (!marking) {
      if (callback) callback({ ok: false, reason: "Markierung nicht gefunden" });
      return;
    }

    loadedMarkings = [
      ...loadedMarkings,
      {
        ...marking,
        id: "loaded-" + Date.now() + "-" + Math.random().toString(36).slice(2),
      },
    ].slice(-20);

    emitMapState();
    emitAnnouncement("Markierung geladen");
    if (callback) callback({ ok: true });
  });

  socket.on("clearActiveMapMarkings", (callback) => {
    clearActiveMapMarkings();
    emitAnnouncement("Markierungen geloescht");
    if (callback) callback({ ok: true });
  });

  socket.on("setGameArea", (data, callback) => {
    if (!Array.isArray(data?.points)) {
      if (callback) callback({ ok: false, reason: "Spielbereich fehlt" });
      return;
    }

    gameArea = data.points
      .map((point) => ({
        lat: Number(point?.lat),
        lng: Number(point?.lng),
      }))
      .filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lng))
      .slice(0, 30);

    emitMapState();
    emitAnnouncement(gameArea.length > 0 ? "Spielbereich aktualisiert" : "Spielbereich geloescht");
    if (callback) callback({ ok: true });
  });

  socket.on("setTargetArea", (data, callback) => {
    if (!Array.isArray(data?.points)) {
      if (callback) callback({ ok: false, reason: "Zielbereich fehlt" });
      return;
    }

    const nextPassword = String(data?.password ?? targetPassword).trim();
    if (!nextPassword) {
      if (callback) callback({ ok: false, reason: "Passwort fehlt" });
      return;
    }

    targetPassword = nextPassword;
    targetArea = data.points
      .map((point) => ({
        lat: Number(point?.lat),
        lng: Number(point?.lng),
      }))
      .filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lng))
      .slice(0, 30);

    emitMapState();
    emitTargetAreaToUnlockedPlayers();
    emitAnnouncement(targetArea.length > 0 ? "Zielbereich aktualisiert" : "Zielbereich vorbereitet");
    if (callback) callback({ ok: true });
  });

  socket.on("clearTargetArea", (callback) => {
    targetArea = [];
    targetPassword = "";
    targetUnlockedPlayers = new Set();
    emitMapState();
    io.emit("targetAreaState", { targetArea: [] });
    emitAnnouncement("Zielbereich geloescht");
    if (callback) callback({ ok: true });
  });

  socket.on("unlockTargetArea", (data, callback) => {
    const playerId = data?.playerId;
    const password = String(data?.password || "").trim();

    if (!playerId || !players[playerId]) {
      if (callback) callback({ ok: false, reason: "Spieler nicht gefunden" });
      return;
    }

    if (!targetPassword || password !== targetPassword) {
      if (callback) callback({ ok: false, reason: "Falsches Passwort" });
      return;
    }

    targetUnlockedPlayers.add(playerId);
    io.to(players[playerId].socketId).emit("targetAreaState", { targetArea });
    if (callback) callback({ ok: true });
  });

  socket.on("setMeetingPoint", (data, callback) => {
    const lat = Number(data?.lat);
    const lng = Number(data?.lng);

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      if (callback) callback({ ok: false, reason: "Treffpunkt fehlt" });
      return;
    }

    meetingPoint = {
      lat,
      lng,
      updatedAt: Date.now(),
    };

    emitMapState();
    emitAnnouncement("Treffpunkt gesetzt");
    if (callback) callback({ ok: true });
  });

  socket.on("clearMeetingPoint", (callback) => {
    meetingPoint = null;
    emitMapState();
    emitAnnouncement("Treffpunkt geloescht");
    if (callback) callback({ ok: true });
  });

  socket.on("sendBroadcastMessage", (data, callback) => {
    const message = String(data?.message || "").trim();
    if (!message) {
      if (callback) callback({ ok: false, reason: "Nachricht fehlt" });
      return;
    }

    emitAdminMessage(message);
    emitAnnouncement(message);
    if (callback) callback({ ok: true });
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

  socket.on("sendPlayerMessage", (data, callback) => {
    const playerId = data?.playerId;
    const message = String(data?.message || "").trim();

    if (!playerId || !players[playerId] || !message) {
      if (callback) callback({ ok: false, reason: "Spieler oder Nachricht fehlt" });
      return;
    }

    const playerMessage = {
      id: "player-message-" + Date.now(),
      playerId,
      playerName: players[playerId].name,
      message,
      createdAt: Date.now(),
    };

    adminSockets.forEach((socketId) => {
      io.to(socketId).emit("playerMessageSent", playerMessage);
    });

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
    remainingPingMs = pingIntervalMs;
    nextPingAt = isPingRunning ? Date.now() + pingIntervalMs : null;

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

    remainingPingMs = pingIntervalMs;
    nextPingAt = isPingRunning ? Date.now() + pingIntervalMs : null;
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
    adminSockets.delete(socket.id);

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

  if (isPingRunning && nextPingAt && now >= nextPingAt) {
    runPing();
    nextPingAt = now + pingIntervalMs;
    remainingPingMs = pingIntervalMs;
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
