/****************************************************************************
 **                                                                        **
 ** Modules                                                                **
 **                                                                        **
 ****************************************************************************/

import EventEmitter      = require('events');
import axios             from 'axios';
import ip                = require('ip');
import socketIOClient    = require('socket.io-client');

import { log }           from '../../../util/pancake-utils';
import { PancakeError }  from '../../../util/pancake-err';
import { Configuration } from '../../../util/pancake-config';
import { flagpole }      from '../../../flagpole/flagpole';


/****************************************************************************
 **                                                                        **
 ** Vars & definitions                                                     **
 **                                                                        **
 ****************************************************************************/

// URLs
const URL_HTTP                   = 'http://';
const URL_HTTPS                  = 'https://';
const URL_REGISTER_SERVER        = '/pitboss/register';
const PITBOSS_RECONNECT_INTERVAL = 60; // sec
const PITBOSS_CONNECT_TIMEOUT    = 30; // sec

// Other constants
const HTTP_REQUEST_HEADER = {
  headers: { 'Content-Type': 'application/json', 'Accept-Version': "1" }
}


/****************************************************************************
 **                                                                        **
 ** Class PitbossClient                                                    **
 **                                                                        **
 ****************************************************************************/

export class PitbossClient extends EventEmitter
{
  private _server: any;
  private _pitbossServer: string;
  private _pitbossPort: number;
  private _pitbossBaseURL: string;
  private _pitbossSocket: any;
  private _reconnectInterval = PITBOSS_RECONNECT_INTERVAL;
  private _timerID: NodeJS.Timer;


  /****************************************************************************
   **                                                                        **
   ** Private functions                                                      **
   **                                                                        **
   ****************************************************************************/

  private _timeoutCallback(callback: Function) : () => void
  {
    let called = false;

    let timerID = setTimeout(() => {
        if (called) return;
        called = true;
        callback(new PancakeError('ERR_CALLBACK_TIMEOUT'));
    },
    PITBOSS_CONNECT_TIMEOUT*1000);

    return function() {
      if (called) return;
      called = true;
      clearTimeout(timerID);
      callback.apply(this, arguments);
    }
  }


  private _onDisconnect(socket: any) : void
  {
    // Let everyone know
    this.emit('disconnect', socket);
    log.info(`PITBOSS: Lost connection to our Pitboss. Will attempt to reconnect in ${this._reconnectInterval} sec.`);

    // Try again
    this._initiateReconnects();
  }


  private _onHeartbeat(heartbeat: any, ack: Function) : void
  {
    // Let everyone know
    this.emit('heartbeat');
    log.trace('PITBOSS: Received heartbeat request. Responding.');

    // Respond
    ack({ status: 'OK', timestamp: Date.now() });
  }


  private _reconnect() : void
  {
    log.info('PITBOSS: Trying to establish connection with our Pitboss.');

    // Give it a shot
    this._registerWithoutNotary(this._server, this._pitbossBaseURL, false);
  }


  private _cancelReconnects() : void
  {
    if (this._timerID) {
      clearTimeout(this._timerID);
      this._timerID = undefined;
    }
  }


private _initiateReconnects() : void
  {
    this._cancelReconnects();
    this._pitbossSocket = undefined;
    this._timerID = setTimeout(() => { this._reconnect(); }, this._reconnectInterval*1000);
  }


  private _postRegistration(socket: any, registerResp: any) : void
  {
    // Remember save off vitals
    this._pitbossSocket = socket;
    this._server.uuid = registerResp.result.uuid;

    // Cancel any reconnect attempts
    this._cancelReconnects();

    // Make sure we receive important notifications
    this._pitbossSocket.on('disconnect', () => { this._onDisconnect(socket); });
    this._pitbossSocket.on('heartbeat',  (heartbeat: any, ack: Function) => { this._onHeartbeat(heartbeat, ack); });

    // Let everyone know
    this.emit('connect', socket);
    this.emit('serverUUID', this._server.uuid);
  }


