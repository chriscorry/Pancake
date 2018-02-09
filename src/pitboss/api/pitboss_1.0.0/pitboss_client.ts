/****************************************************************************
 **                                                                        **
 ** Modules                                                                **
 **                                                                        **
 ****************************************************************************/

import ip              = require('ip');

import { ListenerCallback,
         DisconnectCallback,
         ClientAPI }     from '../../../util/clientapi';
import { log }           from '../../../util/pancake-utils';
import { PancakeError }  from '../../../util/pancake-err';
import { Configuration } from '../../../util/pancake-config';
import { flagpole }      from '../../../flagpole/flagpole';


/****************************************************************************
 **                                                                        **
 ** Vars & definitions                                                     **
 **                                                                        **
 ****************************************************************************/

 const URL_HTTP           = 'http://';
 const URL_HTTPS          = 'https://';


/****************************************************************************
 **                                                                        **
 ** Class PitbossClient                                                    **
 **                                                                        **
 ****************************************************************************/

export class PitbossClient extends ClientAPI
{
  private _server: any;
  private _uuidSave: string;
  private _registerCount = 0;
  private _config: Configuration;


  /****************************************************************************
   **                                                                        **
   ** Overrides                                                              **
   **                                                                        **
   ****************************************************************************/

  protected _performPostConnectTasks(reconnecting: boolean) : void
  {
    // Make sure we receive important notifications
    this._socket.on('heartbeat', (heartbeat: any, ack: Function) => { this._onHeartbeat(heartbeat, ack); });

    // Automatically re-register ourself, if we've been registered before
    if (reconnecting && this._server) {
      this._registerWithServer();
    }
  }


  protected _performConnectCleanup() : void
  {
  }


  /****************************************************************************
   **                                                                        **
   ** Private methods                                                        **
   **                                                                        **
   ****************************************************************************/

  private _onHeartbeat(heartbeat: any, ack: Function) : void
  {
    // Let everyone know
    this.emit('heartbeat');
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

                log.info(`PITBOSS: Server successfully registered with Pitboss. Server uuid = '${registerResp.result.uuid}'`);
                this._server.uuid = registerResp.result.uuid;
                this.emit('serverUUID', this._server.uuid);
                this._registerCount = 0;
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

   constructor()
   {
     super('Pitboss', 'pitboss', '1.0.0');
   }


  /****************************************************************************
   **                                                                        **
   ** Public methods                                                         **
   **                                                                        **
   ****************************************************************************/

   async connect(config?: Configuration, onConnect: ListenerCallback = undefined, onDisconnect: DisconnectCallback = undefined) : Promise<PancakeError>
   {
    // Simple validation checks
    if (!config && !this._config) {
      return this._processError('ERR_NO_CONFIG', `PITBOSS: No configuration object.`);
    }

    this._config = config;
    this._uuidSave = this._server ? this._server.uuid : undefined;
    let baseURLSave = this._baseURL;

    // Clean up a bit
    if (this.connected) {
      this._socket.removeAllListeners();
      this._server = undefined;
    }

    // Extract our config values
    let address = config.get('PITBOSS_SERVER');
    let port = config.get('PITBOSS_PORT');
    if (!address || !port) {
      return this._processError('ERR_MISSING_CONFIG_INFO', 'PITBOSS: Could not find Pitboss server configuration info.');
    }
    let newURL = URL_HTTP + address + ':' + port;
    if (newURL != baseURLSave) {
      this._uuidSave = undefined;
    }

    // Do the real deal
    return this._baseConnect(address, port, onConnect, onDisconnect);
  }


  getServerUUID() : string
  {
    return this._server ? this._server.uuid : undefined;
  }


  async registerWithServer(name: string, description: string, port: number) : Promise<PancakeError>
  {
    // Simple validation checks
    if (!this.connected) {
      return this._processError('ERR_NO_CONNECTION', `PITBOSS: Not connected to server.`);
    }

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
      groups: this._config.get('PITBOSS_GROUPS')
    }

    // Do the real deal
    this._registerWithServer();
  }

} // END class PitbossClient


// THE client singleton
export let pitboss: PitbossClient;
if (!pitboss) {
  pitboss = new PitbossClient();
}
