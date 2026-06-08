import { useEffect, useRef } from "react";
import { SERVER_TICK_MS, type ClientInput } from "@raid-simulator/shared";
import { useSimulatorStore } from "../stores/simulatorStore";

type UseKeyboardInputParams = {
  enabled: boolean;
  sendInput: (input: ClientInput) => void;
};

type MovementKey = "up" | "down" | "left" | "right";

const KEY_MAP: Record<string, MovementKey> = {
  w: "up",
  ㅈ: "up",
  arrowup: "up",
  s: "down",
  ㄴ: "down",
  arrowdown: "down",
  a: "left",
  ㅁ: "left",
  arrowleft: "left",
  d: "right",
  ㅇ: "right",
  arrowright: "right"
};

const CODE_MAP: Record<string, MovementKey> = {
  KeyW: "up",
  ArrowUp: "up",
  KeyS: "down",
  ArrowDown: "down",
  KeyA: "left",
  ArrowLeft: "left",
  KeyD: "right",
  ArrowRight: "right"
};

export function useKeyboardInput({ enabled, sendInput }: UseKeyboardInputParams) {
  const inputRef = useRef<ClientInput>({
    up: false,
    down: false,
    left: false,
    right: false
  });

  useEffect(() => {
    if (!enabled) {
      return;
    }

    function handleKey(event: KeyboardEvent, value: boolean) {
      if (isTextEntryElement(document.activeElement)) {
        return;
      }

      const key = KEY_MAP[event.key.toLowerCase()] ?? CODE_MAP[event.code];
      if (!key) {
        return;
      }

      event.preventDefault();
      inputRef.current = {
        ...inputRef.current,
        [key]: value
      };
    }

    const handleKeyDown = (event: KeyboardEvent) => handleKey(event, true);
    const handleKeyUp = (event: KeyboardEvent) => handleKey(event, false);
    const interval = window.setInterval(() => {
      sendInput({
        ...inputRef.current,
        cameraYaw: useSimulatorStore.getState().cameraYaw
      });
    }, SERVER_TICK_MS);

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      inputRef.current = { up: false, down: false, left: false, right: false };
      sendInput(inputRef.current);
    };
  }, [enabled, sendInput]);
}

function isTextEntryElement(element: Element | null): boolean {
  if (!element) {
    return false;
  }

  const tagName = element.tagName.toLowerCase();
  return tagName === "input" || tagName === "textarea" || tagName === "select";
}
