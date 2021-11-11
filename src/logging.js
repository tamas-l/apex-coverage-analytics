class Logger {

    log(...data) {
        console.log.apply(console, [this.getTimestamp(), '[LOG]'].concat(data));
    }

    error(...data) {
        console.error.apply(console, [this.getTimestamp(), '[ERROR]'].concat(data));
    }

    getTimestamp() {
        return '[' + new Date().toLocaleTimeString() + ']';
    }

}

const logger = new Logger();

export { Logger, logger };