import { defineConfig } from "vitest/config";

// vitest 4's worker pools intermittently fail to load their own runner on this
// Windows + CommonJS setup ("Vitest failed to find the runner"), cascading whole
// files to false failures. Running every test file in a single long-lived forked
// child (no parallel worker pool) is deterministic here. `fileParallelism: false`
// forces maxWorkers to 1, so all files share one fork — this is the Vitest 4
// replacement for the old `poolOptions.forks.singleFork`, which was removed in v4.
// The server suite is ~1s of real test time, so serializing it costs nothing.
export default defineConfig({
  test: {
    pool: "forks",
    fileParallelism: false,
  },
});
