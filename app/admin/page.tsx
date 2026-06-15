"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { io } from "socket.io-client";

const AdminMap = dynamic(() => import("./AdminMap"), { ssr: false });
const socket = io(process.env.NEXT_PUBLIC_SOCKET_URL!);

type Player = {
  playerId: string;
  socketId: string;
  name: string;
  role: "unassigned" | "agent" | "hunter";
  liveLat: number | null;
  liveLng: number | null;
  pingLat: number | null;
  pingLng: number | null;
  heading: number | null;
  locationStatus: string;
  connected: boolean;
  lastUpdate: number | null;
};

type CatchState = {
  reporterId: string;
  reporterName: string;
  targetId: string;
  targetName: string;
  status: "pending";
  createdAt: number;
} | null;

type MapPoint = {
  lat: number;
  lng: number;
};

type AdminPosition = MapPoint & {
  heading: number | null;
  updatedAt: number;
};

type MapState = {
  adminPosition: AdminPosition | null;
  gameArea: MapPoint[];
  meetingPoint: MapPoint | null;
};

type EditMode = "none" | "meeting" | "area";

type PrivateMessageLog = {
  id: string;
  targetId: string;
  targetName: string;
  message: string;
  createdAt: number;
  reply?: string;
  replyFrom?: string;
};

type ServerResponse = {
  ok: boolean;
  reason?: string;
};

