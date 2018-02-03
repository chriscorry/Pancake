/****************************************************************************
 **                                                                        **
 ** Modules                                                                **
 **                                                                        **
 ****************************************************************************/

import * as utils            from '../../../util/pancake-utils';
import { PancakeError }      from '../../../util/pancake-err';
import { Configuration }     from '../../../util/pancake-config';
import { IEndpointInfo,
         IEndpointResponse } from '../../../flagpole/apitypes';
const  log                 = utils.log;


/****************************************************************************
 **                                                                        **
 ** Vars & definitions                                                     **
 **                                                                        **
 ****************************************************************************/

interface IRelayServer {
    uuid: string,
    address: string,
    port: number
}

interface IDomain {
  name: string,
  description?: string,
  channels: Map<string, IChannel>
  relays: IRelayServer[];
}

interface IChannel {
  name: string,
  description?: string,
  subscribers: any[]
  relays: IRelayServer[];
}

interface IMessage {
  payload: any,
  sent: number,
  visitedRelays: string[]
}

let _lastError: any;
let _domains  = new Map<string, IDomain>();
let _channels = new Map<string, IChannel>();


/****************************************************************************
 **                                                                        **
 ** Framework callbacks                                                    **
 **                                                                        **
 ****************************************************************************/

export function initializeAPI(name: string, ver: string, apiToken:string,
                              config: Configuration) : void
{
}


// export function onConnect(socket: any) : PancakeError
// {
//   return;
// }


// export function onDisconnect(socket: any) : PancakeError
// {
//   return;
// }


/****************************************************************************
 **                                                                        **
 ** Private functions                                                      **
 **                                                                        **
 ****************************************************************************/

function _processError(status: string, reason?: string, obj?: any) : PancakeError
{
  _lastError = new PancakeError(status, reason, obj);
  log.trace(`SCREECH: ${status}: ${reason}`);
  if (obj) log.trace(obj);
  return _lastError;
}



/****************************************************************************
 **                                                                        **
 ** Screech API                                                            **
 **                                                                        **
 ****************************************************************************/

function _createDomain(payload: any) : IEndpointResponse
{
  return { status: 200 };
}


function _deleteDomain(payload: any) : IEndpointResponse
{
  return { status: 200 };
}


function _addDomainRelay(payload: any) : IEndpointResponse
{
  return { status: 200 };
}


function _removeDomainRelay(payload: any) : IEndpointResponse
{
  return { status: 200 };
}


function _openChannel(payload: any) : IEndpointResponse
{
  return { status: 200 };
}


function _setChannelProperties(payload: any) : IEndpointResponse
{
  return { status: 200 };
}


function _addChannelRelay(payload: any) : IEndpointResponse
{
  return { status: 200 };
}


function _removeChannelRelay(payload: any) : IEndpointResponse
{
  return { status: 200 };
}


function _send(payload: any) : IEndpointResponse
{
  return { status: 200 };
}


function _subscribe(payload: any) : IEndpointResponse
{
  return { status: 200 };
}


function _clearStaleChannels(payload: any) : IEndpointResponse
{
  return { status: 200 };
}


export function getLastError() : PancakeError
{
  return _lastError;
}


/****************************************************************************
 **                                                                        **
 ** Flagpole housekeeping                                                  **
 **                                                                        **
 ****************************************************************************/

export let flagpoleHandlers: IEndpointInfo[] = [
  { requestType: 'post',  path: '/screech/createdomain',       event: 'createDomain',       handler: _createDomain },
  { requestType: 'post',  path: '/screech/deletedomain',       event: 'deleteDomain',       handler: _deleteDomain },
  { requestType: 'post',  path: '/screech/adddomainrelay',     event: 'addDomainRelay',     handler: _addDomainRelay },
  { requestType: 'post',  path: '/screech/removedomainrelay',  event: 'removeDomainRelay',  handler: _removeDomainRelay },
  { requestType: 'post',  path: '/screech/openchannel',        event: 'openChannel',        handler: _openChannel },
  { requestType: 'post',  path: '/screech/setchannelprops',    event: 'setChannelProps',    handler: _setChannelProperties },
  { requestType: 'post',  path: '/screech/addchannelrelay',    event: 'addChannelRelay',    handler: _addChannelRelay },
  { requestType: 'post',  path: '/screech/removechannelrelay', event: 'removeChannelRelay', handler: _removeChannelRelay },
  { requestType: 'get',   path: '/screech/clearstalechannels', event: 'clearStaleChannels', handler: _clearStaleChannels },
  { requestType: 'post',  path: '/screech/send',               event: 'send',               handler: _send },
  {                                                            event: 'subscribe',          handler: _subscribe }
];
