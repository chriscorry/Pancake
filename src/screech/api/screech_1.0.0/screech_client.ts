/****************************************************************************
 **                                                                        **
 ** Modules                                                                **
 **                                                                        **
 ****************************************************************************/

import EventEmitter      = require('events');
import socketIOClient    = require('socket.io-client');

import * as utils        from '../../../util/pancake-utils';
import { PancakeError }  from '../../../util/pancake-err';
import { Configuration } from '../../../util/pancake-config';
const log = utils.log;


/****************************************************************************
 **                                                                        **
 ** Vars & definitions                                                     **
 **                                                                        **
 ****************************************************************************/

// URLs
const URL_HTTP                   = 'http://';
const URL_HTTPS                  = 'https://';
const SCREECH_RECONNECT_INTERVAL = 15; // sec
const SCREECH_CONNECT_TIMEOUT    = 10; // sec

// Other constants
const HTTP_REQUEST_HEADER = {
  headers: { 'Content-Type': 'application/json', 'Accept-Version': "1" }
}

type ListenerCallback = (...args: any[]) => void;
type DisconnectCallback = (socket:any) => void;


/****************************************************************************
 **                                                                        **
 ** Class ScreechClient                                                    **
 **                                                                        **
 ****************************************************************************/

export class ScreechClient extends EventEmitter
{
  private _screechBaseURL: string;
  private _connected = false;
  private _reconnecting = false;
  private _reconnectInterval = SCREECH_RECONNECT_INTERVAL;
  private _timerID: NodeJS.Timer;
  private _lastError: any;
  private _screechSocket: any;
  private _activeDomains = new Set<[string, string, any]>();
  private _activeChannels = new Set<[string, string, string, any]>();
  private _activeSubs = new Set<[string,string]>();
  private _lastDomain: string;
  private _lastChannel: string;


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


  private _timeoutCallback(callback: Function)
  {
    let called = false;

    let timerID = setTimeout(() => {
      if (called) return;
        called = true;
        callback(new PancakeError('ERR_CALLBACK_TIMEOUT'));
    },
    SCREECH_CONNECT_TIMEOUT*1000);

    return function() {
      if (called) return;
      called = true;
      clearTimeout(timerID);
      callback.apply(this, arguments);
    }
  }


  private _reconnect()
  {
    log.info('SCREECH: Trying to establish connection with Screech server.');

    // Give it a shot
    this._connect(false);
  }


  private _initiateReconnects()
  {
    this._cancelReconnects();
    this._screechSocket = undefined;
    this._connected = false;
    this._reconnecting = true;
    this._timerID = setTimeout(() => { this._reconnect(); }, this._reconnectInterval*1000);
  }


  private _cancelReconnects()
  {
    if (this._timerID) {
      clearTimeout(this._timerID);
      this._timerID = undefined;
    }
    this._reconnecting = false;
  }


  private _onDisconnect(socket: any)
  {
    // Let everyone know
    log.info(`SCREECH: Lost connection to Screech server.`);
    this.emit('disconnect');

    // Try again
    this._initiateReconnects();
  }


