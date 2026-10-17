/** Human-readable elapsed duration for live order timers and recorded stages. */
export function formatOrderDuration(start: string | Date | number, end: string | Date | number = new Date()): string {
  const elapsedSeconds = Math.max(0, Math.floor((new Date(end).getTime() - new Date(start).getTime()) / 1000));
  const hours = Math.floor(elapsedSeconds / 3600);
  const minutes = Math.floor((elapsedSeconds % 3600) / 60);
  const seconds = elapsedSeconds % 60;
  return hours > 0 ? `${hours}h ${minutes}m ${seconds}s` : `${minutes}m ${seconds}s`;
}
