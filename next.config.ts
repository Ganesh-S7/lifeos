import type { NextConfig } from "next";

export default function nextConfig(phase: string): NextConfig {
  // Runtime-only phase context, inherited by build workers. Never add this to
  // Next's `env` option: that would inline a build exception into deployed code.
  // Every next dev/start config load replaces it with the current server phase.
  process.env.LIFEOS_NEXT_PHASE = phase;

  return {
    reactCompiler: true,
  };
}
