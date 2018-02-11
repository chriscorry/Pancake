/****************************************************************************
 **                                                                        **
 ** Modules                                                                **
 **                                                                        **
 ****************************************************************************/

import EventEmitter      = require('events');
import socketIOClient    = require('socket.io-client');

import * as utils        from './pancake-utils';
import { PancakeError }  from './pancake-err';
import { Configuration } from './pancake-config';
const log = utils.log;


/****************************************************************************
 **                                                                        **
 ** Vars & definitions                                                     **
 **                                                                        **
 ****************************************************************************/

// URLs
const URL_HTTP           = 'http://';
const URL_HTTPS          = 'https://';
const RECONNECT_INTERVAL = 15; // sec
const CONNECT_TIMEOUT    = 10; // sec

// Other constants
const HTTP_REQUEST_HEADER = {
  headers: { 'Content-Type': 'application/json', 'Accept-Version': "1" }
}

export type ListenerCallback = (...args: any[]) => void;
export type DisconnectCallback = (socket:any) => void;


/****************************************************************************
 **                                                                        **
 ** Class ClientAPI                                                        **
 **                                                                        **
 ****************************************************************************/

export class ClientAPI extends EventEmitter
{
  private _connected = false;
  private _reconnecting = false;
  private _reconnectInterval = RECONNECT_INTERVAL;
  private _timerID: NodeJS.Timer;
  private _lastError: any;
  protected _baseURL: string;
  protected _socket: any;

  // Provided by subclasses
  private _serviceName: string;
  private _serviceNameUCase: string;
  private _serverAPI: string;
  private _serverAPIVer: string;


  /****************************************************************************
   **                                                                        **
   ** Private methods                                                        **
   **                                                                        **
   ****************************************************************************/

  private _onDisconnect(socket: any) : void
  {
    // Let everyone know
    this.emit('disconnect', socket);
    log.info(`${this._serviceNameUCase}: Lost connection to ${this._serviceName} server. Will attempt to reconnect in ${this._reconnectInterval} sec.`);

    // Try again
    this._initiateReconnects();
  }


  private _cancelReconnects() : void
  {
    if (this._timerID) {
      clearTimeout(this._timerID);
      this._timerID = undefined;
    }
    this._reconnecting = false;
  }


  private _initiateReconnects(connectFunc?: Function, passThis: boolean = false) : void
  {
    this._cancelReconnects();
    this._socket = undefined;
    this._connected = false;
    this._reconnecting = true;
    this._timerID = setTimeout(() => {

      // Let folks know
      log.info(`${this._serviceNameUCase}: Trying to establish connection with ${this._serviceName} server.`);

      // Give it another shot
      if (!connectFunc) {
        this._connect(false);
      }
      else {
        passThis ? connectFunc(this, false) : connectFunc.bind(this, false);
      }
     }, this._reconnectInterval*1000);
  }


  private async _postConnect(socket: any) : Promise<void>
  {
    // Remember save off vitals
    this._socket = socket;
    this._connected = true;
    let reconnecting = this._reconnecting;

    // Cancel any reconnect attempts
    this._cancelReconnects();

    // Make sure we receive important notifications
    this._socket.on('disconnect', () => { this._onDisconnect(socket); });

    // Hook everything back up again
    this._performPostConnectTasks(reconnecting);

    // Let everyone know
    this.emit('connect');
  }


