/****************************************************************************
 **                                                                        **
 ** Modules                                                                **
 **                                                                        **
 ****************************************************************************/

// import socketIO       = require('socket.io');
import _              = require('lodash');
import { PancakeError }    from '../util/pancake-err';
import { EndpointInfo,
         EndpointResponse,
         EndpointHandler } from './apitypes';
import { Transport }       from './transport';
import utils          = require('../util/pancake-utils');
const  log            = utils.log;


/****************************************************************************
 **                                                                        **
 ** Vars & definitions                                                     **
 **                                                                        **
 ****************************************************************************/

 //Events
 const EVT_NEGOTIATE = 'negotiate';


/****************************************************************************
 **                                                                        **
 ** class TransportSocketIO                                                **
 **                                                                        **
 ****************************************************************************/

export class TransportSocketIO implements Transport
{
  private _serverSocketIO: any;
  private _envName: string;
  private _registeredEndpointsByToken = new Map<string, Set<EndpointInfo>>();
  private _pendingWSClients           = new Set<any>();
  private _currentWSClients           = new Set<any>();


  // initialize(initInfo: any) : void
  // instanceInfo {
  //   IN server = Socket.io instance
  //   IN envName
  // }

  initialize(initInfo: any) : void
  {
    this._serverSocketIO = initInfo.serverSocketIO;

    // Simple validation
    if (!this._serverSocketIO) {
      log.trace(`FP: ERR_BAD_ARG: Socket.IO server instance not provided`);
      throw new PancakeError('ERR_BAD_ARG');
    }
    if (initInfo.envName) this._envName = initInfo.envName;

    // We need to hear aboiut connects and disconnects
    this._serverSocketIO.sockets.on('connection', this._onConnect.bind(this));
  }


  // registerAPIEndpoint(name:string, ver: string, apiToken: string, endpointInfo: any) : PancakeError
  // instanceInfo {
  //   IN eventName
  // }

  registerAPIEndpoint(name:string, ver: string, apiToken: string, endpointInfo: EndpointInfo) : PancakeError
  {
    // Need to maintain our own collection because we'll be referring to it when
    // websocket clients attempt to negotiate
    let endpoints = this._registeredEndpointsByToken.get(apiToken);
    if (!endpoints) {
      endpoints = new Set<EndpointInfo>();
      this._registeredEndpointsByToken.set(apiToken, endpoints);
    }

    // Add to the collection
    endpoints.add(endpointInfo);

    return;
  }


  // unregisterAPIEndpoint(name: string, ver: string, apiToken: string, endpointInfo: any) : PancakeError
  // instanceInfo {
  //   IN eventName
  // }

  unregisterAPIEndpoint(name: string, ver: string, apiToken: string, endpointInfo: EndpointInfo) : PancakeError
  {
    let endpoints = this._registeredEndpointsByToken.get(apiToken);
    if (endpoints) {
      endpoints.delete(endpointInfo);
      if (endpoints.size === 0) {
        this._registeredEndpointsByToken.delete(apiToken);
      }
    }
    else {
      // Weird -- this should never happen
      log.warn(`FP: WS: Encountered missing API. That's odd.`);
    }
    return;
  }


  /****************************************************************************
   **                                                                        **
   ** Event handlers                                                         **
   **                                                                        **
   ****************************************************************************/

  _onConnect(socket: any) : PancakeError
  {
    this._pendingWSClients.add(socket);
    log.trace(`FP: Websocket connect. (${socket.id})`);

    // Register our interest in disconnect and negotiation events
    socket.on('disconnect', (reason: string) : any => {
      this._onDisconnect(reason, socket);
    });
    socket.on(EVT_NEGOTIATE, (payload:any, ack:Function) : any => {
      payload.socket = socket;
      let resp = this._onNegotiate(payload);
      if (resp) {
        ack(resp)
      }
      return resp;
    });
    return;
  }


  _onDisconnect(reason: string, socket: any) : void
  {
    this._pendingWSClients.delete(socket);
    this._currentWSClients.delete(socket);
    log.trace(`FP: Websocket disconnect. (${socket.id})`);
  }


  private _onNegotiate(payload: any) : any
  {
    let socket = payload.socket;

    if (this._pendingWSClients.has(socket) || this._currentWSClients.has(socket)) {

      // Build the API token
      let name = payload.name;
      let ver = payload.ver;
      name = _.toLower(_.trim(name));
      let apiToken = name + ':' + _.trim(ver);

      // Look up the requested API
      let endpoints = this._registeredEndpointsByToken.get(apiToken);
      if (endpoints) {

        // Loop through the API...
        endpoints.forEach((endpointInfo: EndpointInfo) => {

          // ...and register the endpoints with this socket
          if (endpointInfo.event) {
            let eventName = name + ':' + endpointInfo.event;

            // Register with wrapper function
            socket.on(eventName, async (payload:any, ack:Function) : Promise<any> => {
              try {
                if (!payload) payload = {};
                payload.socket = socket;
                let resp = await endpointInfo.handler(payload);
                if (ack) {
                  if (resp.err) {
                    ack(resp.err);
                  }
                  else if (resp.status || resp.result) {
                    ack({ status: resp.status, result: resp.result});
                  }
                }
                return resp.result;
              }
              catch (err) {
                log.error('FP: Unexpected exception. (SocketIO)', err)
                return err;
              }
            });
            log.trace(`FP: Registered socket event handler (${eventName}, v${ver})`);
          }
        });

        // No longer a pending client
        this._pendingWSClients.delete(socket);
        this._currentWSClients.add(socket);

        log.trace(`FP: Websocket negotiate success. ${name}, v${ver}`);
        return { _status: 'SUCCESS' };
      }

      // No dice
      log.trace(`FP: Websocket negotiate failed. ${name}, v${ver}`);
      return new PancakeError('ERR_API_NOT_FOUND');
    }

    return;
  }
}
