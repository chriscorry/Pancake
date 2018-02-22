/****************************************************************************
 **                                                                        **
 ** Modules                                                                **
 **                                                                        **
 ****************************************************************************/

import _                   = require('lodash');
import { PitbossClient }     from '../../../pitboss/api/pitboss_1.0.0/pitboss_client';
import { ScreechClient }     from './screech_client';
import * as utils            from '../../../util/pancake-utils';
import { grab }              from '../../../util/pancake-grab';
import { PancakeError }      from '../../../util/pancake-err';
import { Configuration }     from '../../../util/pancake-config';
import { IEndpointInfo,
         IEndpointResponse } from '../../../flagpole/apitypes';
import { IDomain,
         IChannel,
         IMessage,
         messaging }         from '../../messaging';
const  log                 = utils.log;


/****************************************************************************
 **                                                                        **
 ** Vars & definitions                                                     **
 **                                                                        **
 ****************************************************************************/

interface IRelayServer {
     uuid: string,
     address: string,
     port: number,
     client?: ScreechClient
}

const RELAY_GROUP_NAME = 'DefaultRelays';

let _pitboss: PitbossClient;
let _uuid: string;
let _relayServers = new Map<string, IRelayServer>();


/****************************************************************************
 **                                                                        **
 ** Framework callbacks                                                    **
 **                                                                        **
 ****************************************************************************/