export default function AdminPage() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState("");

  const [players, setPlayers] = useState<Record<string, Player>>({});
  const [nextPingAt, setNextPingAt] = useState<number | null>(null);
  const [seconds, setSeconds] = useState(0);
  const [showPingFlash, setShowPingFlash] = useState(false);

  const [pingIntervalSeconds, setPingIntervalSeconds] = useState(300);
  const [pingInput, setPingInput] = useState("300");

  const [catchState, setCatchState] = useState<CatchState>(null);
  const [announcement, setAnnouncement] = useState("");
  const [adminPosition, setAdminPosition] = useState<AdminPosition | null>(null);
  const [gameArea, setGameArea] = useState<MapPoint[]>([]);
  const [meetingPoint, setMeetingPoint] = useState<MapPoint | null>(null);
  const [editMode, setEditMode] = useState<EditMode>("none");
  const [broadcastInput, setBroadcastInput] = useState("");
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [privateInput, setPrivateInput] = useState("");
  const [privateMessages, setPrivateMessages] = useState<PrivateMessageLog[]>([]);
  const adminHeadingRef = useRef<number | null>(null);

  useEffect(() => {
    socket.on(
      "pingState",
      (data: { nextPingAt: number; pingIntervalMs: number }) => {
        setNextPingAt(data.nextPingAt);

        const secs = Math.round(data.pingIntervalMs / 1000);
        setPingIntervalSeconds(secs);
        setPingInput(String(secs));
      }
    );

    socket.on("playersUpdate", (data: Record<string, Player>) => {
      setPlayers(data);
    });

    socket.on("pingTriggered", () => {
      setShowPingFlash(true);
      setTimeout(() => {
        setShowPingFlash(false);
      }, 3000);
    });

    socket.on("catchState", (data: CatchState) => {
      setCatchState(data);
    });

    socket.on("mapState", (data: MapState) => {
      setAdminPosition(data.adminPosition);
      setGameArea(data.gameArea || []);
      setMeetingPoint(data.meetingPoint);
    });

    socket.on("privateMessageSent", (data: PrivateMessageLog) => {
      setPrivateMessages((messages) => [data, ...messages].slice(0, 20));
    });

    socket.on(
      "privateReply",
      (data: {
        messageId: string;
        playerName: string;
        reply: string;
      }) => {
        setPrivateMessages((messages) =>
          messages.map((message) =>
            message.id === data.messageId
              ? {
                  ...message,
                  reply: data.reply,
                  replyFrom: data.playerName,
                }
              : message
          )
        );
      }
    );

    socket.on("announcement", (data: { message: string }) => {
      setAnnouncement(data.message);
      setTimeout(() => {
        setAnnouncement("");
      }, 5000);
    });

    socket.emit("requestState");

    return () => {
      socket.off("playersUpdate");
      socket.off("pingState");
      socket.off("pingTriggered");
      socket.off("catchState");
      socket.off("mapState");
      socket.off("privateMessageSent");
      socket.off("privateReply");
      socket.off("announcement");
    };
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      if (!nextPingAt) {
        setSeconds(0);
        return;
      }

      const diffMs = nextPingAt - Date.now();
      const nextSeconds = Math.max(0, Math.ceil(diffMs / 1000));
      setSeconds(nextSeconds);
    }, 250);

    return () => clearInterval(interval);
  }, [nextPingAt]);

  useEffect(() => {
    if (!isAuthenticated || !navigator.geolocation) return;

    let lastPosition: MapPoint | null = null;

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        let nextHeading =
          Number.isFinite(pos.coords.heading) && pos.coords.heading !== null
            ? pos.coords.heading
            : adminHeadingRef.current;

        if (lastPosition && nextHeading === null) {
          const lat1 = (lastPosition.lat * Math.PI) / 180;
          const lat2 = (pos.coords.latitude * Math.PI) / 180;
          const lngDiff = ((pos.coords.longitude - lastPosition.lng) * Math.PI) / 180;
          const y = Math.sin(lngDiff) * Math.cos(lat2);
          const x =
            Math.cos(lat1) * Math.sin(lat2) -
            Math.sin(lat1) * Math.cos(lat2) * Math.cos(lngDiff);
          nextHeading = ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
        }

        lastPosition = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        };

        adminHeadingRef.current = nextHeading;
        socket.emit("updateAdminPosition", {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          heading: nextHeading,
        });
      },
      () => {},
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 5000,
      }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [isAuthenticated]);

  const setRole = (playerId: string, role: "unassigned" | "agent" | "hunter") => {
    socket.emit("setRole", { playerId, role });
  };

  const showServerError = (error: Error | null, response?: ServerResponse) => {
    if (error) {
      alert("Der Backend-Server hat nicht geantwortet. Bitte Render/Backend neu deployen.");
      return true;
    }

    if (response && !response.ok) {
      alert(response.reason || "Die Aktion konnte nicht ausgeführt werden.");
      return true;
    }

    return false;
  };

  const kickPlayer = (playerId: string) => {
    if (!confirm("Diesen Spieler wirklich rauswerfen?")) return;
    socket.timeout(4000).emit(
      "kickPlayer",
      { playerId },
      (error: Error | null, response?: ServerResponse) => {
        showServerError(error, response);
      }
    );
  };

  const autoAssignRoles = () => {
    socket.timeout(4000).emit(
      "autoAssignRoles",
      (error: Error | null, response?: ServerResponse) => {
        if (showServerError(error, response)) return;
      }
    );
  };

  const addAreaPoint = (point: MapPoint) => {
    const nextArea = [...gameArea, point];
    setGameArea(nextArea);
    socket.timeout(4000).emit(
      "setGameArea",
      { points: nextArea },
      (error: Error | null, response?: ServerResponse) => {
        showServerError(error, response);
      }
    );
  };

  const setMeetingPointOnMap = (point: MapPoint) => {
    setMeetingPoint(point);
    setEditMode("none");
    socket.timeout(4000).emit(
      "setMeetingPoint",
      point,
      (error: Error | null, response?: ServerResponse) => {
        showServerError(error, response);
      }
    );
  };

  const clearGameArea = () => {
    setGameArea([]);
    socket.timeout(4000).emit(
      "setGameArea",
      { points: [] },
      (error: Error | null, response?: ServerResponse) => {
        showServerError(error, response);
      }
    );
  };

  const clearMeetingPoint = () => {
    setMeetingPoint(null);
    socket.timeout(4000).emit(
      "clearMeetingPoint",
      (error: Error | null, response?: ServerResponse) => {
        showServerError(error, response);
      }
    );
  };

  const sendBroadcastMessage = () => {
    const message = broadcastInput.trim();
    if (!message) return;

    socket.timeout(4000).emit(
      "sendBroadcastMessage",
      { message },
      (error: Error | null, response?: ServerResponse) => {
        if (showServerError(error, response)) return;
      }
    );
    setBroadcastInput("");
  };

  const sendPrivateMessage = () => {
    const message = privateInput.trim();
    if (!selectedPlayerId || !message) return;

    socket.timeout(4000).emit(
      "sendPrivateMessage",
      {
        targetId: selectedPlayerId,
        message,
      },
      (error: Error | null, response?: ServerResponse) => {
        showServerError(error, response);
      }
    );

    setPrivateInput("");
  };

  const applyPingInterval = () => {
    const value = Number(pingInput);

    if (!Number.isFinite(value)) {
      alert("Bitte eine gültige Zahl eingeben.");
      return;
    }

    if (value < 5 || value > 3600) {
      alert("Bitte einen Wert zwischen 5 und 3600 Sekunden eingeben.");
      return;
    }

    socket.emit("setPingInterval", { seconds: value });
  };

  const getStatusColor = (player: Player) => {
    if (!player.connected) return "bg-gray-500";
    if (player.locationStatus === "active") return "bg-green-600";
    if (player.locationStatus === "checking") return "bg-yellow-500";
    return "bg-red-600";
  };

  const getRoleColor = (role: Player["role"]) => {
    if (role === "hunter") return "bg-red-600";
    if (role === "agent") return "bg-blue-600";
    return "bg-gray-600";
  };

  const mapPlayers = useMemo(() => {
    return Object.fromEntries(
      Object.entries(players).filter(
        ([, player]) => player.liveLat !== null && player.liveLng !== null
      )
    );
  }, [players]);

  const selectedPlayer = useMemo(() => {
    if (!selectedPlayerId) return null;
    return players[selectedPlayerId] || null;
  }, [players, selectedPlayerId]);

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  if (!isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-800 p-6">
        <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
          <h1 className="mb-4 text-2xl font-bold">Admin Login</h1>

          <input
            type="password"
            placeholder="Passwort"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mb-4 w-full rounded-lg border border-gray-300 px-4 py-3"
          />

          <button
            onClick={() => {
              if (password === process.env.NEXT_PUBLIC_ADMIN_PASSWORD) {
                setIsAuthenticated(true);
              } else {
                alert("Falsches Passwort");
              }
            }}
            className="w-full rounded-lg bg-gray-800 px-4 py-3 text-white font-semibold"
          >
            Login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen bg-gray-800 p-6">
      {showPingFlash && (
        <div className="pointer-events-none absolute inset-0 z-[1000] flex items-center justify-center bg-white/20">
          <div className="rounded-2xl bg-black/75 px-8 py-4 text-3xl font-bold text-white shadow-2xl">
            PING!
          </div>
        </div>
      )}

      {announcement && (
        <div className="absolute left-1/2 top-6 z-[1200] -translate-x-1/2 rounded-xl bg-black/80 px-5 py-3 text-center text-sm font-semibold text-white shadow-xl">
          {announcement}
        </div>
      )}

      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-3xl font-bold">Admin Übersicht</h1>

        <div className="flex flex-wrap items-center gap-3">
          <div className="rounded-xl bg-gray-800 px-4 py-3 text-lg font-bold text-white">
            Nächster Ping in: {formatTime(seconds)}
          </div>

          <div className="rounded-xl bg-white px-4 py-3 shadow">
            <div className="mb-2 text-sm font-semibold text-black">
              Pingdauer ändern
            </div>

            <div className="flex items-center gap-2">
              <input
                type="number"
                min={5}
                max={3600}
                value={pingInput}
                onChange={(e) => setPingInput(e.target.value)}
                className="w-28 rounded border border-gray-300 px-3 py-2"
              />
              <span className="text-sm text-black">Sek.</span>
              <button
                onClick={applyPingInterval}
                className="rounded bg-gray-800 px-4 py-2 text-sm font-semibold text-white"
              >
                Übernehmen
              </button>
            </div>

            <div className="mt-2 text-xs text-black">
              Aktuell: {pingIntervalSeconds} Sekunden
            </div>
          </div>
        </div>
      </div>

      <div className="mb-6 grid gap-4 lg:grid-cols-[220px_1fr]">
        <div className="rounded-2xl bg-white p-4 shadow">
          <h2 className="mb-3 text-xl font-bold text-black">Spielsteuerung</h2>
          <button
            onClick={autoAssignRoles}
            className="w-full rounded bg-indigo-700 px-4 py-3 font-semibold text-white"
          >
            Auto Zuordnung
          </button>
          <div className="mt-2 text-sm text-gray-700">
            Ein Spieler wird Agent, alle anderen werden Hunter.
          </div>
        </div>

        <div className="rounded-2xl bg-white p-4 shadow">
          <h2 className="mb-3 text-xl font-bold text-black">Nachricht an alle</h2>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              type="text"
              value={broadcastInput}
              onChange={(event) => setBroadcastInput(event.target.value)}
              placeholder="Nachricht schreiben"
              className="min-w-0 flex-1 rounded border border-gray-300 px-3 py-2 text-black"
            />
            <button
              onClick={sendBroadcastMessage}
              className="rounded bg-gray-800 px-4 py-2 font-semibold text-white"
            >
              Senden
            </button>
          </div>
        </div>
      </div>

      <div className="mb-6 rounded-2xl bg-white p-4 shadow">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-black">Karte</h2>
            <div className="text-sm text-gray-700">
              {editMode === "meeting" && "Klicke auf die Karte, um den Treffpunkt zu setzen."}
              {editMode === "area" && "Klicke mehrere Punkte auf der Karte, um den Spielbereich zu zeichnen."}
              {editMode === "none" && "Spielbereich, Treffpunkt und Adminposition werden hier angezeigt."}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setEditMode(editMode === "meeting" ? "none" : "meeting")}
              className={`rounded px-3 py-2 text-sm font-semibold text-white ${
                editMode === "meeting" ? "bg-amber-600" : "bg-gray-800"
              }`}
            >
              Treffpunkt setzen
            </button>
            <button
              onClick={() => setEditMode(editMode === "area" ? "none" : "area")}
              className={`rounded px-3 py-2 text-sm font-semibold text-white ${
                editMode === "area" ? "bg-green-700" : "bg-gray-800"
              }`}
            >
              Spielbereich zeichnen
            </button>
            <button
              onClick={clearMeetingPoint}
              className="rounded bg-gray-600 px-3 py-2 text-sm font-semibold text-white"
            >
              Treffpunkt löschen
            </button>
            <button
              onClick={clearGameArea}
              className="rounded bg-gray-600 px-3 py-2 text-sm font-semibold text-white"
            >
              Spielbereich löschen
            </button>
          </div>
        </div>

        <div className="h-[420px] overflow-hidden rounded-xl shadow">
          <AdminMap
            players={mapPlayers}
            adminPosition={adminPosition}
            gameArea={gameArea}
            meetingPoint={meetingPoint}
            editMode={editMode}
            onMeetingPoint={setMeetingPointOnMap}
            onAreaPoint={addAreaPoint}
          />
        </div>
      </div>

      <div className="mb-6 rounded-2xl bg-white p-4 shadow">
        <h2 className="mb-3 text-xl font-bold text-black">Catch Prüfung</h2>

        {!catchState && <div className="text-sm text-gray-600">Keine offene Catch-Meldung.</div>}

        {catchState && (
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="text-sm text-gray-800">
              <strong>{catchState.reporterName}</strong> meldet Catch gegen{" "}
              <strong>{catchState.targetName}</strong>.
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => socket.emit("confirmCatch")}
                className="rounded bg-green-600 px-4 py-2 font-semibold text-white"
              >
                Bestätigen
              </button>

              <button
                onClick={() => socket.emit("rejectCatch")}
                className="rounded bg-red-600 px-4 py-2 font-semibold text-white"
              >
                Ablehnen
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="mb-6 rounded-2xl bg-white p-4 shadow">
        <h2 className="mb-3 text-xl font-bold text-black">Private Nachricht</h2>

        {!selectedPlayer && (
          <div className="text-sm text-gray-700">
            Wähle einen Spieler aus der Liste aus, um ihm direkt zu schreiben.
          </div>
        )}

        {selectedPlayer && (
          <div className="grid gap-3">
            <div className="text-sm text-gray-800">
              Ausgewählt: <strong>{selectedPlayer.name}</strong>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                type="text"
                value={privateInput}
                onChange={(event) => setPrivateInput(event.target.value)}
                placeholder="Private Nachricht schreiben"
                className="min-w-0 flex-1 rounded border border-gray-300 px-3 py-2 text-black"
              />
              <button
                onClick={sendPrivateMessage}
                className="rounded bg-indigo-700 px-4 py-2 font-semibold text-white"
              >
                Senden
              </button>
            </div>
          </div>
        )}

        {privateMessages.length > 0 && (
          <div className="mt-4 grid gap-2">
            {privateMessages.map((message) => (
              <div key={message.id} className="rounded border border-gray-200 p-3 text-sm text-gray-800">
                <div>
                  An <strong>{message.targetName}</strong>: {message.message}
                </div>
                {message.reply && (
                  <div className="mt-1 rounded bg-green-50 p-2 text-green-900">
                    Antwort von {message.replyFrom}: {message.reply}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="grid gap-4">
        {Object.values(players).map((player) => (
          <div
            key={player.playerId}
            onClick={() => setSelectedPlayerId(player.playerId)}
            className={`cursor-pointer rounded-2xl bg-white p-4 shadow ${
              selectedPlayerId === player.playerId ? "ring-4 ring-indigo-500" : ""
            }`}
          >
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-lg font-bold text-black">{player.name}</div>
                <div className="text-sm text-gray-600">
                  ID: {player.playerId}
                </div>
              </div>

              <div className="flex gap-2">
                <span
                  className={`rounded px-3 py-1 text-sm font-semibold text-white ${getStatusColor(
                    player
                  )}`}
                >
                  {player.connected ? player.locationStatus : "offline"}
                </span>

                <span
                  className={`rounded px-3 py-1 text-sm font-semibold text-white ${getRoleColor(
                    player.role
                  )}`}
                >
                  {player.role}
                </span>
              </div>
            </div>

            <div className="mb-3 text-sm text-gray-700">
              <div>
                Live-Position:{" "}
                {player.liveLat !== null && player.liveLng !== null
                  ? `${player.liveLat.toFixed(6)}, ${player.liveLng.toFixed(6)}`
                  : "keine"}
              </div>
              <div>
                Ping-Position:{" "}
                {player.pingLat !== null && player.pingLng !== null
                  ? `${player.pingLat.toFixed(6)}, ${player.pingLng.toFixed(6)}`
                  : "keine"}
              </div>
              <div>
                Letztes Update:{" "}
                {player.lastUpdate
                  ? new Date(player.lastUpdate).toLocaleTimeString()
                  : "keins"}
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                onClick={(event) => {
                  event.stopPropagation();
                  setRole(player.playerId, "unassigned");
                }}
                className="rounded bg-gray-600 px-3 py-2 text-sm font-semibold text-white"
              >
                Unassigned
              </button>

              <button
                onClick={(event) => {
                  event.stopPropagation();
                  setRole(player.playerId, "agent");
                }}
                className="rounded bg-blue-600 px-3 py-2 text-sm font-semibold text-white"
              >
                Agent
              </button>

              <button
                onClick={(event) => {
                  event.stopPropagation();
                  setRole(player.playerId, "hunter");
                }}
                className="rounded bg-red-600 px-3 py-2 text-sm font-semibold text-white"
              >
                Hunter
              </button>

              <button
                onClick={(event) => {
                  event.stopPropagation();
                  kickPlayer(player.playerId);
                }}
                className="rounded bg-black px-3 py-2 text-sm font-semibold text-white"
              >
                Rauswerfen
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
