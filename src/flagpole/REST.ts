/****************************************************************************
 **                                                                        **
 ** Modules                                                                **
 **                                                                        **
 ****************************************************************************/

import _              = require('lodash');
import { Token }           from '../util/tokens';
import { PancakeError }    from '../util/pancake-err';
import { IEndpointInfo,
         IEndpointResponse,
         EndpointHandler } from './apitypes';
import { ITransport }      from './transport';
import utils          = require('../util/pancake-utils');
const  log            = utils.log;


/****************************************************************************
 **                                                                        **
 ** class TransportREST                                                    **
 **                                                                        **
 ****************************************************************************/

export class TransportREST implements ITransport
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


  // registerAPIEndpoint(name:string, ver: string, apiToken: string, endpointInfo: any) : PancakeError
  // instanceInfo {
  //   IN requestType = 'get', 'post', 'put', 'patch', etc.
  //   IN path = API URL
  //   IN handler
  //   OUT route
  // }

  registerAPIEndpoint(name:string, ver: string, apiToken:string, endpointInfo: IEndpointInfo) : PancakeError
  {
    if (endpointInfo.requestType && endpointInfo.path) {

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
            let apiRes: IEndpointResponse;
            try {
                let xauth = req.headers['x-auth'];
                let token = xauth ? new Token(xauth) : undefined;
                let payload = this._buildPayload(req);
                apiRes = await endpointInfo.handler(payload, token, req.headers);
                if (apiRes.header && apiRes.header.name && apiRes.header.data) {
                  res.header(apiRes.header.name, apiRes.header.data);
                }
                if (!apiRes.err) {
                  res.send(apiRes.status, apiRes.result);
                }
                return next(apiRes.err)
            }
            catch (err) {
              log.error('FP: Unexpected exception. (REST)', err)
              return next(err);
            }
          });
          // log.trace(`FP: Registered route (${endpointInfo.path}, ${ver})`);
        }
      }
      else {
        log.trace(`FP: ERR_REGISTER_ROUTE: Bad request type: "${endpointInfo.requestType}"`);
        throw new PancakeError('ERR_REGISTER_ROUTE', `Bad request type: "${endpointInfo.requestType}"`);
      }
    }
    return;
  }


  // unregisterAPIEndpoint(name: string, ver: string, apiToken: string, endpointInfo: any) : PancakeError
  // instanceInfo {
  //   IN route
  // }

  unregisterAPIEndpoint(name: string, ver: string, apiToken: string, endpointInfo: IEndpointInfo) : PancakeError
  {
    // Unregister the route
    this._serverRestify.rm(endpointInfo.route);
    log.trace(`FP: Unregistered route (${endpointInfo.route})`);
    endpointInfo.route = undefined;
    return;
  }
}
