import { useEffect, useState } from 'react';

const secondsLeft = (deadline, offset) =>
  deadline ? Math.max(0, Math.ceil((deadline - (Date.now() + offset)) / 1000)) : 0;

export function useSecondsLeft(deadline, offset) {
  const [left, setLeft] = useState(() => secondsLeft(deadline, offset));
  useEffect(() => {
    setLeft(secondsLeft(deadline, offset));
    const t = setInterval(() => setLeft(secondsLeft(deadline, offset)), 250);
    return () => clearInterval(t);
  }, [deadline, offset]);
  return left;
}
