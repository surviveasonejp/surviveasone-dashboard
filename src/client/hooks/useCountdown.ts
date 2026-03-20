import { useState, useEffect, useRef } from "react";
import { type AlertLevel, getAlertLevel } from "../lib/calculations";

interface CountdownState {
  remainingSeconds: number;
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  alertLevel: AlertLevel;
}

export function useCountdown(totalSeconds: number): CountdownState {
  const startTime = useRef(Date.now());
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    startTime.current = Date.now();
    setElapsed(0);

    const interval = setInterval(() => {
      const now = Date.now();
      setElapsed((now - startTime.current) / 1000);
    }, 1000);

    return () => clearInterval(interval);
  }, [totalSeconds]);

  const remaining = Math.max(0, totalSeconds - elapsed);
  const days = Math.floor(remaining / 86400);
  const hours = Math.floor((remaining % 86400) / 3600);
  const minutes = Math.floor((remaining % 3600) / 60);
  const seconds = Math.floor(remaining % 60);
  const alertLevel = getAlertLevel(remaining / 86400);

  return { remainingSeconds: remaining, days, hours, minutes, seconds, alertLevel };
}
