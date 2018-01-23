import _              = require('lodash');
import { PancakeError } from '../util/pancake-err';
import { Transport }    from './transport';
import utils          = require('../util/pancake-utils');
const  log            = utils.log;

/*
export class transportREST implements Transport
{
  private _serverRestify: any;
  private _envName: string;
  private _requestTypes = new Map<string, Function>();


  // initialize(initInfo: any) : void
  // initInfo {
  //   IN server = Restify server
  //   IN envName = current execution environment
  // }

  initialize(initInfo: any) : void
  {
    this._serverRestify = initInfo.serverRestify;

    // Simple validation
    if (!this._serverRestify) {
      log.trace(`FP: ERR_BAD_ARG: Restify server instance not provided`);
      throw new PancakeError('ERR_BAD_ARG');
    }
    if (initInfo.envName) this._envName = initInfo.envName;

    // Set it all up
    this._requestTypes.set('get',   this._serverRestify.get);
    this._requestTypes.set('post',  this._serverRestify.post);
    this._requestTypes.set('put',   this._serverRestify.put);
    this._requestTypes.set('patch', this._serverRestify.patch);
    this._requestTypes.set('del',   this._serverRestify.del);
    this._requestTypes.set('opts',  this._serverRestify.opts);
  }


  // registerAPIInstance(name:string, ver: any, instanceInfo: any) : PancakeError
  // instanceInfo {
  //   IN requestType = 'get', 'post', 'put', 'patch', etc.
  //   IN path = API URL
  //   IN handler
  //   OUT route
  // }

  registerAPIInstance(name:string, ver: any, instanceInfo: any) : PancakeError
  {
    // Validate requestType
    let httpRequestType = _.toLower(_.trim(instanceInfo.requestType));
    if (httpRequestType.match('get|post|put|patch|del|opts')) {

      // Register the route
      let funcRequestHandler = this._requestTypes.get(httpRequestType);
      if (funcRequestHandler) {
        instanceInfo.route = funcRequestHandler.call(this._serverRestify, {
          path: instanceInfo.path,
          version: ver
        },
        instanceInfo.handler);
        log.trace(`FP: Registered route (${instanceInfo.path}, ${ver})`);
      }
    }
    else {
      log.trace(`FP: ERR_REGISTER_ROUTE: Bad request type: "${instanceInfo.requestType}"`);
      throw new PancakeError('ERR_REGISTER_ROUTE', `Bad request type: "${instanceInfo.requestType}"`);
    }
    return;
  }


  // unregisterAPIInstance(name: string, ver: string, instanceInfo: any) : PancakeError
  // instanceInfo {
  //   IN route
  // }

  unregisterAPIInstance(name: string, ver: string, instanceInfo: any) : PancakeError
  {
    // Unregister the route
    this._serverRestify.rm(instanceInfo.route);
    log.trace(`FP: Unregistered route (${instanceInfo.route})`);
    instanceInfo.route = undefined;
    return;
  }
}


/*
  FOR NEST
  initInfo {
    IN server = Restify server
    IN envName
  }

  FOR WEBSOCKET
  instanceInfo {
    IN server = Socket.io instance
    IN envName
  }

  function initialize(initInfo) : PancakeError


  FOR NEST
  instanceInfo {
    IN requestType = 'get', 'post', 'put', 'patch', etc.
    IN path = API route
    IN handler
    OUT route
  }

  FOR WEBSOCKET
  instanceInfo {
    IN eventName
  }

  function registerAPIInstance(name, ver, instanceInfo) : PancakeError


  FOR NEST
  instanceInfo {
    IN route
  }

  FOR WEBSOCKET
  instanceInfo {
    IN eventName
  }

  function unregisterAPIInstance(name, ver, instanceInfo) : PancakeError


  *******************************************************************************
_registerAPIDIrect
NEST SPECIFIC
     START PROCESS TRANSPORT REGISTRATION -----
        // Validate requestType
        var httpRequestType = _.toLower(_.trim(pathInfo.requestType));
        if (httpRequestType.match('get|post|put|patch|del|opts')) {

          // Register the route
          var funcRequestHandler = this._requestTypes.get(httpRequestType);
          if (funcRequestHandler) {
            pathInfo.route = funcRequestHandler.call(this._serverRestify, {
              path: pathInfo.path,
              version: newAPI.ver
            },
            pathInfo.handler);
            log.trace(`FP: Registered route (${pathInfo.path}, ${newAPI.ver})`);
          }
        }
      STOP PROCESS TRANSPORT REGISTRATION -----


*******************************************************************************

  private _unregisterAPIInfo(apiUnregInfo: _ApiInfo) : void
  NEST SPECIFIC
       START PROCESS TRANSPORT REGISTRATION -----
  {
    // Iterate over each route and remove
    apiUnregInfo.apiHandler.flagpoleHandlers.forEach((pathInfo: _PathInfo) => {

      // Unregister the route
      this._serverRestify.rm(pathInfo.route);
      log.trace(`FP: Unregistered route (${pathInfo.route})`);
      pathInfo.route = undefined;
    });
    STOP PROCESS TRANSPORT REGISTRATION -----


********************************************************************************
  private _unregisterAllAPIs() : void
NEST SPECIFIC
     START PROCESS TRANSPORT REGISTRATION -----
      // Remove routes
      this._unregisterAPIInfo(apiInfo);
      STOP PROCESS TRANSPORT REGISTRATION -----

*******************************************************************************

  initialize(server: any, opts: FlagpoleOpts) : void
  NEST SPECIFIC
       START PROCESS TRANSPORT REGISTRATION -----
    // Set it all up
    this._serverRestify = server;
    this._requestTypes.set('get',   this._serverRestify.get);
    this._requestTypes.set('post',  this._serverRestify.post);
    this._requestTypes.set('put',   this._serverRestify.put);
    this._requestTypes.set('patch', this._serverRestify.patch);
    this._requestTypes.set('del',   this._serverRestify.del);
    this._requestTypes.set('opts',  this._serverRestify.opts);
    STOP PROCESS TRANSPORT REGISTRATION -----

*/
