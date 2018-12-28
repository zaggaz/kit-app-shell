#!/usr/bin/env node
const path = require('path');
const Api = require('sywac/Api');
// Use the file directly. Might break when moving stuff but tests will tell us
// This saves a lot of time as the big modules for building are not loaded is not needed
const platformUtils = require('@kano/kit-app-shell-core/lib/util/platform');
const chalk = require('chalk');

/**
 * Parses inputs, runs the commands and report to the user
 */
class CLI {
    constructor(processArgv) {
        this.processArgv = processArgv;
    } 
    start() {
        this.startedAt = Date.now();
        // Parse the output once to deal with command discovery and help
        return this.firstPass()
            .then((result) => {
                // This won't run if the user input a correct command with a platform
                if (result.argv.platform) {
                    return this.secondPass(result.argv.platform);
                }
                console.log(result.output);
                this.end(result.code);
            });
    }
    end(code) {
        this.duration = Date.now() - this.startedAt;
        const totalTime = (this.duration / 1000).toFixed(2);
        const msg = `Done in ${totalTime}s.`;
        if (this.reporter) {
            this.reporter.onInfo(msg);
        }
        process.exit(code);
    }
    /**
     * Catches errors from the current task and notify the process state
     * @param {Promise} task current long running task
     */
    setTask(task) {
        if (!this.processState) {
            return;
        }
        task.catch(e => this.processState.setFailure(e));
    }
    static parseCommon(sywac) {
        return sywac
            .positional('[app=./]', {
                params: [{
                    required: true,
                    desc: 'Path to the root of the app',
                    coerce: path.resolve,
                }],
            })
            .string('env', {
                desc: 'Target environment',
                defaultValue: 'development',
            });
    }
    static applyStyles(sywac) {
        sywac.style({
            group: s => chalk.cyan.bold(s),
            desc: s => chalk.white(s),
            hints: s => chalk.dim(s),
            flagsError: s => chalk.red(s),
        });
    }
    static patchSywacOptions(sywac, forcedOptions) {
        const originalOptions = sywac._addOptionType.bind(sywac);
        sywac._addOptionType = (flags, opts, type) => {
            return originalOptions(flags, Object.assign({}, opts, forcedOptions), type);
        };
        return {
            dispose() {
                sywac._addOptionType = originalOptions;
            }
        };
    }
    mountReporter(argv) {
        if (argv.quiet) {
            return;
        }
        // Late require speeds up small things like help and version
        this.processState = require('@kano/kit-app-shell-core/lib/process-state');
        let ReporterClass;
        // Avoid wasting people's time by loading only the necessary code
        if (process.stdout.isTTY) {
            // Use spinner UI for humans
            ReporterClass = require('../lib/reporters/ora');
        } else {
            // Use normal logging for machines (e.g. CI)
            ReporterClass = require('../lib/reporters/console');
        }
        this.reporter = new ReporterClass();
        this.processState.on('step', ({ message = '' }) => this.reporter.onStep(message));
        this.processState.on('success', ({ message = '' }) => this.reporter.onSuccess(message));
        this.processState.on('failure', ({ message = '' }) => this.reporter.onFailure(message));
        this.processState.on('warning', ({ message = '' }) => this.reporter.onWarning(message));
        this.processState.on('info', ({ message = '' }) => this.reporter.onInfo(message));
    }
    firstPass() {
        // Create local sywac
        const sywac = new Api();
    
        // All commands available
        const commands = ['run', 'build', 'test', 'configure'];
    
        sywac.configure({ name: 'kash' });
    
        // Generate all commands with generic help message
        commands.forEach((cmd) => {
            sywac.command(`${cmd} <platform> --help`, {
                desc: `Show help for the ${cmd} command`,
                run: (argv) => {
                    return this.secondPass(argv.platform);
                }
            });
        });
    
        sywac.command('open config', {
            desc: 'Open the location of your configuration',
            run: (argv) => {
                return require('../lib/open-config')();
            },
        });
    
        sywac.help();
        sywac.showHelpByDefault();
    
        sywac.version();
    
        CLI.applyStyles(sywac);
    
        return sywac.parse(this.processArgv);
    }
    secondPass(platformId) {
        const sywac = new Api();
        let platformCli
        // catch synchronous error and reject as a result
        try {
            platformCli = platformUtils.loadPlatformKey(platformId, 'cli');
        } catch (e) {
            let context = sywac.initContext(false);
            context.unexpectedError(e);
            const result = context.toResult();
            console.log(result.output);
            return this.end(result.code);
        }
    
        const platform = {
            cli: platformCli,
        };
    
        sywac.command('build <platform>', {
            desc: 'build the application',
            setup: (sywac) => {
                CLI.parseCommon(sywac);
                sywac.array('resources')
                    .string('--out, -o', {
                        desc: 'Output directory',
                        coerce: path.resolve,
                        required: true,
                    })
                    .number('--build-number, -n', {
                        aliases: ['n', 'build-number', 'buildNumber'],
                        defaultValue: 0,
                    })
                    .boolean('--bundle-only', {
                        aliases: ['bundle-only', 'bundleOnly'],
                        defaultValue: false,
                    });
                const sywacPatch = CLI.patchSywacOptions(sywac, { group: platform.cli.group || 'Platform: ' });
                platformUtils.registerOptions(sywac, platform, 'build');
                sywacPatch.dispose();
            },
            run: (argv) => {
                this.mountReporter(argv);
                const { runCommand } = require('../lib/command');
                return runCommand('build', platformId, argv);
            }
        });
    
        sywac.command(`run <platform>`, {
            desc: 'run the application',
            setup: (sywac) => {
                CLI.parseCommon(sywac);
                const sywacPatch = CLI.patchSywacOptions(sywac, { group: platform.cli.group || 'Platform: ' });
                platformUtils.registerOptions(sywac, platform, 'run');
                sywacPatch.dispose();
            },
            run: (argv) => {
                this.mountReporter(argv);
                const { runCommand } = require('../lib/command');
                const task = runCommand('run', platformId, argv);
                this.setTask(task);
                return task;
            },
        });
    
        sywac.command(`test <platform>`, {
            desc: 'test the application',
            setup: (sywac) => {
                CLI.parseCommon(sywac);
                sywac.string('--prebuilt-app', {
                    aliases: ['prebuilt-app', 'prebuiltApp'],
                    desc: 'Path to the built app to test',
                    required: true,
                    coerce: path.resolve,
                });
                const sywacPatch = CLI.patchSywacOptions(sywac, { group: platform.cli.group || 'Platform: ' });
                platformUtils.registerOptions(sywac, platform, 'test');
                sywacPatch.dispose();
            },
            run: (argv) => {
                this.mountReporter(argv);
                const runTest = require('../lib/test');
                const task = runTest(argv, platformId, 'test');
                this.setTask(task);
                return task;
            },
        });
    
        sywac.command(`configure <platform>`, {
            desc: 'configure kash',
            setup: (sywac) => {
                const sywacPatch = CLI.patchSywacOptions(sywac, { group: platform.cli.group || 'Platform: ' });
                platformUtils.registerOptions(sywac, platform, 'configure');
                sywacPatch.dispose();
            },
            run: (argv) => {
                this.mountReporter(argv);
                const configure = require('../lib/configure');
                const task = configure(argv, platformId);
                this.setTask(task);
                return task;
            },
        });
    
        sywac.boolean('--quiet, -q', {
            desc: 'Silence all outputs',
            defaultValue: false,
        });
    
        sywac.boolean('--verbose', {
            desc: 'Displays verbose logs',
            defaultValue: false
        });
    
        sywac.help();
        sywac.showHelpByDefault();
    
        sywac.version();
    
        sywac.configure({ name: 'kash' });
    
        // Register the global commands for the platform
        const sywacPatch = CLI.patchSywacOptions(sywac, { group: platform.cli.group || 'Platform: ' });
        platformUtils.registerCommands(sywac, platform);
        sywacPatch.dispose();
    
        CLI.applyStyles(sywac);
        
        return sywac.parse(this.processArgv)
            .then((result) => {
                if (result.output.length) {
                    console.log(result.output);
                }
                this.end(result.code);
            });
    }
}

const cli = new CLI(process.argv.slice(2));

cli.start();
