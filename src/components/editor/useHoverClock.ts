"use client";

import * as React from "react";

/**
 * Jam yang berjalan selama kursor di atas sebuah ubin, supaya peragaan efek,
 * transisi, atau animasi terlihat bergerak. `time` = detik sejak disorot; 0 = diam.
 */
export function useHoverClock(): { time: number; start: () => void; stop: () => void } {
  const [time, setTime] = React.useState(0);
  const raf = React.useRef(0);
  const stop = React.useCallback(() => {
    cancelAnimationFrame(raf.current);
    setTime(0);
  }, []);
  const start = React.useCallback(() => {
    const begin = performance.now();
    const tick = (now: number) => {
      // Selalu sedikit di atas 0 supaya "sedang disorot" bisa dibedakan dari diam.
      setTime(Math.max(0.001, (now - begin) / 1000));
      raf.current = requestAnimationFrame(tick);
    };
    cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(tick);
  }, []);
  React.useEffect(() => () => cancelAnimationFrame(raf.current), []);
  return { time, start, stop };
}
