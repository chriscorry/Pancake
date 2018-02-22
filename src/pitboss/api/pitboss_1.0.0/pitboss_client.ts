/****************************************************************************
 **                                                                        **
 ** Modules                                                                **
 **                                                                        **
 ****************************************************************************/

import ip              = require('ip');

import { ListenerCallback,
         DisconnectCallback,
         ClientWebsocketAPI } from '../../../util/clientapi';
import { log }                from '../../../util/pancake-utils';
import { PancakeError }       from '../../../util/pancake-err';
import { Configuration }      from '../../../util/pancake-config';
import { Token }              from '../../../util/tokens';
import { flagpole }           from '../../../flagpole/flagpole';


/****************************************************************************
 **                                                                        **
 ** Vars & definitions                                                     **
 **                                                                        **
 ****************************************************************************/

 const URL_HTTP             = 'http://';
 const URL_HTTPS            = 'https://';
 const ARG_ALL_SERVERS      = 'allservers';
 const ARG_ALL_GROUPS       = 'allgroups';
 const MSG_NAME_ALL_SERVERS = 'pitboss-serveractivity';
 const MSG_NAME_ALL_GROUPS  = 'pitboss-groupactivity';
 const MSG_HEARTBEAT        = 'heartbeat';
 const MSG_UUID             = 'serverUUID';


/****************************************************************************
 **                                                                        **
 ** Class PitbossClient                                                    **
 **                                                                        **
 ****************************************************************************/

export class PitbossClient extends ClientWebsocketAPI
{
  private _server: any;
  private _uuidSave: string;
  private _registered = false;
  private _registerCount = 0;
  private _config: Configuration;


  /****************************************************************************
   **                                                                        **
   ** Overrides                                                              **
   **                                                                        **
   ****************************************************************************/

  protected _performPostConnectTasks(reconnecting: boolean) : void
  {
    // Automatically re-register ourself, if we've been registered before
    if (reconnecting && this._server) {
      this._registerWithServer();
    }
  }


  // protected _performConnectCleanup() : void
  // {
  // }


  /****************************************************************************
   **                                                                        **
   ** Private methods                                                        **
   **                                                                        **
   ****************************************************************************/

  private _onHeartbeat(heartbeat: any, ack: Function) : void
  {
    // Let everyone know
    this.emit(MSG_HEARTBEAT);
    log.trace('PITBOSS: Received heartbeat request. Responding.');

    // Respond
    ack({ status: 'OK', timestamp: Date.now() });
  }


  private async _registerWithServer() : Promise<PancakeError>
  {
    return new Promise<PancakeError>((resolve, reject) => {

      // Kick it all off
      try {

        // Send off the registration request
        this._registerCount++;
        this._socket.emit('pitboss:register', this._server, this._timeoutCallback((registerResp: any) => {

          // Timeout?
          if (!(registerResp instanceof PancakeError)) {

            // Everything okay?
            if (this._registerCount > 0) {
              if (200 === registerResp.status) {

                // Successful registration
                log.info(`PITBOSS: Server successfully registered with Pitboss. Server uuid = '${registerResp.result.uuid}'`);
                this._server.uuid = registerResp.result.uuid;
                this.emit(MSG_UUID, this._server.uuid);
                this._registerCount = 0;
                this._registered = true;

                // Make sure we receive important notifications
                this._socket.on(MSG_HEARTBEAT, (heartbeat: any, ack: Function) => { this._onHeartbeat(heartbeat, ack); });

                resolve();
              }
              else {
                reject(this._processError('ERR_PITBOSS_REGISTER', 'PITBOSS: Pitboss registration failed.', registerResp));
              }
            }
          }

          // Callback timeout
          else {
            reject(this._processError('ERR_PITBOSS_REGISTER_TIMEOUT', 'PITBOSS: Pitboss registration timeout.'));
          }
        }));

      } catch (err) {
        return this._processError('ERR_PITBOSS_REGISTER', `PITBOSS: Pitboss registration failed.`, err);
      }
    });
  }


  /****************************************************************************
   **                                                                        **
   ** Constructor                                                            **
   **                                                                        **
   ****************************************************************************/

   constructor(token?: Token)
   {
     super('Pitboss', 'pitboss', '1.0.0', token);
   }


  /****************************************************************************
   **                                                                        **
   ** Public methods                                                         **
   **                                                                        **
   ****************************************************************************/

  async connect(address: string, port: number, token?: Token, onConnect: ListenerCallback = undefined, onDisconnect: DisconnectCallback = undefined) : Promise<PancakeError>
  {
    return this._baseConnect(address, port, token, onConnect, onDisconnect);
  }