  private async _postRegistration(socket: any) : Promise<void>
  {
    // Remember save off vitals
    this._screechSocket = socket;
    this._connected = true;
    let resubscribe = this._reconnecting;

    // Cancel any reconnect attempts
    this._cancelReconnects();

    // Make sure we receive important notifications
    this._screechSocket.on('disconnect', () => { this._onDisconnect(socket); });

    // Let everyone know
    this.emit('connect');

    // Hook everything back up again
    if (true === resubscribe) {

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


  private async _connect(logErrors: boolean) : Promise<PancakeError>
  {
    let socketClient: any;

    return new Promise<PancakeError>((resolve, reject) => {

      // Kick it all off
      try {

        // Make our websocket connect
        socketClient = socketIOClient(this._screechBaseURL + '/', { reconnection: false });
        if (!socketClient) {
          this._initiateReconnects();
          this._processError('ERR_SCREECH_CONNECT', `SCREECH: Could not connect to Screech server ${this._screechBaseURL}`, undefined, logErrors);
        }

        // Get access to the Screech API
        socketClient.emit('negotiate', { name: 'screech', ver: '1.0.0' }, this._timeoutCallback((negotiateResp: any) => {

          // Timeout?
          if (!(negotiateResp instanceof PancakeError)) {

            // Everything okay?
            if (negotiateResp[0].status === 'SUCCESS') {

              // We are connected
              this._postRegistration(socketClient);
              resolve();
            }
            else if (true === logErrors) {
              reject(this._processError('ERR_SCREECH_NEGOTIATE', `SCREECH: Could not negotiate Screech API with server`, negotiateResp[0]));
            }
          }

          // Callback timeout
          else {
            socketClient.close();
            socketClient = undefined;
            this._initiateReconnects();
            this._processError('ERR_SCREECH_NEGOTIATE_TIMEOUT', 'Screech API negotiate timeout.', undefined, logErrors);
          }
        }));

      } catch (error) {
        socketClient.close();
        socketClient = undefined;
        this._initiateReconnects();
        return this._processError('ERR_SCREECH_CONNECT', `SCREECH: Could not connect to Screech server ${this._screechBaseURL}`, undefined, logErrors);
      }

      return;
    });
  }


  async _subscribe(domainName: string, channelName: string, onMessage?: ListenerCallback) : Promise<PancakeError>
  {
    // Simple validation checks
    if (!this._connected) {
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
      this._screechSocket.emit('screech:subscribe', { domain: domainName, channel: channelName }, this._timeoutCallback((resp: any) => {

        if (!(resp instanceof PancakeError)) {

          // The server resonded
          if (200 === resp.status) {

            // Add event listeners
            // We ALWAYS need this step
            this._screechSocket.on(domainName + '-' + channelName, (message:any) => {
              this.emit(channelName, message);
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

  async connect(address: string, port: number, onConnect: ListenerCallback = undefined, onDisconnect: DisconnectCallback = undefined) : Promise<PancakeError>
  {
    // CLose up shop and cancel any reconnect attempts
    if (this._screechSocket) {
      this._screechSocket.close();
      this._screechSocket = undefined;
    }
    this._connected = false;
    this._cancelReconnects();

    // Clear out active domains, channels, and subscriptions
    this._activeDomains.clear();
    this._activeChannels.clear();
    this._activeSubs.clear();

    // Clear out old event handlers
    this.removeAllListeners();

    // Remember these callbacks
    if (onConnect) this.on('connect', onConnect);
    if (onDisconnect) this.on('disconnect', onDisconnect);

    // Build our URL
    this._screechBaseURL = URL_HTTP + address + ':' + port;

    // Kick it all off
    return this._connect(true);
  }


  async createDomain(domainName: string, description: string, opts?: any) : Promise<PancakeError>
  {
    // Simple validation checks
    if (!this._connected) {
      return this._processError('ERR_NO_CONNECTION', `SCREECH: Not connected to server.`);
    }

    // Kick off the request
    return new Promise<PancakeError>((resolve, reject) => {
      this._screechSocket.emit('screech:createDomain', { name: domainName, description, opts }, this._timeoutCallback((resp: any) => {

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
    if (!this._connected) {
      return this._processError('ERR_NO_CONNECTION', `SCREECH: Not connected to server.`);
    }

    // Kick off the request
    return new Promise<PancakeError>((resolve, reject) => {
      this._screechSocket.emit('screech:deleteDomain', { name: domainName }, this._timeoutCallback((resp: any) => {

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
    if (!this._connected) {
      return this._processError('ERR_NO_CONNECTION', `SCREECH: Not connected to server.`);
    }

    // Kick off the request
    return new Promise<PancakeError>((resolve, reject) => {
      this._screechSocket.emit('screech:openChannel', { domain: domainName, name: channelName, description, opts }, this._timeoutCallback((resp: any) => {

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
    if (!this._connected) {
      return this._processError('ERR_NO_CONNECTION', `SCREECH: Not connected to server.`);
    }

    // Kick off the request
    return new Promise<PancakeError>((resolve, reject) => {
      this._screechSocket.emit('screech:deleteChannel', { domain: domainName, name: channelName }, this._timeoutCallback((resp: any) => {

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
                this._screechSocket.removeAllListeners(domainName + '-' + channelName);
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
    if (!this._connected) {
      return this._processError('ERR_NO_CONNECTION', `SCREECH: Not connected to server.`);
    }

    // Kick off the request
    return new Promise<PancakeError>((resolve, reject) => {
      this._screechSocket.emit('screech:send', { domain: domainName, channel: channelName, payload }, this._timeoutCallback((resp: any) => {

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


  get lastError() : PancakeError
  {
    return this._lastError;
  }


  get connected() : boolean
  {
    return this._connected;
  }

} // END class ScreechClient
