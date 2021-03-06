/****************************************************************************
 **                                                                        **
 ** Modules                                                                **
 **                                                                        **
 ****************************************************************************/

import _                   = require('lodash');
import { PitbossClient }     from '../../../pitboss/api/pitboss_1.0.0/pitboss_client';
import { Cadre }             from '../../../pitboss/api/pitboss_1.0.0/cadre';
import { ScreechClient }     from './screech_client';
import * as utils            from '../../../util/pancake-utils';
import { PancakeError }      from '../../../util/pancake-err';
import { Configuration }     from '../../../util/pancake-config';
import { Token }             from '../../../util/tokens';
import { Entitlements }      from '../../../util/entitlements';
import { entitledEndpoint,
         IEndpointInfo,
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

// ENTITLEMENTS
const ENT_DOMAIN         = 'screech';
const ENT_ROLE_ADMIN     = 'admin';
const ENT_ROLE_GENERATOR = 'generator';
const ENT_ROLE_CONSUMER  = 'consumer';
const ENT_ROLE_TOOLS     = 'tools';
const API_TAG            = 'SCREECH';

interface IRelayServer {
     uuid: string,
     address: string,
     port: number,
     client?: ScreechClient
}

const RELAY_GROUP_NAME = 'DefaultRelays';

let _cadre: ScreechCadre;


/****************************************************************************
 **                                                                        **
 ** Class ScreechCadre                                                     **
 **                                                                        **
 ****************************************************************************/

export class ScreechCadre extends Cadre<IRelayServer>
{
  private _token: Token;

  /****************************************************************************
   **                                                                        **
   ** To override                                                            **
   **                                                                        **
   ****************************************************************************/

   protected createCohortRecord(serverInfo: any) : IRelayServer
   {
     let newRelay: IRelayServer = _.pick(serverInfo, [
       'name', 'uuid', 'address', 'port'
     ]);
     newRelay.client = new ScreechClient(this._token, { tryReconnect: false });
     newRelay.client.connect(newRelay.address, newRelay.port, undefined, undefined, undefined, true);
     return newRelay;
   }


   protected removeCohortRecord(relay: IRelayServer) : void
   {
     relay.client.close();
     relay.client = undefined;
   }


  /****************************************************************************
   **                                                                        **
   ** Constructor                                                            **
   **                                                                        **
   ****************************************************************************/

  constructor(pitboss: PitbossClient)
  {
    super(pitboss, RELAY_GROUP_NAME, API_TAG);
  }


  /****************************************************************************
   **                                                                        **
   ** Public methods                                                         **
   **                                                                        **
   ****************************************************************************/

  onAuthToken(newToken: Token) : void
  {
    // Remember this guy
    this._token = newToken;

    // Pass into all of our client APIs
    this._cohort.forEach((relay: IRelayServer) => {
      relay.client.token = newToken;
    });
  }


  relayCreateDomain(name: string, description: string, opts: any) : void
  {
    this._cohort.forEach((relay: IRelayServer) => {
      relay.client.createDomain(name, description, opts);
    });
  }


  relayOpenChannel(domainName: string, channelName: string,
                   entitledRoles: any, description: string, opts: any) : void
  {
    this._cohort.forEach((relay: IRelayServer) => {
      relay.client.openChannel(domainName, channelName, entitledRoles, description, opts);
    });
  }


  relaySend(domainName: string, channelName: string, messagePayload: any, useToken: Token) : void
  {
    this._cohort.forEach((relay: IRelayServer) => {
      relay.client.send(domainName, channelName, messagePayload, useToken);
    });
  }


  getRelays() : any[]
  {
    let returnItems: any[] = [];
    this._cohort.forEach((relay: IRelayServer) => {
      returnItems.push(_.pick(relay, [
        'name', 'uuid', 'address', 'port'
      ]));
    });
    return returnItems;
  }

} // END class ScreechCadre


/****************************************************************************
 **                                                                        **
 ** Framework callbacks                                                    **
 **                                                                        **
 ****************************************************************************/

export function initializeAPI(name: string, ver: string, apiToken:string,
                              config: Configuration,
                              opts: any) : PancakeError
{
  let eventSinks = opts.initEventsSink;

  // We want to hear about registration events
  if (opts.serverEventsSource) {
    _cadre = new ScreechCadre(opts.serverEventsSource as PitbossClient);
  }

  // Let folks know
  eventSinks.emit('initComplete', 'screech');

  return;
}


export function onAuthToken(newToken: Token) : PancakeError
{
  // Pass into all of our client APIs
  if (_cadre) {
    _cadre.onAuthToken(newToken);
  }

  return;
}


/****************************************************************************
 **                                                                        **
 ** Screech API                                                            **
 **                                                                        **
 ****************************************************************************/

function _createDomain(payload: any) : IEndpointResponse
{
  let { name, description, opts } = payload;
  let relay: boolean = payload.relay ? payload.relay : false;

  // Kick it off
  let domain: IDomain = messaging.createDomain(name, description, opts);
  if (!domain) {
    return { status: 400, result: messaging.lastError };
  }

  // Relay the request
  if (!relay && _cadre) {
    _cadre.relayCreateDomain(name, description, opts);
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


// function _addRelay(payload: any) : IEndpointResponse
// {
//   return { status: 200 };
// }


// function _removeRelay(payload: any) : IEndpointResponse
// {
//   return { status: 200 };
// }


function _openChannel(payload: any) : IEndpointResponse
{
  let { domain: domainName, name: channelName, entitledRoles, description, opts } = payload;
  let relay: boolean = payload.relay ? payload.relay : false;

  // Kick it off
  let channel:IChannel = messaging.createChannel(domainName, channelName, entitledRoles, description, opts);
  if (!channel) {
    return { status: 400, result: messaging.lastError };
  }

  // Relay the request
  if (!relay && _cadre) {
    _cadre.relayOpenChannel(domainName, channelName, entitledRoles, description, opts);
  }

  return { status: 200, result: { reason: 'Channel successfully opened', uuid: channel.uuid } };
}


// NOTE: deleteChannel requests are not relayed
function _deleteChannel(payload: any) : IEndpointResponse
{
  let { domain: domainName, name: channelName } = payload;
  if (!messaging.deleteChannel(domainName, channelName)) {
    return { status: 400, result: { reason: `Channel not found (${domainName}, ${channelName})` } };
  }
  return { status: 200, result: { reason: `Channel successfully deleted (${domainName}, ${channelName})` } };
}


// function _setChannelProperties(payload: any) : IEndpointResponse
// {
//   return { status: 200 };
// }


function _send(payload: any, token: Token) : IEndpointResponse
{
  let { domain: domainName, channel: channelName, payload: messagePayload, proxyToken } = payload;
  let relay: boolean = payload.relay ? payload.relay : false;
  let useToken: Token = token;

  // Proxy?
  if (proxyToken) {
    useToken = new Token(proxyToken);
  }

  // Shoot it off
  if (relay) messagePayload.relay = true;
  let message: IMessage = messaging.emit(domainName, channelName, messagePayload, useToken);
  if (!message) {
    return { status: 400, result: messaging.lastError };
  }

  // Relay the request
  if (!relay && _cadre) {
    _cadre.relaySend(domainName, channelName, messagePayload, useToken);
  }

  // All good
  return { status: 200, result: {
    reason: 'Message successfully sent.',
    uuid: message.uuid,
    domain: message.channel.domain.name,
    channel: message.channel.name } };
}


// NOTE: subscribe requests are not relayed
function _subscribe(payload: any, token: Token) : IEndpointResponse
{
  let { domain: domainName, channel: channelName, socket } = payload;

  let channel: IChannel = messaging.on(domainName, channelName, socket, token);
  if (!channel) {
    return { status: 400, result: messaging.lastError };
  }

  return { status: 200, result: {
      reason: 'Successfully subscribed to channel.',
      domain: channel.domain.name,
      channel: channel.name } };
}


// function _clearStaleChannels(payload: any) : IEndpointResponse
// {
//   return { status: 200 };
// }


function _getRegistry(payload: any) : IEndpointResponse
{
  return { status: 200, result: messaging.getChannelRegistry() };
}


function _getRelays(payload: any) : IEndpointResponse
{
  let returnItems = _cadre ? _cadre.getRelays() : undefined;
  return { status: 200, result: returnItems };
}


/****************************************************************************
 **                                                                        **
 ** Flagpole housekeeping                                                  **
 **                                                                        **
 ****************************************************************************/

export let flagpoleHandlers: IEndpointInfo[] = [
  {
    requestType: 'post',
    path: '/screech/createdomain',
    event: 'createDomain',
    handler: entitledEndpoint(ENT_DOMAIN, [ ENT_ROLE_GENERATOR, ENT_ROLE_TOOLS, ENT_ROLE_ADMIN ], API_TAG, _createDomain)
  },
  {
    requestType: 'del',
    path: '/screech/deletedomain',
    event: 'deleteDomain',
    handler: entitledEndpoint(ENT_DOMAIN, [ ENT_ROLE_GENERATOR, ENT_ROLE_TOOLS, ENT_ROLE_ADMIN ], API_TAG, _deleteDomain)
  },
  // { requestType: 'post',  path: '/screech/addrelay',     event: 'addRelay',     handler: _addRelay },
  // { requestType: 'post',  path: '/screech/removerelay',  event: 'removeRelay',  handler: _removeRelay },
  {
    requestType: 'post',
    path: '/screech/openchannel',
    event: 'openChannel',
    handler: entitledEndpoint(ENT_DOMAIN, [ ENT_ROLE_GENERATOR, ENT_ROLE_CONSUMER, ENT_ROLE_TOOLS, ENT_ROLE_ADMIN ], API_TAG, _openChannel)
  },
  {
    requestType: 'del',
    path: '/screech/deletechannel',
    event: 'deleteChannel',
    handler: entitledEndpoint(ENT_DOMAIN, [ ENT_ROLE_GENERATOR, ENT_ROLE_TOOLS, ENT_ROLE_ADMIN ], API_TAG, _deleteChannel)
  },
  // { requestType: 'post',  path: '/screech/setchannelprops',    event: 'setChannelProps',    handler: _setChannelProperties },
  // { requestType: 'get',   path: '/screech/clearstalechannels', event: 'clearStaleChannels', handler: _clearStaleChannels },
  {
    requestType: 'get',
    path: '/screech/getregistry',
    event: 'getRegistry',
    handler: entitledEndpoint(ENT_DOMAIN, [ ENT_ROLE_GENERATOR, ENT_ROLE_CONSUMER, ENT_ROLE_TOOLS, ENT_ROLE_ADMIN ], API_TAG, _getRegistry)
  },
  {
    requestType: 'get',
    path: '/screech/getrelays',
    event: 'getRelays',
    handler: entitledEndpoint(ENT_DOMAIN, [ ENT_ROLE_TOOLS, ENT_ROLE_ADMIN ], API_TAG, _getRelays)
  },
  {
    requestType: 'post',
    path: '/screech/send',
    event: 'send',
    handler: entitledEndpoint(ENT_DOMAIN, [ ENT_ROLE_GENERATOR, ENT_ROLE_TOOLS, ENT_ROLE_ADMIN ], API_TAG, _send)
  },
  {
    event: 'subscribe',
    handler: entitledEndpoint(ENT_DOMAIN, [ ENT_ROLE_CONSUMER, ENT_ROLE_TOOLS, ENT_ROLE_ADMIN ], API_TAG, _subscribe)
  }
];
