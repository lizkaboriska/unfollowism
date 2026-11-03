export function usernameKey(value: unknown): string {
  const text = typeof value === 'string' ? value : typeof value === 'number' ? String(value) : '';
  return text.trim().toLowerCase();
}

export function profileUrl(username: string): string {
  return `https://www.instagram.com/${username}`;
}
