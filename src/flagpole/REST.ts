/****************************************************************************
 **                                                                        **
 ** Modules                                                                **
 **                                                                        **
 ****************************************************************************/

import _              = require('lodash');
import { PancakeError }    from '../util/pancake-err';
import { EndpointResponse,
         EndpointHandler } from './apitypes';
import { Transport }       from './transport';
import utils          = require('../util/pancake-utils');
const  log            = utils.log;


/****************************************************************************
 **                                                                        **
 ** class TransportREST                                                    **
 **                                                                        **
 ****************************************************************************/

export class TransportREST implements Transport
{
  private _serverRestify: any;
  private _envName: string;
  private _requestTypes = new Map<string, Function>();


  private _buildPayload(req: any)
  {
    let payload = req.body ? req.body : { };
    Object.assign(payload, req.query, req.params);
    return payload;
  }


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


  // registerAPIInstance(name:string, ver: any, endpointInfo: any) : PancakeError
  // instanceInfo {
  //   IN requestType = 'get', 'post', 'put', 'patch', etc.
  //   IN path = API URL
  //   IN handler
  //   OUT route
  // }

  registerAPIInstance(name:string, ver: any, endpointInfo: any) : PancakeError
  {
    // Validate requestType
    let httpRequestType = _.toLower(_.trim(endpointInfo.requestType));
    if (httpRequestType.match('get|post|put|patch|del|opts')) {

      // Register the route
      let funcRequestHandler = this._requestTypes.get(httpRequestType);
      if (funcRequestHandler) {
        endpointInfo.route = funcRequestHandler.call(this._serverRestify, {
          path: endpointInfo.path,
          version: ver
        },

        // Wrapper function
        async (req: any, res: any, next: Function) : Promise<any> => {
          let apiRes: EndpointResponse;
          try {
              let payload = this._buildPayload(req);
              apiRes = await endpointInfo.handler(payload);
              res.send(apiRes.status, apiRes.result);
              return next(apiRes.err)
          }
          catch (err) {
            log.error('FP: Unexpected exception.', err)
            return next(err);
          }
        });
        log.trace(`FP: Registered route (${endpointInfo.path}, ${ver})`);
      }
    }
    else {
      log.trace(`FP: ERR_REGISTER_ROUTE: Bad request type: "${endpointInfo.requestType}"`);
      throw new PancakeError('ERR_REGISTER_ROUTE', `Bad request type: "${endpointInfo.requestType}"`);
    }
    return;
  }


  // unregisterAPIInstance(name: string, ver: string, endpointInfo: any) : PancakeError
  // instanceInfo {
  //   IN route
  // }

  unregisterAPIInstance(name: string, ver: string, endpointInfo: any) : PancakeError
  {
    // Unregister the route
    this._serverRestify.rm(endpointInfo.route);
    log.trace(`FP: Unregistered route (${endpointInfo.route})`);
    endpointInfo.route = undefined;
    return;
  }
}
