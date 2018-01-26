/****************************************************************************
 **                                                                        **
 ** Modules                                                                **
 **                                                                        **
 ****************************************************************************/

import path              = require('path');
import fs                = require('fs');
import _                 = require('lodash');
import semver            = require('semver');
import { PancakeError }    from '../util/pancake-err';
import { Configuration }   from '../util/pancake-config';
import { EndpointInfo,
         EndpointResponse,
         EndpointHandler } from './apitypes';
import utils             = require('../util/pancake-utils');
const  log               = utils.log;

// Transports
import { Transport }           from './transport';
import { TransportREST }       from './REST';
import { TransportSocketIO }   from './websockets';


/*********************************************a*******************************
 **                                                                        **
 ** Vars & definitions                                                     **
 **                                                                        **
 ****************************************************************************/

export interface FlagpoleOpts {
  envName?:       string,
  apiSearchDirs?: string
}

interface _ApiInfo {
  name:            string,
  descriptiveName: string,
  description:     string,
  ver:             string,
  apiHandler:      any,
  apiToken:        string,
  fileName:        string
}


/****************************************************************************
 **                                                                        **
 ** class Flagpole                                                         **
 **                                                                        **
 ****************************************************************************/

export class Flagpole
{
  // Member data
  private _envName: string;
  private _apiSearchDirs: string[] = [];
  private _registeredAPIsByToken   = new Map<string, _ApiInfo>();

  // Transports
  private _transports: Transport[] = [];


  /****************************************************************************
   **                                                                        **
   ** PRIVATE _registerAPIDirect(...)                                        **
   **                                                                        **
   ****************************************************************************/

  private _registerAPIDirect(name:            string,
                             descriptiveName: string,        // opt
                             description:     string,        // opt
                             ver:             string,
                             apiHandler:      any,
                             fileName?:       string,        // opt
                             config?:         Configuration) : PancakeError // opt
  {
    // Simple validation
    if (!this._transports.length) {
      log.trace('FP: ERR_TRANSPORT_NOT_INIT');
      return new PancakeError('ERR_TRANSPORT_NOT_INIT');
    }
    if (!name || !ver || !apiHandler) {
      log.trace('FP: ERR_BAD_ARG');
      return new PancakeError('ERR_BAD_ARG');
    }

    // Validate version format
    if (!semver.valid(ver)) {
      log.trace('FP: ERR_BAD_ARG: Invalid version format');
      return new PancakeError('ERR_BAD_ARG', 'Invalid version format');
    }
    ver = semver.clean(ver);

    // Create our new API token
    name = _.toLower(_.trim(name));
    var apiToken = name + ':' + _.trim(ver);

    // Has this API already been registered?
    if (this._registeredAPIsByToken.get(apiToken)) {

      // Unregister what's currently there
      this.unregisterAPI(apiToken);
      log.trace('FP: Overwriting api %s', apiToken);
    }

    let newAPI: _ApiInfo = {
      name,
      descriptiveName,
      description,
      ver,
      apiHandler,
      apiToken,
      fileName
    };
    let endpointInfo: EndpointInfo;

    try {
      // Register the routes
      // newApi.apiHandler.flagpoleHandlers is an array of EndpointInfos
      newAPI.apiHandler.flagpoleHandlers.forEach((endpointInfo: EndpointInfo) => {

        // Set it up
        for (let transport of this._transports) {
          transport.registerAPIEndpoint(name, ver, apiToken, endpointInfo);
        }
      });
    }
    catch (error) {
      if (error instanceof PancakeError) {
        return error;
      }
      log.trace(`FP: ERR_REGISTER_ROUTE: Could not register route: "${endpointInfo.requestType}", "${endpointInfo.path}", ${newAPI.ver}`);
      return new PancakeError('ERR_REGISTER_ROUTE', `Could not register route: "${endpointInfo.requestType}", "${endpointInfo.path}", ${newAPI.ver}`, error);
    }

    // Add to the main API collection
    this._registeredAPIsByToken.set(apiToken, newAPI);
    log.info(`FP: New API "${apiToken}" registered.`);

    // Let the API know
    if (newAPI.apiHandler.initializeAPI) {
      log.trace(`FP: Calling API initializer`);
      newAPI.apiHandler.initializeAPI(config, name, ver, apiToken);
    }
  }


  /****************************************************************************
   **                                                                        **
   ** PRIVATE _registerAPIFromFile(...)                                      **
   **                                                                        **
   ****************************************************************************/

