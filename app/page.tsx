"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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

type LocationStatus =
  | "checking"
  | "active"
  | "unsupported"
  | "denied"
  | "unavailable"
  | "timeout"
  | "error"
  | "stale";

type PrivacyDecision = {
  cookies: boolean;
  location: boolean;
};

type MapPoint = {
  lat: number;
  lng: number;
};

type MapState = {
  gameArea: MapPoint[];
  meetingPoint: MapPoint | null;
  startPoint: MapPoint | null;
  loadedMarkings: LoadedMarking[];
};

type LoadedMarking = {
  id: string;
  name: string;
  gameArea: MapPoint[];
  meetingPoint: MapPoint | null;
  startPoint: MapPoint | null;
};

type PrivateMessage = {
  id: string;
  message: string;
  createdAt: number;
};

function generatePlayerId() {
  return "player-" + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function getCookie(name: string) {
  if (typeof document === "undefined") return null;

  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

function persistPrivacyDecision(decision: PrivacyDecision) {
  if (typeof window === "undefined") return;

  window.localStorage.setItem("pinggamePrivacyConsent", JSON.stringify(decision));
  document.cookie = `pinggame_cookie_consent=${decision.cookies ? "accepted" : "denied"}; path=/; max-age=31536000; SameSite=Lax`;
}

export default function Home() {
  const [playerId, setPlayerId] = useState<string>("");
  const [playerName, setPlayerName] = useState<string>("");
  const [tempName, setTempName] = useState<string>("");
  const [joined, setJoined] = useState(false);

  const [livePosition, setLivePosition] = useState<[number, number] | null>(null);
  const [pingPosition, setPingPosition] = useState<[number, number] | null>(null);
  const [ownHeading, setOwnHeading] = useState<number | null>(null);
  const [players, setPlayers] = useState<Record<string, Player>>({});
  const [seconds, setSeconds] = useState(0);
  const lastPositionRef = useRef<MapPoint | null>(null);
  const headingRef = useRef<number | null>(null);

  const [locationStatus, setLocationStatus] =
    useState<LocationStatus>("checking");
  const [locationMessage, setLocationMessage] = useState("Warte auf Standort...");

  const [nextPingAt, setNextPingAt] = useState<number | null>(null);
  const [isPingRunning, setIsPingRunning] = useState(false);
  const [showPingFlash, setShowPingFlash] = useState(false);

  const [catchState, setCatchState] = useState<CatchState>(null);
  const [announcement, setAnnouncement] = useState("");
  const [showCatchSelect, setShowCatchSelect] = useState(false);
  const [gameArea, setGameArea] = useState<MapPoint[]>([]);
  const [meetingPoint, setMeetingPoint] = useState<MapPoint | null>(null);
  const [startPoint, setStartPoint] = useState<MapPoint | null>(null);
  const [loadedMarkings, setLoadedMarkings] = useState<LoadedMarking[]>([]);
  const [targetArea, setTargetArea] = useState<MapPoint[]>([]);
  const [centralBase, setCentralBase] = useState<MapPoint | null>(null);
  const [targetPasswordInput, setTargetPasswordInput] = useState("");
  const [showTargetUnlock, setShowTargetUnlock] = useState(false);
  const [targetFocusKey, setTargetFocusKey] = useState(0);
  const [privateMessage, setPrivateMessage] = useState<PrivateMessage | null>(null);
  const [privateReply, setPrivateReply] = useState("");
  const [adminMessageInput, setAdminMessageInput] = useState("");
  const [kicked, setKicked] = useState(false);
  const [privacyDecision, setPrivacyDecision] = useState<PrivacyDecision | null>(null);
  const [showPrivacyPrompt, setShowPrivacyPrompt] = useState(false);

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
    if (typeof window === "undefined") return;

    const savedChoice = window.localStorage.getItem("pinggamePrivacyConsent");
    if (savedChoice) {
      try {
        const parsedChoice = JSON.parse(savedChoice) as PrivacyDecision;
        setPrivacyDecision(parsedChoice);
        return;
      } catch {
        window.localStorage.removeItem("pinggamePrivacyConsent");
      }
    }

    const cookieValue = getCookie("pinggame_cookie_consent");
    if (cookieValue === "accepted" || cookieValue === "denied") {
      const fallbackDecision = {
        cookies: cookieValue === "accepted",
        location: false,
      };
      setPrivacyDecision(fallbackDecision);
      persistPrivacyDecision(fallbackDecision);
      return;
    }

    setShowPrivacyPrompt(true);
  }, []);

  useEffect(() => {
    if (!joined || !playerId || !playerName) return;

    const registerPlayer = () => {
      socket.emit("registerPlayer", {
        playerId,
        name: playerName,
      });
      socket.emit("requestState");
    };

    registerPlayer();
    socket.on("connect", registerPlayer);

    return () => {
      socket.off("connect", registerPlayer);
    };
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

    socket.on(
      "pingState",
      (data: { nextPingAt: number | null; isPingRunning: boolean }) => {
        setNextPingAt(data.nextPingAt);
        setIsPingRunning(data.isPingRunning);
      }
    );

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
      setGameArea(data.gameArea || []);
      setMeetingPoint(data.meetingPoint);
      setStartPoint(data.startPoint || null);
      setLoadedMarkings(data.loadedMarkings || []);
    });

    socket.on("targetAreaState", (data: { targetArea: MapPoint[]; centralBase?: MapPoint | null }) => {
      const nextTargetArea = data.targetArea || [];
      setTargetArea(nextTargetArea);
      setCentralBase(data.centralBase || null);
      if (nextTargetArea.length > 0 || data.centralBase) {
        setTargetFocusKey((key) => key + 1);
        setShowTargetUnlock(false);
      }
    });

    socket.on("adminMessage", (data: PrivateMessage) => {
      setAnnouncement(data.message);
      setTimeout(() => {
        setAnnouncement("");
      }, 8000);
    });

    socket.on("privateMessage", (data: PrivateMessage) => {
      setPrivateMessage(data);
      setPrivateReply("");
    });

    socket.on("kicked", () => {
      localStorage.removeItem("playerName");
      setJoined(false);
      setKicked(true);
    });

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
      socket.off("targetAreaState");
      socket.off("adminMessage");
      socket.off("privateMessage");
      socket.off("kicked");
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
    const handleOrientation = (event: DeviceOrientationEvent) => {
      const heading =
        typeof event.alpha === "number" ? (360 - event.alpha + 360) % 360 : null;

      if (heading !== null) {
        headingRef.current = heading;
        setOwnHeading(heading);
      }
    };

    window.addEventListener("deviceorientationabsolute", handleOrientation);
    window.addEventListener("deviceorientation", handleOrientation);

    return () => {
      window.removeEventListener("deviceorientationabsolute", handleOrientation);
      window.removeEventListener("deviceorientation", handleOrientation);
    };
  }, []);

  useEffect(() => {
    if (!joined || !playerId) return;

    if (!privacyDecision) {
      setLocationStatus("checking");
      setLocationMessage("Bitte erlauben Sie zuerst Standort und Cookies.");
      return;
    }

    if (!privacyDecision.location) {
      setLocationStatus("denied");
      setLocationMessage("Standort ist deaktiviert. Bitte einmal im Browser erlauben.");
      socket.emit("locationStatus", {
        playerId,
        locationStatus: "denied",
      });
      return;
    }

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
        let nextHeading =
          Number.isFinite(pos.coords.heading) && pos.coords.heading !== null
            ? pos.coords.heading
            : headingRef.current;

        if (lastPositionRef.current && nextHeading === null) {
          const lat1 = (lastPositionRef.current.lat * Math.PI) / 180;
          const lat2 = (pos.coords.latitude * Math.PI) / 180;
          const lngDiff =
            ((pos.coords.longitude - lastPositionRef.current.lng) * Math.PI) / 180;
          const y = Math.sin(lngDiff) * Math.cos(lat2);
          const x =
            Math.cos(lat1) * Math.sin(lat2) -
            Math.sin(lat1) * Math.cos(lat2) * Math.cos(lngDiff);
          nextHeading = ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
        }

        lastPositionRef.current = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        };

        if (nextHeading !== null) {
          headingRef.current = nextHeading;
          setOwnHeading(nextHeading);
        }

        setLivePosition(newPosition);
        setLocationStatus("active");
        setLocationMessage(
          `Standort aktiv (Genauigkeit: ${Math.round(pos.coords.accuracy)} m)`
        );

        socket.emit("updatePosition", {
          playerId,
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          heading: nextHeading,
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
  }, [joined, playerId, privacyDecision]);

  const myRole = useMemo(() => {
    if (!playerId || !players[playerId]) return "unassigned";
    return players[playerId].role;
  }, [playerId, players]);

  const otherPlayers = useMemo(() => {
    if (!isPingRunning) return {};

    return Object.fromEntries(
      Object.entries(players).filter(([id]) => id !== playerId)
    );
  }, [isPingRunning, players, playerId]);

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

  const handlePrivacyChoice = (allowLocation: boolean, allowCookies: boolean) => {
    const nextDecision: PrivacyDecision = {
      cookies: allowCookies,
      location: allowLocation,
    };

    persistPrivacyDecision(nextDecision);
    setPrivacyDecision(nextDecision);
    setShowPrivacyPrompt(false);

    if (!allowLocation) {
      setLocationStatus("denied");
      setLocationMessage("Standort ist deaktiviert. Du kannst es später wieder erlauben.");
      if (playerId) {
        socket.emit("locationStatus", {
          playerId,
          locationStatus: "denied",
        });
      }
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

  const sendPrivateReply = () => {
    const reply = privateReply.trim();
    if (!privateMessage || !reply) return;

    socket.emit("sendPrivateReply", {
      playerId,
      messageId: privateMessage.id,
      reply,
    });

    setPrivateMessage(null);
    setPrivateReply("");
  };

  const sendMessageToAdmin = () => {
    const message = adminMessageInput.trim();
    if (!message) return;

    socket.emit(
      "sendPlayerMessage",
      {
        playerId,
        message,
      },
      (response: { ok: boolean; reason?: string }) => {
        if (!response.ok) {
          alert(response.reason || "Nachricht konnte nicht gesendet werden.");
          return;
        }

        setAnnouncement("Nachricht an Admin gesendet");
        setTimeout(() => {
          setAnnouncement("");
        }, 4000);
      }
    );

    setAdminMessageInput("");
  };

  const unlockTargetArea = () => {
    const password = targetPasswordInput.trim();
    if (!password) return;

    socket.emit(
      "unlockTargetArea",
      {
        playerId,
        password,
      },
      (response: { ok: boolean; reason?: string }) => {
        if (!response.ok) {
          alert(response.reason || "Passwort ist nicht korrekt.");
          return;
        }

        setTargetPasswordInput("");
      }
    );
  };

  if (!joined) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-100 p-6">
        {showPrivacyPrompt && (
          <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/60 p-4">
            <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
              <h2 className="text-xl font-bold text-black">Datenschutz & Standort</h2>
              <p className="mt-2 text-sm text-gray-700">
                Für dieses Spiel darf der Browser einmal Standort und Cookies verwenden.
                Ohne Erlaubnis bleiben beide Funktionen deaktiviert.
              </p>

              <div className="mt-4 rounded-lg bg-gray-50 p-3 text-sm text-gray-800">
                <p>• Standort: für die Positionsverfolgung</p>
                <p>• Cookies: für die einmalige Zustimmung auf diesem Gerät</p>
              </div>

              <div className="mt-5 flex gap-2">
                <button
                  onClick={() => handlePrivacyChoice(true, true)}
                  className="flex-1 rounded-lg bg-green-600 px-4 py-3 font-semibold text-white"
                >
                  Erlauben
                </button>
                <button
                  onClick={() => handlePrivacyChoice(false, false)}
                  className="flex-1 rounded-lg bg-gray-700 px-4 py-3 font-semibold text-white"
                >
                  Deaktiviert lassen
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
          <h1 className="mb-4 text-2xl font-bold text-black">Spiel beitreten</h1>
          {kicked && (
            <div className="mb-4 rounded-lg bg-red-100 px-4 py-3 text-sm font-semibold text-red-800">
              Du wurdest aus dem Spiel entfernt.
            </div>
          )}
          <p className="mb-4 text-sm text-gray-800">
            Gib deinen Namen ein. Deine Rolle wird später im Adminbereich zugewiesen.
          </p>

          <input
            type="text"
            value={tempName}
            onChange={(e) => setTempName(e.target.value)}
            placeholder="Dein Name"
            className="mb-4 w-full rounded-lg border border-gray-300 px-4 py-3 text-black outline-none placeholder:text-gray-600"
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

      {privateMessage && (
        <div className="absolute inset-x-4 top-32 z-[1250] mx-auto max-w-md rounded-2xl bg-white p-5 shadow-2xl">
          <h2 className="mb-2 text-lg font-bold text-black">Nachricht vom Admin</h2>
          <div className="mb-4 rounded bg-gray-100 p-3 text-sm text-gray-900">
            {privateMessage.message}
          </div>
          <textarea
            value={privateReply}
            onChange={(event) => setPrivateReply(event.target.value)}
            placeholder="Antwort schreiben"
            className="mb-3 min-h-24 w-full rounded border border-gray-300 px-3 py-2 text-black"
          />
          <div className="flex gap-2">
            <button
              onClick={sendPrivateReply}
              className="flex-1 rounded bg-indigo-700 px-4 py-2 font-semibold text-white"
            >
              Antwort senden
            </button>
            <button
              onClick={() => setPrivateMessage(null)}
              className="rounded bg-gray-600 px-4 py-2 font-semibold text-white"
            >
              Schließen
            </button>
          </div>
        </div>
      )}

      {showTargetUnlock && (
        <div className="absolute inset-x-4 top-32 z-[1260] mx-auto max-w-md rounded-2xl bg-white p-5 shadow-2xl">
          <h2 className="mb-2 text-lg font-bold text-black">Zielbereich anzeigen</h2>
          <p className="mb-3 text-sm text-gray-700">
            Gib das Passwort ein, um den Zielbereich auf deiner Karte freizuschalten.
          </p>
          <input
            type="password"
            value={targetPasswordInput}
            onChange={(event) => setTargetPasswordInput(event.target.value)}
            placeholder="Passwort"
            className="mb-3 w-full rounded border border-gray-300 px-3 py-2 text-black"
          />
          <div className="flex gap-2">
            <button
              onClick={unlockTargetArea}
              className="flex-1 rounded bg-yellow-600 px-4 py-2 font-semibold text-white"
            >
              Anzeigen
            </button>
            <button
              onClick={() => setShowTargetUnlock(false)}
              className="rounded bg-gray-600 px-4 py-2 font-semibold text-white"
            >
              Abbrechen
            </button>
          </div>
        </div>
      )}

      <div className="bg-gray-800 p-4 text-center text-xl font-bold text-white">
        {isPingRunning ? `Nächster Ping in: ${formatTime(seconds)}` : "Ping-Countdown angehalten"}
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

      <div className="grid gap-2 bg-white px-4 py-3 shadow-sm sm:grid-cols-[1fr_auto_auto]">
        <input
          type="text"
          value={adminMessageInput}
          onChange={(event) => setAdminMessageInput(event.target.value)}
          placeholder="Nachricht an Admin schreiben"
          className="min-w-0 rounded border border-gray-300 px-3 py-2 text-black"
        />
        <button
          onClick={sendMessageToAdmin}
          className="rounded bg-indigo-700 px-4 py-2 font-semibold text-white"
        >
          An Admin senden
        </button>
        <button
          onClick={() => setShowTargetUnlock(true)}
          className="rounded bg-yellow-600 px-4 py-2 font-semibold text-white"
        >
          Zielbereich anzeigen
        </button>
      </div>

      <div className="flex-1">
        <Map
          livePosition={livePosition}
          pingPosition={pingPosition}
          ownHeading={ownHeading}
          ownRole={myRole}
          players={otherPlayers}
          gameArea={gameArea}
          meetingPoint={meetingPoint}
          targetArea={targetArea}
          centralBase={centralBase}
          startPoint={startPoint}
          targetFocusKey={targetFocusKey}
          loadedMarkings={loadedMarkings}
        />
      </div>

      <div className={`${getRoleBarColor()} p-3 text-center text-white`}>
        Name: {playerName} | Rolle: {myRole}
      </div>
    </div>
  );
}
