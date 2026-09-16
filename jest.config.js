/** @type {import('jest').Config} */
module.exports = {
  moduleFileExtensions: ["js", "json", "ts"],
  rootDir: ".",
  testRegex: ".*\\.spec\\.ts$",
  transform: {
    "^.+\\.ts$": ["ts-jest", { tsconfig: "tsconfig.json" }],
    "^.+\\.js$": "babel-jest",
  },
  // sanitize-html's dependency chain (htmlparser2 etc.) ships as ESM-only in
  // recent versions; Jest's default "ignore all of node_modules" needs an
  // exception so those files get transformed to CommonJS instead of failing
  // on a bare `import` statement.
  transformIgnorePatterns: [
    "node_modules/\\.pnpm/(?!(htmlparser2|domhandler|domutils|domelementtype|entities|dom-serializer)@)",
  ],
  moduleNameMapper: {
    "^@email-platform/types$": "<rootDir>/../../packages/types/src/index.ts",
    "^@email-platform/email$": "<rootDir>/../../packages/email/src/index.ts",
  },
  collectCoverageFrom: ["src/**/*.(t|j)s"],
  testEnvironment: "node",
  setupFiles: ["<rootDir>/test/jest.setup.ts"],
};
