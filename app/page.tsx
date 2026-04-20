"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { io } from "socket.io-client";

const Map = dynamic(() => import("./map"), { ssr: false });
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

type LocationStatus =
  | "checking"
  | "active"
  | "unsupported"
  | "denied"
  | "unavailable"
  | "timeout"
  | "error"
  | "stale";

function generatePlayerId() {
  return "player-" + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export default function Home() {
  const [playerId, setPlayerId] = useState<string>("");
  const [playerName, setPlayerName] = useState<string>("");
  const [tempName, setTempName] = useState<string>("");
  const [joined, setJoined] = useState(false);

  const [livePosition, setLivePosition] = useState<[number, number] | null>(null);
  const [pingPosition, setPingPosition] = useState<[number, number] | null>(null);
  const [players, setPlayers] = useState<Record<string, Player>>({});
  const [seconds, setSeconds] = useState(0);

  const [locationStatus, setLocationStatus] =
    useState<LocationStatus>("checking");
  const [locationMessage, setLocationMessage] = useState("Warte auf Standort...");

  const [nextPingAt, setNextPingAt] = useState<number | null>(null);
  const [showPingFlash, setShowPingFlash] = useState(false);

  const [catchState, setCatchState] = useState<CatchState>(null);
  const [announcement, setAnnouncement] = useState("");
  const [showCatchSelect, setShowCatchSelect] = useState(false);

  useEffect(() => {
    const savedPlayerId = localStorage.getItem("playerId");
    const savedPlayerName = localStorage.getItem("playerName");

    const finalPlayerId = savedPlayerId || generatePlayerId();
    setPlayerId(finalPlayerId);

    if (!savedPlayerId) {
      localStorage.setItem("playerId", finalPlayerId);
    }

    if (savedPlayerName) {
      setPlayerName(savedPlayerName);
      setTempName(savedPlayerName);
      setJoined(true);
    }
  }, []);

  useEffect(() => {
    if (!joined || !playerId || !playerName) return;

    socket.emit("registerPlayer", {
      playerId,
      name: playerName,
    });
  }, [joined, playerId, playerName]);

  useEffect(() => {
    socket.on("playersUpdate", (data: Record<string, Player>) => {
      setPlayers(data);

      if (playerId && data[playerId]) {
        const me = data[playerId];
        if (me.pingLat !== null && me.pingLng !== null) {
          setPingPosition([me.pingLat, me.pingLng]);
        } else {
          setPingPosition(null);
        }
      }
    });

    socket.on("pingState", (data: { nextPingAt: number }) => {
      setNextPingAt(data.nextPingAt);
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

    socket.on("announcement", (data: { message: string }) => {
      setAnnouncement(data.message);
      setTimeout(() => {
        setAnnouncement("");
      }, 5000);
    });

    return () => {
      socket.off("playersUpdate");
      socket.off("pingState");
      socket.off("pingTriggered");
      socket.off("catchState");
      socket.off("announcement");
    };
  }, [playerId]);

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
    if (!joined || !playerId) return;

    if (!navigator.geolocation) {
      setLocationStatus("unsupported");
      setLocationMessage("Geolocation wird auf diesem Gerät nicht unterstützt.");
      socket.emit("locationStatus", {
        playerId,
        locationStatus: "unsupported",
      });
      return;
    }

    setLocationStatus("checking");
    setLocationMessage("Warte auf Standortfreigabe...");

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const newPosition: [number, number] = [
          pos.coords.latitude,
          pos.coords.longitude,
        ];

        setLivePosition(newPosition);
        setLocationStatus("active");
        setLocationMessage(
          `Standort aktiv (Genauigkeit: ${Math.round(pos.coords.accuracy)} m)`
        );

        socket.emit("updatePosition", {
          playerId,
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          locationStatus: "active",
        });
      },
      (err) => {
        console.error("Geolocation error:", err);

        switch (err.code) {
          case err.PERMISSION_DENIED:
            setLocationStatus("denied");
            setLocationMessage(
              "Standortzugriff verweigert. Bitte Standortfreigabe im Browser erlauben."
            );
            socket.emit("locationStatus", {
              playerId,
              locationStatus: "denied",
            });
            break;
          case err.POSITION_UNAVAILABLE:
            setLocationStatus("unavailable");
            setLocationMessage("Standort momentan nicht verfügbar.");
            socket.emit("locationStatus", {
              playerId,
              locationStatus: "unavailable",
            });
            break;
          case err.TIMEOUT:
            setLocationStatus("timeout");
            setLocationMessage("Standortabfrage hat zu lange gedauert.");
            socket.emit("locationStatus", {
              playerId,
              locationStatus: "timeout",
            });
            break;
          default:
            setLocationStatus("error");
            setLocationMessage("Unbekannter Fehler bei der Standorterfassung.");
            socket.emit("locationStatus", {
              playerId,
              locationStatus: "error",
            });
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 5000,
      }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [joined, playerId]);

  const myRole = useMemo(() => {
    if (!playerId || !players[playerId]) return "unassigned";
    return players[playerId].role;
  }, [playerId, players]);

  const otherPlayers = useMemo(() => {
    return Object.fromEntries(
      Object.entries(players).filter(([id]) => id !== playerId)
    );
  }, [players, playerId]);

  const catchableAgents = useMemo(() => {
    return Object.values(players).filter(
      (player) => player.playerId !== playerId && player.role === "agent"
    );
  }, [players, playerId]);

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  const getLocationBarColor = () => {
    switch (locationStatus) {
      case "active":
        return "bg-green-600";
      case "checking":
        return "bg-yellow-500";
      default:
        return "bg-red-600";
    }
  };

  const getRoleBarColor = () => {
    switch (myRole) {
      case "hunter":
        return "bg-red-600";
      case "agent":
        return "bg-blue-600";
      default:
        return "bg-gray-600";
    }
  };

  const handleJoin = () => {
    const trimmed = tempName.trim();
    if (!trimmed) return;

    localStorage.setItem("playerName", trimmed);
    setPlayerName(trimmed);
    setJoined(true);
  };

  const reportCatch = (targetId: string) => {
    socket.emit(
      "reportCatch",
      {
        reporterId: playerId,
        targetId,
      },
      (response: { ok: boolean; reason: string }) => {
        if (!response.ok) {
          alert(response.reason);
        }
      }
    );

    setShowCatchSelect(false);
  };

  if (!joined) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-100 p-6">
        <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
          <h1 className="mb-4 text-2xl font-bold">Spiel beitreten</h1>
          <p className="mb-4 text-sm text-gray-600">
            Gib deinen Namen ein. Deine Rolle wird später im Adminbereich zugewiesen.
          </p>

          <input
            type="text"
            value={tempName}
            onChange={(e) => setTempName(e.target.value)}
            placeholder="Dein Name"
            className="mb-4 w-full rounded-lg border border-gray-300 px-4 py-3 outline-none"
          />

          <button
            onClick={handleJoin}
            className="w-full rounded-lg bg-gray-800 px-4 py-3 font-semibold text-white"
          >
            Beitreten
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex h-screen flex-col">
      {showPingFlash && (
        <div className="pointer-events-none absolute inset-0 z-[1000] flex items-center justify-center bg-white/20">
          <div className="rounded-2xl bg-black/75 px-8 py-4 text-3xl font-bold text-white shadow-2xl">
            PING!
          </div>
        </div>
      )}

      {showCatchSelect && (
        <div className="absolute inset-0 z-[1100] flex items-center justify-center bg-black/40 p-6">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <h2 className="mb-4 text-xl font-bold">Agent wählen</h2>

            <div className="mb-4 grid gap-2">
              {catchableAgents.length === 0 && (
                <div className="text-sm text-gray-600">Keine Agents verfügbar.</div>
              )}

              {catchableAgents.map((agent) => (
                <button
                  key={agent.playerId}
                  onClick={() => reportCatch(agent.playerId)}
                  className="rounded-lg bg-blue-600 px-4 py-3 text-left font-semibold text-white"
                >
                  {agent.name}
                </button>
              ))}
            </div>

            <button
              onClick={() => setShowCatchSelect(false)}
              className="w-full rounded-lg bg-gray-600 px-4 py-3 font-semibold text-white"
            >
              Abbrechen
            </button>
          </div>
        </div>
      )}

      {announcement && (
        <div className="absolute left-1/2 top-24 z-[1200] -translate-x-1/2 rounded-xl bg-black/80 px-5 py-3 text-center text-sm font-semibold text-white shadow-xl">
          {announcement}
        </div>
      )}

      <div className="bg-gray-800 p-4 text-center text-xl font-bold text-white">
        Nächster Ping in: {formatTime(seconds)}
      </div>

      <div className={`${getLocationBarColor()} p-2 text-center text-sm text-white`}>
        {locationMessage}
      </div>

      <div className="flex items-center justify-between gap-3 bg-white px-4 py-3 shadow-sm">
        <div className="text-sm text-gray-700">
          {catchState
            ? `Offene Catch-Meldung: ${catchState.reporterName} → ${catchState.targetName}`
            : "Keine offene Catch-Meldung"}
        </div>

        {myRole === "hunter" && !catchState && (
          <button
            onClick={() => setShowCatchSelect(true)}
            className="rounded-lg bg-red-600 px-4 py-2 font-semibold text-white"
          >
            Catch
          </button>
        )}
      </div>

      <div className="flex-1">
        <Map
          livePosition={livePosition}
          pingPosition={pingPosition}
          players={otherPlayers}
        />
      </div>

      <div className={`${getRoleBarColor()} p-3 text-center text-white`}>
        Name: {playerName} | Rolle: {myRole}
      </div>
    </div>
  );
}