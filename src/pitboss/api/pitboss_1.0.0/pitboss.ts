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
import { IDomain,
         IChannel,
         IMessage,
         messaging }         from '../../../screech/messaging';
import { entitledEndpoint,
         IEndpointInfo,
         IEndpointResponse } from '../../../flagpole/apitypes';
import { IServerInfo,
         IServiceInfo,
         IGroupInfo,
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

// ENTITLEMENTS
const ENT_DOMAIN       = 'pitboss';
const ENT_ROLE_ADMIN   = 'admin';
const ENT_ROLE_CLIENT  = 'client';
const ENT_ROLE_SERVER  = 'server';
const ENT_ROLE_TOOLS   = 'tools';
const API_TAG          = 'PITBOSS';

type UUID = string;
const NOTARIZE_TIMEOUT    = 10*60; // 10 minutes
const HEARTBEAT_INTERVAL  = 60; // 1 minute
const HEARTBEAT_THRESHOLD = 3; // # allowed missed heartbeats
const DOMAIN_NAME         = 'Pitboss';
const CHANNEL_ALL_SERVERS = 'ServerActivity';
const CHANNEL_ALL_GROUPS  = 'GroupActivity';
const ARG_ALL_SERVERS     = 'allservers';
const ARG_ALL_GROUPS      = 'allgroups';

let _serversByUUID       = new Map<UUID,   IServerInfo>();
let _serversBySocket     = new Map<any,    IServerInfo>();
let _servicesByName      = new Map<string, Set<IServerInfo>>();
let _pendingServers      = new Map<UUID,   IServerInfo>();
let _strategies          = new Map<string, IBalanceStrategy>();
let _groups              = new Map<string, IGroupInfo>();
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

export function initializeAPI(name: string, ver: string, apiToken:string,
                              config: Configuration,
                              opts: any) : PancakeError
{
  let eventSinks       = opts.initEventsSink;
  _maintenanceInterval = (config ? config.get('HEARTBEAT_INTERVAL') : HEARTBEAT_INTERVAL)*1000;
  _heartbeatThreshold  = config ? config.get('HEARTBEAT_THRESHOLD') : HEARTBEAT_THRESHOLD;

  // Install strategies
  _defaultStrategy = new RoundRobinStrategy();
  if (_defaultStrategy.initialize) {
    _defaultStrategy.initialize(config);
  }

  // Initialize our messaging service
  messaging.createDomain(DOMAIN_NAME, 'Event notifications for important Pitboss events');
  messaging.createChannel(DOMAIN_NAME, CHANNEL_ALL_SERVERS, 'Notifications about all server comings and goings');
  messaging.createChannel(DOMAIN_NAME, CHANNEL_ALL_GROUPS, 'Notifications about all group-related activity');

  // TODO load up strategies map from config data

  // Kick off timer
  if (_timerID) {
    clearTimeout(_timerID);
  }
  _timerID = setTimeout(_performMaintenance, _maintenanceInterval);

  // Let folks know
  eventSinks.emit('initComplete', 'pitboss');

  return;
}


// export function onConnect(socket: any) : PancakeError
// {
//   return;
// }


export function onDisconnect(socket: any) : PancakeError
{
  _removeServerRegistration(_serversBySocket.get(socket));
  messaging.unsubscribeAll(socket);
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

    // Let interested parties know
    messaging.send(DOMAIN_NAME, CHANNEL_ALL_SERVERS, {
      event: 'Disconnect',
      server: _.pick(server, [
        'name',
        'description',
        'pid',
        'uuid',
        'address',
        'port',
        'missedHeartbeats'
      ])}, undefined, false);

    // Remove from groups
    while (server.groups.size) {
      let group: IGroupInfo = server.groups.entries().next().value[0];
      _removeServerFromGroupPriv(group.name, server.uuid);
    }

    // Remove from collections
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
      log.info(`PITBOSS: Server removed from registry (${server.uuid}, ${server.address}, ${server.port})`);
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
  // Let interested parties know
  messaging.send(DOMAIN_NAME, CHANNEL_ALL_SERVERS, {
    event: 'Connect',
    server: _.pick(server, [
      'name',
      'description',
      'pid',
      'uuid',
      'address',
      'port',
      'missedHeartbeats'
    ])}, undefined, false);

  // Make everything right
  _serversByUUID.set(server.uuid, server);
  _serversBySocket.set(server.socket, server);
  server.services.forEach((service, name) => {
    _addServiceRegistration(name, server);
  });
  _pendingServers.delete(server.uuid);

  // And finally process any pending group assignments
  if (server.pendingGroups) {
    server.pendingGroups.forEach((group: string) => {
      _createGroupPriv(group);
      _addServerToGroupPriv(group, server.uuid);
    });
    server.pendingGroups = undefined;
  }
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
    log.warn(`PITBOSS: Removed AWOL server from registry (${server.uuid}, ${server.address}, ${server.port})`);
  }

  // Kick off the next one
  _timerID = setTimeout(_performMaintenance, _maintenanceInterval);
}


