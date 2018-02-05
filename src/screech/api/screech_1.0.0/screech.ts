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

  // Kick it off
  let domain: IDomain = messaging.createDomain(domainName, description, opts);
  if (!domain) {
    return { status: 400, result: messaging.getLastError() };
  }

  return { status: 200, result: { reason: 'Domain successfully created', uuid: domain.uuid } };
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
  let domainName = payload.domain;
  let channelName = payload.name;
  let description = payload.description;
  let opts = payload.opts;

  // Kick it off
  let channel:IChannel = messaging.createChannel(domainName, channelName, undefined, description, opts);
  if (!channel) {
    return { status: 400, result: messaging.getLastError() };
  }

  return { status: 200, result: { reason: 'Channel successfully opened', uuid: channel.uuid } };
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

  // Shoot it off
  let message: IMessage = messaging.send(domainName, channelName, undefined, messagePayload);
  if (!message) {
    return { status: 400, result: messaging.getLastError() };
  }

  // All good
  return { status: 200, result: {
    reason: 'Message successfully sent.',
    uuid: message.uuid,
    domain: message.channel.domain.uuid,
    channel: message.channel.uuid } };
}


function _sendToLast(payload: any) : IEndpointResponse
{
  let messagePayload = payload.payload;

  // Shoot it off
  let message: IMessage = messaging.sendToLast(messagePayload);
  if (!message) {
    return { status: 400, result: messaging.getLastError() };
  }

  // All good
  return { status: 200, result: {
    reason: 'Message successfully sent.',
    uuid: message.uuid,
    domain: message.channel.domain.uuid,
    channel: message.channel.uuid } };
}


function _subscribe(payload: any) : IEndpointResponse
{
  let socket = payload.socket;
  let domainName = payload.domain;
  let channelName = payload.channel;

  let channel: IChannel = messaging.subscribe(domainName, channelName, undefined, socket);
  if (!channel) {
    return { status: 400, result: messaging.getLastError() };
  }

  return { status: 200, result: {
      reason: 'Successfully subscribed to channel.',
      domain: channel.domain.uuid,
      channel: channel.uuid } };
}


function _clearStaleChannels(payload: any) : IEndpointResponse
{
  return { status: 200 };
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
  { requestType: 'post',  path: '/screech/sendtolast',         event: 'sendToLast',         handler: _sendToLast },
  {                                                            event: 'subscribe',          handler: _subscribe }
];