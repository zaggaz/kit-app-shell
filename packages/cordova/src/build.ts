import { util } from '@kano/kit-app-shell-core/lib/util';
import { IBuild } from '@kano/kit-app-shell-core/lib/types';
import { processState } from '@kano/kit-app-shell-core/lib/process-state';
import { Bundler } from '@kano/kit-app-shell-core/lib/bundler';
import * as path from 'path';
import { cordova } from 'cordova-lib';
import { promisify } from 'util';
import * as rimrafCb from 'rimraf';
import { ICordovaBuildOptions } from './types';
import { getProject } from './project';
const rimraf = promisify(rimrafCb);

const DEFAULT_BACKGROUND_COLOR = '#ffffff';

const build : IBuild = (opts : ICordovaBuildOptions) => {
    // Enhance the Cordova preferences with the background color config
    opts.preferences.BackgroundColor = opts.preferences.BackgroundColor
        || opts.config.BACKGROUND_COLOR
        || DEFAULT_BACKGROUND_COLOR;
    // Catch cordova logs and displays them
    // TODO: Catch all logs (error, warn, ...)
    // TODO: Find a console UI to display these logs and any subprocess logs
    // in parrallel of the spinner
    cordova.on('log', () => {
        // console.log(...args);
    });
    cordova.on('error', (e) => {
        processState.setFailure(e);
    });
    cordova.on('warn', (w) => {
        processState.setWarning(w);
    });

    // Get a corodva project ready to build
    return getProject({
        ...opts,
        skipCache: opts['no-cache'],
    })
        .then((projectPath) => Promise.all((opts.clean || []).map((p) => rimraf(p)))
            .then(() => {
                const wwwPath = path.join(projectPath, 'www');
                // TODO move this to core and make it an optional plugin
                const wcPath = require.resolve('@webcomponents/webcomponentsjs/webcomponents-bundle.js');
                const wcFilename = 'webcomponents-bundle.js';
                const wcDest = path.join(wwwPath, wcFilename);
                let wcScriptData = '';
                // Copy webcomponents bundle
                return util.fs.readFile(wcPath)
                    .then((wcFileData) => {
                        const fileString = wcFileData.toString();

                        // iOS specific bug fix to support the ionic:// protocol within the webcomponents bundle
                        if (opts.platform === 'ios') {
                            const regex = /l\.wss=443;/g;
                            wcScriptData = fileString.replace(regex, 'l.wss=443;l.ionic=443;');
                        } else {
                            wcScriptData = fileString;
                        }
                        return util.fs.writeFile(wcDest, wcScriptData);
                    })
                    .then(() =>
                    // Bundle the cordova shell and provided app into the www directory
                        Bundler.bundle(
                            path.join(__dirname, '/../www/index.html'),
                            path.join(__dirname, '/../www/index.js'),
                            path.join(opts.app, 'index.js'),
                            opts.config,
                            {
                                appJs: {
                                    ...opts,
                                },
                                js: {
                                    bundleOnly: opts.bundleOnly,
                                    targets: opts.targets,
                                    replaces: [{
                                        // Avoid jsZip to detect the define from requirejs
                                        // TODO: Scope this to the jszip file
                                        values: {
                                            'typeof define': 'undefined',
                                        },
                                    }],
                                },
                                html: {
                                    replacements: {
                                        injectScript: `<script src="/${wcFilename}"></script>`,
                                    },
                                },
                            },
                        ))
                    .then((bundle) => Bundler.write(bundle, wwwPath))
                    .then(() => projectPath);
            }))
        .then((projectPath) => {
            if (opts.skipCordovaBuild) {
                return projectPath;
            }
            // A platform path can be provided to use as a local module,
            // this resolves the name of a potential path
            // to its package name. We then strip the 'cordova-' prefix to extract the platform id
            // This is hacky and could in the future become unreliable.
            // TODO: Maybe we should pass the platforms as ids and resolve their local packages if
            // already installed
            const platformIds = opts.platforms.map((platform) => path.basename(platform).replace('cordova-', ''));
            // if the run flag is passed, run the built app on device
            const command = opts.run ? 'run' : 'build';
            const buildOptions = Object.assign(
                {}, opts.buildOpts ? opts.buildOpts.options : {}, { release: opts.release });
            const options = Object.assign(opts.buildOpts || {}, {
                platforms: platformIds, options: buildOptions,
            });
            processState.setInfo('Building cordova app');
            return cordova[command](options)
                .then(() => projectPath);
        });
};

export default build;
