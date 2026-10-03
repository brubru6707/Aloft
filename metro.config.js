// Learn more https://docs.expo.dev/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// three.js: Metro would pick the CommonJS build ("require" export condition), which calls
// process.emitWarning at load time (missing in React Native) and is deprecated upstream.
// Resolve the bare "three" import to the ES module build instead.
const threeModule = path.resolve(__dirname, 'node_modules/three/build/three.module.js');
const defaultResolver = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === 'three') return { type: 'sourceFile', filePath: threeModule };
  return defaultResolver
    ? defaultResolver(context, moduleName, platform)
    : context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
