import { useCallback, useRef } from "react";
import { Client, type Room } from "colyseus.js";
import { isPlayerRole, type ClientInput, type JoinOptions, type PlayerSnapshot } from "@raid-simulator/shared";
import { useSimulatorStore, type AoeView, type TowerView } from "../stores/simulatorStore";
import { dropPlayer, ingestSnapshot, resetNetcode, setSelfId } from "../netcode";

type RaidRoomStateLike = {
  players?: {
    forEach?: (callback: (value: unknown, key: string) => void) => void;
    onAdd?: (callback: (value: PlayerSchemaLike, key: string) => void, triggerAll?: boolean) => unknown;
    onChange?: (callback: (value: PlayerSchemaLike, key: string) => void) => unknown;
    onRemove?: (callback: (value: PlayerSchemaLike, key: string) => void) => unknown;
  };
};

type PlayerSchemaLike = Partial<PlayerSnapshot> & {
  onChange?: (callback: () => void) => unknown;
};

type GimmickAction = "practiceStart" | "stop" | "pause" | "resume";
type GimmickOptions = { stopOnFailure?: boolean };

const SERVER_URL = process.env.NEXT_PUBLIC_GAME_SERVER_URL ?? "ws://localhost:2567";

export function useRaidRoom() {
  const roomRef = useRef<Room<RaidRoomStateLike> | null>(null);

  const syncPlayers = useCallback((state: RaidRoomStateLike) => {
    const nextPlayers: Record<string, PlayerSnapshot> = {};

    state.players?.forEach?.((value, key) => {
      if (!isRecord(value)) {
        return;
      }
      const player = value as Partial<PlayerSnapshot>;
      if (
        typeof player.id === "string" &&
        typeof player.name === "string" &&
        isPlayerRole(player.role) &&
        typeof player.x === "number" &&
        typeof player.z === "number" &&
        typeof player.rotation === "number"
      ) {
        const lastSeq = typeof player.lastSeq === "number" ? player.lastSeq : 0;
        nextPlayers[key] = {
          id: player.id,
          name: player.name,
          role: player.role,
          x: player.x,
          z: player.z,
          rotation: player.rotation,
          lastSeq,
          marker: readMarker(player.marker),
          markerVisible: player.markerVisible === true,
          priorityMarker: readPriorityMarker(player.priorityMarker),
          dice: Number(player.dice) || 0
        };
        ingestSnapshot(key, player.x, player.z, player.rotation, lastSeq);
      }
    });

    useSimulatorStore.getState().setPlayers(nextPlayers);

    // 자기 캐릭터의 역할(시뮬 내 역할 변경 포함)을 store에 반영한다.
    const store = useSimulatorStore.getState();
    const selfSnap = store.sessionId ? nextPlayers[store.sessionId] : undefined;
    if (selfSnap && store.selfRole !== selfSnap.role) {
      store.setSelf(store.selfName, selfSnap.role);
    }
  }, []);

  const upsertPlayer = useCallback((player: PlayerSchemaLike, key: string) => {
    const snapshot = toPlayerSnapshot(player);
    if (!snapshot) {
      return;
    }

    ingestSnapshot(key, snapshot.x, snapshot.z, snapshot.rotation, snapshot.lastSeq);

    const currentPlayers = useSimulatorStore.getState().players;
    useSimulatorStore.getState().setPlayers({
      ...currentPlayers,
      [key]: snapshot
    });
  }, []);

  const removePlayer = useCallback((key: string) => {
    dropPlayer(key);
    const currentPlayers = useSimulatorStore.getState().players;
    const nextPlayers = { ...currentPlayers };
    delete nextPlayers[key];
    useSimulatorStore.getState().setPlayers(nextPlayers);
  }, []);

  const wireRoom = useCallback(
    (room: Room<RaidRoomStateLike>, role: JoinOptions["role"]) => {
      roomRef.current = room;
      setSelfId(room.sessionId);
      const store = useSimulatorStore.getState();
      store.setSessionId(room.sessionId);
      store.setRoomId(room.roomId);
      store.setSelf("", role);
      store.setConnectionStatus("connected");

      syncPlayers(room.state);
      room.state.players?.onAdd?.((player, key) => {
        if (!isRecord(player)) {
          return;
        }
        upsertPlayer(player, key);
        player.onChange?.(() => upsertPlayer(player, key));
      }, true);
      room.state.players?.onChange?.((player, key) => upsertPlayer(player, key));
      room.state.players?.onRemove?.((_player, key) => removePlayer(key));

      // 기믹 상태(보스/탑/공격범위/로그)는 패치마다 통째로 스냅샷해 store에 반영.
      syncGimmick(room.state);
      room.onStateChange((state) => {
        syncPlayers(state);
        syncGimmick(state);
      });

      room.onLeave(() => {
        const latest = useSimulatorStore.getState();
        if (latest.connectionStatus === "connected") {
          resetNetcode();
          latest.reset();
        }
      });
      room.onError((_code, message) => {
        const latest = useSimulatorStore.getState();
        latest.setConnectionStatus("error");
        latest.setErrorMessage(message || "서버 오류가 발생했습니다.");
      });
    },
    [syncPlayers, upsertPlayer, removePlayer]
  );

  const connect = useCallback(
    async (role: JoinOptions["role"], open: (client: Client) => Promise<Room<RaidRoomStateLike>>) => {
      const store = useSimulatorStore.getState();
      store.setConnectionStatus("connecting");
      store.setErrorMessage(null);
      try {
        await roomRef.current?.leave();
        resetNetcode();
        const client = new Client(SERVER_URL);
        const room = await open(client);
        wireRoom(room, role);
      } catch (error) {
        roomRef.current = null;
        const message = error instanceof Error ? error.message : "서버에 연결할 수 없습니다.";
        const latest = useSimulatorStore.getState();
        latest.setConnectionStatus("error");
        latest.setErrorMessage(message);
        throw new Error(message);
      }
    },
    [wireRoom]
  );

  const createRoom = useCallback(
    (role: JoinOptions["role"]) => connect(role, (client) => client.create<RaidRoomStateLike>("raid_room", { role })),
    [connect]
  );

  const joinRoom = useCallback(
    (code: string, role: JoinOptions["role"]) =>
      connect(role, (client) => client.joinById<RaidRoomStateLike>(code.trim(), { role })),
    [connect]
  );

  const setRole = useCallback((role: JoinOptions["role"]) => {
    roomRef.current?.send("setRole", { role });
  }, []);

  const leave = useCallback(async () => {
    const room = roomRef.current;
    roomRef.current = null;
    await room?.leave();
    resetNetcode();
    useSimulatorStore.getState().reset();
  }, []);

  const sendInput = useCallback((input: ClientInput) => {
    roomRef.current?.send("input", input);
  }, []);

  const sendGimmick = useCallback((action: GimmickAction, gimmick = "missing", options: GimmickOptions = {}) => {
    roomRef.current?.send("gimmick", { action, gimmick, ...options });
  }, []);

  return {
    createRoom,
    joinRoom,
    setRole,
    leave,
    sendInput,
    sendGimmick,
    isConnected: useSimulatorStore((state) => state.connectionStatus === "connected")
  };
}