function _createGroupPriv(name: string, description?: string) : PancakeError
{
  // Quick and dirty validation
  if (!name) {
    return _processError('ERR_BAD_ARG', `No group name provided in createGroup request.`);
  }

  // Does the group already exist?
  let group: IGroupInfo = _groups.get(name.toLowerCase());
  if (group) {
    if (!group.description && description)
      group.description = description;
    return;
  }

  // Create a new group
  let newGroup: IGroupInfo = {
    name,
    description,
    members: new Set<IServerInfo>()
  }
  _groups.set(name.toLowerCase(), newGroup);

  // Let interested folks know
  let newGroupMsg = {
    event: 'NewGroup',
    name,
    description
  };
  messaging.send(DOMAIN_NAME, name.toLowerCase(), newGroupMsg, undefined, false);
  messaging.send(DOMAIN_NAME, CHANNEL_ALL_GROUPS, newGroupMsg, undefined, false);

  return;
}


function _addServerToGroupPriv(groupName: string, uuid: string) : PancakeError
{
  // Quick and dirty validation
  if (!groupName || !uuid) {
    return _processError('ERR_BAD_ARG', `Missing arguments in addServerToGroup request.`);
  }
  groupName = groupName.toLowerCase();

  // Look up group
  let group: IGroupInfo = _groups.get(groupName);
  if (!group) {
    return _processError('ERR_GROUP_NOT_FOUND', `No group exists with the name provided in addServerToGroup request ('${groupName}').`);
  }

  // Look up server
  let server: IServerInfo = _serversByUUID.get(uuid.toLowerCase());
  if (!server) {
    return _processError('ERR_SERVER_NOT_FOUND', `No server exists with the identifier provided in addServerToGroup request ('${uuid}').`);
  }

  // Short-circuit
  if (group.members.has(server) && server.groups.has(group))
    return;

  // Pop it on in
  group.members.add(server);
  server.groups.add(group);

  // Let interested parties know
  let joinMsg = {
    event: 'JoinedGroup',
    group: group.name,
    server: _.pick(server, [
      'name',
      'description',
      'pid',
      'uuid',
      'address',
      'port',
      'missedHeartbeats'
    ])};
  messaging.send(DOMAIN_NAME, group.name,         joinMsg, undefined, false);
  messaging.send(DOMAIN_NAME, CHANNEL_ALL_GROUPS, joinMsg, undefined, false);

  return;
}


function _removeServerFromGroupPriv(groupName: string, uuid: string) : PancakeError
{
  // Quick and dirty validation
  if (!groupName || !uuid) {
    return _processError('ERR_BAD_ARG', `Missing arguments in removeServerFromGroup request.`);
  }
  groupName = groupName.toLowerCase();

  // Look up group
  let group: IGroupInfo = _groups.get(groupName);
  if (!group) {
    return _processError('ERR_GROUP_NOT_FOUND', `No group exists with the name provided in removeServerFromGroup request ('${groupName}').`);
  }

  // Look up server
  let server: IServerInfo = _serversByUUID.get(uuid.toLowerCase());
  if (!server) {
    return _processError('ERR_SERVER_NOT_FOUND', `No server exists with the identifier provided in removeServerFromGroup request ('${uuid}').`);
  }

  // Short-circuit
  if (!group.members.has(server) && !server.groups.has(group))
    return;

  // Pop it out
  group.members.delete(server);
  server.groups.delete(group);

  // Let interested parties know
  let leftMsg = {
    event: 'LeftGroup',
    group: group.name,
    server: _.pick(server, [
      'name',
      'description',
      'pid',
      'uuid',
      'address',
      'port',
      'missedHeartbeats'
    ])};
  messaging.send(DOMAIN_NAME, group.name,         leftMsg, undefined, false);
  messaging.send(DOMAIN_NAME, CHANNEL_ALL_GROUPS, leftMsg, undefined, false);

  return;
}


