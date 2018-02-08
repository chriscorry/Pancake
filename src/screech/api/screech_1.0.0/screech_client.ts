/****************************************************************************
 **                                                                        **
 ** Modules                                                                **
 **                                                                        **
 ****************************************************************************/

// import EventEmitter      = require('events');
// import socketIOClient    = require('socket.io-client');

import { ListenerCallback,
         ClientAPI }     from '../../../util/clientapi';
import * as utils        from '../../../util/pancake-utils';
import { PancakeError }  from '../../../util/pancake-err';
import { Configuration } from '../../../util/pancake-config';
const log = utils.log;


/****************************************************************************
 **                                                                        **
 ** Vars & definitions                                                     **
 **                                                                        **
 ****************************************************************************/


/****************************************************************************
 **                                                                        **
 ** Class ScreechClient                                                    **
 **                                                                        **
 ****************************************************************************/

export class ScreechClient extends ClientAPI
{
  private _activeDomains = new Set<[string, string, any]>();
  private _activeChannels = new Set<[string, string, string, any]>();
  private _activeSubs = new Set<[string,string]>();
  private _lastDomain: string;
  private _lastChannel: string;


  /****************************************************************************
   **                                                                        **
   ** Overrides                                                              **
   **                                                                        **
   ****************************************************************************/

  protected async _performPostConnectTasks(reconnecting: boolean) : Promise<void>
  {
    if (reconnecting) {
      let waitArray: Promise<PancakeError>[] = [];

      // Re-setup domains first, then channels, then subs
      this._activeDomains.forEach((domain) => {
        waitArray.push(this.createDomain.apply(this, domain));
      });
      await Promise.all(waitArray);
      waitArray = [];
      this._activeChannels.forEach((channel) => {
        waitArray.push(this.openChannel.apply(this, channel));
      });
      await Promise.all(waitArray);
      waitArray = [];
      this._activeSubs.forEach((sub) => {
        waitArray.push(this._subscribe.apply(this, sub));
      });
      await Promise.all(waitArray);
    }
  }


  protected _performConnectCleanup() : void
  {
    // Clear out active domains, channels, and subscriptions
    this._activeDomains.clear();
    this._activeChannels.clear();
    this._activeSubs.clear();
  }


  /****************************************************************************
   **                                                                        **
   ** Private methods                                                        **
   **                                                                        **
   ****************************************************************************/

  async _subscribe(domainName: string, channelName: string, onMessage?: ListenerCallback) : Promise<PancakeError>
  {
    // Simple validation checks
    if (!this.connected) {
      return this._processError('ERR_NO_CONNECTION', `SCREECH: Not connected to server.`);
    }

    // Check to see if we are already subscribed
    domainName = domainName.toLowerCase();
    channelName = channelName.toLowerCase();
    if (onMessage) {
      if (this._activeSubs.has([domainName, channelName])) {
        this.on(domainName + '-' + channelName, onMessage);
        return;
      }
    }

    // Kick off the request
    return new Promise<PancakeError>((resolve, reject) => {
      this._socket.emit('screech:subscribe', { domain: domainName, channel: channelName }, this._timeoutCallback((resp: any) => {

        if (!(resp instanceof PancakeError)) {

          // The server resonded
          if (200 === resp.status) {

            // Add event listeners
            // We ALWAYS need this step
            this._socket.on(domainName + '-' + channelName, (message:any) => {
              this.emit(domainName + '-' + channelName, message);
            });

            // We only do these steps the first time (i.e., not on reconnects)
            if (onMessage) {
              this.on(domainName + '-' + channelName, onMessage);
              this._activeSubs.add([domainName, channelName]);
            }

            resolve();
          }
          else
            reject(resp.result);
        }
        else {
          reject(resp as PancakeError);
        }

      }));
    });
  }


  /****************************************************************************
   **                                                                        **
   ** Public methods                                                         **
   **                                                                        **
   ****************************************************************************/

   constructor()
   {
     super('Screech', 'screech', '1.0.0');
   }


  /****************************************************************************
   **                                                                        **
   ** Public methods                                                         **
   **                                                                        **
   ****************************************************************************/

  async createDomain(domainName: string, description: string, opts?: any) : Promise<PancakeError>
  {
    // Simple validation checks
    if (!this.connected) {
      return this._processError('ERR_NO_CONNECTION', `SCREECH: Not connected to server.`);
    }

    // Kick off the request
    return new Promise<PancakeError>((resolve, reject) => {
      this._socket.emit('screech:createDomain', { name: domainName, description, opts }, this._timeoutCallback((resp: any) => {

        if (!(resp instanceof PancakeError)) {

          // The server responded
          if (200 === resp.status) {

            // Remember that this is an active domain in case we get
            // disconnected and need to reconstitute our state
            domainName = domainName.toLowerCase();
            this._activeDomains.add([domainName, description, opts]);
            this._lastDomain = domainName;
            resolve();
          }
          else
            reject(resp.result);
        }
        else {
          reject(resp as PancakeError);
        }

      }));
    });
  }