  private async _connect(logErrors: boolean) : Promise<PancakeError>
  {
    let socketClient: any;

    return new Promise<PancakeError>((resolve, reject) => {

      function _innerConnect(client: ClientAPI, logErrorsInner: boolean) : PancakeError
      {
        // Make our websocket connect
        socketClient = socketIOClient(client._baseURL + '/');
        if (!socketClient) {
          client._initiateReconnects(_innerConnect, true);
          return client._processError('ERR_CLIENT_CONNECT', `${client._serviceNameUCase}: Could not connect to ${client._serviceName} server ${client._baseURL}`, undefined, logErrorsInner);
        }

        // Kick it all off
        try {

          // Get access to the API
          socketClient.emit('negotiate', { name: client._serverAPI, ver: client._serverAPIVer }, client._timeoutCallback((negotiateResp: any) => {

            // Timeout?
            if (!(negotiateResp instanceof PancakeError)) {

              // Everything okay?
              if (negotiateResp[0].status === 'SUCCESS') {

                // We are connected
                client._postConnect(socketClient);
                resolve();
              }
              else if (true === logErrors) {
                reject(client._processError('ERR_CLIENT_NEGOTIATE', `${client._serviceNameUCase}: Could not negotiate ${client._serviceName} API with server`, negotiateResp[0]));
              }
            }

            // Callback timeout
            else {
              socketClient.close();
              socketClient = undefined;
              client._initiateReconnects(_innerConnect, true);
              client._processError('ERR_NEGOTIATE_TIMEOUT', `${client._serviceNameUCase}: ${client._serviceName} API negotiate timeout.`, undefined, logErrorsInner);
            }
          }));

        } catch (error) {
          socketClient.close();
          socketClient = undefined;
          client._initiateReconnects(_innerConnect, true);
          return client._processError('ERR_CLIENT_CONNECT', `${client._serviceNameUCase}: Could not connect to ${client._serviceName} server ${client._baseURL}`, undefined, logErrorsInner);
        }
      }

      // Okay, kick it off
      _innerConnect(this, logErrors);
    });
  }


  /****************************************************************************
   **                                                                        **
   ** Protected methods                                                      **
   **                                                                        **
   ****************************************************************************/

   protected _timeoutCallback(callback: Function) : () => void
   {
     let called = false;

     let timerID = setTimeout(() => {
       if (called) return;
         called = true;
         callback(new PancakeError('ERR_CALLBACK_TIMEOUT'));
     },
     CONNECT_TIMEOUT*1000);

     return function() {
       if (called) return;
       called = true;
       clearTimeout(timerID);
       callback.apply(this, arguments);
     }
   }


  protected _processError(status: string, reason?: string, obj?: any, logError: boolean = true) : PancakeError
  {
    this._lastError = new PancakeError(status, reason, obj);
    if (true === logError) {
      log.trace(`${this._serviceNameUCase}: ${status}: ${reason}`);
      if (obj) log.trace(obj);
    }
    return this._lastError;
  }


  protected async _baseConnect(address: string, port: number, onConnect: ListenerCallback = undefined, onDisconnect: DisconnectCallback = undefined) : Promise<PancakeError>
  {
    // Clean-up
    this._baseClose();

    // Remember these callbacks
    if (onConnect) this.on('connect', onConnect);
    if (onDisconnect) this.on('disconnect', onDisconnect);

    // Build our URL
    this._baseURL = URL_HTTP + address + ':' + port;

    // Kick it all off
    return this._connect(true);
  }


  protected _baseClose() : void
  {
    // Close up shop and cancel any reconnect attempts
    if (this._socket) {
      this._socket.close();
      this._socket = undefined;
      this._baseURL = '';
    }
    this._connected = false;
    this._cancelReconnects();

    // Clear out active domains, channels, and subscriptions
    this._performConnectCleanup();

    // Clear out old event handlers
    this.removeAllListeners();
  }


  /****************************************************************************
   **                                                                        **
   ** To override                                                            **
   **                                                                        **
   ****************************************************************************/

  protected _performPostConnectTasks(reconnecting: boolean) : void
  {
    // Do nothing here in the base class
  }


  protected _performConnectCleanup() : void
  {
    // Do nothing here in the base class
  }


  /****************************************************************************
   **                                                                        **
   ** Constructor                                                            **
   **                                                                        **
   ****************************************************************************/

  constructor(serviceName: string, serverAPI: string, serverAPIVer: string)
  {
    super();

    // Assignemnts
    this._serviceName = serviceName;
    this._serviceNameUCase = serviceName.toUpperCase();
    this._serverAPI = serverAPI;
    this._serverAPIVer = serverAPIVer;
  }


  /****************************************************************************
   **                                                                        **
   ** Public methods                                                         **
   **                                                                        **
   ****************************************************************************/

  // NOTE ABOUT connect() & close()
  // Subclasses need to provide their own public connect() and close() methods
  // that re-direct to _baseConnect() & _baseClose(). This allows subclasses to
  // provide interfaces with different type signatures than class BaseClient
  // requires.
  //
  // EXAMPLE:
  // protected connect(...) : void
  // {
  //   super._baseConnect(...);
  // }

  get lastError() : PancakeError
  {
    return this._lastError;
  }


  get serviceName() : string
  {
    return this._serviceName;
  }


  get connected() : boolean
  {
    return this._connected;
  }

} // END class ClientAPI
