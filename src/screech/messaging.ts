/****************************************************************************
 **                                                                        **
 ** Modules                                                                **
 **                                                                        **
 ****************************************************************************/

const  _                   = require('lodash');
const  uuidv4              = require('uuid/v4');
import * as utils            from '../util/pancake-utils';
import { PancakeError }      from '../util/pancake-err';
import { Configuration }     from '../util/pancake-config';
import { Token }             from '../util/tokens';
import { entitled }          from '../util/entitlements';
const  log                 = utils.log;


/****************************************************************************
 **                                                                        **
 ** Vars & definitions                                                     **
 **                                                                        **
 ****************************************************************************/

export interface IDomain {
  name: string,
  uuid: string,
  description?: string,
  opts: any,
  channels: Map<string, IChannel>
}

export interface IChannel {
  name: string,
  uuid: string,
  domain: IDomain,
  description?: string,
  entitledRoles?: string[],
  opts?: any,
  subscribers: Set<any> // set of sockets
}

export interface IMessage {
  uuid: string,
  payload: any,
  channel: IChannel,
  sent: number
}


/****************************************************************************
 **                                                                        **
 ** Class MessagEngine                                                     **
 **                                                                        **
 ****************************************************************************/

export class MessageEngine
{
  private _lastError: any;
  private _domains  = new Map<string, IDomain>();
  private _channels = new Map<string, IChannel>();
  private _lastDomain: IDomain;
  private _lastChannel: IChannel;
  private _lastToken: Token;


  /****************************************************************************
   **                                                                        **
   ** Private methods                                                        **
   **                                                                        **
   ****************************************************************************/

  private _processError(status: string, reason?: string, obj?: any, logError: boolean = true) : PancakeError
  {
    this._lastError = new PancakeError(status, reason, obj);
    if (true === logError) {
      log.trace(`SCREECH: ${status}: ${reason}`);
      if (obj) log.trace(obj);
    }
    return this._lastError;
  }


  private _getDomain(domainName: string) : IDomain
  {
    let checkName = domainName;
    if (checkName) {
      return this._domains.get(checkName.toLowerCase());
    }
    return;
  }


  private _isValidDomain(domainName: string) : boolean
  {
    return this._getDomain(domainName) ? true : false;
  }


  private _getChannel(domainName: string, channelName: string) : IChannel
  {
    let domain = this._getDomain(domainName);
    if (domain) {
      let checkChannelName = channelName;
      if (checkChannelName) {
        // Try the long-form name first
        let channel = this._channels.get(domain.name.toLowerCase() + '-' + checkChannelName.toLowerCase());
        if (channel) return channel;

        // Maybe channel is provided as a uuid?
        return this._channels.get(checkChannelName.toLowerCase());
      }
    }
    return;
  }


  private _isValidChannel(domainName: string, channelName: string) : boolean
  {
    return this._getChannel(domainName, channelName) ? true : false;
  }


  /****************************************************************************
   **                                                                        **
   ** Public methods                                                         **
   **                                                                        **
   ****************************************************************************/

  createDomain(domainName: string, description: string, opts?: any) : IDomain
  {
    // Quick and dirty validation
    if (!domainName) {
      this._processError('ERR_BAD_ARG', `Domain name not specified.`);
      return;
    }

    // Does this domain already exist?
    domainName = domainName.toLowerCase();
    let existingDomain = this._domains.get(domainName);
    if (existingDomain) {
      return existingDomain;
    }

    // Clean up and register
    let newDomain: IDomain = {
      name: domainName,
      uuid: uuidv4(),
      description,
      opts,
      channels: new Map<string, IChannel>()
    }
    this._domains.set(domainName, newDomain);
    this._domains.set(newDomain.uuid, newDomain);
    this._lastDomain = newDomain;

    return newDomain;
  }


  deleteDomain(domainName: string) : boolean
  {
    // Does this domain already exist?
    domainName = domainName.toLowerCase();
    let domain = this._domains.get(domainName);
    if (domain) {

      // Remove our channels first
      while (domain.channels.size) {
        this.deleteChannel(domain, domain.channels.entries().next().value[0]);
      }

      // ... and now the domain
      this._domains.delete(domainName);
      this._domains.delete(domain.uuid);
      return true;
    }
    return false;
  }


  createChannel(domainName: string, channelName: string,
                roles?: any, description?: string, opts?: any) : IChannel
  {
    // Quick and dirty validation
    let domain = this._getDomain(domainName);
    if (!domain) {
      this._processError('ERR_BAD_ARG', `Missing or invalid Domain name.`);
      return;
    }
    if (!channelName) {
      this._processError('ERR_BAD_ARG', `Missing Channel name.`);
      return;
    }

    // Pre-existing?
    let existingChannel = this._getChannel(domainName, channelName);
    if (existingChannel) {
      return existingChannel;
    }

    // Prep roles
    if (roles) {
      if (!Array.isArray(roles)) roles = [ roles ];
    }

    // Clean up and register
    channelName = channelName.toLowerCase();
    let newChannel: IChannel = {
      name: channelName,
      uuid: uuidv4(),
      domain,
      entitledRoles: roles,
      description,
      opts,
      subscribers: new Set<any>()
    }
    domain.channels.set(channelName, newChannel);
    this._channels.set(domain.name + '-' + channelName, newChannel);
    this._channels.set(newChannel.uuid, newChannel);
    this._lastDomain = domain;
    this._lastChannel = newChannel;

    return newChannel;
  }


