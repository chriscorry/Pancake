/****************************************************************************
 **                                                                        **
 ** Modules                                                                **
 **                                                                        **
 ****************************************************************************/

const  _                   = require('lodash');
const  uuidv4              = require('uuid/v4');
const  semver              = require('semver');
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
  regTime: number,
  services: Map<string, IServiceInfo>
}

type UUID = string;
const NOTARIZE_TIMEOUT = 10*60; // 10 minutes

let _serversByUUID   = new Map<UUID,   IServerInfo>();
let _serversBySocket = new Map<any,    IServerInfo>();
let _servicesByName  = new Map<string, Set<IServerInfo>>();
let _pendingServers  = new Map<UUID,   IServerInfo>();
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

function _addServiceRegistration(name: string, server: IServerInfo) : void
{
  let servers: Set<IServerInfo> = _servicesByName.get(name);
  if (!servers) {
    servers = new Set<IServerInfo>();
    _servicesByName.set(name, servers);
  }
  servers.add(server);
}


function _doesVersionSatisfy(checkVer: string, versions: string[]) : boolean
{
  // Assumes versions array is sorted in DECENDING order
  for (let version of versions) {
    if (semver.satisfies(checkVer, '^' + version)) {
      return true;
    }
  }
  return false;
}


function _clearStalePendingServers() : void
{
  _pendingServers = utils.filterMap(_pendingServers, (name: string, server: IServerInfo) => {
    if (Date.now() - server.regTime < NOTARIZE_TIMEOUT*1000) {
      return true;
    }
  });
}


function _addServerToRegistry(server: IServerInfo) : void
{
  // Make everything right
  _serversByUUID.set(server.uuid, server);
  _serversBySocket.set(server.socket, server);
  server.services.forEach((service, name) => {
    _addServiceRegistration(name, server);
  });
  _pendingServers.delete(server.uuid);
}


function _buildServerDigest(server: IServerInfo, includeServices: boolean = true) : any
{
  let returnServer = _.pick(server, [
    'name',
    'description',
    'uuid',
    'address',
    'port'
  ]);
  if (true === includeServices) {
    let returnServices: any = [];
    server.services.forEach((service: IServiceInfo, name: string) => {
      let returnService = {
        name: service.name,
        description: service.description,
        versions: service.versions
      }
      returnServices.push(returnService);
    });
    returnServer.services = returnServices;
  }
  return returnServer;
}


/****************************************************************************
 **                                                                        **
 ** Pitboss API                                                            **
 **                                                                        **
 ****************************************************************************/


function _registerServer(payload: any) : IEndpointResponse
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
    regTime:     Date.now(),
    services:    new Map<string, IServiceInfo>()
  }

  // Quick and dirty validation
  if (!newServer.name || !utils.isDottedIPv4(newServer.address) ||
      !newServer.port || !payload.services) {
    return { status: 400, result: _processError('ERR_BAD_ARG', `Invalid args during server registration.`) };
  }

  let numServices = 0;
  let opts = payload.opts;
  let requireWShandshake = true;
  if ((opts && opts.websocketRequired == false) || payload.socket) {
    requireWShandshake = false;
  }
  let services = payload.services;
  if (!Array.isArray(services)) {
    services = [ services ];
  }

  // Loop through our services
  let validService: boolean;
  for (let service of services) {

    validService = true;

    // Validate
    if (service.name && service.versions) {

      // Version (singular) or versions (multiple)?
      let versions = service.versions;
      if (!Array.isArray(versions)) {
        versions = [ versions ];
      }

      // Make sure all of our versions are valid
      let validVers = true;
      for (let version of versions) {
        if (!semver.valid(version)) {
          validVers = false;
        }
      }

      // Create the new object and add it
      if (true === validVers) {

        // Sort versions in DECENDING order
        versions.sort((a: string, b: string) => {
          if (semver.lt(a, b)) {
            return 1;
          }
          if (semver.gt(a, b)) {
            return -1;
          }
          return 0;
        });

        // Okay -- good to go
        let newService: IServiceInfo = { name: service.name, description: service.description, versions };
        newServer.services.set(newService.name, newService);
      }
      else {
        validService = false;
      }
    }
    else {
      validService = false;
    }

    // How did it go?
    if (false == validService) {
      return { status: 400, result: _processError('ERR_BAD_ARG', `Invalid args during server registration.`) };
    }
  }

  // If we need to handshake, this is a pending servers
  _clearStalePendingServers();
  if (requireWShandshake) {
    _pendingServers.set(newServer.uuid, newServer);
  }
  else {
    _addServerToRegistry(newServer);
  }

  // Off we go
  return { status: 200, result: { notarySig: newServer.uuid }};
}


