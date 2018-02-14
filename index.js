const process = require("process");

const Transport = require('winston-transport');

const AWS = require("aws-sdk");

const precon = (value) => {
  if (value) {
    return value;
  } else {
    const err = new Error("Missing required value");
    console.error(err, err.stack);
    process.exit(1);
  }
}

const findToPushIndex = (logs) => {
  let totalEstimatedSize = 0;

  for (let i = 0; i++; i < logs.length) {
    const strungified = JSON.stringify(logs[i]);
    totalEstimatedSize = totalEstimatedSize + strungified.length;
    if (totalEstimatedSize > 1000000) {
      if (i == 0) {
        throw new Error("Single log message is too big to send: " + strungified);
      } else {
        return i - 1;
      }
    }
  }

  return logs.length;
};

const pushFn = async (that) => {
  if (that.started && that.logs.length > 0) {
    const sliceIndex = findToPushIndex(that.logs);

    const toPush = that.logs.slice(0, sliceIndex);

    that.logs = that.logs.slice(sliceIndex);

    const oldST = that.sequenceToken;
    try {
      const response = await that.cloudwatchlogs.putLogEvents({
        logEvents: toPush,
        logGroupName: that.logGroupName,
        logStreamName: that.logStreamName,
        sequenceToken: that.sequenceToken
      }).promise();
      that.sequenceToken = response.nextSequenceToken;
      return setTimeout(pushFn, that.interval, that);
    } catch (err) {
      console.error(err, err.stack);
      process.exit(222);
    }
  } else {
    return setTimeout(pushFn, that.interval, that);
  }
};

const startFn = async (that) => {

  if (that.started) {
    const err = new Error("can't call start more than once");
    console.error(err, err.stack);
    process.exit(1);
  } else {
    that.started = true;

    try {
      await that.cloudwatchlogs.createLogGroup({ logGroupName: that.logGroupName }).promise();
    } catch (err) {
      if (err.message !== 'The specified log group already exists') {
        console.error(err, err.stack);
        process.exit(220);
      }
    }
    await that.cloudwatchlogs.putRetentionPolicy({ logGroupName: that.logGroupName, retentionInDays: that.retentionDays }).promise();

    try {
      await that.cloudwatchlogs.createLogStream({ logGroupName: that.logGroupName, logStreamName: that.logStreamName }).promise();
    } catch (err) {
      if (err.message !== 'The specified log stream already exists') {
        console.error(err, err.stack);
        process.exit(221);
      }
    }

    const res = await that.cloudwatchlogs.describeLogStreams({ logGroupName: that.logGroupName, logStreamNamePrefix: that.logStreamName }).promise();

    if (that.sequenceToken) {
      return;
    }
    that.sequenceToken = res.logStreams[0].uploadSequenceToken;

    if (!that.sequenceToken) {
      const response = await that.cloudwatchlogs.putLogEvents({
        logEvents: [{ timestamp: new Date().getTime(), message: "start stream" }],
        logGroupName: that.logGroupName,
        logStreamName: that.logStreamName,
      }).promise();
      if (that.sequenceToken) {
        return;
      }
      that.sequenceToken = response.nextSequenceToken;
    }
    console.error(`created ${that.logGroupName}/${that.logStreamName} and started pushing logs at [${that.sequenceToken}]...`);

    setTimeout(pushFn, that.interval, that);
  };
}

class CloudwatchLogsTransport extends Transport {
  constructor(opts = {}) {
    super(opts);
    this.sequenceToken = null;
    this.logGroupName = precon(opts.logGroupName);
    this.logStreamName = precon(opts.logStreamName);
    this.retentionDays = opts.retentionDays || 7;
    this.interval = opts.interval || 1000;
    this.started = false;
    this.logs = [];
    this.cloudwatchlogs = new AWS.CloudWatchLogs(opts.cloudWatchLogsConfig || {});
  }

  async start() {
    this.startPromise = startFn(this)
    await this.startPromise;
    console.log("CWLTransport started");
  }

  async flushAndStop() {
    await this.startPromise;
    while (this.logs.length > 0) {
      await pushFn(this);
    }
    this.started = false;
    console.log("CWL Transport flushed and stopped.");
  }

  log(info, callback) {
    if (!this.started) {
      const err = new Error("not started");
      console.error(err, err.stack);
      process.exit(1);
    } else {
      this.logs.push({
        message: JSON.stringify(info),
        timestamp: new Date().getTime()
      });
    }
    return callback();
  }
}


module.exports = CloudwatchLogsTransport;

