/****************************************************************************
 **                                                                        **
 ** Modules                                                                **
 **                                                                        **
 ****************************************************************************/

import { EventEmitter }    from 'events';
import path              = require('path');
import fs                = require('fs');
import _                 = require('lodash');
import semver            = require('semver');
import { PancakeError }    from '../util/pancake-err';
import { Configuration }   from '../util/pancake-config';
import { IEndpointInfo,
         IEndpointResponse,
         EndpointHandler } from './apitypes';
import { Token }           from '../util/tokens';
import utils             = require('../util/pancake-utils');
const  log               = utils.log;

// Transports
import { ITransport }          from './transport';
import { TransportREST }       from './REST';
import { TransportSocketIO }   from './websockets';


/*********************************************a*******************************
 **                                                                        **
 ** Vars & definitions                                                     **
 **                                                                        **
 ****************************************************************************/

export interface IFlagpoleOpts {
  envName?:             string,
  apiSearchDirs?:       string,
  serverEventsSource?:  EventEmitter,
  initEventsSink?:      EventEmitter
}

interface _IApiInfo {
  name:             string,
  description?:     string,
  ver:              string,
  apiHandler:       any,
  apiToken:         string,
  metaTags?:        any,
  fileName?:        string
}


/****************************************************************************
 **                                                                        **
 ** class Flagpole                                                         **
 **                                                                        **
 ****************************************************************************/

export class Flagpole extends EventEmitter
{
  // Member data
  private _lastError: any;
  private _envName: string;
  private _apiSearchDirs: string[] = [];
  private _registeredAPIsByToken   = new Map<string, _IApiInfo>();
  private _opts: IFlagpoleOpts;
  private _authToken: Token;

  // Transports
  private _transports: ITransport[] = [];


  /****************************************************************************
   **                                                                        **
   ** Private methods                                                        **
   **                                                                        **
   ****************************************************************************/

  private _processError(status: string, reason?: string, obj?: any, logError: boolean = true) : PancakeError
  {
    this._lastError = new PancakeError(status, reason, obj);
    if (true === logError) {
      log.trace(`FP: ${status}: ${reason}`);
      if (obj) log.trace(obj);
    }
    return this._lastError;
  }


  private _registerAPIDirect(name:            string,
                             description:     string,        // opt
                             ver:             string,
                             apiHandler:      any,
                             fileName?:       string,        // opt
                             config?:         Configuration, // opt
                             opts?:           any) : PancakeError // opt
  {
    // Simple validation
    if (!this._transports.length) {
      return this._processError('ERR_TRANSPORT_NOT_INIT');
    }
    if (!name || !ver || !apiHandler) {
      return this._processError('ERR_BAD_ARG');
    }

    // Validate version format
    if (!semver.valid(ver)) {
      return this._processError('ERR_BAD_ARG', 'Invalid version format');
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

    let newAPI: _IApiInfo = {
      name,
      description,
      ver,
      apiHandler,
      apiToken,
      fileName,
      metaTags: (opts && opts.metaTags) ? opts.metaTags : undefined
    };
    let endpointInfo: IEndpointInfo;

    try {
      // Register the routes
      // newApi.apiHandler.flagpoleHandlers is an array of EndpointInfos
      newAPI.apiHandler.flagpoleHandlers.forEach((endpointInfo: IEndpointInfo) => {

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
      return this._processError('ERR_REGISTER_ROUTE', `Could not register route: '${endpointInfo.requestType}', '${endpointInfo.path}', ${newAPI.ver}`, error);
    }

    // Add to the main API collection
    this._registeredAPIsByToken.set(apiToken, newAPI);
    log.info(`FP: New API '${apiToken}' registered.`);

    // Let the API know
    if (newAPI.apiHandler.initializeAPI) {
      log.trace(`FP: Calling API initializer`);
      let err = newAPI.apiHandler.initializeAPI(name, ver, apiToken, config, this._opts);
      if (err) {
        return this._processError('ERR_INIT_API', `Encountered fatal error initializing API '${name}'`, err);
      }
    }
    for (let transport of this._transports) {
      if (transport.registerAPI) {
        let err = transport.registerAPI(newAPI.apiHandler);
        if (err) {
          return this._processError('ERR_INIT_API', `Enountered fatal error initializing transport for API '${name}'`, err);
        }
      }
    }
  }


  private _registerAPIFromFile(name: string,
                               description: string,
                               ver: string,
                               fileName: string,
                               opts?: any) : PancakeError
  {
    // Simple validation
    if (!this._transports.length) {
      return this._processError('ERR_TRANSPORT_NOT_INIT');
    }
    if (!name || !ver) {
      return this._processError('ERR_BAD_ARG');
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
          err = this._registerAPIDirect(name, description, ver, newAPI, safeFileName, config, opts);

        // Swallow the exception
        }
        catch(error) {
          err = error;
        }
        return true;
      }
    });

    // No dice
    if (!newAPI) {
      return this._processError('ERR_FILE_LOAD', `Could not load API file ${fileName}`, err);
    }
  }


  private _unregisterAPIInfo(apiUnregInfo: _IApiInfo) : void
  {
    // Iterate over each route and remove
    apiUnregInfo.apiHandler.flagpoleHandlers.forEach((endpointInfo: IEndpointInfo) => {

      // Unregister the route
      for (let transport of this._transports) {
        transport.unregisterAPIEndpoint(apiUnregInfo.name, apiUnregInfo.ver, apiUnregInfo.apiToken, endpointInfo);
      }
    });
  }


