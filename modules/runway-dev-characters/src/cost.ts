/**
 * Local credit estimate for `gwm1_avatars` realtime sessions.
 *
 * Source: https://docs.dev.runwayml.com/guides/pricing.md, read 2026-11-06:
 * "gwm1_avatars (real-time sessions): 2 credits upfront, then 2 credits per 6 seconds".
 * Status: SOURCE-BOUND. This is an ESTIMATE for local enforcement, not Runway's billing truth.
 * Whether partial 6-second blocks round up is UNVERIFIED; we round up (conservative).
 */
export const UPFRONT_CREDITS = 2;
export const CREDITS_PER_BLOCK = 2;
export const BLOCK_SECONDS = 6;

/** Upper-bound credits for a session of `seconds` length. */
export function estimateCredits(seconds: number): number {
  const s = Math.max(0, Math.ceil(seconds));
  return UPFRONT_CREDITS + Math.ceil(s / BLOCK_SECONDS) * CREDITS_PER_BLOCK;
}
