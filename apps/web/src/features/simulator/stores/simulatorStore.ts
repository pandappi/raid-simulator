import { create } from "zustand";
import type { PlayerRole, PlayerSnapshot } from "@raid-simulator/shared";

type ConnectionStatus = "idle" | "connecting" | "connected" | "error" | "disconnected";

export type TowerView = { id: string; x: number; z: number; round: number };
export type AoeView = {
  id: string;
  kind: string;
  x: number;
  z: number;
  radius: number;
  dir: number;
  angle: number;
  range: number;
  // 직선(rect) 길이·폭, 위험(빨강) 표시 (보스 공격 텔레그래프용, 선택).
  length?: number;
  width?: number;
  danger?: boolean;
};
export type GimmickView = {
  gimmick: string;
  phase: string;
  round: number;
  elapsed: number;
  paused: boolean;
  controlsLocked: boolean;
  roomRemainingSec: number;
  bossActive: boolean;
  bossCast: string;
  // 보스 위치/크기(기본 중앙·BOSS_RADIUS). 주사위 기믹은 웨이마크 위로 이동.
  bossX?: number;
  bossZ?: number;
  bossRadius?: number;
  towers: TowerView[];
  aoes: AoeView[];
  logs: string[];
};

const initialGimmick: GimmickView = {
  gimmick: "",
  phase: "idle",
  round: 0,
  elapsed: 0,
  paused: false,
  controlsLocked: false,
  roomRemainingSec: 0,
  bossActive: false,
  bossCast: "",
  towers: [],
  aoes: [],
  logs: []
};

type SimulatorState = {
  sessionId: string | null;
  roomId: string | null;
  players: Record<string, PlayerSnapshot>;
  selfRole: PlayerRole | null;
  selfName: string;
  cameraYaw: number;
  connectionStatus: ConnectionStatus;
  errorMessage: string | null;
  gimmick: GimmickView;
};

type SimulatorActions = {
  setSessionId: (sessionId: string | null) => void;
  setRoomId: (roomId: string | null) => void;
  setPlayers: (players: Record<string, PlayerSnapshot>) => void;
  setSelf: (name: string, role: PlayerRole | null) => void;
  setCameraYaw: (cameraYaw: number) => void;
  setConnectionStatus: (status: ConnectionStatus) => void;
  setErrorMessage: (message: string | null) => void;
  setGimmick: (gimmick: GimmickView) => void;
  reset: () => void;
};

const initialState: SimulatorState = {
  sessionId: null,
  roomId: null,
  players: {},
  selfRole: null,
  selfName: "",
  cameraYaw: Math.PI,
  connectionStatus: "idle",
  errorMessage: null,
  gimmick: initialGimmick
};

export const useSimulatorStore = create<SimulatorState & SimulatorActions>((set) => ({
  ...initialState,
  setSessionId: (sessionId) => set({ sessionId }),
  setRoomId: (roomId) => set({ roomId }),
  setPlayers: (players) => set({ players }),
  setSelf: (selfName, selfRole) => set({ selfName, selfRole }),
  setCameraYaw: (cameraYaw) => set({ cameraYaw }),
  setConnectionStatus: (connectionStatus) => set({ connectionStatus }),
  setErrorMessage: (errorMessage) => set({ errorMessage }),
  setGimmick: (gimmick) => set({ gimmick }),
  reset: () => set({ ...initialState, connectionStatus: "disconnected" })
}));