  private _registerWithoutNotary(server: any, pitbossBaseURL: string, logErrors: boolean) : void
  {
    let socket: any;

    // Kick it all off
    try {

      // Make our websocket connect
      socket = socketIOClient(pitbossBaseURL + '/', { reconnection: false });
      if (!socket) {
        if (true === logErrors) {
          log.trace(new PancakeError('ERR_PITBOSS_CONNECT', `PITBOSS: Could not connect to Pitboss server ${pitbossBaseURL}`));
        }
        this._initiateReconnects();
        return;
      }

      // Get access to the Pitboss API
      socket.emit('negotiate', { name: 'pitboss', ver: '1.0.0' }, this._timeoutCallback((negotiateResp: any) => {

        // Timeout?
        if (!(negotiateResp instanceof PancakeError)) {

          // Everything okay?
          if (negotiateResp[0].status === 'SUCCESS') {

            // Send off the registration request
            socket.emit('pitboss:register', server, this._timeoutCallback((registerResp: any) => {

              // Timeout?
              if (!(registerResp instanceof PancakeError)) {

                // Everything okay?
                if (200 === registerResp.status) {
                  log.info('PITBOSS: Server successfully registered with Pitboss.');
                  this._postRegistration(socket, registerResp);
                }
                else {
                  socket.close();
                  socket = undefined;
                  if (true === logErrors) {
                    log.trace(new PancakeError('ERR_PITBOSS_REGISTER', 'PITBOSS: Pitboss registration failed.', registerResp));
                  }
                  this._initiateReconnects();
                }
              }

              // Callback timeout
              else {
                socket.close();
                socket = undefined;
                if (true === logErrors) {
                  log.trace('PITBOSS: ERR_PITBOSS_REGISTER_TIMEOUT: Pitboss registration timeout.');
                }
                this._initiateReconnects();
              }
            }));
          }
        }

        // Callback timeout
        else {
          socket.close();
          socket = undefined;
          if (true === logErrors) {
            log.trace('PITBOSS: ERR_PITBOSS_REGISTER_TIMEOUT: Pitboss registration timeout.');
          }
          this._initiateReconnects();
        }
      }));

    } catch (error) {
      socket.close();
      socket = undefined;
      if (true === logErrors) {
        log.trace(new PancakeError('ERR_PITBOSS_REGISTER', 'PITBOSS: Pitboss registration failed.', error));
      }
      this._initiateReconnects();
    }
  }


  /****************************************************************************
   **                                                                        **
   ** Public methods                                                         **
   **                                                                        **
   ****************************************************************************/

  getServerUUID() : string
  {
    return this._server ? this._server.uuid : undefined;
  }


  async registerWithServer(name: string, description: string, port: number,
                     config: Configuration, logErrors = true) : Promise<void>
  {
    let uuidSave = this._server ? this._server.uuid : undefined;
    let baseURLSave = this._pitbossBaseURL;

    // If we're already connected to a Pitboss, break it off
    if (this._pitbossSocket) {
      this._pitbossSocket.removeAllListeners();
      this._pitbossSocket.close();
      this._pitbossServer = undefined;
      this._pitbossBaseURL = '';
      this._server = undefined;
    }

    // Extract our config values
    this._pitbossServer = config.get('PITBOSS_SERVER');
    this._pitbossPort = config.get('PITBOSS_PORT');
    if (!this._pitbossServer || !this._pitbossPort) {
      if (true === logErrors) {
        log.trace(new PancakeError('ERR_MISSING_CONFIG_INFO', 'PITBOSS: Could not find Pitboss server configuration info.'));
      }
      return;
    }
    this._pitbossBaseURL = URL_HTTP + this._pitbossServer + ':' + this._pitbossPort;
    if (this._pitbossBaseURL != baseURLSave) {
      uuidSave = undefined;
    }

    // Build our initial registration request data
    let services = flagpole.queryAPIs();
    this._server = {
      name,
      description,
      uuid: uuidSave,
      pid: process.pid,
      address: ip.address(),
      port,
      services,
      groups: config.get('PITBOSS_GROUPS')
    }

    // Do the real deal
    this._registerWithoutNotary(this._server, this._pitbossBaseURL, logErrors);
  }

} // END class PitbossClient


// THE client singleton
export let pitboss: PitbossClient;
if (!pitboss) {
  pitboss = new PitbossClient();
}
