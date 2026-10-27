// The tests live in the harness folder at the monorepo root
export default {
  preset: 'react-native-harness',
  roots: ['<rootDir>/../../harness'],
  testMatch: ['**/*.harness.ts'],
  // Tests that need a physical device are left out on simulators
  testPathIgnorePatterns:
    process.env.HARNESS_SIMULATOR === 'true'
      ? ['\\.device\\.harness\\.ts$']
      : [],
  setupFiles: ['<rootDir>/../../harness/setup.ts'],
  // The test files are few, so a crawl is fast and does not depend on Watchman
  watchman: false,
}
