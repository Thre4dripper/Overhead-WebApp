/// <reference types="vite/client" />
interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  readonly VITE_WS_URL?: string;
  readonly VITE_DEFAULT_LAT?: string;
  readonly VITE_DEFAULT_LON?: string;
  readonly VITE_TRANSPORT?: string;
  readonly VITE_POLL_INTERVAL_MS?: string;
}
