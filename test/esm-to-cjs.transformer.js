// Jest runs CommonJS; this rewrites ESM-only node_modules (Scalar's renderer) so specs can require them.
const ts = require('typescript');

module.exports = {
  process(sourceText, sourcePath) {
    const { outputText } = ts.transpileModule(sourceText, {
      fileName: sourcePath,
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, allowJs: true },
    });
    return { code: outputText };
  },
};
