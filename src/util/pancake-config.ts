import utils = require('./pancake-utils');
let    log   = utils.log;

const SILENT_TAG = '[silent]';

// Standard environments
export const ENV_DEV  = 'development';
export const ENV_TEST = 'test';
export const ENV_PROD = 'production';


export class Configuration
{
  private _envName: string;
  private _configItems = new Map<string, any>();

  _copyOverConfigItems(config: any, sectionName: string) : void
  {
    if (config) {
      Object.keys(config).forEach((key: string) => {

        // Check for [silent]
        let originalKey = key;
        let silent = key.startsWith(SILENT_TAG);
        if (silent) {
          key = key.slice(SILENT_TAG.length);
        }

        // Copy over key into the environment
        // (Process environment trumps)
        let value = process.env[originalKey] ? process.env[originalKey] : config[originalKey];
        this._configItems.set(key, value);

        // Special case for the log level
        let lowerKey = key.toLowerCase();
        if (lowerKey === 'log_level') {
          log.level = value;
        }

        if (!silent) {
          log.trace(`CONFIG: Set '${sectionName}' config value: ${key}=${value}`);
        }
      });
    }
  }

  constructor(configFileName: string, envName: string = process.env.NODE_ENV || ENV_DEV)
  {
    try {

      // Simple validatation
      this._envName = envName.trim().toLowerCase();

      // Load in our config object
      let safeFileName: string = utils.buildSafeFileName(configFileName);
      let config = require(safeFileName);
      let globalConfig = config.global;
      let envConfig = config[this._envName];
      this._configItems.clear();
      log.trace(`CONFIG: Loading config file (${safeFileName})...`);

      // Load in the environment variables
      this._copyOverConfigItems(globalConfig, 'GLOBAL');
      this._copyOverConfigItems(envConfig, this._envName);
      log.trace(`CONFIG: Configuration file "${configFileName}" successfullly loaded.`);

    } catch (err) {
      log.trace('CONFIG: Could not extract valid configuration.');
      throw err;
    }
  }

  get envName() : string
  {
    return this._envName;
  }

  get(itemName: string) : any
  {
    let item = process.env[itemName];
    if (!item) {
      item = this._configItems.get(itemName);
    }
    return item;
  }
}
