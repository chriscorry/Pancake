/****************************************************************************
 **                                                                        **
 ** Modules                                                                **
 **                                                                        **
 ****************************************************************************/

import path             = require('path');
import restify          = require('restify');

const { log }           = require('../util/pancake-utils');
const { Configuration } = require('../util/pancake-config');
const { flagpole }      = require('../flagpole/flagpole');


/****************************************************************************
 **                                                                        **
 ** Vars & definitions                                                     **
 **                                                                        **
 ****************************************************************************/

const DEFAULT_SERVER_CONFIG = 'serverconfig.json';
const DEFAULT_API_CONFIG    = 'apiconfig.json';

export interface SyrupOpts {
  name?:   string,
  ver?:    string,
  apiDir?: string
}


/****************************************************************************
 **                                                                        **
 ** GO!                                                                    **
 **                                                                        **
 ****************************************************************************/

// This is all there is
export function go(serverConfigFileName: string = DEFAULT_SERVER_CONFIG,
                   apiConfigFileName: string = DEFAULT_API_CONFIG,
                   opts?: SyrupOpts) : void
{
  let syrupOpts         = opts || <SyrupOpts>{};
  let serverName:string = syrupOpts.name || process.env.SYRUP_SERVER_NAME || 'Syrup Test';
  let serverVer: string = syrupOpts.ver  || process.env.SYRUP_SERVER_VER  || '1.0.0';


  /****************************************************************************
   **                                                                        **
   ** Banner                                                                 **
   **                                                                        **
   ****************************************************************************/

  log.info(`${serverName} v${serverVer}`);
  log.info('Framework Copyright (c) 2018, Chris Corry LLC All rights reserved.');


  /****************************************************************************
   **                                                                        **
   ** SETUP                                                                  **
   **                                                                        **
   ****************************************************************************/

  // Load up the main server config
  let config = new Configuration(__dirname + '/../../config/serverconfig.json');
  log.info(`SYRUP: Logging level is ${log.levelAsString}`);

  // VARS
  const port = config.get('PORT');

  // RESTIFY
  // TODO: pass in certs and key for HTTPS
  let serverRestify = restify.createServer({name: serverName});
  serverRestify.use(restify.plugins.bodyParser());

  // FLAGPOLE
  let apiSearchDirs: string = '';
  if (config.get('SYRUP_API_DIR'))
    apiSearchDirs += (config.get('SYRUP_API_DIR') + path.delimiter);
  if (syrupOpts.apiDir)
    apiSearchDirs += (syrupOpts.apiDir + path.delimiter);
  apiSearchDirs += (path.resolve() + path.delimiter);
  apiSearchDirs += (__dirname + '/../../config' + path.delimiter);
  apiSearchDirs += (__dirname + '/../syrup/api');
  flagpole.initialize(serverRestify, { apiSearchDirs, envName: config.envName });


  /****************************************************************************
   **                                                                        **
   ** REGISTER APIs                                                          **
   **                                                                        **
   ****************************************************************************/

  // First, load our private framework APIs
  log.info(`SYRUP: Loading private framework APIs...`);
  var err = flagpole.loadAPIConfig('apiconfig_priv.json');
  if (err) {
    log.error(err);
    log.error('Exiting...');
    process.exit(err);
  }

  // Now load the main APIs
  let configFile: string = config.get['SYRUP_API_CONFIG_FILE'] || apiConfigFileName;
  log.info(`SYRUP: Loading user APIs...`);
  err = flagpole.loadAPIConfig(configFile);
  if (err) {
    log.warn(`SYRUP: No user API loaded. (${configFile})`);
  }

  // Start processing requests
  serverRestify.listen(port, () => {
    log.info(`SYRUP: '${serverRestify.name}' listening on port ${port}...`);
  });
}
