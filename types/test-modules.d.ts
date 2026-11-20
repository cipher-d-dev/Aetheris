// Test-only dependencies without bundled types.
declare module 'libsodium-wrappers';
declare module 'sql.js';

// Images bundled by Metro (a number at runtime; a URL string in the web preview).
declare module '*.png' {
  const value: any;
  export default value;
}
