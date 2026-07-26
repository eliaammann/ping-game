"use client";

import { Fragment, useEffect, useRef } from "react";
import { MapContainer, TileLayer, Marker, Polygon, useMap, Tooltip } from "react-leaflet";
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

type LoadedMarking = {
  id: string;
  name: string;
  gameArea: MapPoint[];
  meetingPoint: MapPoint | null;
  startPoint: MapPoint | null;
};

function InitialCenter({ position }: { position: [number, number] }) {
  const map = useMap();
  const hasCentered = useRef(false);

  useEffect(() => {
    if (hasCentered.current) return;

    map.setView(position, 16);
    hasCentered.current = true;
  }, [map, position]);

  return null;
}

function FitToArea({
  points,
  focusKey,
}: {
  points: MapPoint[];
  focusKey: number;
}) {
  const map = useMap();
  const lastFocusKey = useRef(0);

  useEffect(() => {
    if (focusKey === 0 || focusKey === lastFocusKey.current || points.length === 0) {
      return;
    }

    lastFocusKey.current = focusKey;

    if (points.length === 1) {
      map.setView([points[0].lat, points[0].lng], 16);
      return;
    }

    const bounds = L.latLngBounds(points.map((point) => [point.lat, point.lng]));
    map.fitBounds(bounds, { padding: [50, 50] });
  }, [focusKey, map, points]);

  return null;
}

