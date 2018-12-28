const path = require('path');
const util = require('@kano/kit-app-shell-cordova/lib/util');

// Load plugins and platforms from the local dependencies.
// This avoid using cordova-fetch and having to download deps on every build
const platforms = [util.getModulePath('cordova-ios')];
const plugins = [
    util.getModulePath('cordova-plugin-add-swift-support'),
    util.getModulePath('cordova-plugin-blob-constructor-polyfill'),
    util.getModulePath('cordova-plugin-ios-ble-permissions'),
    util.getModulePath('cordova-plugin-protocol'),
    path.join(__dirname, 'plugin'),
];

const hooks = {
    before_prepare: [
        require.resolve('./hooks/config'),
        require.resolve('./hooks/generate-icons'),
        require.resolve('./hooks/generate-screens'),
    ],
};

module.exports = {
    platforms,
    plugins,
    hooks,
};
