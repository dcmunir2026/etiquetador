// Vitest shim for the `server-only` package. The real package throws if
// imported from a client component (a Next.js bundler guard). For
// unit tests we just need a no-op module so the import resolves.
export {};
