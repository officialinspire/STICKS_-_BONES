/**
 * Analytics configuration for STICKS & BONES.
 *
 * DISABLED. No INSPIRE analytics contract was supplied for this game, so no
 * transport is configured and nothing is ever sent. Do not fill this in with
 * guessed values. To enable it, the owner must supply (docs/ANALYTICS.md):
 *   1. the analytics service and its client contract: endpoint or SDK, and the key / project / measurement id
 *      intended for THIS game;
 *   2. the INSPIRE consent behaviour to respect (API or signal, default state, regions);
 *   3. the deployed event names/fields to map to (or approval of the proposed names);
 *   4. the website → game launch-id / promotional-parameter contract, if any.
 * Then implement an `AnalyticsTransport`, set `enabled: true`, wire `consent`
 * to the real signal, and verify in the service's own test tooling.
 */
import type { AnalyticsConfig } from './analytics';

export const ANALYTICS_CONFIG: AnalyticsConfig = {
  enabled: false,
  transport: null,
  // No consent mechanism exists in this app or was supplied: treat as "not granted".
  consent: () => false,
};
