import { create } from "zustand";
import type { PlayerRole, PlayerSnapshot } from "@raid-simulator/shared";

type ConnectionStatus = "idle" | "connecting" | "connected" | "error" | "disconnected";

type SimulatorState = {
  sessionId: string | null;
  players: Record<string, PlayerSnapshot>;
  selfRole: PlayerRole | null;
  selfName: string;
  cameraYaw: number;
  connectionStatus: ConnectionStatus;
  errorMessage: string | null;
};

type SimulatorActions = {
  setSessionId: (sessionId: string | null) => void;
  setPlayers: (players: Record<string, PlayerSnapshot>) => void;
  setSelf: (name: string, role: PlayerRole | null) => void;
  setCameraYaw: (cameraYaw: number) => void;
  setConnectionStatus: (status: ConnectionStatus) => void;
  setErrorMessage: (message: string | null) => void;
  reset: () => void;
};

const initialState: SimulatorState = {
  sessionId: null,
  players: {},
  selfRole: null,
  selfName: "",
  cameraYaw: Math.PI,
  connectionStatus: "idle",
  errorMessage: null
};

export const useSimulatorStore = create<SimulatorState & SimulatorActions>((set) => ({
  ...initialState,
  setSessionId: (sessionId) => set({ sessionId }),
  setPlayers: (players) => set({ players }),
  setSelf: (selfName, selfRole) => set({ selfName, selfRole }),
  setCameraYaw: (cameraYaw) => set({ cameraYaw }),
  setConnectionStatus: (connectionStatus) => set({ connectionStatus }),
  setErrorMessage: (errorMessage) => set({ errorMessage }),
  reset: () => set({ ...initialState, connectionStatus: "disconnected" })
}));
