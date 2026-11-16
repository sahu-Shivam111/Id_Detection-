import axios from "axios";
import { io } from "socket.io-client";

const BASE = import.meta.env.VITE_API_URL || "http://localhost:5000";

export const api = axios.create({ baseURL: `${BASE}/api` });
export const socket = io(BASE);

export const joinInspection = (id) =>
  new Promise((resolve) => socket.emit("join-inspection", id, resolve));

export const formatTime = (s) => {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
};