/****************************************************************************
 **                                                                        **
 ** Pitboss API                                                            **
 **                                                                        **
 ****************************************************************************/

 /****************************************************************************
  **                                                                        **
  ** Registration                                                           **
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
    services:         new Map<string, IServiceInfo>(),
    groups:           new Set<IGroupInfo>()
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

  // Start with groups -- if they're there, we defer until registration
  if (payload.groups) {
    newServer.pendingGroups = Array.isArray(payload.groups) ? payload.groups : [ payload.groups ];
  }

  // Now services
  let services = payload.services;
  if (!Array.isArray(services)) {
    services = [ services ];
  }
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
  log.info(`PITBOSS: Server added to registry (${newServer.uuid}, ${newServer.address}, ${newServer.port})`);
  let resp = {
    status: 200,
    result: {
      message: 'Server added to Pitboss registry.',
      uuid: newServer.uuid
    }
  }
  return resp;
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
  log.info(`PITBOSS: Server added to registry (${server.uuid}, ${server.address}, ${server.port})`);
  return { status: 200, result: 'Server notarized and added to Pitboss registry.' };
}


/****************************************************************************
 **                                                                        **
 ** Lookup & Query                                                         **
 **                                                                        **
 ****************************************************************************/

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
  service = service.toLowerCase();

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

  // Just return potentially relevant info
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
  let server = _serversByUUID.get(uuid.toLowerCase());
  if (!server) {
    return { status: 400, result: _processError('ERR_SERVER_NOT_FOUND', `Unknown server uuid in getServerInfo call`) };
  }

  log.trace(`PITBOSS: Returned server info.`);
  return { status: 200, result: _getServerDigest(server)};
}


/****************************************************************************
 **                                                                        **
 ** Events                                                                 **
 **                                                                        **
 ****************************************************************************/

function _registerInterest(payload: any) : IEndpointResponse
{
  let target = payload.target ? payload.target.toLowerCase() : ARG_ALL_SERVERS;

  switch(target) {

    // Register for events about all servers coming and going
    case ARG_ALL_SERVERS:
      messaging.subscribe(DOMAIN_NAME, CHANNEL_ALL_SERVERS, payload.socket);
      log.trace(`PITBOSS: Event subscription added for ALL SERVERS.`);
      break;

    // Register for events about all group activity
    case ARG_ALL_GROUPS:
      messaging.subscribe(DOMAIN_NAME, CHANNEL_ALL_GROUPS, payload.socket);
      log.trace(`PITBOSS: Event subscription added for ALL GROUPS.`);
      break;

    // Otherwise, we assume this is a group name
    default:
      messaging.subscribe(DOMAIN_NAME, target, payload.socket);
      log.trace(`PITBOSS: Event subscription added for group '${target}'.`);
  }

  return { status: 200, result: 'Event subscription added.'};
}


/****************************************************************************
 **                                                                        **
 ** Groups                                                                 **
 **                                                                        **
 ****************************************************************************/

function _createGroup(payload: any) : IEndpointResponse
{
  let { name, description } = payload;

  // Pass it along
  let err = _createGroupPriv(name, description);
  if (err) {
    return { status: 400, err };
  }
  return { status: 200, result: 'New group created.'};
}


function _deleteGroup(payload: any) : IEndpointResponse
{
  let name = payload.name;

  // Quick and dirty validation
  if (!name) {
    return { status: 400, result: _processError('ERR_BAD_ARG', `No group name provided in deleteGroup request.`) };
  }
  name = name.toLowerCase();

  // Look it up
  let group: IGroupInfo = _groups.get(name);
  if (!group) {
    return { status: 400, result: _processError('ERR_GROUP_NOT_FOUND', `No group exists with the name provided in deleteGroup request ('${name}').`) };
  }

  // Blow it away
  group.members.forEach((server: IServerInfo) => {
    server.groups.delete(group);
  });
  _groups.delete(name);

  // Let interested folks know
  let deleteGroupMsg = {
    event: 'DeleteGroup',
    name
  };
  messaging.send(DOMAIN_NAME, name,               deleteGroupMsg, undefined, false);
  messaging.send(DOMAIN_NAME, CHANNEL_ALL_GROUPS, deleteGroupMsg, undefined, false);
  messaging.deleteChannel(DOMAIN_NAME, name);

  return { status: 200, result: 'Group deleted.'};
}


function _addServerToGroup(payload: any) : IEndpointResponse
{
  let { group, uuid } = payload;

  // Pass it on
  let err = _addServerToGroupPriv(group, uuid);
  if (err) {
    return { status: 400, err };
  }
  return { status: 200, result: 'Server added to group.'};
}


function _removeServerFromGroup(payload: any) : IEndpointResponse
{
  let { group, uuid } = payload;

  // Pass it on
  let err = _removeServerFromGroupPriv(group, uuid);
  if (err) {
    return { status: 400, result: err };
  }
  return { status: 200, result: 'Server removed from group.'};
}


