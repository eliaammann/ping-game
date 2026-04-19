"use client";

import { useEffect, useMemo, useState } from "react";
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

  const setRole = (playerId: string, role: "unassigned" | "agent" | "hunter") => {
    socket.emit("setRole", { playerId, role });
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

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  if (!isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-100 p-6">
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
    <div className="relative min-h-screen bg-gray-100 p-6">
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
            <div className="mb-2 text-sm font-semibold text-gray-700">
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
              <span className="text-sm text-gray-600">Sek.</span>
              <button
                onClick={applyPingInterval}
                className="rounded bg-gray-800 px-4 py-2 text-sm font-semibold text-white"
              >
                Übernehmen
              </button>
            </div>

            <div className="mt-2 text-xs text-gray-500">
              Aktuell: {pingIntervalSeconds} Sekunden
            </div>
          </div>
        </div>
      </div>

      <div className="mb-6 h-[420px] overflow-hidden rounded-2xl shadow">
        <AdminMap players={mapPlayers} />
      </div>

      <div className="mb-6 rounded-2xl bg-white p-4 shadow">
        <h2 className="mb-3 text-xl font-bold">Catch Prüfung</h2>

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

      <div className="grid gap-4">
        {Object.values(players).map((player) => (
          <div key={player.playerId} className="rounded-2xl bg-white p-4 shadow">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-lg font-bold">{player.name}</div>
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
                onClick={() => setRole(player.playerId, "unassigned")}
                className="rounded bg-gray-600 px-3 py-2 text-sm font-semibold text-white"
              >
                Unassigned
              </button>

              <button
                onClick={() => setRole(player.playerId, "agent")}
                className="rounded bg-blue-600 px-3 py-2 text-sm font-semibold text-white"
              >
                Agent
              </button>

              <button
                onClick={() => setRole(player.playerId, "hunter")}
                className="rounded bg-red-600 px-3 py-2 text-sm font-semibold text-white"
              >
                Hunter
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}