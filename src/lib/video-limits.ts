export const DEFAULT_VIDEO_LIMIT_MB = 500;
export const BYTES_PER_MB = 1_000_000;
export const MAX_CONFIGURABLE_MB = Math.floor(
  Number.MAX_SAFE_INTEGER / BYTES_PER_MB,
);

export function videoSizeLimitBytes(limitMb: number | null) {
  return limitMb === null ? Number.POSITIVE_INFINITY : limitMb * BYTES_PER_MB;
}