export default function Map({
  livePosition,
  pingPosition,
  ownHeading,
  ownRole,
  players,
  gameArea,
  meetingPoint,
  targetArea,
  centralBase,
  startPoint,
  targetFocusKey,
  loadedMarkings,
}: {
  livePosition: [number, number] | null;
  pingPosition: [number, number] | null;
  ownHeading: number | null;
  ownRole: "unassigned" | "agent" | "hunter";
  players: Record<string, Player>;
  gameArea: MapPoint[];
  meetingPoint: MapPoint | null;
  targetArea: MapPoint[];
  centralBase: MapPoint | null;
  startPoint: MapPoint | null;
  targetFocusKey: number;
  loadedMarkings: LoadedMarking[];
}) {
  const ownColor =
    ownRole === "agent" ? "#2563eb" : ownRole === "hunter" ? "#dc2626" : "#4b5563";
  const targetFocusPoints = centralBase ? [...targetArea, centralBase] : targetArea;
  const directionIcon = L.divIcon({
    className: "",
    html: `<div style="
      width:0;
      height:0;
      border-left:7px solid transparent;
      border-right:7px solid transparent;
      border-bottom:20px solid ${ownColor};
      transform:rotate(${ownHeading ?? 0}deg);
      transform-origin:50% 70%;
      filter:drop-shadow(0 1px 2px rgba(0,0,0,0.35));
    "></div>`,
    iconSize: [20, 20],
    iconAnchor: [10, 14],
  });

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

      {(targetArea.length >= 3 || centralBase) && (
        <>
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
          <FitToArea points={targetFocusPoints} focusKey={targetFocusKey} />
        </>
      )}

      {centralBase && (
        <Marker
          position={[centralBase.lat, centralBase.lng]}
          icon={L.divIcon({
            className: "",
            html: `<div style="
              width:28px;
              height:28px;
              background:#111827;
              border-radius:50%;
              border:4px solid #facc15;
              box-shadow:0 2px 8px rgba(0,0,0,0.4);
            "></div>`,
            iconSize: [28, 28],
            iconAnchor: [14, 14],
          })}
        >
          <Tooltip permanent direction="top" offset={[0, -16]}>
            Central Base
          </Tooltip>
        </Marker>
      )}

      {loadedMarkings.map((marking) => (
        <Fragment key={marking.id}>
          {marking.gameArea.length >= 3 && (
            <Polygon
              positions={marking.gameArea.map((point) => [point.lat, point.lng])}
              pathOptions={{
                color: "#15803d",
                fillColor: "#86efac",
                fillOpacity: 0.12,
                weight: 2,
                dashArray: "6 6",
              }}
            />
          )}

          {marking.meetingPoint && (
            <Marker
              position={[marking.meetingPoint.lat, marking.meetingPoint.lng]}
              icon={L.divIcon({
                className: "",
                html: `<div style="
                  width:22px;
                  height:22px;
                  background:#f97316;
                  border-radius:50% 50% 50% 0;
                  border:3px solid white;
                  transform:rotate(-45deg);
                  box-shadow:0 2px 6px rgba(0,0,0,0.35);
                  opacity:0.85;
                "></div>`,
                iconSize: [22, 22],
                iconAnchor: [11, 20],
              })}
            >
              <Tooltip permanent direction="top" offset={[0, -20]}>
                {marking.name}
              </Tooltip>
            </Marker>
          )}

          {marking.startPoint && (
            <Marker
              position={[marking.startPoint.lat, marking.startPoint.lng]}
              icon={L.divIcon({
                className: "",
                html: `<div style="
                  width:20px;
                  height:20px;
                  background:#14b8a6;
                  border-radius:50%;
                  border:3px solid white;
                  box-shadow:0 2px 6px rgba(0,0,0,0.35);
                  opacity:0.85;
                "></div>`,
                iconSize: [20, 20],
                iconAnchor: [10, 10],
              })}
            >
              <Tooltip permanent direction="top" offset={[0, -12]}>
                {marking.name}
              </Tooltip>
            </Marker>
          )}
        </Fragment>
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

      {startPoint && (
        <Marker
          position={[startPoint.lat, startPoint.lng]}
          icon={L.divIcon({
            className: "",
            html: `<div style="
              width:24px;
              height:24px;
              background:#0f766e;
              border-radius:50%;
              border:3px solid white;
              box-shadow:0 2px 6px rgba(0,0,0,0.35);
            "></div>`,
            iconSize: [24, 24],
            iconAnchor: [12, 12],
          })}
        >
          <Tooltip permanent direction="top" offset={[0, -14]}>
            Dein Startpunkt
          </Tooltip>
        </Marker>
      )}

      {livePosition && (
        <>
          {ownHeading === null && (
            <Marker
              position={livePosition}
              icon={L.divIcon({
                className: "",
                html: `<div style="
                  width:16px;
                  height:16px;
                  background:${ownColor};
                  border-radius:50%;
                  border:2px solid white;
                "></div>`,
                iconSize: [16, 16],
                iconAnchor: [8, 8],
              })}
            >
              <Tooltip permanent direction="top" offset={[0, -10]}>
                Du live
              </Tooltip>
            </Marker>
          )}

          {ownHeading !== null && (
            <Marker position={livePosition} icon={directionIcon}>
              <Tooltip permanent direction="top" offset={[0, -18]}>
                Du live
              </Tooltip>
            </Marker>
          )}

          <InitialCenter position={livePosition} />
        </>
      )}

      {pingPosition && (
        <Marker
          position={pingPosition}
          icon={L.divIcon({
            className: "",
            html: `<div style="
              width:30px;
              height:30px;
              border:2px solid black;
              border-radius:50%;
              background:transparent;
            "></div>`,
            iconSize: [30, 30],
            iconAnchor: [15, 15],
          })}
        >
          <Tooltip permanent direction="top" offset={[0, -16]}>
            Dein letzter Ping
          </Tooltip>
        </Marker>
      )}

      {Object.values(players)
        .filter((player) => player.pingLat !== null && player.pingLng !== null)
        .map((player) => {
          let color = "gray";
          if (player.role === "agent") color = "blue";
          if (player.role === "hunter") color = "red";

          const outline = player.connected ? "white" : "yellow";

          return (
            <Marker
              key={player.playerId}
              position={[player.pingLat!, player.pingLng!]}
              icon={L.divIcon({
                className: "",
                html: `<div style="
                  width:14px;
                  height:14px;
                  background:${color};
                  border-radius:50%;
                  border:2px solid ${outline};
                "></div>`,
                iconSize: [14, 14],
                iconAnchor: [7, 7],
              })}
            >
              <Tooltip permanent direction="top" offset={[0, -10]}>
                {player.name}
              </Tooltip>
            </Marker>
          );
        })}
    </MapContainer>
  );
}
