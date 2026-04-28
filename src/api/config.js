export const API_URL = process.env.REACT_APP_API_URL || "http://localhost:5001/api";
export const SERVER_URL = process.env.REACT_APP_SERVER_URL || "http://localhost:5001";
export const SOCKET_URL = process.env.REACT_APP_SOCKET_URL || "http://localhost:5001";

/**
 * Build a shareable profile URL.
 * Points to the BACKEND in production so LinkedIn / WhatsApp bots can fetch
 * the dynamic Open Graph preview HTML. The backend redirects browsers to the
 * React SPA route after the bot has scraped the OG tags.
 * In local dev (no public hostname), falls back to the current frontend origin.
 */
export const buildShareUrl = (rollNo) => {
  // In dev, SERVER_URL is localhost — LinkedIn bot can't fetch it anyway, so
  // use the frontend origin so copy-link is at least valid in-browser.
  const isLocalServer = /localhost|127\.0\.0\.1/.test(SERVER_URL);
  const base = isLocalServer ? window.location.origin : SERVER_URL;
  return `${base}/profile/share/${rollNo}`;
};
