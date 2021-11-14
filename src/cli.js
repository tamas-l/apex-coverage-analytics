import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'
import { startPolling } from './collect.js'
import { build } from './build.js'
import { clean } from './clean.js'

yargs(hideBin(process.argv))
    .command({
        command: 'collect',
        desc: 'Collect Apex code coverage data from Salesforce and accumulate them in local database.',
        builder: (yargs) => yargs.option('interval', {
            description: 'the refresh interval (seconds)',
            type: 'number',
            default: 300
        }),
        handler: (argv) => startPolling(argv)
    })
    .command({
        command: 'build <type>',
        desc: 'Process coverage data and build test suites, report, etc.',
        builder: (yargs) => yargs.positional('type', {
            description: 'the selected output type',
            choices: ['report', 'test-suites'],
            type: 'string'
        })
        .option('output-dir', {
            description: 'directory to store output files',
            type: 'string',
            normalize: true,
            demandOption: true
        })
        .option('coverage-threshold', {
            description: 'the code coverage threshold for individual classes and triggers',
            type: 'number',
            demandOption: true,
            default: 75
        }),
        handler: (argv) => build(argv)
    }).command({
        command: 'clean',
        desc: 'Remove all data stored in MongoDB collection.',
        handler: (argv) => clean(argv)
    }).option('credentials', {
        description: 'link to JSON file containing credentials',
        type: 'string',
        normalize: true,
        demandOption: true
    }).option('db', {
        description: 'MongoDB database name to use',
        type: 'string',
        demandOption: true,
        default: 'apex-coverage-analytics'
    }).option('collection', {
        description: 'MongoDB collection name to use',
        type: 'string',
        demandOption: true,
        default: 'ApexCodeCoverage'
    })
    .demandCommand()
    .help()
    .argv;