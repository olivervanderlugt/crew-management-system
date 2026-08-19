import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    // Run the suite in the timezone the users are actually in, not the one the
    // CI runner happens to have. Every date bug found so far only appears when
    // local time and UTC disagree about which day it is; under TZ=UTC the
    // tests cannot tell the difference.
    env: { TZ: "Europe/Amsterdam" },
  },
});