// function _lookup(payload: any) : IEndpointResponse
// Takes a service name, version, and optional array of key tuples (hints)
// Returns an address and port
// API config has strategies for server assignment (e.g., round-robin...).
//   Some of these strategies may use hints (e.g., hashing user ids)

function _lookup(payload: any) : IEndpointResponse
{
  return;
}


function _getServerRegistry(payload: any) : IEndpointResponse
{
  let returnItems: any[] = [];
  _serversByUUID.forEach((server: IServerInfo, name: string) => {
    returnItems.push(_buildServerDigest(server));
  })
  log.trace(`PITBOSS: Returned server registry.`);
  return { status: 200, result: returnItems};
}


function _getServiceRegistry(payload: any) : IEndpointResponse
{
  let returnItems: any[] = [];
  _servicesByName.forEach((servers: Set<IServerInfo>, service: string) => {
    let returnServers: any[] = [];
    servers.forEach((server: IServerInfo) => {
      returnServers.push(_buildServerDigest(server, false));
    });
    let returnService = { service, servers: returnServers };
    returnItems.push(returnService);
  })
  log.trace(`PITBOSS: Returned service registry.`);
  return { status: 200, result: returnItems};
}


function _getServerInfo(payload: any) : IEndpointResponse
{
  let uuid = payload.uuid;
  if (!uuid) {
    return { status: 400, result: _processError('ERR_BAD_ARG', `Missing server uuid in getServerInfo call`) };
  }
  let server = _serversByUUID.get(uuid);
  if (!server) {
    return { status: 400, result: _processError('ERR_SERVER_NOT_FOUND', `Unknown server uuid in getServerInfo call`) };
  }

  log.trace(`PITBOSS: Returned server info.`);
  return { status: 200, result: _buildServerDigest(server)};
}


// function _onNotorize(payload: any) : IEndpointResponse
// NOTE: websocket ONLY!
// Takes a notarySig (UUID)
// Returns SUCCESS or error code
// Completes the server registration process. Servers are not placed into the
// active pool until notarized.

function _onNotarize(payload: any) : IEndpointResponse
{
  // Check args
  _clearStalePendingServers();
  let uuid = payload.notarySig;
  if (!uuid) {
    return { status: 400, result: _processError('ERR_BAD_ARG', `Missing signature uuid in notarize call`) };
  }
  let server = _pendingServers.get(uuid);
  if (!server) {
    return { status: 400, result: _processError('ERR_SERVER_NOT_FOUND', `Unknown server uuid in notarize call (notarize timeout?)`) };
  }

  // Remember the socket
  server.socket = payload.socket;

  // Make everything right
  _addServerToRegistry(server);

 return { status: 200, result: 'Server notarized and added to Pitboss registry.'};
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
  { requestType: 'post',  path: '/pitboss/register',    event: 'register',   handler: _registerServer },
  { requestType: 'post',  path: '/pitboss/lookup',      event: 'lookup',     handler: _lookup },
  {                                                     event: 'notarize',   handler: _onNotarize },
  { requestType: 'post',  path: '/pitboss/server',      event: 'server',     handler: _getServerInfo },
  { requestType: 'get',   path: '/pitboss/servers',     event: 'servers',    handler: _getServerRegistry },
  { requestType: 'get',   path: '/pitboss/services',    event: 'services',   handler: _getServiceRegistry }
  /*
  { requestType: 'post',  path: '/cache/items',   event: 'items',  handler: getItemMultiple },
  { requestType: 'post',  path: '/cache/set',     event: 'set',    handler: setItem },
  { requestType: 'post',  path: '/cache/load',    event: 'load',   handler: loadItems },
  { requestType: 'get',   path: '/cache/stats',   event: 'stats',  handler: getStats },
  { requestType: 'get',   path: '/cache/dump',    event: 'dump',   handler: dumpCache },
  { requestType: 'get',   path: '/cache/load10',  event: 'load10', handler: load10 }
  */
];
