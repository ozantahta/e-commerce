import { createLogger, format, transports } from 'winston';

const { combine, timestamp, errors, json, printf } = format;

const customFormat = printf(({ level, message, timestamp, service, ...meta }) => {
  return JSON.stringify({
    timestamp,
    level,
    service,
    message,
    ...meta
  });
});

export const createServiceLogger = (serviceName: string) => {
  return createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: combine(
      timestamp(),
      errors({ stack: true }),
      json(),
      customFormat
    ),
    defaultMeta: { service: serviceName },
    transports: [
      new transports.Console({
        format: combine(
          format.colorize(),
          format.simple()
        )
      }),
      new transports.File({
        filename: `logs/${serviceName}-error.log`,
        level: 'error',
        maxsize: 5242880, // 5MB
        maxFiles: 5
      }),
      new transports.File({
        filename: `logs/${serviceName}-combined.log`,
        maxsize: 5242880, // 5MB
        maxFiles: 5
      })
    ]
  });
};

export const logger = createServiceLogger('shared');
