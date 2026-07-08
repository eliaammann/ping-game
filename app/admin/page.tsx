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
  targetArea: MapPoint[];
  playerStartPoints: Record<string, MapPoint>;
  savedMarkings: SavedMarking[];
  loadedMarkings: SavedMarking[];
  hasTargetPassword: boolean;
};

type SavedMarking = {
  id: string;
  name: string;
  createdAt: number;
  gameArea: MapPoint[];
  meetingPoint: MapPoint | null;
  targetArea: MapPoint[];
  playerStartPoints: Record<string, MapPoint>;
};

type EditMode = "none" | "meeting" | "area" | "target" | "start";

type PrivateMessageLog = {
  id: string;
  targetId: string;
  targetName: string;
  message: string;
  createdAt: number;
  reply?: string;
  replyFrom?: string;
};

type PlayerMessageLog = {
  id: string;
  playerId: string;
  playerName: string;
  message: string;
  createdAt: number;
  reply?: string;
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
  const [isPingRunning, setIsPingRunning] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [showPingFlash, setShowPingFlash] = useState(false);

  const [pingIntervalSeconds, setPingIntervalSeconds] = useState(300);
  const [pingInput, setPingInput] = useState("300");

  const [catchState, setCatchState] = useState<CatchState>(null);
  const [announcement, setAnnouncement] = useState("");
  const [adminPosition, setAdminPosition] = useState<AdminPosition | null>(null);
  const [gameArea, setGameArea] = useState<MapPoint[]>([]);
  const [meetingPoint, setMeetingPoint] = useState<MapPoint | null>(null);
  const [targetArea, setTargetArea] = useState<MapPoint[]>([]);
  const [targetPasswordDraft, setTargetPasswordDraft] = useState("");
  const [hasTargetPassword, setHasTargetPassword] = useState(false);
  const [playerStartPoints, setPlayerStartPoints] = useState<Record<string, MapPoint>>({});
  const [savedMarkings, setSavedMarkings] = useState<SavedMarking[]>([]);
  const [loadedMarkings, setLoadedMarkings] = useState<SavedMarking[]>([]);
  const [showMarkingPanel, setShowMarkingPanel] = useState(false);
  const [markingNameInput, setMarkingNameInput] = useState("");
  const [editMode, setEditMode] = useState<EditMode>("none");
  const [broadcastInput, setBroadcastInput] = useState("");
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [privateInput, setPrivateInput] = useState("");
  const [privateMessages, setPrivateMessages] = useState<PrivateMessageLog[]>([]);
  const [playerMessages, setPlayerMessages] = useState<PlayerMessageLog[]>([]);
  const [playerReplyInputs, setPlayerReplyInputs] = useState<Record<string, string>>({});
  const adminHeadingRef = useRef<number | null>(null);

  useEffect(() => {
    socket.on(
      "pingState",
      (data: {
        nextPingAt: number | null;
        pingIntervalMs: number;
        remainingPingMs: number;
        isPingRunning: boolean;
      }) => {
        setNextPingAt(data.nextPingAt);
        setIsPingRunning(data.isPingRunning);

        const secs = Math.round(data.pingIntervalMs / 1000);
        setPingIntervalSeconds(secs);
        setPingInput(String(secs));

        if (!data.isPingRunning) {
          setSeconds(Math.ceil(data.remainingPingMs / 1000));
        }
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

    socket.on("adminMapState", (data: MapState) => {
      setAdminPosition(data.adminPosition);
      setGameArea(data.gameArea || []);
      setMeetingPoint(data.meetingPoint);
      setTargetArea(data.targetArea || []);
      setPlayerStartPoints(data.playerStartPoints || {});
      setSavedMarkings(data.savedMarkings || []);
      setLoadedMarkings(data.loadedMarkings || []);
      setHasTargetPassword(data.hasTargetPassword);
    });

    socket.on("privateMessageSent", (data: PrivateMessageLog) => {
      setPrivateMessages((messages) => [data, ...messages].slice(0, 20));
    });

    socket.on("playerMessageSent", (data: PlayerMessageLog) => {
      setPlayerMessages((messages) => [data, ...messages].slice(0, 30));
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
      socket.off("adminMapState");
      socket.off("privateMessageSent");
      socket.off("playerMessageSent");
      socket.off("privateReply");
      socket.off("announcement");
    };
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      if (!isPingRunning || !nextPingAt) {
        return;
      }

      const diffMs = nextPingAt - Date.now();
      const nextSeconds = Math.max(0, Math.ceil(diffMs / 1000));
      setSeconds(nextSeconds);
    }, 250);

    return () => clearInterval(interval);
  }, [isPingRunning, nextPingAt]);

  useEffect(() => {
    if (!isAuthenticated) return;

    socket.emit("registerAdmin");
    socket.emit("requestState");
  }, [isAuthenticated]);

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

  const triggerPingNow = () => {
    socket.timeout(4000).emit(
      "triggerPingNow",
      (error: Error | null, response?: ServerResponse) => {
        showServerError(error, response);
      }
    );
  };

  const togglePingRunning = () => {
    socket.timeout(4000).emit(
      "setPingRunning",
      { isRunning: !isPingRunning },
      (error: Error | null, response?: ServerResponse) => {
        showServerError(error, response);
      }
    );
  };

  const resetGame = () => {
    if (!confirm("Spiel wirklich zurücksetzen? Rollen, Pings, Catch-Meldungen und Kartenpunkte werden gelöscht.")) {
      return;
    }

    socket.timeout(4000).emit(
      "resetGame",
      (error: Error | null, response?: ServerResponse) => {
        showServerError(error, response);
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

  const beginTargetArea = (keepUnlockedPlayers: boolean) => {
    const password = prompt("Passwort für den Zielbereich eingeben");
    const trimmedPassword = password?.trim();
    if (!trimmedPassword) return;

    setTargetPasswordDraft(trimmedPassword);
    setTargetArea([]);
    setEditMode("target");

    if (keepUnlockedPlayers) {
      socket.timeout(4000).emit(
        "setTargetArea",
        {
          points: [],
          password: trimmedPassword,
        },
        (error: Error | null, response?: ServerResponse) => {
          showServerError(error, response);
        }
      );
    } else {
      socket.timeout(4000).emit(
        "clearTargetArea",
        (error: Error | null, response?: ServerResponse) => {
          showServerError(error, response);
        }
      );
    }
  };

  const addTargetAreaPoint = (point: MapPoint) => {
    const nextArea = [...targetArea, point];
    setTargetArea(nextArea);
    socket.timeout(4000).emit(
      "setTargetArea",
      {
        points: nextArea,
        password: targetPasswordDraft,
      },
      (error: Error | null, response?: ServerResponse) => {
        showServerError(error, response);
      }
    );
  };

  const clearTargetArea = () => {
    setTargetArea([]);
    setTargetPasswordDraft("");
    setEditMode("none");
    socket.timeout(4000).emit(
      "clearTargetArea",
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

  const setStartPointOnMap = (point: MapPoint) => {
    if (!selectedPlayerId) {
      alert("Bitte zuerst einen Spieler auswählen.");
      setEditMode("none");
      return;
    }

    setPlayerStartPoints((points) => ({
      ...points,
      [selectedPlayerId]: point,
    }));
    setEditMode("none");
    socket.timeout(4000).emit(
      "setStartPoint",
      {
        playerId: selectedPlayerId,
        point,
      },
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

  const clearSelectedStartPoint = () => {
    if (!selectedPlayerId) {
      alert("Bitte zuerst einen Spieler auswählen.");
      return;
    }

    setPlayerStartPoints((points) => {
      const nextPoints = { ...points };
      delete nextPoints[selectedPlayerId];
      return nextPoints;
    });

    socket.timeout(4000).emit(
      "clearStartPoint",
      { playerId: selectedPlayerId },
      (error: Error | null, response?: ServerResponse) => {
        showServerError(error, response);
      }
    );
  };

  const saveCurrentMarkings = () => {
    const name = markingNameInput.trim();
    if (!name) {
      alert("Bitte einen Namen eingeben.");
      return;
    }

    socket.timeout(4000).emit(
      "saveCurrentMarkings",
      { name },
      (error: Error | null, response?: ServerResponse & { savedMarkings?: SavedMarking[] }) => {
        if (showServerError(error, response)) return;

        if (response?.savedMarkings) {
          setSavedMarkings(response.savedMarkings);
        }
        setMarkingNameInput("");
      }
    );
  };

  const loadSavedMarking = (markingId: string) => {
    socket.timeout(4000).emit(
      "loadSavedMarking",
      { id: markingId },
      (error: Error | null, response?: ServerResponse) => {
        showServerError(error, response);
      }
    );
  };

  const clearActiveMapMarkings = () => {
    if (!confirm("Alle aktuell eingezeichneten Markierungen auf der Karte löschen? Gespeicherte Markierungen bleiben erhalten.")) {
      return;
    }

    setGameArea([]);
    setMeetingPoint(null);
    setTargetArea([]);
    setPlayerStartPoints({});
    setLoadedMarkings([]);
    setEditMode("none");

    socket.timeout(4000).emit(
      "clearActiveMapMarkings",
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

  const replyToPlayerMessage = (message: PlayerMessageLog) => {
    const reply = (playerReplyInputs[message.id] || "").trim();
    if (!reply) return;

    socket.timeout(4000).emit(
      "sendPrivateMessage",
      {
        targetId: message.playerId,
        message: reply,
      },
      (error: Error | null, response?: ServerResponse) => {
        if (showServerError(error, response)) return;

        setPlayerMessages((messages) =>
          messages.map((entry) =>
            entry.id === message.id ? { ...entry, reply } : entry
          )
        );
        setPlayerReplyInputs((inputs) => ({
          ...inputs,
          [message.id]: "",
        }));
      }
    );
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
          <div className="flex items-center gap-2 rounded-xl bg-gray-900 px-4 py-3 text-white">
            <div className="text-lg font-bold">
              {isPingRunning ? `Nächster Ping in: ${formatTime(seconds)}` : `Pausiert bei: ${formatTime(seconds)}`}
            </div>
            <button
              onClick={togglePingRunning}
              className={`rounded px-3 py-2 text-sm font-semibold text-white ${
                isPingRunning ? "bg-red-700" : "bg-green-700"
              }`}
            >
              {isPingRunning ? "Anhalten" : "Starten"}
            </button>
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
                className="w-28 rounded border border-gray-300 px-3 py-2 text-black placeholder:text-gray-600"
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
          <div className="grid gap-2">
            <button
              onClick={autoAssignRoles}
              className="w-full rounded bg-indigo-700 px-4 py-3 font-semibold text-white"
            >
              Auto-Zuordnung
            </button>
            <button
              onClick={triggerPingNow}
              className="w-full rounded bg-gray-800 px-4 py-3 font-semibold text-white"
            >
              Ping jetzt
            </button>
            <button
              onClick={resetGame}
              className="w-full rounded bg-red-700 px-4 py-3 font-semibold text-white"
            >
              Spiel zurücksetzen
            </button>
          </div>
          <div className="mt-3 text-sm text-gray-700">
            Rollen verteilen, sofort pingen oder eine neue Runde sauber starten.
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
              {editMode === "target" && "Klicke mehrere Punkte auf der Karte, um den Zielbereich zu zeichnen."}
              {editMode === "start" && "Klicke auf die Karte, um den Startpunkt für den ausgewählten Spieler zu setzen."}
              {editMode === "none" &&
                `Spielbereich, Treffpunkt und Adminposition werden hier angezeigt. Zielpasswort: ${
                  hasTargetPassword ? "gesetzt" : "nicht gesetzt"
                }.`}
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
              onClick={() => beginTargetArea(false)}
              className={`rounded px-3 py-2 text-sm font-semibold text-white ${
                editMode === "target" ? "bg-yellow-600" : "bg-yellow-700"
              }`}
            >
              Zielbereich zeichnen
            </button>
            <button
              onClick={() => beginTargetArea(true)}
              className="rounded bg-yellow-600 px-3 py-2 text-sm font-semibold text-white"
            >
              Zielbereich ändern
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
            <button
              onClick={clearTargetArea}
              className="rounded bg-gray-600 px-3 py-2 text-sm font-semibold text-white"
            >
              Zielbereich löschen
            </button>
          </div>
        </div>

        <div className="mb-3">
          <button
            onClick={() => setShowMarkingPanel((isOpen) => !isOpen)}
            className="rounded bg-indigo-700 px-4 py-2 text-sm font-semibold text-white"
          >
            Markierungen
          </button>
        </div>

        {showMarkingPanel && (
          <div className="mb-3 rounded-xl border border-gray-200 bg-gray-50 p-3">
            <div className="mb-3 flex flex-col gap-2 sm:flex-row">
              <input
                type="text"
                value={markingNameInput}
                onChange={(event) => setMarkingNameInput(event.target.value)}
                placeholder="Name der Markierung"
                className="min-w-0 flex-1 rounded border border-gray-300 px-3 py-2 text-black"
              />
              <button
                onClick={saveCurrentMarkings}
                className="rounded bg-indigo-700 px-4 py-2 font-semibold text-white"
              >
                Markiertes speichern
              </button>
            </div>

            <div className="grid gap-2">
              {savedMarkings.length === 0 && (
                <div className="text-sm text-gray-700">Noch keine gespeicherten Markierungen.</div>
              )}

              {savedMarkings.map((marking) => (
                <button
                  key={marking.id}
                  onClick={() => loadSavedMarking(marking.id)}
                  className="rounded border border-gray-300 bg-white px-3 py-2 text-left text-sm font-semibold text-gray-900 hover:bg-gray-100"
                >
                  {marking.name}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="relative h-[420px] overflow-hidden rounded-xl shadow">
          <button
            onClick={clearActiveMapMarkings}
            className="absolute right-3 top-3 z-[1000] flex h-10 w-10 items-center justify-center rounded-full bg-black/80 text-xl font-bold text-white shadow-xl"
            title="Alle Markierungen auf der Karte löschen"
          >
            ×
          </button>
          <AdminMap
            players={mapPlayers}
            adminPosition={adminPosition}
            gameArea={gameArea}
            meetingPoint={meetingPoint}
            targetArea={targetArea}
            playerStartPoints={playerStartPoints}
            loadedMarkings={loadedMarkings}
            editMode={editMode}
            onMeetingPoint={setMeetingPointOnMap}
            onAreaPoint={addAreaPoint}
            onTargetAreaPoint={addTargetAreaPoint}
            onStartPoint={setStartPointOnMap}
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
        <h2 className="mb-3 text-xl font-bold text-black">Nachrichten von Spielern</h2>

        {playerMessages.length === 0 && (
          <div className="text-sm text-gray-700">Noch keine Nachrichten von Spielern.</div>
        )}

        {playerMessages.length > 0 && (
          <div className="grid gap-3">
            {playerMessages.map((message) => (
              <div key={message.id} className="rounded border border-gray-200 p-3 text-sm text-gray-800">
                <div className="mb-2">
                  Von <strong>{message.playerName}</strong>: {message.message}
                </div>
                {message.reply && (
                  <div className="mb-2 rounded bg-green-50 p-2 text-green-900">
                    Antwort gesendet: {message.reply}
                  </div>
                )}
                <div className="flex flex-col gap-2 sm:flex-row">
                  <input
                    type="text"
                    value={playerReplyInputs[message.id] || ""}
                    onChange={(event) =>
                      setPlayerReplyInputs((inputs) => ({
                        ...inputs,
                        [message.id]: event.target.value,
                      }))
                    }
                    placeholder="Antwort schreiben"
                    className="min-w-0 flex-1 rounded border border-gray-300 px-3 py-2 text-black"
                  />
                  <button
                    onClick={() => replyToPlayerMessage(message)}
                    className="rounded bg-indigo-700 px-4 py-2 font-semibold text-white"
                  >
                    Antworten
                  </button>
                </div>
              </div>
            ))}
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
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setEditMode("start")}
                className="rounded bg-teal-700 px-4 py-2 font-semibold text-white"
              >
                Startpunkt setzen
              </button>
              <button
                onClick={clearSelectedStartPoint}
                className="rounded bg-gray-600 px-4 py-2 font-semibold text-white"
              >
                Startpunkt löschen
              </button>
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
