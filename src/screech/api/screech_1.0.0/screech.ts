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

interface IRelayServer {
    uuid: string,
    address: string,
    port: number
}

interface IDomain {
  name: string,
  uuid: string,
  description?: string,
  opts: any,
  channels: Map<string, IChannel>
  relays: IRelayServer[];
}

interface IChannel {
  name: string,
  uuid: string,
  domain: IDomain,
  version: string,
  description?: string,
  opts?: any,
  subscribers: any[]
  relays: IRelayServer[];
}

interface IMessage {
  payload: any,
  version: string,
  channel: IChannel,
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


function _getDomain(domainName: string) : IDomain
{
  let checkName = domainName;
  if (checkName) {
    return _domains.get(checkName.toLowerCase());
  }
  return;
}


function _isValidDomain(domainName: string) : boolean
{
  return _getDomain(domainName) ? true : false;
}


function _getChannel(domainName: string, channelName: string) : IChannel
{
  let domain = _getDomain(domainName);
  if (domain) {
    let checkChannelName = channelName;
    if (checkChannelName) {
      return _channels.get(domain.name + '-' + checkChannelName.toLowerCase());
    }
  }
  return;
}


function _isValidChannel(domainName: string, channelName: string) : boolean
{
  return _getChannel(domainName, channelName) ? true : false;
}


function _createChannel(domainName: string, channelName: string, version: string, description?: string, opts?: any) : IChannel
{
  // Quick and dirty validation
  let domain = _getDomain(domainName);
  if (!domain) {
    _processError('ERR_BAD_ARG', `Missing or invalid Domain name.`);
    return;
  }
  if (!channelName) {
    _processError('ERR_BAD_ARG', `Missing Channel name.`);
    return;
  }

  // Pre-existing?
  let existingChannel = _getChannel(domainName, channelName);
  if (existingChannel) {
    return existingChannel;
  }

  // Clean up and register
  channelName = channelName.toLowerCase();
  let newChannel: IChannel = {
    name: channelName,
    uuid: uuidv4(),
    domain,
    version,
    description,
    opts,
    subscribers: [],
    relays: []
  }
  _channels.set(domain.name + '-' + channelName, newChannel);
  _channels.set(newChannel.uuid, newChannel);

  return newChannel;
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

  // Quick and dirty validation
  if (!domainName) {
    return { status: 400, result: _processError('ERR_BAD_ARG', `Domain name not specified.`) };
  }

  // Does this domain already exist?
  domainName = domainName.toLowerCase();
  let existingDomain = _domains.get(domainName);
  if (existingDomain) {
    return { status: 200, result: { reason: 'Domain already exists', uuid: existingDomain.uuid } };
  }

  // Clean up and register
  let newDomain: IDomain = {
    name: domainName,
    uuid: uuidv4(),
    description,
    opts,
    channels: new Map<string, IChannel>(),
    relays: []
  }
  _domains.set(domainName, newDomain);
  _domains.set(newDomain.uuid, newDomain);

  return { status: 200, result: { reason: 'Domain successfully created', uuid: newDomain.uuid } };
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

  let newChannel = _createChannel(domainName, channelName, undefined, description, opts);
  if (!newChannel) {
    return { status: 400, result: getLastError() };
  }

  return { status: 200, result: { reason: 'Channel successfully opened', uuid: newChannel.uuid } };
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
