/** Shared cookie name — keep middleware + auth in sync (Edge-safe). */
export const SESSION_COOKIE = "ky_session";

/** 180 days — staff should stay signed in after invite accept. */
export const SESSION_MAX_AGE_SEC = 60 * 60 * 24 * 180;
