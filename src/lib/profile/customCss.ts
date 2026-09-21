import "server-only";

/**
 * Server-only boundary for the custom-CSS sanitizer. App code imports from here
 * so the sanitizer (and postcss) never bundle into a client component. The pure
 * implementation lives in ./cssSanitize (imported by the escape-test suite).
 */

export { sanitizeCustomCss, CUSTOM_CSS_SCOPE, MAX_CUSTOM_CSS, type SanitizeResult } from "./cssSanitize";