  deleteChannel(domainNameOrObj: any, channelName: string) : boolean
  {
    // Extract our domain
    let domain: IDomain;
    let typeName = typeof domainNameOrObj;
    if ('string' === typeName) {
      let domainName = domainNameOrObj.toLowerCase();
      domain = this._domains.get(domainName);
    }
    else if ('object' === typeName) {
      domain = domainNameOrObj as IDomain;
    }
    if (!domain) {
      return false;
    }

    // Make sure the channel exists
    channelName = channelName.toLowerCase();
    let channel = domain.channels.get(channelName);
    if (!channel) {
      return false;
    }

    // Now blow away all of our matching channels
    domain.channels.delete(channelName);
    this._channels.delete(domain.name + '-' + channelName);
    this._channels.delete(channel.uuid);

    return true;
  }


  /*
  function _setChannelProperties(payload: any) : IEndpointResponse
  {
    return { status: 200 };
  }
  */


  emit(domainName: string, channelName: string, payload: any, token?: Token, logErrors: boolean = true) : IMessage
  {
      return this.send(domainName, channelName, payload, token, logErrors);
  }


  send(domainName: string, channelName: string, payload: any, token?: Token, logErrors: boolean = true) : IMessage
  {
    // Retrieve the channel
    let channel = this._getChannel(domainName, channelName);
    if (!channel) {
      this._processError('ERR_BAD_CHANNEL', `Could not retrieve channel ('${domainName}-${channelName}')`, undefined, logErrors);
      return;
    }

    // Authorized to use?
    if (!entitled(token, channel.domain.name, channel.entitledRoles)) {
      this._processError('ERR_UNAUTHORIZED', `Not authorized to send on this channel`, undefined, logErrors);
      return;
    }

    // Create the message
    let message: IMessage = {
      uuid: uuidv4(),
      payload,
      channel,
      sent: Date.now()
    }
    let subscriberMessage = _.pick(message, [
      'uuid', 'payload', 'sent'
    ]);
    subscriberMessage.domain = channel.domain.name;
    subscriberMessage.channel = channel.name;

    // Send the messages to local subscribers
    if (payload) {
      for (let socket of channel.subscribers) {
        socket.emit(channel.domain.name + '-' + channel.name, subscriberMessage);
      }
    }

    // Remember these params
    this._lastDomain = channel.domain;
    this._lastChannel = channel;
    this._lastToken = token;

    return message;
  }


  sendToLast(payload: any, token?: Token) : IMessage
  {
    if (!this._lastDomain || !this._lastChannel) {
      this._processError('ERR_LAST_PARAMS', `Invalid params from last call to 'send'.`);
      return;
    }
    return this.send(this._lastDomain.name, this._lastChannel.name, payload, token || this._lastToken);
  }


  on(domainName: string, channelName: string, socket: any, token?: Token) : IChannel
  {
    return this.subscribe(domainName, channelName, socket, token);
  }


  subscribe(domainName: string, channelName: string, socket: any, token?: Token) : IChannel
  {
    // Quick and dirty validation
    let domain = this._getDomain(domainName);
    if (!domain) {
      this._processError('ERR_BAD_ARG', `Missing or invalid Domain name.`);
      return;
    }

    // Retrieve the channel
    let channel = this._getChannel(domainName, channelName);
    if (!channel) {

      // If the channel doesn't exist, we'll create it
      channel = this.createChannel(domainName, channelName, undefined);
      if (!channel) {
        this._processError('ERR_BAD_CHANNEL', `Could not create channel '${channelName}'.`);
        return;
      }
      log.warn(`MESSAGING: Lazy-created public channel '${channelName}' with no authorization requirements.`);
    }

    // Authorized to use?
    else {
      if (!entitled(token, channel.domain.name, channel.entitledRoles)) {
        this._processError('ERR_UNAUTHORIZED', `Not authorized to subscribe to this channel`);
        return;
      }
    }

    // Add this subscriber to the subscriber list
    channel.subscribers.add(socket);

    return channel;
  }


  unsubscribe(domainName: string, channelName: string, socket: any) : IChannel
  {
    // Retrieve the channel
    let channel = this._getChannel(domainName, channelName);
    if (!channel) {
      this._processError('ERR_BAD_CHANNEL', `Could not retrieve channel ('${domainName}-${channelName}')`);
      return;
    }

    // Remove this subscriber from the subscriber list
    channel.subscribers.delete(socket);

    return channel;
  }


  unsubscribeAll(socket: any) : void
  {
    if (socket) {
      this._channels.forEach((channel: IChannel, name: string) => {
        channel.subscribers.delete(socket);
      });
    }
  }


  /*
  function _clearStaleChannels(payload: any) : IEndpointResponse
  {
    return { status: 200 };
  }
  */


  getChannelRegistry() : any[]
  {
    let returnItems: any[] = [];

    this._domains.forEach((domain: IDomain, domainName: string) => {
      if (domainName != domain.uuid) {
        let newDomain = {
          domain: domain.name,
          uuid: domain.uuid,
          description: domain.description,
          channels: new Array<any>()
        };
        domain.channels.forEach((channel: IChannel, channelName: string) => {
          if (channelName != channel.uuid) {
            newDomain.channels.push({
              channel: channel.name,
              uuid: channel.uuid,
              description: channel.description
            });
          }
        });
        returnItems.push(newDomain);
      }
    });
    return returnItems;
  }


  get lastError() : PancakeError
  {
    return this._lastError;
  }

} // END class MessageEngine


// THE singleton
export let messaging: MessageEngine;
if (!messaging) {
  messaging = new MessageEngine();
}
