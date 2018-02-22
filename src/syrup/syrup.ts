/****************************************************************************
 **                                                                        **
 ** Modules                                                                **
 **                                                                        **
 ****************************************************************************/

import path              = require('path');
import fs                from 'fs';
import restify           = require('restify');
import socketIO          = require('socket.io');

import { LatchkeyClient } from '../latchkey/api/latchkey_1.0.0/latchkey_client';
import { PitbossClient }  from '../pitboss/api/pitboss_1.0.0/pitboss_client';
import { PancakeError }   from '../util/pancake-err';
import { log }            from '../util/pancake-utils';
import { Configuration }  from '../util/pancake-config';
import { grab }           from '../util/pancake-grab';
import { Token }          from '../util/tokens';
import { flagpole }       from '../flagpole/flagpole';


/****************************************************************************
 **                                                                        **
 ** Vars & definitions                                                     **
 **                                                                        **
 ****************************************************************************/

const DEFAULT_SERVER_CONFIG = 'serverconfig.json';
const DEFAULT_API_CONFIG    = 'apiconfig.json';

export interface SyrupOpts {
  name?:       string,
  ver?:        string,
  apiDir?:     string,
  usePitboss?: boolean,
  useNotary?:  boolean,
  selfAuth?:   boolean,
  skipAuth?:   boolean
}


/****************************************************************************
 **                                                                        **
 ** GO!                                                                    **
 **                                                                        **
 ****************************************************************************/

// This is all there is
export async function go(serverConfigFileName: string = DEFAULT_SERVER_CONFIG,
                         apiConfigFileName: string = DEFAULT_API_CONFIG,
                         opts?: SyrupOpts) : Promise<void>
{
  let syrupOpts         = opts || <SyrupOpts>{};
  let serverName:string = syrupOpts.name || process.env.SYRUP_SERVER_NAME || 'Syrup Test';
  let serverVer: string = syrupOpts.ver  || process.env.SYRUP_SERVER_VER  || '1.0.0';
  let token: Token;
  let err: any, resp: any;


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
  if (process.env.LOG_LEVEL) log.level = process.env.LOG_LEVEL;
  let config = new Configuration(__dirname + '/../../config/' + serverConfigFileName);
  log.info(`SYRUP: Logging level is ${log.levelAsString}`);

  // VARS
  const port = config.get('PORT');

  // Secrets
  Token.config = config;

  // RESTIFY
  // TODO: pass in certs and key for HTTPS
  let serverRestify = restify.createServer({name: serverName});
  serverRestify.use(restify.plugins.bodyParser());
  serverRestify.use(restify.plugins.queryParser());
  serverRestify.get('/', restify.plugins.serveStatic({
    directory: __dirname + '/../../public',
    default: '/index.html'
  }));
  serverRestify.get('/js', restify.plugins.serveStatic({
    directory: __dirname + '/../../public',
    default: '/index.js'
  }));

  // SOCKET.IO
  let serverSocketIO = socketIO.listen(serverRestify.server);

  // PITBOSS
  let pitboss = new PitbossClient();

  // FLAGPOLE
  let apiSearchDirs: string = '';
  if (config.get('SYRUP_API_DIR'))
    apiSearchDirs += (config.get('SYRUP_API_DIR') + path.delimiter);
  if (syrupOpts.apiDir)
    apiSearchDirs += (syrupOpts.apiDir + path.delimiter);
  apiSearchDirs += (path.resolve() + path.delimiter);
  apiSearchDirs += (__dirname + '/../../config' + path.delimiter);
  apiSearchDirs += (__dirname + '/../syrup/api');
  flagpole.initialize(serverRestify, serverSocketIO, {
    apiSearchDirs,
    envName: config.envName,
    events: pitboss
   });


  /****************************************************************************
   **                                                                        **
   ** REGISTER APIs                                                          **
   **                                                                        **
   ****************************************************************************/

  // First, load our private framework APIs
  log.info(`SYRUP: Loading private framework APIs...`);
  err = flagpole.loadAPIConfig('apiconfig_priv.json');
  if (err) {
    log.error(err);
    log.error('Exiting...');
    process.exit(1);
  }

  // Now load the main APIs
  let configFile: string = config.get('SYRUP_API_CONFIG_FILE') || apiConfigFileName;
  log.info(`SYRUP: Loading user APIs...`);
  err = flagpole.loadAPIConfig(configFile);
  if (err) {
    log.error(err);
    log.error('Exiting...');
    process.exit(1);
  }

  // Start processing requests
  serverRestify.listen(port, () => {
    log.info(`SYRUP: '${serverRestify.name}' listening on port ${port}...`);
  });


  /****************************************************************************
   **                                                                        **
   ** LATCHKEY                                                               **
   **                                                                        **
   ****************************************************************************/

  let addressLatchkey: string, portLatchkey: number;
  let accountEmail: string, accountPassword: string;
  if (!opts || !opts.skipAuth) {
    if (opts && opts.selfAuth) {
      addressLatchkey = 'localhost';
      portLatchkey = port;
    }
    else {
      addressLatchkey = config.get('LATCHKEY_ADDRESS');
      portLatchkey = config.get('LATCHKEY_PORT');
    }
    accountEmail = config.get('LATCHKEY_ACCOUNT_EMAIL');
    accountPassword = config.get('LATCHKEY_ACCOUNT_PASSWORD');
    let latchkey = new LatchkeyClient(addressLatchkey, portLatchkey);
    [err, token] = await grab(latchkey.createToken(accountEmail, accountPassword));
    if (err) {
      log.error(`SYRUP: Could not create auth token. ${err.status} ${err.reason}`);
    }
  }
  else {
    log.info(`SYRUP: Skipping creation of auth token per configuration.`);
  }


  /****************************************************************************
   **                                                                        **
   ** PITBOSS                                                                **
   **                                                                        **
   ****************************************************************************/

  let usePitboss = opts ? opts.usePitboss : true;
  if (usePitboss === undefined) {
    usePitboss = config.get('USE_PITBOSS');
  }
  if (usePitboss === undefined) {
    usePitboss = true;
  }
  if (true === usePitboss) {
    if (!token || !token.valid) {
      log.info('SYRUP: Skipping registration with Pitboss due to missing or invalid auth token.');
    }
    else {
      log.info(`SYRUP: Registering with Pitboss...`);
      pitboss.connectWithConfig(config, token, function connectOnce() {
        pitboss.registerWithServer(serverName, undefined, port);
        pitboss.removeListener('connect', connectOnce);
      });
    }
  }

}
