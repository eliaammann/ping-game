"use client";

import { MapContainer, TileLayer, Marker, useMap, Tooltip } from "react-leaflet";
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

  locationStatus: string;
  connected: boolean;
  lastUpdate: number | null;
};

function Recenter({ position }: { position: [number, number] }) {
  const map = useMap();
  map.setView(position, 16);
  return null;
}

export default function Map({
  livePosition,
  pingPosition,
  players,
}: {
  livePosition: [number, number] | null;
  pingPosition: [number, number] | null;
  players: Record<string, Player>;
}) {
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

      {livePosition && (
        <>
          <Marker
            position={livePosition}
            icon={L.divIcon({
              className: "",
              html: `<div style="
                width:16px;
                height:16px;
                background:blue;
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

          <Recenter position={livePosition} />
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