export function initializeAPI(name: string, ver: string, apiToken:string,
                              config: Configuration, opts: any) : PancakeError
{
  // We want to hear about registration events
  if (opts.events) {
    _pitboss = opts.events as PitbossClient;
    _pitboss.on('serverUUID', (uuid) => { _onNewServerUUID(uuid); });
  }
  return;
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

function _onRelayGroupChange(msg: any) : void
{
  switch(msg.event) {
    case 'JoinedGroup':
      if (msg.server.uuid != _uuid) {
        let newRelay: IRelayServer = _.pick(msg.server, [
          'name', 'uuid', 'address', 'port'
        ]);
        newRelay.client = new ScreechClient(undefined, { tryReconnect: false });
        newRelay.client.connect(newRelay.address, newRelay.port, undefined, undefined, undefined, true);
        _relayServers.set(msg.server.uuid, newRelay);
        log.trace(`SCREECH: Added server '${msg.server.uuid}' to relay list.`);
      }
      break;
    case 'LeftGroup':
      if (msg.server.uuid != _uuid) {
        let relay = _relayServers.get(msg.server.uuid);
        if (relay) {
          relay.client.close();
          relay.client = undefined;
          _relayServers.delete(msg.server.uuid);
        }
      }
      log.trace(`SCREECH: Removed server '${msg.server.uuid}' from relay list.`);
      break;
  }
}


async function _onNewServerUUID(uuid: string) : Promise<void>
{
  // Save off
  _uuid = uuid;

  // We want to receive notifications about the relay group
  await grab(_pitboss.registerInterest(RELAY_GROUP_NAME, _onRelayGroupChange));

  // Retrive our list of groups from the server
  let [err, resp] = await grab(_pitboss.getGroups());
  if (err) return;

  // Process each server already in the groups
  let relays = resp.find((group:any) => {
    if (RELAY_GROUP_NAME === group.name)
      return true;
  })
  if (relays && relays.members) {
    relays.members.forEach((relay: any) => {
      if (relay.uuid != _uuid) {
        log.trace(`SCREECH: Added server '${relay.uuid}' to relay list.`);
        let newRelay: IRelayServer = _.pick(relay, [
          'name', 'uuid', 'address', 'port'
        ]);
        newRelay.client = new ScreechClient(undefined, { tryReconnect: false });
        newRelay.client.connect(newRelay.address, newRelay.port, undefined, undefined, undefined, true);
        _relayServers.set(relay.uuid, newRelay);
      }
    });
  }
}


/****************************************************************************
 **                                                                        **
 ** Screech API                                                            **
 **                                                                        **
 ****************************************************************************/

function _createDomain(payload: any) : IEndpointResponse
{
  let domainName = payload.name;
  let description = payload.description;
  let opts = payload.opts;
  let relay: boolean = payload.relay ? payload.relay : false;

  // Kick it off
  let domain: IDomain = messaging.createDomain(domainName, description, opts);
  if (!domain) {
    return { status: 400, result: messaging.lastError };
  }

  // Relay the request
  if (!relay) {
    _relayServers.forEach((relay: IRelayServer) => {
      relay.client.createDomain(domainName, description, opts);
    });
  }

  return { status: 200, result: { reason: 'Domain successfully created', uuid: domain.uuid } };
}


// NOTE: deleteDomain requests are not relayed
function _deleteDomain(payload: any) : IEndpointResponse
{
  let domainName = payload.name;
  if (!messaging.deleteDomain(domainName)) {
    return { status: 400, result: { reason: `Domain not found (${domainName})` } };
  }
  return { status: 200, result: { reason: `Domain successfully deleted (${domainName})` } };
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
  let domainName = payload.domain;
  let channelName = payload.name;
  let description = payload.description;
  let opts = payload.opts;
  let relay: boolean = payload.relay ? payload.relay : false;

  // Kick it off
  let channel:IChannel = messaging.createChannel(domainName, channelName, undefined, description, opts);
  if (!channel) {
    return { status: 400, result: messaging.lastError };
  }

  // Relay the request
  if (!relay) {
    _relayServers.forEach((relay: IRelayServer) => {
      relay.client.openChannel(domainName, channelName, description, opts);
    });
  }

  return { status: 200, result: { reason: 'Channel successfully opened', uuid: channel.uuid } };
}


// NOTE: deleteChannel requests are not relayed
function _deleteChannel(payload: any) : IEndpointResponse
{
  let domainName = payload.domain;
  let channelName = payload.name;
  if (!messaging.deleteChannel(domainName, channelName)) {
    return { status: 400, result: { reason: `Channel not found (${domainName}, ${channelName})` } };
  }
  return { status: 200, result: { reason: `Channel successfully deleted (${domainName}, ${channelName})` } };
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
  let domainName = payload.domain;
  let channelName = payload.channel;
  let messagePayload = payload.payload;
  let relay: boolean = payload.relay ? payload.relay : false;

  // Shoot it off
  if (relay) messagePayload.relay = true;
  let message: IMessage = messaging.emit(domainName, channelName, undefined, messagePayload);
  if (!message) {
    return { status: 400, result: messaging.lastError };
  }

  // Relay the request
  if (!relay) {
    _relayServers.forEach((relay: IRelayServer) => {
      relay.client.send(domainName, channelName, messagePayload);
    });
  }

  // All good
  return { status: 200, result: {
    reason: 'Message successfully sent.',
    uuid: message.uuid,
    domain: message.channel.domain.name,
    channel: message.channel.name } };
}


// NOTE: subscribe requests are not relayed
function _subscribe(payload: any) : IEndpointResponse
{
  let socket = payload.socket;
  let domainName = payload.domain;
  let channelName = payload.channel;

  let channel: IChannel = messaging.on(domainName, channelName, undefined, socket);
  if (!channel) {
    return { status: 400, result: messaging.lastError };
  }

  return { status: 200, result: {
      reason: 'Successfully subscribed to channel.',
      domain: channel.domain.name,
      channel: channel.name } };
}


function _clearStaleChannels(payload: any) : IEndpointResponse
{
  return { status: 200 };
}


function _getRegistry(payload: any) : IEndpointResponse
{
  return { status: 200, result: messaging.getChannelRegistry() };
}


function _getRelays(payload: any) : IEndpointResponse
{
  let returnItems: any[] = [];
  _relayServers.forEach((relay: IRelayServer) => {
    returnItems.push(_.pick(relay, [
      'name', 'uuid', 'address', 'port'
    ]));
  });
  return { status: 200, result: returnItems };
}


/****************************************************************************
 **                                                                        **
 ** Flagpole housekeeping                                                  **
 **                                                                        **
 ****************************************************************************/

export let flagpoleHandlers: IEndpointInfo[] = [
  { requestType: 'post',  path: '/screech/createdomain',       event: 'createDomain',       handler: _createDomain },
  { requestType: 'del',   path: '/screech/deletedomain',       event: 'deleteDomain',       handler: _deleteDomain },
  // { requestType: 'post',  path: '/screech/adddomainrelay',     event: 'addDomainRelay',     handler: _addDomainRelay },
  // { requestType: 'post',  path: '/screech/removedomainrelay',  event: 'removeDomainRelay',  handler: _removeDomainRelay },
  { requestType: 'post',  path: '/screech/openchannel',        event: 'openChannel',        handler: _openChannel },
  { requestType: 'del',   path: '/screech/deletechannel',      event: 'deleteChannel',      handler: _deleteChannel },
  { requestType: 'post',  path: '/screech/setchannelprops',    event: 'setChannelProps',    handler: _setChannelProperties },
  // { requestType: 'post',  path: '/screech/addchannelrelay',    event: 'addChannelRelay',    handler: _addChannelRelay },
  // { requestType: 'post',  path: '/screech/removechannelrelay', event: 'removeChannelRelay', handler: _removeChannelRelay },
  // { requestType: 'get',   path: '/screech/clearstalechannels', event: 'clearStaleChannels', handler: _clearStaleChannels },
  { requestType: 'get',   path: '/screech/getregistry',        event: 'getRegistry',        handler: _getRegistry },
  { requestType: 'get',   path: '/screech/getrelays',          event: 'getRelays',          handler: _getRelays },
  { requestType: 'post',  path: '/screech/send',               event: 'send',               handler: _send },
  {                                                            event: 'subscribe',          handler: _subscribe }
];
