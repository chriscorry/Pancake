/****************************************************************************
 **                                                                        **
 ** Modules                                                                **
 **                                                                        **
 ****************************************************************************/

const  uuidv4              = require('uuid/v4');
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

interface IServiceInfo {
  name: string,
  description?: string,
  versions: string[]
}

interface IServerInfo {
  name: string,
  description?: string,
  uuid: string,
  address: string,
  port: number,
  socket: any,
  services: Map<string, IServiceInfo>
}

let _serversByUUID   = new Map<string, IServerInfo>();
let _serversBySocket = new Map<any,    IServerInfo>();
let _pendingServers  = new Map<string, IServerInfo>();
let _lastError: any;


/****************************************************************************
 **                                                                        **
 ** Framework callbacks                                                    **
 **                                                                        **
 ****************************************************************************/


export function initializeAPI(config?: Configuration) : void
{
}


export function onConnect(socket: any) : PancakeError
{
  return;
}


export function onDisconnect(socket: any) : PancakeError
{
  return;
}


/****************************************************************************
 **                                                                        **
 ** Private functions                                                      **
 **                                                                        **
 ****************************************************************************/


function _processError(status: string, reason?: string, obj?: any) : PancakeError
{
  _lastError = new PancakeError(status, reason, obj);
  log.trace(`PITBOSS: ${status}: ${reason}`);
  if (obj) log.trace(obj);
  return _lastError;
}


/****************************************************************************
 **                                                                        **
 ** Private functions                                                      **
 **                                                                        **
 ****************************************************************************/


export function getLastError() : PancakeError
{
  return _lastError;
}


/****************************************************************************
 **                                                                        **
 ** Pitboss API                                                        **
 **                                                                        **
 ****************************************************************************/


async function registerServer(payload: any) : Promise<IEndpointResponse>
{
  /* PAYLOAD FORMAT
    name
    description
    address (IP address)
    socket (undefined, or an active socket if coming from a websocket call)
    services:
    [
      ServiceInfo
      {
          name, description
          [ versions]
      }
    ]
    opts = { websocketRequired: boolean (defaults to true) }
  */

  let newServer: IServerInfo = {
    name:        payload.name,
    description: payload.description,
    uuid:        uuidv4(),
    address:     payload.address,
    port:        payload.port,
    socket:      payload.socket,
    services:    new Map<string, IServiceInfo>()
  }
  let opts = payload.opts;
  let requireWShandshake = true;
  if ((opts && opts.websocketRequired == false) || payload.socket) {
    requireWShandshake = false;
  }
  let services = payload.services;
  if (!Array.isArray(services)) {
    services = [ services ];
  }

  // Quick and dirty validation
  if (!newServer.name || !utils.isDottedIPv4(newServer.address) || !newServer.port) {
    return { err: _processError('ERR_BAD_ARG', `PITBOSS: Invalid args during server registration.`) };
  }

  // TODO: Loop through our services and add them to the lists

  // If we need to handshake, this is _pendingServerslet _serversByUUID   = new Map<string, IServerInfo>();
  if (requireWShandshake) {
    _pendingServers.set(newServer.uuid, newServer);
  }
  else {
    _serversByUUID.set(newServer.uuid, newServer);
    _serversBySocket.set(newServer.socket, newServer);
  }

  // Off we go
  return { status: 200, result: { notarySig: newServer.uuid }};
}


/****************************************************************************
 **                                                                        **
 ** Flagpole housekeeping                                                  **
 **                                                                        **
 ****************************************************************************/

export let flagpoleHandlers: IEndpointInfo[] = [
  { requestType: 'post',  path: '/pitboss/register',    event: 'register',   handler: registerServer }
  /*
  { requestType: 'post',  path: '/cache/items',   event: 'items',  handler: getItemMultiple },
  { requestType: 'post',  path: '/cache/set',     event: 'set',    handler: setItem },
  { requestType: 'post',  path: '/cache/load',    event: 'load',   handler: loadItems },
  { requestType: 'get',   path: '/cache/stats',   event: 'stats',  handler: getStats },
  { requestType: 'get',   path: '/cache/dump',    event: 'dump',   handler: dumpCache },
  { requestType: 'get',   path: '/cache/load10',  event: 'load10', handler: load10 }
  */
];
