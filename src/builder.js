import fs from 'fs'
import path from 'path'
import xmlbuilder from 'xmlbuilder2'
import { MongoClient } from 'mongodb'
import { logger } from './logging.js'

const reportStyle = `
    body {
        font-family: monospace
    }
    td:nth-child(2), th:nth-child(2) {
        text-align: left;
    }
    td:first-child, th:first-child {
        text-align: left;
    }
    table {
        margin-bottom: 1em;
    }
    table, td, th {
        border: 1px solid darkgray
    }
    table {
        border-collapse: collapse
    }
    .pass {
        background-color: lightgreen
    }
    .fail {
        background-color: pink
    }
`;

function testComparator(test1, test2) {
    return test1.coveredLines.size - test2.coveredLines.size;
}

class TestSuite {

    tests = [];
    coveredLines = new Set();

    add(test) {
        this.tests.push(test);
        test.coveredLines.forEach(line => {
            this.coveredLines.add(line);
        });
    }

}

async function build(argv) {
    const credentials = JSON.parse(fs.readFileSync(argv.credentials));
    const mongo = new MongoClient(credentials.mongodb);
    await mongo.connect()
    logger.log('Connected to MongoDB.');
    const db = mongo.db(argv.db);
    const collection = db.collection(argv.collection);
    const aggregateResult = collection.aggregate([
        {
            $group: {
                _id: {
                    $concat: ["$ApexClassOrTrigger.Id", "$ApexTestClass.Id"]
                },
                class: {
                    $first: {
                        id: "$ApexClassOrTrigger.Id",
                        name: "$ApexClassOrTrigger.Name"
                    }
                },
                testClass: {
                    $first: {
                        id: "$ApexTestClass.Id",
                        name: "$ApexTestClass.Name"
                    }
                },
                apexCodeCoverage: {
                    $push: "$$ROOT"
                }
            }
        },
        {
            $project: {
                class: "$class",
                testClass: "$testClass",
                apexCodeCoverage: "$apexCodeCoverage",
                coveredLines: {
                    $reduce: {
                        input: "$apexCodeCoverage",
                        initialValue: [],
                        in: { $setUnion: ["$$value", "$$this.Coverage.coveredLines"] }
                    }
                },
                allLines: {
                    $reduce: {
                        input: "$apexCodeCoverage",
                        initialValue: [],
                        in: { $setUnion: ["$$value", "$$this.Coverage.uncoveredLines", "$$this.Coverage.coveredLines"] }
                    }
                }
            }
        },
        {
            $group: {
                _id: "$class.id",
                class: {
                    $first: "$class",
                },
                testClasses: {
                    $push: "$$ROOT"
                }
            }
        },
        {
            $project: {
                class: "$class",
                testClasses: "$testClasses",
                allLines: {
                    $reduce: {
                        input: "$testClasses",
                        initialValue: [],
                        in: { $setUnion: ["$$value", "$$this.allLines"] }
                    }
                }
            }
        },
        {
            $project: {
                class: "$class",
                allLines: "$allLines",
                tests: {
                    $map: {
                        input: "$testClasses",
                        in: {
                            id: "$$this.testClass.id",
                            name: '$$this.testClass.name',
                            coveredLines: "$$this.coveredLines"
                        }
                    }
                }
            }
        },
        {
            $sort: { "class.name": 1 }
        }
    ]);
    
    const coverageData = await aggregateResult.toArray();
    await mongo.close();
    logger.log(`Retrieved aggregated test coverage data for ${coverageData.length} classes and triggers.`);

    const targetCoverage = argv.coverageThreshold / 100;

    coverageData.forEach(coverage => {
        coverage.allLines = new Set(coverage.allLines);
        coverage.tests.forEach(test => {
            test.coveredLines = new Set(test.coveredLines);
        });
        coverage.testSuite = new TestSuite();
        while ((coverage.testSuite.coveredLines.size / coverage.allLines.size < targetCoverage) && coverage.tests.length > 0) {
            // Find the test providing the most unique coverage.
            coverage.tests.sort(testComparator);
            const bestTest = coverage.tests.shift();
            if (bestTest.coveredLines.size > 0) {
                coverage.testSuite.add(bestTest);
            }
            // Update all test records to remove lines that are already covered by the test suite.
            coverage.tests.forEach(test => {
                bestTest.coveredLines.forEach(line => {
                    test.coveredLines.delete(line);
                });
            });
        }
    });

    fs.mkdirSync(argv.outputDir, { recursive: true });

    if (argv.type == 'test-suites') {
        coverageData.forEach(coverage => {
            const filePath = path.resolve(argv.outputDir, coverage.class.name + '.testSuite');
            const file = fs.openSync(filePath, 'w');
            fs.writeFileSync(file, xmlbuilder.create({
                ApexTestSuite: {
                    "@xmlns": "http://soap.sforce.com/2006/04/metadata",
                    testClassName: coverage.testSuite.tests.map(test => test.name)
                }
            }).end({ prettyPrint: true }));
            fs.closeSync(file);
        });
    } else if (argv.type == 'report') {
        const filePath = path.resolve(argv.outputDir, `Apex Code Coverage Report.xhtml`);
        const file = fs.openSync(filePath, 'w');
        const report = xmlbuilder.create().ele('html').att('xmlns', 'http://www.w3.org/1999/xhtml')
            .ele('head')
                .ele('title').txt(`Apex Code Coverage Report ${new Date().toLocaleString()}`).up()
                .ele('style').txt(reportStyle).up().up()
        const body = report.ele('body');
        coverageData.forEach(coverage => {
            const percentageEstimate = coverage.testSuite.coveredLines.size / coverage.allLines.size * 100;
            const tbody = body
                .ele('table')
                    .ele('thead').att('class', percentageEstimate < 75 ? 'fail' : 'pass')
                        .ele('tr')
                            .ele('th').txt(coverage.class.name).up()
                            .ele('th').txt(percentageEstimate.toFixed(1)).up()
                        .up()
                    .up()
                    .ele('tbody');
            coverage.testSuite.tests.forEach(test => {
                tbody.ele('tr').ele('td').txt(test.name).up().ele('td').txt((test.coveredLines.size / coverage.allLines.size * 100).toFixed(1));
            });
        });
        fs.writeFileSync(file, report.end({ prettyPrint: true }));
        fs.closeSync(file);
    }
}

export { build }