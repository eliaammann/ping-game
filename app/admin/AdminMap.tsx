"use client";

import { MapContainer, TileLayer, Marker, Tooltip, useMap } from "react-leaflet";
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

function FitToPlayers({ players }: { players: Record<string, Player> }) {
  const map = useMap();

  const validPlayers = Object.values(players).filter(
    (player) => player.liveLat !== null && player.liveLng !== null
  );

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

  return null;
}

export default function AdminMap({
  players,
}: {
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

      <FitToPlayers players={players} />

      {Object.values(players)
        .filter((player) => player.liveLat !== null && player.liveLng !== null)
        .map((player) => {
          let color = "gray";
          if (player.role === "agent") color = "blue";
          if (player.role === "hunter") color = "red";

          const outline = player.connected ? "white" : "yellow";

          return (
            <Marker
              key={player.playerId}
              position={[player.liveLat!, player.liveLng!]}
              icon={L.divIcon({
                className: "",
                html: `<div style="
                  width:18px;
                  height:18px;
                  background:${color};
                  border-radius:50%;
                  border:3px solid ${outline};
                "></div>`,
                iconSize: [18, 18],
                iconAnchor: [9, 9],
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