/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testTimeout: 20 * 1000,
  testMatch: [
    "**/tests/**/*.spec.ts",
  ],
};