  private _registerAPIFromFile(name: string,
                               descriptiveName: string,
                               description: string,
                               ver: string,
                               fileName: string) : PancakeError
  {
    // Simple validation
    if (!this._transports.length) {
      log.trace('FP: ERR_TRANSPORT_NOT_INIT');
      return new PancakeError('ERR_TRANSPORT_NOT_INIT');
    }
    if (!name || !ver) {
      log.trace(`FP: ERR_BAD_ARG`);
      return new PancakeError('ERR_BAD_ARG');
    }

    // Try to load up the file
    let newAPI: any;
    let err: any;
    this._apiSearchDirs.find((apiDir) => {

      // Search through each api dir
      let safeFileName = utils.buildSafeFileName(fileName, apiDir);
      if (fs.existsSync(safeFileName)) {
        try {
          // Load it...
          newAPI = require(safeFileName);

          // Look for a configuration file, if it exists
          let config: Configuration;
          let configFile = path.dirname(safeFileName) + path.sep + path.basename(safeFileName, path.extname(safeFileName));
          configFile += '.config.json';
          if (fs.existsSync(configFile)) {
            config = new Configuration(configFile, this._envName);
          }

          // ... and register it
          err = this._registerAPIDirect(name, descriptiveName, description, ver, newAPI, safeFileName, config);

        // Swallow the exception
        } catch(error) {
          err = error;
        }
        return true;
      }
    });

    // No dice
    if (!newAPI) {
      log.trace(`FP: ERR_FILE_LOAD: Could not load API file ${fileName}`, err);
      return new PancakeError('ERR_FILE_LOAD', `Could not load API file ${fileName}`, err);
    }
  }


  /****************************************************************************
   **                                                                        **
   ** PRIVATE _unregisterAPIInfo(...)                                        **
   **                                                                        **
   ****************************************************************************/

  private _unregisterAPIInfo(apiUnregInfo: _ApiInfo) : void
  {
    // Iterate over each route and remove
    apiUnregInfo.apiHandler.flagpoleHandlers.forEach((endpointInfo: EndpointInfo) => {

      // Unregister the route
      for (let transport of this._transports) {
        transport.unregisterAPIEndpoint(apiUnregInfo.name, apiUnregInfo.ver, apiUnregInfo.apiToken, endpointInfo);
      }
    });
  }


  /****************************************************************************
   **                                                                        **
   ** PRIVATE _unregisterAllAPIs(...)                                        **
   **                                                                        **
   ****************************************************************************/

  private _unregisterAllAPIs() : void
  {
    this._registeredAPIsByToken.forEach((apiInfo: _ApiInfo) => {

      // Remove routes
      this._unregisterAPIInfo(apiInfo);

      // Unload modules from the cache
      if (apiInfo.fileName) {
        delete require.cache[require.resolve(apiInfo.fileName)];
        log.trace(`FP: Removed module (${apiInfo.fileName}) from Node cache.`);
      }

      // Let the API know
      if (apiInfo.apiHandler.terminate) {
        log.trace(`FP: Calling API terminator`);
        apiInfo.apiHandler.terminate();
      }
    });

    // Wipe the collection
    this._registeredAPIsByToken.clear();
    log.trace(`FP: All APIs unregistered.`);
  }


  /****************************************************************************
   **                                                                        **
   ** PUBLIC init(server: Required, Restify server instance)                 **
   **                                                                        **
   ****************************************************************************/

  initialize(serverRestify: any, serverSocketIO: any, opts: FlagpoleOpts) : void
  {
    // Initialize our REST transport
    let transportREST = new TransportREST();
    transportREST.initialize({
      serverRestify,
      envName: opts.envName
    });
    this._transports.push(transportREST);

    // Initialize our SocketIO transport
    let transportSocketIO = new TransportSocketIO();
    transportSocketIO.initialize({
      serverSocketIO,
      envName: opts.envName
    });
    this._transports.push(transportSocketIO);

    // API dirs
    if (opts && opts.apiSearchDirs) {
      opts.apiSearchDirs.split(path.delimiter).forEach((dir) => {
        this._apiSearchDirs.push(path.resolve(dir) + path.sep);
      });
    }
    else {
      this._apiSearchDirs = [ '.' + path.sep ];
    }
  }


  /****************************************************************************
   **                                                                        **
   ** PUBLIC registerAPI(...)                                                **
   **                                                                        **
   ****************************************************************************/

  registerAPI(name: string,
              descriptiveName: string,
              description: string,
              ver: string,
              pathOrHandler: any) : PancakeError
  {
    let typePathOrHandler: string = typeof pathOrHandler;
    if (typePathOrHandler === 'object') {
      return this._registerAPIDirect(name, descriptiveName, description, ver, pathOrHandler);
    }
    else if (typePathOrHandler === 'string'){
      return this._registerAPIFromFile(name, descriptiveName, description, ver, pathOrHandler);
    }
    return new PancakeError('ERR_BAD_ARG', 'FP: Must provide filename or handler to registerAPI.');
  }


