import { useCallback, useRef } from "react";
import { Client, type Room } from "colyseus.js";
import { isPlayerRole, type ClientInput, type JoinOptions, type PlayerSnapshot } from "@raid-simulator/shared";
import { useSimulatorStore } from "../stores/simulatorStore";
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

const SERVER_URL = process.env.NEXT_PUBLIC_GAME_SERVER_URL ?? "ws://localhost:2567";

export function useRaidRoom() {
  const roomRef = useRef<Room<RaidRoomStateLike> | null>(null);

  const syncPlayers = useCallback((state: RaidRoomStateLike) => {
    const nextPlayers: Record<string, PlayerSnapshot> = {};

    state.players?.forEach?.((value, key) => {
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
          lastSeq
        };
        ingestSnapshot(key, player.x, player.z, player.rotation, lastSeq);
      }
    });

    useSimulatorStore.getState().setPlayers(nextPlayers);
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

  const join = useCallback(
    async ({ name, role }: JoinOptions) => {
      const store = useSimulatorStore.getState();
      store.setConnectionStatus("connecting");
      store.setErrorMessage(null);

      try {
        await roomRef.current?.leave();
        resetNetcode();

        const client = new Client(SERVER_URL);
        const room = await client.joinOrCreate<RaidRoomStateLike>("raid_room", { name, role });
        roomRef.current = room;

        setSelfId(room.sessionId);
        store.setSessionId(room.sessionId);
        store.setSelf(name, role);
        store.setConnectionStatus("connected");

        syncPlayers(room.state);
        room.state.players?.onAdd?.((player, key) => {
          upsertPlayer(player, key);
          player.onChange?.(() => upsertPlayer(player, key));
        }, true);
        room.state.players?.onChange?.((player, key) => upsertPlayer(player, key));
        room.state.players?.onRemove?.((_player, key) => removePlayer(key));
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
      } catch (error) {
        roomRef.current = null;
        const message = error instanceof Error ? error.message : "서버에 연결할 수 없습니다.";
        const latest = useSimulatorStore.getState();
        latest.setConnectionStatus("error");
        latest.setErrorMessage(message);
        throw new Error(message);
      }
    },
    [syncPlayers]
  );

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

  return {
    join,
    leave,
    sendInput,
    isConnected: useSimulatorStore((state) => state.connectionStatus === "connected")
  };
}

function toPlayerSnapshot(player: PlayerSchemaLike): PlayerSnapshot | null {
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
      lastSeq: typeof player.lastSeq === "number" ? player.lastSeq : 0
    };
  }

  return null;
}
