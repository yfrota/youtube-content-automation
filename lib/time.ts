// Relative-time formatting in pt-BR ("há 2 horas", "ontem", "agora mesmo").
// Compute on the client (after mount) to avoid SSR/client hydration drift,
// since the output depends on the current time.

export function relativeTime(iso: string, now: Date = new Date()): string {
  const then = new Date(iso);
  const diffMs = now.getTime() - then.getTime();
  const seconds = Math.round(diffMs / 1000);
  const minutes = Math.round(seconds / 60);
  const hours = Math.round(minutes / 60);
  const days = Math.round(hours / 24);

  if (seconds < 45) return "agora mesmo";
  if (minutes < 2) return "há 1 minuto";
  if (minutes < 60) return `há ${minutes} minutos`;
  if (hours < 2) return "há 1 hora";
  if (hours < 24) return `há ${hours} horas`;
  if (days < 2) return "ontem";
  if (days < 7) return `há ${days} dias`;

  const weeks = Math.round(days / 7);
  if (weeks < 5) return weeks < 2 ? "há 1 semana" : `há ${weeks} semanas`;

  const months = Math.round(days / 30);
  if (months < 12) return months < 2 ? "há 1 mês" : `há ${months} meses`;

  const years = Math.round(days / 365);
  return years < 2 ? "há 1 ano" : `há ${years} anos`;
}
