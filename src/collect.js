import fs from 'fs'
import { MongoClient } from 'mongodb'
import { Tooling } from './tooling.js'
import { logger } from './logging.js'

async function startPolling(argv) {
    const credentials = JSON.parse(fs.readFileSync(argv.credentials));
    const mongo = new MongoClient(credentials.mongodb);
    await mongo.connect()
    logger.log('Connected to MongoDB.');
    const db = mongo.db(argv.db);
    const collection = db.collection(argv.collection);
    await collection.createIndex({
        'ApexClassOrTrigger.Id': 1,
        'ApexTestClass.Id': 1,
        'TestMethodName': 1
    }, { unique: true });

    const sf = new Tooling();
    await sf.connect(credentials.salesforce);
    logger.log('Connected to Salesforce.');
    
    let timer;
    const poll = async function() {
        try {
            const coverageRecords = await sf.queryApexCodeCoverage();
            let writeResult;
            try {
                writeResult = await collection.insertMany(coverageRecords, { ordered: false });
            } catch (e) {
                writeResult = e;
            } finally {
                logger.log(`Inserted ${writeResult.insertedCount} new ApexCodeCoverage record(s) of total ${coverageRecords.length}.`);
            }
        } catch(e) {
            logger.error(e);
        } finally {
            timer = setTimeout(poll, argv.interval * 1000);
        }
    }

    poll();
    logger.log(`Polling started with interval ${argv.interval} seconds.`);
    
    process.on('SIGINT', function() {
        clearTimeout(timer);
        mongo.close().finally(() => {
            logger.log('Exiting...');
        });
    });
}

export { startPolling }