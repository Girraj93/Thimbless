import pino from "pino";
const transport = pino.transport({
  targets: [
    {
      target: "pino-pretty",
      options: {
        destination: "./logs/thimbles.log",
        mkdir: true, colorize: false, // Ensures no ANSI codes in file output
        translateTime: "SYS:standard", // Formats timestamp in a readable format
        ignore: "pid,hostname", // Optional: omits process ID and hostname
      },
    },
    {
      target: "pino-pretty",
      options: {
        destination: process.stdout.fd,
      },
    },
  ],
});

const logger = pino({}, transport);


export default logger;
  