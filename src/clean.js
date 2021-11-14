import fs from 'fs'
import { MongoClient } from 'mongodb'
import { logger } from './logging.js'

async function clean(argv) {
    const credentials = JSON.parse(fs.readFileSync(argv.credentials));
    const mongo = new MongoClient(credentials.mongodb);
    await mongo.connect()
    logger.log('Connected to MongoDB.');
    const db = mongo.db(argv.db);
    const collections = await db.collections();
    const collection = collections.find(c => c.collectionName === argv.collection);
    if (collection) {
        await collection.drop();
        logger.log(`Dropped collection ${collection.namespace}.`);
    } else {
        logger.log(`No collection ${argv.db}.${argv.collection} found.`);
    }
    await mongo.close();
}

export { clean }