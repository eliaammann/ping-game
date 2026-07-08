"use client";

import { useEffect, useRef } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Polygon,
  Tooltip,
  useMap,
  useMapEvents,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

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

type MapPoint = {
  lat: number;
  lng: number;
};

type AdminPosition = MapPoint & {
  heading: number | null;
  updatedAt: number;
};

type EditMode = "none" | "meeting" | "area" | "target" | "start";

function InitialFitToPlayers({ players }: { players: Record<string, Player> }) {
  const map = useMap();
  const hasCentered = useRef(false);

  useEffect(() => {
    if (hasCentered.current) return;

    const validPlayers = Object.values(players).filter(
      (player) => player.liveLat !== null && player.liveLng !== null
    );

    if (validPlayers.length === 0) return;

    if (validPlayers.length === 1) {
      map.setView([validPlayers[0].liveLat!, validPlayers[0].liveLng!], 16);
    }

    if (validPlayers.length > 1) {
      const bounds = L.latLngBounds(
        validPlayers.map(
          (player) => [player.liveLat!, player.liveLng!] as [number, number]
        )
      );

      map.fitBounds(bounds, { padding: [40, 40] });
    }

    hasCentered.current = true;
  }, [map, players]);

  return null;
}

function MapClickHandler({
  editMode,
  onMeetingPoint,
  onAreaPoint,
  onTargetAreaPoint,
  onStartPoint,
}: {
  editMode: EditMode;
  onMeetingPoint: (point: MapPoint) => void;
  onAreaPoint: (point: MapPoint) => void;
  onTargetAreaPoint: (point: MapPoint) => void;
  onStartPoint: (point: MapPoint) => void;
}) {
  useMapEvents({
    click(event) {
      const point = {
        lat: event.latlng.lat,
        lng: event.latlng.lng,
      };

      if (editMode === "meeting") {
        onMeetingPoint(point);
      }

      if (editMode === "area") {
        onAreaPoint(point);
      }

      if (editMode === "target") {
        onTargetAreaPoint(point);
      }

      if (editMode === "start") {
        onStartPoint(point);
      }
    },
  });

  return null;
}

