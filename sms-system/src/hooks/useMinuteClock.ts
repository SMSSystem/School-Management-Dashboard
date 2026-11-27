import { useEffect, useState } from "react";

/** The current time, moved on every minute: for "next class" and "on now", which change as lessons start and end. */
export function useMinuteClock(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);
  return now;
}
