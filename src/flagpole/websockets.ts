/****************************************************************************
 **                                                                        **
 ** Modules                                                                **
 **                                                                        **
 ****************************************************************************/

// import socketIO       = require('socket.io');
// import _              = require('lodash');
import { PancakeError }    from '../util/pancake-err';
import { EndpointInfo,
         EndpointResponse,
         EndpointHandler } from './apitypes';
import { Transport }       from './transport';
import utils          = require('../util/pancake-utils');
const  log            = utils.log;


/****************************************************************************
 **                                                                        **
 ** Vars & definitions                                                     **
 **                                                                        **
 ****************************************************************************/


/****************************************************************************
 **                                                                        **
 ** class TransportSocketIO                                                **
 **                                                                        **
 ****************************************************************************/

export class TransportSocketIO implements Transport
{
  private _serverSocketIO: any;
  private _envName: string;


  // initialize(initInfo: any) : void
  // instanceInfo {
  //   IN server = Socket.io instance
  //   IN envName
  // }

  initialize(initInfo: any) : void
  {
    this._serverSocketIO = initInfo.serverSocketIO;

    // Simple validation
    if (!this._serverSocketIO) {
      log.trace(`FP: ERR_BAD_ARG: Socket.IO server instance not provided`);
      throw new PancakeError('ERR_BAD_ARG');
    }
    if (initInfo.envName) this._envName = initInfo.envName;
  }


  // registerAPIInstance(name:string, ver: any, endpointInfo: any) : PancakeError
  // instanceInfo {
  //   IN eventName
  // }

  registerAPIInstance(name:string, ver: string, endpointInfo: EndpointInfo) : PancakeError
  {
    return;
  }


  // unregisterAPIInstance(name: string, ver: string, endpointInfo: any) : PancakeError
  // instanceInfo {
  //   IN eventName
  // }

  unregisterAPIInstance(name: string, ver: string, endpointInfo: EndpointInfo) : PancakeError
  {
    return;
  }
}
