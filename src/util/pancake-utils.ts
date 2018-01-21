import util = require('util');
import path = require('path');


/****************************************************************************
 **                                                                        **
 ** Utilities                                                              **
 **                                                                        **
 ****************************************************************************/

export function filterMap(map: Map<any, any>, test: Function) : Map<any, any>
{
  let newMap = new Map();
  map.forEach((value: any, key: any) => {
    if (test(key, value)) {
      newMap.set(key, value);
    }
  });
  return newMap;
}


export function buildSafeFileName(fileName: string, safeRoot?: string) : string
{
  if (!safeRoot) safeRoot = '';
  let safeSuffix = path.normalize(fileName).replace(/^(\.\.[/\\])+/, '');
  let safeName = path.join(safeRoot, safeSuffix);
  if (!path.isAbsolute(safeName)) {
    safeName = './' + safeName;
  }
  return safeName;
}


export function isNumeric(value: any) : boolean
{
  return !isNaN(value - parseFloat(value));
}


/****************************************************************************
 **                                                                        **
 ** Logging                                                                **
 ** (Want something light and easy, interface compatible with Bunyan)      **
 **                                                                        **
 ****************************************************************************/

export const LOG_FATAL = 60;
export const LOG_ERROR = 50;
export const LOG_WARN  = 40;
export const LOG_INFO  = 30;
export const LOG_DEBUG = 20;
export const LOG_TRACE = 10;

const logLevels: any = {
  'fatal': LOG_FATAL,
  'error': LOG_ERROR,
  'warn':  LOG_WARN,
  'info':  LOG_INFO,
  'debug': LOG_DEBUG,
  'trace': LOG_TRACE
};
let logLevelsByOrd: any = {};
Object.keys(logLevels).forEach((key: string) => {
  logLevelsByOrd[logLevels[key]] = key.toUpperCase();
});


class Logger
{
  private _logLevel: number;

  constructor(newLevel: any = LOG_INFO) {
    var argType = typeof newLevel;
    switch(argType) {
    case 'string':
      let ordLevel: number = logLevels[newLevel];
      if (ordLevel)
        this._logLevel = ordLevel;
      break;
    case 'number':
      this._logLevel = newLevel;
      break;
    }
    if (!this._logLevel && process.env.LOG_LEVEL) {
      this.level = process.env.LOG_LEVEL;
    }
    if (!this._logLevel) {
      this._logLevel = LOG_INFO;
    }
  }

  set level(newLevel: any) {
    var argType = typeof newLevel;
    switch(argType) {
    case 'string':
      var ordLevel = logLevels[newLevel];
      if (ordLevel)
        this._logLevel = ordLevel;
      break;
    case 'number':
      this._logLevel = newLevel;
      break;
    }
  }

  get level() {
    return this._logLevel;
  }

  get levelAsString() {
    return logLevelsByOrd[this._logLevel];
  }

  getLevelString(ordLevel: number) : string
  {
    return logLevelsByOrd[ordLevel];
  }

  getLevelOrd(level: string) : number
  {
    return logLevels[level];
  }

  _isLoggableOrd(level: number) : boolean
  {
    return level >= this._logLevel;
  }

  _log(target: any, prefix: string, args: any) : void
  {
    var logStr = prefix;
    if (args.length > 0) {

      // Error object
      var arg = args[0];
      if (arg instanceof Error) {
        logStr += arg.stack.toString();
      }

      // Format style
      else if (typeof arg === 'string') {
        logStr += util.format.apply(null, args);
      }

      // Everything else
      else {
        logStr += util.inspect(arg);
      }
    }
    target(logStr);
  }

  fatal(...args: any[]) : void
  {
    if (this._isLoggableOrd(LOG_FATAL))
      this._log(console.error, 'FATAL: ', arguments); // eslint-disable-line
  }

  error(...args: any[]) : void
  {
    if (this._isLoggableOrd(LOG_ERROR))
      this._log(console.error, 'ERROR: ', arguments); // eslint-disable-line
  }

  warn(...args: any[]) : void
  {
    if (this._isLoggableOrd(LOG_WARN))
      this._log(console.warn, 'WARN: ', arguments); // eslint-disable-line
  }

  info(...args: any[]) : void
  {
    if (this._isLoggableOrd(LOG_INFO))
      this._log(console.info, 'INFO: ', arguments); // eslint-disable-line
  }

  debug(...args: any[]) : void
  {
    if (this._isLoggableOrd(LOG_DEBUG))
      this._log(console.log, 'DEBUG: ', arguments); // eslint-disable-line
  }

  trace(...args: any[]) : void
  {
    if (this._isLoggableOrd(LOG_TRACE))
      this._log(console.log, 'TRACE: ', arguments); // eslint-disable-line
  }
}


// THE log singleton
export let log: Logger;
if (!log) {
  log = new Logger();
}
