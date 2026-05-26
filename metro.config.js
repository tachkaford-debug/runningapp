const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Exclude native-only modules from web builds
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === 'web' && moduleName === 'react-native-maps') {
    // Return an empty module for web
    return {
      type: 'empty',
    };
  }
  
  // Use default resolver for everything else
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
