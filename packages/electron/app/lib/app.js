const { moveToApplicationsFolderIfNecessary, shouldMoveToApplicationsFolder } = require('./util/macos');
const { app, ipcMain } = require('electron');
const { Shell } = require('@kano/desktop-shell');
const updaterBusAdapter = require('./bus/updater');
const authBusAdapter = require('./bus/auth');
const iabBusAdapter = require('./bus/iab');
const path = require('path');

const DEFAULT_CONTENT_SCHEME = 'kit-app';

const Devices = require('@kano/devices-sdk-node');
const { DevicesServer } = require('@kano/web-bus/cjs/servers/index');
const { ElectronIpcMainBus } = require('@kano/web-bus/cjs');

const postProcessFactory = require('./post-process');
const getPlatformData = require('./platform');

const DEFAULTS = {
    APP_NAME: 'Kano Desktop Application',
};

const DEFAULT_BACKGROUND_COLOR = '#ffffff';

class App {
    static getIcon(config) {
        if (process.platform !== 'darwin' || !config.ICONS || !config.ICONS.WINDOWS) {
            return null;
        }
        return path.join(appDir, this.config.ICONS.WINDOWS);
    }
    constructor(appDir, config, root, args) {
        this.config = Object.assign({}, DEFAULTS, require(config));

        if (args.profile) {
            this.config.PROFILE = args.profile;
        }

        const scheme = this.config.CONTENT_SCHEME || DEFAULT_CONTENT_SCHEME;

        this.config.APP_SRC = `${scheme}://app/index.js`;
        this.config.UI_ROOT = `${scheme}://app/`;

        Object.assign(this.config, getPlatformData());

        const postProcess = this.config.BUNDLED ? null : postProcessFactory(appDir);

        const icon = App.getIcon(config);

        this.shell = new Shell({
            name: this.config.APP_NAME,
            version: this.config.UI_VERSION,
            root,
            scheme,
            width: 1440,
            height: 900,
            preload: path.join(root, 'preload.js'),
            devMode: this.config.ENV === 'development',
            uwpTitlebar: false,
            menuTransform(menu) {
                return menu;
            },
            server: {
                postProcess,
                authorities: {
                    // An authority of 'app' will resolve to the appDir
                    app: appDir,
                },
            },
            log: {
                level: 'warn',
                file: {
                    level: 'warn',
                    period: '1d',
                    count: 7,
                },
                devMode: {
                    level: 'trace',
                    file: {
                        level: 'trace',
                    },
                },
            },
            windowOptions: {
                icon,
                show: false,
                autoHideMenuBar: true,
                backgroundColor: this.config.BACKGROUND_COLOR || DEFAULT_BACKGROUND_COLOR,
            }
        });

        app.on('before-quit', this._onBeforeQuit.bind(this));

        app.on('ready', this._onReady.bind(this));

        this.shell.on('window-created', this._onWindowCreated.bind(this));

        // Allows preload script to have access to the config
        global.config = this.config;
        // Send the preload script the app's arguments
        global.args = args;
    }
    _onReady() {
        this.shell.createWindow();
    }
    _onBeforeQuit() {
        if (this.adapter) {
            this.adapter.dispose();
        }
        Devices.terminate();
    }
    _onWindowCreated() {
        // Disable updater if the app should be moved to the applications folder
        if (shouldMoveToApplicationsFolder(this.config.FORCE_MOVE_TO_APPLICATIONS_PROMPT)) {
            this.config.UPDATER_DISABLED = true;
        }
        if (!this.bus) {
            // First window created, setup the bus and adapters
            this.bus = new ElectronIpcMainBus(ipcMain, this.shell.window);
            this.adapter = new DevicesServer(this.bus, Devices);
            // Allow the updater to be disabled from the config
            if (!this.config.UPDATER_DISABLED) {
                // Binds the updater events with the updater module
                updaterBusAdapter(this.bus, this.shell.log);
            }
            authBusAdapter(this.bus, this.shell.window);
            iabBusAdapter(this.bus, this.shell.window);
            Devices.setLogger(this.shell.log);
        } else {
            // Subsequent windows, just update the window reference in the bus
            this.bus.setWindow(shell.window);
        }
        moveToApplicationsFolderIfNecessary(this.shell.window, this.config.FORCE_MOVE_TO_APPLICATIONS_PROMPT);
    }
}

module.exports = App;
