const ignored = [
  // Tests that need a physical device are left out on simulators
  ...(process.env.HARNESS_SIMULATOR === 'true'
    ? ['\\.device\\.harness\\.ts$']
    : []),
  // Each platform leaves out the providers that only run on the other one
  ...(process.env.HARNESS_PLATFORM === 'android'
    ? ['/harness/apple/', '/harness/core-ai/', '/harness/json-ui/apple\\.']
    : ['/harness/adk/']),
]

// The tests live in the harness folder at the monorepo root
export default {
  preset: 'react-native-harness',
  roots: ['<rootDir>/../../harness'],
  testMatch: ['**/*.harness.ts'],
  testPathIgnorePatterns: ignored,
  setupFiles: ['<rootDir>/../../harness/setup.ts'],
  // The test files are few, so a crawl is fast and does not depend on Watchman
  watchman: false,
}
