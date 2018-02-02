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
import { IServerInfo,
         IServiceInfo,
         IBalanceStrategy }  from './pitboss_types';
const  log                 = utils.log;

// Load-balancing strategies
import { RoundRobinStrategy } from './strat_roundrobin';
import { RandomStrategy }     from './strat_random';


/****************************************************************************
 **                                                                        **
 ** Vars & definitions                                                     **
 **                                                                        **
 ****************************************************************************/

type UUID = string;
const NOTARIZE_TIMEOUT    = 10*60; // 10 minutes
const HEARTBEAT_INTERVAL  = 60; // 1 minute
const HEARTBEAT_THRESHOLD = 3; // # allowed missed heartbeats

let _serversByUUID       = new Map<UUID,   IServerInfo>();
let _serversBySocket     = new Map<any,    IServerInfo>();
let _servicesByName      = new Map<string, Set<IServerInfo>>();
let _pendingServers      = new Map<UUID,   IServerInfo>();
let _strategies          = new Map<string, IBalanceStrategy>();
let _maintenanceInterval = HEARTBEAT_INTERVAL * 1000;
let _heartbeatThreshold  = HEARTBEAT_THRESHOLD;
let _defaultStrategy: IBalanceStrategy;
let _timerID: NodeJS.Timer;
let _lastError: any;


/****************************************************************************
 **                                                                        **
 ** Framework callbacks                                                    **
 **                                                                        **
 ****************************************************************************/

export function initializeAPI(config: Configuration) : void
{
  _maintenanceInterval = (config ? config.get('HEARTBEAT_INTERVAL') : HEARTBEAT_INTERVAL)*1000;
  _heartbeatThreshold  = config ? config.get('HEARTBEAT_THRESHOLD') : HEARTBEAT_THRESHOLD;

  // Install strategies
  _defaultStrategy = new RoundRobinStrategy();
  if (_defaultStrategy.initialize) {
    _defaultStrategy.initialize(config);
  }

  // TODO load up strategies map from config data

  // Kick off timer
  if (_timerID) {
    clearTimeout(_timerID);
  }
  _timerID = setTimeout(_performMaintenance, _maintenanceInterval);
}


export function onConnect(socket: any) : PancakeError
{
  return;
}


export function onDisconnect(socket: any) : PancakeError
{
  _removeServerRegistration(_serversBySocket.get(socket));
  return;
}


/****************************************************************************
 **                                                                        **
 ** Private functions                                                      **
 **                                                                        **
 ****************************************************************************/

function _getBalanceStrategy(service: string, ver: string)
{
    let strategy: IBalanceStrategy = _strategies.get(service + '-' + ver);
    if (!strategy) {
      strategy = _strategies.get(service);
    }
    if (!strategy) {
      strategy = _defaultStrategy;
    }
    return strategy;
}


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