  async deleteDomain(domainName: string) : Promise<PancakeError>
  {
    // Simple validation checks
    if (!this.connected) {
      return this._processError('ERR_NO_CONNECTION', `SCREECH: Not connected to server.`);
    }

    // Kick off the request
    return new Promise<PancakeError>((resolve, reject) => {
      this._socket.emit('screech:deleteDomain', { name: domainName }, this._timeoutCallback((resp: any) => {

        if (!(resp instanceof PancakeError)) {

          // The server responded
          if (200 === resp.status) {

            // No longer an active domain
            domainName = domainName.toLowerCase();
            this._activeDomains = utils.filterSet(this._activeDomains, (value: [string, string, any]) => {
              if (value[0] != domainName)
                return true;
            });

            // All of this domain's channel's are gone now too
            this._activeChannels = utils.filterSet(this._activeChannels, (value: [string, string, string, any]) => {
              if (value[0] != domainName)
                return true;
            });

            resolve();
          }
          else
            reject(resp.result);
        }
        else {
          reject(resp as PancakeError);
        }

      }));
    });
  }


  async openChannel(domainName: string, channelName: string, description: string, opts?: any) : Promise<PancakeError>
  {
    // Simple validation checks
    if (!this.connected) {
      return this._processError('ERR_NO_CONNECTION', `SCREECH: Not connected to server.`);
    }

    // Kick off the request
    return new Promise<PancakeError>((resolve, reject) => {
      this._socket.emit('screech:openChannel', { domain: domainName, name: channelName, description, opts }, this._timeoutCallback((resp: any) => {

        if (!(resp instanceof PancakeError)) {

          // The server responded
          if (200 === resp.status) {

            // Remember that this is an active channel in case we get
            // disconnected and need to reconstitute our state
            domainName = domainName.toLowerCase();
            channelName = channelName.toLowerCase();
            this._activeChannels.add([domainName, channelName, description, opts]);
            this._lastDomain = domainName;
            this._lastChannel = channelName;
            resolve();
          }
          else
            reject(resp.result);
        }
        else {
          reject(resp as PancakeError);
        }

      }));
    });
  }


  async deleteChannel(domainName: string, channelName: string) : Promise<PancakeError>
  {
    // Simple validation checks
    if (!this.connected) {
      return this._processError('ERR_NO_CONNECTION', `SCREECH: Not connected to server.`);
    }

    // Kick off the request
    return new Promise<PancakeError>((resolve, reject) => {
      this._socket.emit('screech:deleteChannel', { domain: domainName, name: channelName }, this._timeoutCallback((resp: any) => {

        if (!(resp instanceof PancakeError)) {

          // The server responded
          if (200 === resp.status) {

            // Take out the channel
            domainName = domainName.toLowerCase();
            channelName = channelName.toLowerCase();
            this._activeChannels = utils.filterSet(this._activeChannels, (value: [string, string, string, any]) => {
              if (value[0] === domainName && value[1] === channelName)
                return false;
              return true;
            });

            // ... and any subscriptions
            this._activeSubs = utils.filterSet(this._activeSubs, (value: [string, string]) => {
              if (value[0] === domainName && value[1] === channelName) {
                this.removeAllListeners(domainName + '-' + channelName);
                this._socket.removeAllListeners(domainName + '-' + channelName);
                return false;
              }
              return true;
            });

            resolve();
          }
          else
            reject(resp.result);
        }
        else {
          reject(resp as PancakeError);
        }

      }));
    });
  }


  async send(domainName: string, channelName: string, payload: any) : Promise<PancakeError>
  {
    // Simple validation checks
    if (!this.connected) {
      return this._processError('ERR_NO_CONNECTION', `SCREECH: Not connected to server.`);
    }

    // Kick off the request
    return new Promise<PancakeError>((resolve, reject) => {
      this._socket.emit('screech:send', { domain: domainName, channel: channelName, payload }, this._timeoutCallback((resp: any) => {

        if (!(resp instanceof PancakeError)) {

          // The server responded
          if (200 === resp.status) {
            domainName = domainName.toLowerCase();
            channelName = channelName.toLowerCase();
            this._lastDomain = domainName;
            this._lastChannel = channelName;
            resolve();
          }
          else
            reject(resp.result);
        }
        else {
          reject(resp as PancakeError);
        }

      }));
    });
  }


  async sendToLast(payload: any) : Promise<PancakeError>
  {
    if (!this._lastDomain || !this._lastChannel) {
      return this._processError('ERR_LAST_PARAMS', `Invalid params from last call to 'send'.`);
    }
    return this.send(this._lastDomain, this._lastChannel, payload);
  }


  async subscribe(domainName: string, channelName: string, onMessage: ListenerCallback) : Promise<PancakeError>
  {
    return this._subscribe(domainName, channelName, onMessage);
  }

} // END class ScreechClient
