const { ipcRenderer, remote } = require('electron');
const ElectronIpcBusRenderer = require('@kano/devices-sdk/bus-adapter/bus/electron-ipc-renderer');
const config = remote.getGlobal('config');

window.NativeBus = new ElectronIpcBusRenderer(ipcRenderer);

window.KitAppShellConfig = config;