function _removeServerRegistration(serverOrAddress: any, port?: number, silent: boolean = false) : void
{
  let removed: boolean = false;

  // Two ways to call
  // TYPE 1: by server
  if ('object' === typeof serverOrAddress && !port) {
    let server = serverOrAddress as IServerInfo;

    _serversByUUID.delete(server.uuid);
    _serversBySocket.delete(server.socket);
    _pendingServers.delete(server.uuid);
    _servicesByName = utils.filterMap(_servicesByName, (name: string, servers: Set<IServerInfo>) => {
      servers.delete(server);
      if (servers.size != 0) {
        return true;
      }
    });
    if (false === silent) {
      log.trace(`PITBOSS: Server removed from registry (${server.address}, ${server.port})`);
    }
  }

  // TYPE 2: by IP address and port
  else if ('string' === typeof serverOrAddress && port) {
    let address = serverOrAddress as string;
    let serverFound: IServerInfo;
    _serversByUUID.forEach((server: IServerInfo, uuid: string) => {
        if (server.address === address && server.port === port) {
          serverFound = server;
        }
    });
    if (serverFound) {
      _removeServerRegistration(serverFound, undefined, silent);
    }
  }
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


function _getServerDigest(server: IServerInfo, includeServices: boolean = true) : any
{
  let returnServer = _.pick(server, [
    'name',
    'description',
    'pid',
    'uuid',
    'address',
    'port',
    'missedHeartbeats'
  ]);
  if (true === includeServices) {
    let returnServices: any = [];
    server.services.forEach((service: IServiceInfo, name: string) => {
      let returnService = _.pick(service, [
        'name',
        'description',
        'metaTags',
        'versions'
      ]);
      returnServices.push(returnService);
    });
    returnServer.services = returnServices;
  }
  return returnServer;
}


function _getServiceVersions(server: IServerInfo, serviceName: string) : string[]
{
  if (server) {
    let service = server.services.get(serviceName);
    if (service) return service.versions;
  }
  return [];
}


function _getServiceMetaTags(server: IServerInfo, serviceName: string) : any
{
  if (server) {
    let service = server.services.get(serviceName);
    if (service) return service.metaTags;
  }
  return;
}


function _performMaintenance() : void
{
  let awolServers: IServerInfo[] = [];

  // Just because it's convenient...
  _clearStalePendingServers();

  // Send out heartbeats to all of our registered servers
  _serversBySocket.forEach((server: IServerInfo, socket: any) => {

    // Has this server gone AWOL?
    server.missedHeartbeats++;
    if (server.missedHeartbeats >= _heartbeatThreshold) {

      // We are considering this a dead server
      awolServers.push(server);
    }
    else {

      // Send off the heartbeat
      socket.emit('heartbeat', { source: 'pitboss', timestamp: Date.now() }, (heartbeatResp: any) => {

        // Everything OK?
        if ('OK' === heartbeatResp.status) {
          server.missedHeartbeats = 0;
          log.trace(`PITBOSS: Received heartbeat response (${server.address}, ${server.port})`);
        }
      });
    }
  });

  // Unregister our missing servers
  for (let server of awolServers) {
    _removeServerRegistration(server);
    log.trace(`PITBOSS: Removed AWOL server from registry (${server.address}, ${server.port})`);
  }

  // Kick off the next one
  _timerID = setTimeout(_performMaintenance, _maintenanceInterval);
}


/****************************************************************************
 **                                                                        **
 ** Pitboss API                                                            **
 **                                                                        **
 ****************************************************************************/


function _registerServer(payload: any) : IEndpointResponse
{
  let newServer: IServerInfo = {
    name:             payload.name,
    description:      payload.description,
    uuid:             payload.uuid ? payload.uuid : uuidv4(),
    pid:              payload.pid,
    address:          payload.address,
    port:             payload.port,
    socket:           payload.socket,
    regTime:          Date.now(),
    missedHeartbeats: 0,
    services:         new Map<string, IServiceInfo>()
  }

  // Quick and dirty validation
  if (!utils.isDottedIPv4(newServer.address) ||
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
        let newService: IServiceInfo = { name: service.name, description: service.description, versions, metaTags: service.metaTags };
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
    return { status: 200, result: { notarySig: newServer.uuid }};
  }

  // No handshake required
  _removeServerRegistration(newServer.address, newServer.port, true);
  _addServerToRegistry(newServer);
  log.trace(`PITBOSS: Server added to registry (${newServer.address}, ${newServer.port})`);
  let resp = {
    status: 200,
    result: {
      message: 'Server added to Pitboss registry.',
      uuid: newServer.uuid
    }
  }
  return resp;
}


// function _lookup(payload: any) : IEndpointResponse
// Takes a service name, version, and optional array of key tuples (hints)
// Returns a server info digest
// API config has strategies for server assignment (e.g., round-robin...).
//   Some of these strategies may use hints (e.g., hashing user ids)
// HINTS:
//   OptLatestVersion: true/false

function _lookup(payload: any) : IEndpointResponse
{
  let service = payload.service;
  let version = payload.version ? payload.version : '1.0.0';
  let hints   = payload.hints;

  // Quick and dirty validation
  if (!service) {
    return { status: 400, result: _processError('ERR_BAD_ARG', `No service name provided in lookup request.`) };
  }
  service.toLowerCase();

  // Lookup our services
  let servers: Set<IServerInfo> = _servicesByName.get(service);
  if (!servers) {
    return { status: 400, result: _processError('ERR_UNKNOWN_SERVICE', `Could not lookup unknown service '${service}'.`) };
  }

  // Delegate the lookup to the appropriate strategy
  let server: IServerInfo = _getBalanceStrategy(service, version).lookup(service, version, servers, hints);
  if (!server) {
    return { status: 400, result: _processError('ERR_SERVICE_NOT_FOUND', `Could not find requested service '${service}', v${version}.`) };
  }

  // Just return potentially relevenat info
  let returnServer = _.pick(server, [
    'name',
    'description',
    'uuid',
    'address',
    'port'
  ]);

  return { status: 200, result: returnServer };
}


function _getServerRegistry(payload: any) : IEndpointResponse
{
  let returnItems: any[] = [];
  _serversByUUID.forEach((server: IServerInfo, name: string) => {
    returnItems.push(_getServerDigest(server));
  })
  log.trace(`PITBOSS: Returned server registry.`);
  return { status: 200, result: returnItems};
}


function _getServiceRegistry(payload: any) : IEndpointResponse
{
  let returnItems: any[] = [];
  let metaTags
  _servicesByName.forEach((servers: Set<IServerInfo>, service: string) => {
    let returnServers: any[] = [];
    servers.forEach((server: IServerInfo) => {
      let digest = _getServerDigest(server, false);
      digest.versions = _getServiceVersions(server, service);
      digest.metaTags = _getServiceMetaTags(server, service);
      returnServers.push(digest);
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
  return { status: 200, result: _getServerDigest(server)};
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
  log.trace(`PITBOSS: Server added to registry (${server.address}, ${server.port})`);
  return { status: 200, result: 'Server notarized and added to Pitboss registry.'};
}


function getLastError() : PancakeError
{
  return _lastError;
}


/****************************************************************************
 **                                                                        **
 ** Flagpole housekeeping                                                  **
 **                                                                        **
 ****************************************************************************/

export let flagpoleHandlers: IEndpointInfo[] = [
  { requestType: 'post',  path: '/pitboss/register',    event: 'register',   handler: _registerServer,    metaTags: { audience: 'server' } },
  { requestType: 'post',  path: '/pitboss/lookup',      event: 'lookup',     handler: _lookup             },
  { requestType: 'get',   path: '/pitboss/server',      event: 'server',     handler: _getServerInfo      },
  { requestType: 'get',   path: '/pitboss/servers',     event: 'servers',    handler: _getServerRegistry  },
  { requestType: 'get',   path: '/pitboss/services',    event: 'services',   handler: _getServiceRegistry },
  {                                                     event: 'notarize',   handler: _onNotarize,        metaTags: { audience: 'server' } }
];
