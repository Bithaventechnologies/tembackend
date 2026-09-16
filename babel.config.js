// Only used by Jest to transform the small number of ESM-only node_modules
// files pulled in transitively by sanitize-html (see jest.config.js
// transformIgnorePatterns) — application/test TypeScript is compiled by
// ts-jest, not Babel.
module.exports = {
  presets: [["@babel/preset-env", { targets: { node: "current" } }]],
};
