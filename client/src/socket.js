import { io } from "socket.io-client";

// In dev (vite on :5173, server on :4000) set VITE_API_URL=http://localhost:4000 in a .env file.
// In production, the server serves the built frontend itself, so leaving this empty means
// "same origin" — no separate URL to configure.
const API_URL = import.meta.env.VITE_API_URL || "";

let socket = null;

export function connectSocket(token) {
  if (socket) socket.disconnect();
  socket = io(API_URL || undefined, {
    auth: { token },
  });
  return socket;
}

export function getSocket() {
  return socket;
}

export { API_URL };