// 기믹 상태를 store가 쓰기 좋은 평범한 객체로 변환한다.
function syncGimmick(state: unknown) {
  const s = state as Record<string, unknown>;

  const towers: TowerView[] = [];
  const towerMap = s.towers as { forEach?: (cb: (value: Record<string, unknown>, key: string) => void) => void } | undefined;
  towerMap?.forEach?.((tower, key) => {
    towers.push({
      id: typeof tower.id === "string" ? tower.id : key,
      x: Number(tower.x) || 0,
      z: Number(tower.z) || 0,
      round: Number(tower.round) || 0
    });
  });

  const aoes: AoeView[] = [];
  const aoeArr = s.aoes as { forEach?: (cb: (value: Record<string, unknown>) => void) => void } | undefined;
  aoeArr?.forEach?.((aoe) => {
    aoes.push({
      id: typeof aoe.id === "string" ? aoe.id : "",
      kind: typeof aoe.kind === "string" ? aoe.kind : "",
      x: Number(aoe.x) || 0,
      z: Number(aoe.z) || 0,
      radius: Number(aoe.radius) || 0,
      dir: Number(aoe.dir) || 0,
      angle: Number(aoe.angle) || 0,
      range: Number(aoe.range) || 0,
      length: Number(aoe.length) || 0,
      width: Number(aoe.width) || 0,
      danger: aoe.danger === true
    });
  });

  const logs: string[] = [];
  const logArr = s.logs as { forEach?: (cb: (value: string) => void) => void } | undefined;
  logArr?.forEach?.((entry) => {
    if (typeof entry === "string") logs.push(entry);
  });

  useSimulatorStore.getState().setGimmick({
    gimmick: typeof s.gimmick === "string" ? s.gimmick : "",
    phase: typeof s.gimmickPhase === "string" ? s.gimmickPhase : "idle",
    round: Number(s.round) || 0,
    elapsed: Number(s.elapsed) || 0,
    paused: s.paused === true,
    controlsLocked: s.controlsLocked === true,
    roomRemainingSec: Number(s.roomRemainingSec) || 0,
    bossActive: s.bossActive === true,
    bossCast: typeof s.bossCast === "string" ? s.bossCast : "",
    bossX: Number(s.bossX) || 0,
    bossZ: Number(s.bossZ) || 0,
    bossRadius: Number(s.bossRadius) || 0,
    towers,
    aoes,
    logs
  });
}

function toPlayerSnapshot(player: unknown): PlayerSnapshot | null {
  if (!isRecord(player)) {
    return null;
  }
  if (
    typeof player.id === "string" &&
    typeof player.name === "string" &&
    isPlayerRole(player.role) &&
    typeof player.x === "number" &&
    typeof player.z === "number" &&
    typeof player.rotation === "number"
  ) {
    return {
      id: player.id,
      name: player.name,
      role: player.role,
      x: player.x,
      z: player.z,
      rotation: player.rotation,
      lastSeq: typeof player.lastSeq === "number" ? player.lastSeq : 0,
      marker: readMarker(player.marker),
      markerVisible: player.markerVisible === true,
      priorityMarker: readPriorityMarker(player.priorityMarker),
      dice: Number(player.dice) || 0
    };
  }

  return null;
}

function readMarker(value: unknown): PlayerSnapshot["marker"] {
  return value === "share" || value === "spread" || value === "cone" ? value : "";
}

function readPriorityMarker(value: unknown): PlayerSnapshot["priorityMarker"] {
  return value === "number1" || value === "number2" || value === "forbid1" || value === "forbid2" ? value : "";
}

function isRecord(value: unknown): value is Record<string, unknown> & PlayerSchemaLike {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