  private _unregisterAllAPIs() : void
  {
    this._registeredAPIsByToken.forEach((apiInfo: _IApiInfo) => {

      // Remove routes
      this._unregisterAPIInfo(apiInfo);

      // Let the transports know
      for (let transport of this._transports) {
        if (transport.unregisterAPI) {
          transport.unregisterAPI(apiInfo.apiHandler);
        }
      }

      // Let the API know
      if (apiInfo.apiHandler.terminateAPI) {
        log.trace(`FP: Calling API terminator`);
        apiInfo.apiHandler.terminateAPI();
      }

      // Unload modules from the cache
      if (apiInfo.fileName) {
        delete require.cache[require.resolve(apiInfo.fileName)];
        log.trace(`FP: Removed module (${apiInfo.fileName}) from Node cache.`);
      }
    });

    // Wipe the collection
    this._registeredAPIsByToken.clear();
    log.trace(`FP: All APIs unregistered.`);
  }


  /****************************************************************************
   **                                                                        **
   ** Public methods                                                         **
   **                                                                        **
   ****************************************************************************/

  initialize(serverRestify: any, serverSocketIO: any, opts: IFlagpoleOpts) : void
  {
    // Remember our opts
    this._opts = opts ? opts : {};
    this._opts.initEventsSink = this;

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


  set authToken(token: Token)
  {
    this._authToken = token;
    this._registeredAPIsByToken.forEach((api: _IApiInfo) => {
      if (api.apiHandler.onAuthToken) {
        api.apiHandler.onAuthToken(token);
      }
    });
  }


  registerAPI(name: string,
              description: string,
              ver: string,
              pathOrHandler: any,
              opts?: any) : PancakeError
  {
    let typePathOrHandler: string = typeof pathOrHandler;
    if (typePathOrHandler === 'object') {
      return this._registerAPIDirect(name, description, ver, pathOrHandler, undefined, opts);
    }
    else if (typePathOrHandler === 'string'){
      return this._registerAPIFromFile(name, description, ver, pathOrHandler, opts);
    }
    return this._processError('ERR_BAD_ARG', 'FP: Must provide filename or handler to registerAPI.');
  }


  unregisterAPI(nameOrToken: string, ver?: string) : PancakeError
  {
    let found: boolean = false;

    // Simple validation
    if (!this._transports.length) {
      return this._processError('ERR_TRANSPORT_NOT_INIT');
    }

    // No args means wipe them all out
    if (!nameOrToken && !ver) {
      this._unregisterAllAPIs();
      return;
    }

    // Move through the map and process each item
    this._registeredAPIsByToken = utils.filterMap(this._registeredAPIsByToken, (apiToken: string, apiInfo: _IApiInfo) => {

      // If a version was specified, nameOrToken is a name and only the
      // specified version should be removed
      if ((ver && apiInfo.name === nameOrToken && apiInfo.ver === ver) ||

          // If a version was NOT specified and the tokens match, that's our target
          (!ver && apiInfo.apiToken === nameOrToken) ||

          // If a version was NOT specified and the names match, we want to
          // remove ALL versions of this API, including this one
          (!ver && apiInfo.name === nameOrToken)) {

        // Out with the routes
        this._unregisterAPIInfo(apiInfo);

        // Let the transports know
        for (let transport of this._transports) {
          if (transport.unregisterAPI) {
            transport.unregisterAPI(apiInfo.apiHandler);
          }
        }

        // Let the API know
        if (apiInfo.apiHandler.terminateAPI) {
          log.trace(`FP: Calling API terminator`);
          apiInfo.apiHandler.terminateAPI();
        }

        // Unload modules from the cache
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
      return this._processError('ERR_API_NOT_FOUND');
    }
    else {
      log.trace(`FP: API (${nameOrToken}, ${ver}) successfully unregistered.`);
    }
  }


  loadAPIConfig(configFile: string) : PancakeError
  {
    let err: any;

    // Simple validation
    if (!this._transports.length) {
      return this._processError('ERR_TRANSPORT_NOT_INIT');
    }
    if (!configFile) {
      return this._processError('ERR_NO_CONFIG_FILE');
    }

    // Load up the file
    let config: any;
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
      return this._processError('ERR_FILE_LOAD', `Could not load API config file (${configFile})`, err);
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
              err = this.registerAPI(api.name, api.description, ver.ver, ver.fileName, { metaTags: api.metaTags});
            }
          });
        }
      });
    } catch(error) {
      return this._processError('ERR_CONFIG', 'Could not process config file.', error);
    }

    return err;
  }


  queryAPIs() : any[]
  {
    let apis: Map<string, any> = new Map<string, any>();
    let returnItems: any[] = [];

    // TRANSFORM #1
    // Copy into intermmediate data structure
    this._registeredAPIsByToken.forEach((newAPI: _IApiInfo) => {
      let api = apis.get(newAPI.name);
      if (!api) {
        api = { name: newAPI.name, description: newAPI.description, metaTags: newAPI.metaTags, versions: [] };
        apis.set(api.name, api);
      }
      api.versions.push(newAPI.ver);
    });

    // TRANSFORM #2
    // Now feed into the return array
    apis.forEach((api: any) => {
      returnItems.push(api);
    });

    log.trace(`FP: Returned list of APIs.`);
    return returnItems;
  }

} // END class Flagpole


// THE flagpole singleton
export let flagpole: Flagpole;
if (!flagpole) {
  flagpole = new Flagpole();
}