function _getGroups(payload: any) : IEndpointResponse
{
  let returnItems: any[] = [];
  _groups.forEach((group: IGroupInfo, name: string) => {
    let returnGroup = { name: group.name, description: group.description, members: new Array<any>() };
    if (group.members.size) {
      group.members.forEach((server: IServerInfo) => {
        returnGroup.members.push(_.pick(server, [
          'name',
          'description',
          'uuid',
          'address',
          'port'
        ]));
      });
    }
    returnItems.push(returnGroup);
  })
  log.trace(`PITBOSS: Returned group list.`);
  return { status: 200, result: returnItems };
}


 /****************************************************************************
  **                                                                        **
  ** Misc                                                                   **
  **                                                                        **
  ****************************************************************************/

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
  {
    requestType: 'post',
    path: '/pitboss/register',
    event: 'register',
    handler: entitledEndpoint(ENT_DOMAIN, [ ENT_ROLE_SERVER, ENT_ROLE_ADMIN ], API_TAG, _registerServer),
    metaTags: { audience: 'server' }
  },
  {
    requestType: 'post',
    path: '/pitboss/lookup',
    event: 'lookup',
    handler: entitledEndpoint(ENT_DOMAIN, [ ENT_ROLE_CLIENT, ENT_ROLE_SERVER, ENT_ROLE_TOOLS, ENT_ROLE_ADMIN ], API_TAG, _lookup)
  },
  {
    requestType: 'get',
    path: '/pitboss/server',
    event: 'server',
    handler: entitledEndpoint(ENT_DOMAIN, [ ENT_ROLE_CLIENT, ENT_ROLE_SERVER, ENT_ROLE_TOOLS, ENT_ROLE_ADMIN ], API_TAG, _getServerInfo)
  },
  {
    requestType: 'get',
    path: '/pitboss/servers',
    event: 'servers',
    handler: entitledEndpoint(ENT_DOMAIN, [ ENT_ROLE_CLIENT, ENT_ROLE_SERVER, ENT_ROLE_TOOLS, ENT_ROLE_ADMIN ], API_TAG, _getServerRegistry)
  },
  {
    requestType: 'get',
    path: '/pitboss/services',
    event: 'services',
    handler: entitledEndpoint(ENT_DOMAIN, [ ENT_ROLE_CLIENT, ENT_ROLE_SERVER, ENT_ROLE_TOOLS, ENT_ROLE_ADMIN ], API_TAG, _getServiceRegistry)
  },
  {
    requestType: 'post',
    path: '/pitboss/creategroup',
    event: 'createGroup',
    handler: entitledEndpoint(ENT_DOMAIN, [ ENT_ROLE_SERVER, ENT_ROLE_TOOLS, ENT_ROLE_ADMIN ], API_TAG, _createGroup)
  },
  {
    requestType: 'del',
    path: '/pitboss/deletegroup',
    event: 'deleteGroup',
    handler: entitledEndpoint(ENT_DOMAIN, [ ENT_ROLE_SERVER, ENT_ROLE_TOOLS, ENT_ROLE_ADMIN ], API_TAG, _deleteGroup)
  },
  {
    requestType: 'post',
    path: '/pitboss/servertogroup',
    event: 'serverToGroup',
    handler: entitledEndpoint(ENT_DOMAIN, [ ENT_ROLE_SERVER, ENT_ROLE_TOOLS, ENT_ROLE_ADMIN ], API_TAG, _addServerToGroup)
  },
  {
    requestType: 'del',
    path: '/pitboss/serverfromgroup',
    event: 'serverFromGroup',
    handler: entitledEndpoint(ENT_DOMAIN, [ ENT_ROLE_SERVER, ENT_ROLE_TOOLS, ENT_ROLE_ADMIN ], API_TAG, _removeServerFromGroup)
  },
  {
    requestType: 'get',
    path: '/pitboss/groups',
    event: 'groups',
    handler: entitledEndpoint(ENT_DOMAIN, [ ENT_ROLE_CLIENT, ENT_ROLE_SERVER, ENT_ROLE_TOOLS, ENT_ROLE_ADMIN ], API_TAG, _getGroups)
  },
  { event: 'notarize',
    handler: entitledEndpoint(ENT_DOMAIN, [ ENT_ROLE_CLIENT, ENT_ROLE_SERVER, ENT_ROLE_TOOLS, ENT_ROLE_ADMIN ], API_TAG, _onNotarize),
    metaTags: { audience: 'server' }
  },
  {
    event: 'registerInterest',
    handler: entitledEndpoint(ENT_DOMAIN, [ ENT_ROLE_CLIENT, ENT_ROLE_SERVER, ENT_ROLE_TOOLS, ENT_ROLE_ADMIN ], API_TAG, _registerInterest),
    metaTags: { audience: 'tools' }
  }
];