  async connectWithConfig(config?: Configuration, token?: Token, onConnect: ListenerCallback = undefined, onDisconnect: DisconnectCallback = undefined) : Promise<PancakeError>
  {
    // Simple validation checks
    if (!config && !this._config) {
      return this._processError('ERR_NO_CONFIG', `PITBOSS: No configuration object.`);
    }

    // Extract our config values
    let address = config.get('PITBOSS_ADDRESS');
    let port = config.get('PITBOSS_PORT');
    if (!address || !port) {
      return this._processError('ERR_MISSING_CONFIG_INFO', 'PITBOSS: Could not find Pitboss server configuration info.');
    }

    // Save off important values
    this._config = config;
    this._uuidSave = this._server ? this._server.uuid : undefined;
    let baseURLSave = this._baseURL;
    let newURL = URL_HTTP + address + ':' + port;
    if (newURL != baseURLSave) {
      this._uuidSave = undefined;
    }

    // Clean up a bit
    if (this.connected) {
      this._server = undefined;
      this._registered = false;
    }

    // Save off only certain listeners...
    let heartbeatListeners = this.listeners(MSG_HEARTBEAT);
    let uuidListeners      = this.listeners(MSG_UUID);

    // Do the real deal
    let returnValue = this._baseConnect(address, port, token, onConnect, onDisconnect);

    // Add our listeners back
    for (let listener of heartbeatListeners) {
      this.on(MSG_HEARTBEAT, listener as ListenerCallback);
    }
    for (let listener of uuidListeners) {
      this.on(MSG_UUID, listener as ListenerCallback);
    }

    return returnValue;
  }


  get server() : string
  {
    return this._server ? this._server.uuid : undefined;
  }


  get registered() : boolean
  {
    return this._registered;
  }


  async registerWithServer(name: string, description: string, port: number) : Promise<PancakeError>
  {
    // Simple validation checks
    if (!this.connected) {
      return this._processError('ERR_NO_CONNECTION', `PITBOSS: Not connected to server.`);
    }

    // Short circuit
    if (this.registered)
      return;

    // Build our initial registration request data
    let services = flagpole.queryAPIs();
    this._server = {
      name,
      description,
      uuid: this._uuidSave,
      pid: process.pid,
      address: ip.address(),
      port,
      services,
      groups: this._config ? this._config.get('PITBOSS_GROUPS') : undefined
    }

    // Do the real deal
    this._registerWithServer();
  }


  async registerInterest(target: string, onMessage: ListenerCallback) : Promise<PancakeError>
  {
    // Simple validation checks
    if (!this.connected) {
      return this._processError('ERR_NO_CONNECTION', `PITBOSS: Not connected to server.`);
    }

    // Kick off the request
    return new Promise<PancakeError>((resolve, reject) => {
      this._socket.emit('pitboss:registerInterest', { target }, this._timeoutCallback((resp: any) => {

        if (!(resp instanceof PancakeError)) {

          // The server responded
          if (200 === resp.status) {

            target = target.toLowerCase();
            switch(target) {

              // Register for events about all servers coming and going
              case ARG_ALL_SERVERS:
                this.on(MSG_NAME_ALL_SERVERS, onMessage);
                this._socket.on(MSG_NAME_ALL_SERVERS, (msg: any) => {
                  this.emit(MSG_NAME_ALL_SERVERS, msg.payload);
                });
                break;

              // Register for events about all group activity
              case ARG_ALL_GROUPS:
                this.on(MSG_NAME_ALL_GROUPS, onMessage);
                this._socket.on(MSG_NAME_ALL_GROUPS, (msg: any) => {
                  this.emit(MSG_NAME_ALL_GROUPS, msg.payload);
                });
                break;

              // Otherwise, we assume this is a group name
              default:
                this.on('pitboss-' + target, onMessage);
                this._socket.on('pitboss-' + target, (msg: any) => {
                  this.emit('pitboss-' + target, msg.payload);
                });
            }
            resolve();
          }
          else {
            reject(resp.result);
          }
        }
        else {
          reject(resp as PancakeError);
        }

      }));
    });
  }

  async getGroups() : Promise<any[]>
  {
    // Simple validation checks
    if (!this.connected) {
      this._processError('ERR_NO_CONNECTION', `PITBOSS: Not connected to server.`);
      return;
    }

    // Kick off the request
    return new Promise<any[]>((resolve, reject) => {
      this._socket.emit('pitboss:groups', { }, this._timeoutCallback((resp: any) => {

        if (!(resp instanceof PancakeError)) {

          // The server responded
          if (200 === resp.status)
            resolve(resp.result);
          else
            reject(resp.result);
        }
        else {
          reject(resp as PancakeError);
        }

      }));
    });
  }

} // END class PitbossClient
