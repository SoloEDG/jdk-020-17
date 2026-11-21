import { useEffect, useState } from "react";
import type { Shift } from "../shared/types";
import { advanceClock, createShift } from "../features/session";
import { advanceFleet } from "../features/fleet";
import { advanceServices } from "../features/services";

/**
 * Advance the simulation in fixed sub-steps.  The settlement attributes every
 * sub-second window to the state that was observable in it, so a coarse frame
 * or a 4× speed setting cannot blur "service finished" and "player idle" into
 * one cause or count a window twice.
 */
const MAX_STEP = 0.25;

export function stepSimulation(state: Shift, dt: number): Shift {
  let s = state;
  let remaining = Math.max(0, dt);
  while (remaining > 0 && !s.paused) {
    const step = Math.min(remaining, MAX_STEP);
    s = advanceServices(advanceFleet(advanceClock(s, step), step), step);
    remaining -= step;
  }
  return s;
}

export function useSimulation() {
  const [state, setState] = useState<Shift>(createShift);
  useEffect(() => {
    let previous = performance.now();
    const id = setInterval(() => {
      const now = performance.now(),
        elapsed = Math.min((now - previous) / 1000, 1);
      previous = now;
      setState((s) => {
        if (s.paused) return s;
        return stepSimulation(s, elapsed * s.speed);
      });
    }, 100);
    return () => clearInterval(id);
  }, []);
  return [state, setState] as const;
}
