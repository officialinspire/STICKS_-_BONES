/**
 * Playwright is provided by the machine (global install on NODE_PATH), not by
 * this project, so its types are not available to tsc. scripts/e2e.ts is
 * exercised by actually running `npm run e2e`.
 */
declare module 'playwright' {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export type Page = any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export type BrowserContext = any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export const chromium: any;
}