  /****************************************************************************
   **                                                                        **
   ** PUBLIC unregisterAPI(...)                                              **
   **                                                                        **
   ****************************************************************************/

  unregisterAPI(nameOrToken: string, ver?: string) : PancakeError
  {
    let found: boolean = false;

    // Simple validation
    if (!this._transports.length) {
      log.trace('FP: ERR_TRANSPORT_NOT_INIT');
      return new PancakeError('ERR_TRANSPORT_NOT_INIT');
    }

    // No args means wipe them all out
    if (!nameOrToken && !ver) {
      this._unregisterAllAPIs();
      return;
    }

    // Move through the map and process each item
    this._registeredAPIsByToken = utils.filterMap(this._registeredAPIsByToken, (apiToken: string, apiInfo: _ApiInfo) => {

      // If a version was specified, nameOrToken is a name and only the
      // specified version should be removed
      if ((ver && apiInfo.name === nameOrToken && apiInfo.ver === ver) ||

          // If a version was NOT specified and the tokens match, that's our target
          (!ver && apiInfo.apiToken === nameOrToken) ||

          // If a version was NOT specified and the names match, we want to
          // remove ALL versions of this API, including this one
          (!ver && apiInfo.name === nameOrToken)) {

        // Out with the routes, remove from the cache, and keep out of map
        this._unregisterAPIInfo(apiInfo);
        if (apiInfo.fileName) {
          delete require.cache[require.resolve(apiInfo.fileName)];
          log.trace(`FP: Removed module (${apiInfo.fileName}) from Node cache.`);
        }
        found = true;
        return false;
      }

      // Keep in the map
      return true;
    });

    // Was it found?
    if (!found) {
      log.trace(`FP: ERR_API_NOT_FOUND: Could not find API (${nameOrToken}, ${ver}) to unregister.`);
      return new PancakeError('ERR_API_NOT_FOUND');
    }
    else {
      log.trace(`FP: API (${nameOrToken}, ${ver}) successfully unregistered.`);
    }
  }


  /****************************************************************************
   **                                                                        **
   ** PUBLIC loadAPIConfig(...)                                              **
   **                                                                        **
   ****************************************************************************/

  loadAPIConfig(configFile: string) : PancakeError
  {
    // Simple validation
    if (!this._transports.length) {
      log.trace('FP: ERR_TRANSPORT_NOT_INIT');
      return new PancakeError('ERR_TRANSPORT_NOT_INIT');
    }
    if (!configFile) {
      log.trace(`FP: ERR_NO_CONFIG_FILE`);
      return new PancakeError('ERR_NO_CONFIG_FILE');
    }

    // Load up the file
    let config: any;
    let err: any;
    let safeFileName: string;
    this._apiSearchDirs.find((apiDir: string) => {

      // Search through each api dir
      safeFileName = utils.buildSafeFileName(configFile, apiDir);
      if (fs.existsSync(safeFileName)) {
        try {
          config = require(safeFileName);
          log.trace(`FP: Loading API config file (${safeFileName})...`);
        } catch(error) {
          err = error;
        }
        return true;
      }
    });
    if (!config) {
      log.trace(`FP: ERR_FILE_LOAD: Could not load API config file (${configFile})`);
      if (err) log.trace(err);
      return new PancakeError('ERR_FILE_LOAD', `Could not load API config file (${configFile})`, err);
    }

    // Now process the config data
    err = undefined;
    try {
      let apis = config.apis;

      // Process each api in return
      apis.forEach((api: any) => {
        if (api.versions && !err) {
          api.versions.forEach((ver: any) => {
            if (!err) {
              err = this.registerAPI(api.name, api.descriptiveName, api.description, ver.ver, ver.fileName);
            }
          });
        }
      });
    } catch(error) {
      log.trace(`FP: ERR_CONFIG: Could not process config file.`);
      log.trace(error);
      return new PancakeError('ERR_CONFIG', 'Could not process config file.', error);
    }
    return err;
  }


  /****************************************************************************
   **                                                                        **
   ** PUBLIC queryAPIs(...)                                                  **
   **                                                                        **
   ****************************************************************************/

  queryAPIs() : object[]
  {
    let apis: object[] = [];

    this._registeredAPIsByToken.forEach((newAPI: _ApiInfo) => {
      apis.push(_.pick(newAPI, [
        'name',
        'descriptiveName',
        'description',
        'ver',
        'apiToken',
        'fileName'
      ]));
    });

    log.trace(`FP: Returned list of APIs.`);
    return apis;
  }

} // END class Flagpole


// THE flagpole singleton
export let flagpole: Flagpole;
if (!flagpole) {
  flagpole = new Flagpole();
}
