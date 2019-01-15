import * as path from 'path';
import * as fs from 'fs';
import { promisify } from 'util';
import * as mkdirpCb from 'mkdirp';
import * as globCb from 'glob';
import { processState } from '@kano/kit-app-shell-core/lib/process-state';
import { copy } from '@kano/kit-app-shell-core/lib/util/fs';
import { Bundler } from '@kano/kit-app-shell-core/lib/bundler';
import { ElectronBuildOptions } from './types';
import { IBuild } from '@kano/kit-app-shell-core/lib/types';
import { snap } from './snapshot/snap';

const writeFile = promisify(fs.writeFile);
const glob = promisify(globCb);
const mkdirp = promisify(mkdirpCb);

// Do not embbed any of this in the app, these are not required to run
// Ignoring these files will help reducing the overall app size
const cleanIgnore = [
    '**/.npmrc',
    '**/*.md',
    '**/*.d.ts',
    '**/*.d.js',
    '**/.gitignore',
    '**/.gitmodules',
    '**/.eslintrc',
    '**/.eslintrc.js',
    '**/.eslintrc.json',
    '**/karma.conf.js',
    '**/.npmignore',
    '**/package-lock.json',
    '**/yarn.lock',
    '**/rollup.config.js',
    '**/*.test.js',
    '**/.travis.yaml',
    '**/.travis.yml',
    '**/LICENSE.md',
    '**/TODO.md',
    '**/LICENSE.txt',
    '**/CHANGES.md',
    '**/CHANGELOG.md',
    '**/CONTRIBUTING.md',
    '**/binding.gyp',
    '**/*.sln',
    '**/*.vcxproj',
    '**/*.vcxproj.filters',
    '**/config.gypi',
    '**/bower.json',
    '**/Gruntfile.js',
    '**/*.iobj',
    '**/*.lastbuildstate',
    '**/*.h',
    '**/*.cpp',
    '**/*.c',
    '**/*.tlog',
    '**/appveyor.yml',
    '**/appveyor.yaml',
    '**/*.gypi',
    // Custom exclude for node bindings of uwp
    '**/node-v48-win32-x64/binding.node',
    '**/node-v59-win32-x64/binding.node',
];

const babelTargets = {
    chrome: 66, // Electron 3 = Chromium 66
};

const patterns = [
    'package.json',
    'preload.js',
    'node_modules/noble-uwp/**/*',
    'node_modules/electron/**/*',
];

/**
 * Copies the electron app from the `app` directory as a template
 * @param {String} out Path to the copy destination
 */
function copyElectronApp(out) : Promise<void> {
    const cwd = path.join(__dirname, '../app');
    const opts = {
        cwd,
        ignore: [
            ...cleanIgnore,
            'index.html',
            'index.js',
        ],
        dot: true,
        nodir: true,
    };
    return patterns.reduce<Promise<string[]>>((p, pattern) => {
        return p
            .then((paths) => {
                return glob(pattern, opts)
                    .then(p => paths.concat(p));
            });
    }, Promise.resolve([]))
        .then((paths) => {
            // Chain file copying
            const tasks = paths.reduce((p, file) => {
                const src = path.join(cwd, file);
                const dest = path.join(out, file);
                return p.then(() => copy(src, dest));
            }, Promise.resolve());
            return tasks;
        });
}

function generateSnapshot(root : string, out : string) {
    return snap(
        path.join(__dirname, '../app/main.js'),
        root,
        out,
    );
}

/**
 * Create a config.json file in the defined target from a given config object
 * This is used to embbed a config with a built app, ensuring it frozen
 * @param {Object} config The config to save in the app
 * @param {String} out Target directory
 */
function createConfig(config, out) {
    return mkdirp(out)
        .then(() => writeFile(
            path.join(out, 'config.json'),
            JSON.stringify(Object.assign({ BUNDLED: true }, config)),
        ));
}

const electronBuild : IBuild = function build(opts : ElectronBuildOptions) {
    const {
        app,
        config,
        out,
        bundleOnly,
    } = opts;
    processState.setStep(`Creating electron app '${config.APP_NAME}'`);
    const tasks = [
        copyElectronApp(out),
        createConfig(config, out),
        Bundler.bundle(
            path.join(__dirname, '../app/index.html'),
            path.join(__dirname, '../app/index.js'),
            path.join(app, 'index.js'),
            config,
            {
                js: {
                    bundleOnly,
                    targets: babelTargets,
                },
                appJs: {
                    ...opts,
                    targets: babelTargets,
                },
                html: {},
            },
        )
            .then(bundle => Bundler.write(bundle, out)),
    ];
    return Promise.all(tasks)
        .then((results) => {
            processState.setStep('Generating V8 snapshot');
            return generateSnapshot(results[2], results[2]);
        })
        .then((out) => {
            processState.setSuccess('V8 snapshot generated');
            processState.setSuccess(`Created electron app '${config.APP_NAME}'`);
            // Return bundle outputDir
            return out;
        });
}

export default electronBuild;
