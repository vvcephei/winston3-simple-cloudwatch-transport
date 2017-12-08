Winston3 Simple Cloudwatch Transport
====================================

I needed a cloudwatch transport for winston 3... and here it is.

It's a very no-frills project, but it's worked well for me so far.

You create the transport and call `start()` to make it start shipping logs.

It will create the log group and stream if they don't exist, and set a retention policy as well (defaults to 7 days).

One other thing worth noting is that any error it encounters will kill your whole process. Just throwing exceptions would be more normal, but failed promises have a bad habit of being silent or at least subtle, and I didn't want my process to silently stop shipping logs.

To stop the transport, you can call `flushAndStop()`, which returns a promise.

Here's an example usage:

```javascript
const winston = require("winston");
const CloudwatchLogsTransport = require("winston3-simple-cloudwatch-transport");
const cloudwatchLogsTransport = new CloudwatchLogsTransport({
  logGroupName: "my-log-group",
  logStreamName: `${require("os").hostname()}_${process.pid}`,
  cloudWatchLogsConfig: { region: 'us-east-1' } // assumes you've configured your environment for AWS calls
});
cloudwatchLogsTransport.start(); // this returns a promise, but it's not a precondition to logging stuff
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.Console({ format: winston.format.simple(), level: 'error' }),
    cloudwatchLogsTransport
  ]
});

logger.info("this is a log message");
logger.error("this is a more troubling message");

cloudwatchLogsTransport.flushAndStop().then(_ => process.exit(0));
```
