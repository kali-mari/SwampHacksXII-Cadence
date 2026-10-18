export function collectorBaseUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return null;

  try {
    const url = new URL(value.trim());
    if (url.protocol !== 'https:' || !url.hostname || url.username || url.password ||
        (url.pathname !== '/' && url.pathname !== '') || url.search || url.hash ||
        url.hostname === 'console.cloud.tigerdata.com') return null;
    return url.origin;
  } catch {
    return null;
  }
}