export default function AdminMap({
  players,
  adminPosition,
  gameArea,
  meetingPoint,
  targetArea,
  playerStartPoints,
  editMode,
  onMeetingPoint,
  onAreaPoint,
  onTargetAreaPoint,
  onStartPoint,
}: {
  players: Record<string, Player>;
  adminPosition: AdminPosition | null;
  gameArea: MapPoint[];
  meetingPoint: MapPoint | null;
  targetArea: MapPoint[];
  playerStartPoints: Record<string, MapPoint>;
  editMode: EditMode;
  onMeetingPoint: (point: MapPoint) => void;
  onAreaPoint: (point: MapPoint) => void;
  onTargetAreaPoint: (point: MapPoint) => void;
  onStartPoint: (point: MapPoint) => void;
}) {
  const getRoleColor = (role: Player["role"]) => {
    if (role === "agent") return "#2563eb";
    if (role === "hunter") return "#dc2626";
    return "#4b5563";
  };

  return (
    <MapContainer
      center={[47.3769, 8.5417]}
      zoom={13}
      className="h-full w-full"
    >
      <TileLayer
        attribution="&copy; OpenStreetMap contributors"
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      <InitialFitToPlayers players={players} />
      <MapClickHandler
        editMode={editMode}
        onMeetingPoint={onMeetingPoint}
        onAreaPoint={onAreaPoint}
        onTargetAreaPoint={onTargetAreaPoint}
        onStartPoint={onStartPoint}
      />

      {gameArea.length >= 3 && (
        <Polygon
          positions={gameArea.map((point) => [point.lat, point.lng])}
          pathOptions={{
            color: "#16a34a",
            fillColor: "#22c55e",
            fillOpacity: 0.16,
            weight: 3,
          }}
        />
      )}

      {gameArea.length > 0 &&
        gameArea.map((point, index) => (
          <Marker
            key={`${point.lat}-${point.lng}-${index}`}
            position={[point.lat, point.lng]}
            icon={L.divIcon({
              className: "",
              html: `<div style="
                width:16px;
                height:16px;
                background:#16a34a;
                border-radius:50%;
                border:2px solid white;
                box-shadow:0 1px 4px rgba(0,0,0,0.35);
              "></div>`,
              iconSize: [16, 16],
              iconAnchor: [8, 8],
            })}
          >
            <Tooltip permanent direction="top" offset={[0, -10]}>
              Punkt {index + 1}
            </Tooltip>
          </Marker>
        ))}

      {targetArea.length >= 3 && (
        <Polygon
          positions={targetArea.map((point) => [point.lat, point.lng])}
          pathOptions={{
            color: "#ca8a04",
            fillColor: "#facc15",
            fillOpacity: 0.22,
            weight: 3,
          }}
        />
      )}

      {targetArea.length > 0 &&
        targetArea.map((point, index) => (
          <Marker
            key={`target-${point.lat}-${point.lng}-${index}`}
            position={[point.lat, point.lng]}
            icon={L.divIcon({
              className: "",
              html: `<div style="
                width:16px;
                height:16px;
                background:#eab308;
                border-radius:50%;
                border:2px solid white;
                box-shadow:0 1px 4px rgba(0,0,0,0.35);
              "></div>`,
              iconSize: [16, 16],
              iconAnchor: [8, 8],
            })}
          >
            <Tooltip permanent direction="top" offset={[0, -10]}>
              Ziel {index + 1}
            </Tooltip>
          </Marker>
        ))}

      {meetingPoint && (
        <Marker
          position={[meetingPoint.lat, meetingPoint.lng]}
          icon={L.divIcon({
            className: "",
            html: `<div style="
              width:26px;
              height:26px;
              background:#f59e0b;
              border-radius:50% 50% 50% 0;
              border:3px solid white;
              transform:rotate(-45deg);
              box-shadow:0 2px 6px rgba(0,0,0,0.35);
            "></div>`,
            iconSize: [26, 26],
            iconAnchor: [13, 24],
          })}
        >
          <Tooltip permanent direction="top" offset={[0, -22]}>
            Treffpunkt
          </Tooltip>
        </Marker>
      )}

      {Object.entries(playerStartPoints).map(([playerId, point]) => {
        const player = players[playerId];

        return (
          <Marker
            key={`start-${playerId}`}
            position={[point.lat, point.lng]}
            icon={L.divIcon({
              className: "",
              html: `<div style="
                width:22px;
                height:22px;
                background:#0f766e;
                border-radius:50%;
                border:3px solid white;
                box-shadow:0 2px 6px rgba(0,0,0,0.35);
              "></div>`,
              iconSize: [22, 22],
              iconAnchor: [11, 11],
            })}
          >
            <Tooltip permanent direction="top" offset={[0, -13]}>
              Start: {player?.name || playerId}
            </Tooltip>
          </Marker>
        );
      })}

      {adminPosition && (
        adminPosition.heading === null ? (
        <Marker
          position={[adminPosition.lat, adminPosition.lng]}
          icon={L.divIcon({
            className: "",
            html: `<div style="
              width:20px;
              height:20px;
              background:#111827;
              border-radius:50%;
              border:3px solid #facc15;
              box-shadow:0 2px 6px rgba(0,0,0,0.35);
            "></div>`,
            iconSize: [20, 20],
            iconAnchor: [10, 10],
          })}
        >
          <Tooltip permanent direction="top" offset={[0, -12]}>
            Admin
          </Tooltip>
        </Marker>
        ) : (
        <Marker
          position={[adminPosition.lat, adminPosition.lng]}
          icon={L.divIcon({
            className: "",
            html: `<div style="
              width:0;
              height:0;
              border-left:8px solid transparent;
              border-right:8px solid transparent;
              border-bottom:24px solid #facc15;
              transform:rotate(${adminPosition.heading}deg);
              transform-origin:50% 70%;
              filter:drop-shadow(0 1px 2px rgba(0,0,0,0.35));
            "></div>`,
            iconSize: [24, 24],
            iconAnchor: [12, 16],
          })}
        >
          <Tooltip permanent direction="top" offset={[0, -18]}>
            Admin
          </Tooltip>
        </Marker>
        )
      )}

      {Object.values(players)
        .filter((player) => player.liveLat !== null && player.liveLng !== null)
        .map((player) => {
          const color = getRoleColor(player.role);
          const outline = player.connected ? "white" : "yellow";

          return (
            <Marker
              key={player.playerId}
              position={[player.liveLat!, player.liveLng!]}
              icon={L.divIcon({
                className: "",
                html:
                  player.heading !== null
                    ? `<div style="
                        width:0;
                        height:0;
                        border-left:8px solid transparent;
                        border-right:8px solid transparent;
                        border-bottom:24px solid ${color};
                        transform:rotate(${player.heading}deg);
                        transform-origin:50% 70%;
                        filter:drop-shadow(0 1px 2px rgba(0,0,0,0.35));
                      "></div>`
                    : `<div style="
                        width:18px;
                        height:18px;
                        background:${color};
                        border-radius:50%;
                        border:3px solid ${outline};
                      "></div>`,
                iconSize: player.heading !== null ? [24, 24] : [18, 18],
                iconAnchor: player.heading !== null ? [12, 16] : [9, 9],
              })}
            >
              <Tooltip permanent direction="top" offset={[0, -12]}>
                {player.name}
              </Tooltip>
            </Marker>
          );
        })}
    </MapContainer>
  );
}
