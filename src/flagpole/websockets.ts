/****************************************************************************
 **                                                                        **
 ** Modules                                                                **
 **                                                                        **
 ****************************************************************************/

import _              = require('lodash');
import semver         = require('semver');
import { EventEmitter }    from 'events';
import { entitled }        from '../util/entitlements';
import { Token }           from '../util/tokens';
import { PancakeError }    from '../util/pancake-err';
import { IAPI,
         IEndpointInfo,
         IEndpointResponse,
         EndpointHandler } from './apitypes';
import { ITransport }      from './transport';
import utils          = require('../util/pancake-utils');
const  log            = utils.log;


/****************************************************************************
 **                                                                        **
 ** Vars & definitions                                                     **
 **                                                                        **
 ****************************************************************************/

const ENT_DOMAIN         = 'flagpole';
const ENT_ROLE_NEGOTIATE = 'negotiate';
const API_TAG            = 'FP';

interface VersionInfo
{
  ver: string;
  endpoints: IEndpointInfo[]
}

//Events
const EVT_CONNECT      = 'connect';
const EVT_CONNECTION   = 'connection';
const EVT_DISCONNECT   = 'disconnect';
const EVT_NEGOTIATE    = 'negotiate';
const EVT_UPDATE_TOKEN = 'updateToken';


/****************************************************************************
 **                                                                        **
 ** class TransportSocketIO                                                **
 **                                                                        **
 ****************************************************************************/

export class TransportSocketIO extends EventEmitter implements ITransport
{
  private _serverSocketIO: any;
  private _envName: string;
  private _registeredEndpoints = new Map<string, VersionInfo[]>();
  private _pendingWSClients    = new Set<any>();
  private _currentWSClients    = new Set<any>();


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

    // We need to hear about connects
    this._serverSocketIO.sockets.on(EVT_CONNECTION, this._onConnect.bind(this));
  }


  registerAPI(regAPI: IAPI) : PancakeError
  {
    // Register event handlers, if they exist
    if (regAPI.onConnect) {
      this.on(EVT_CONNECT, regAPI.onConnect);
    }
    if (regAPI.onDisconnect) {
      this.on(EVT_DISCONNECT, regAPI.onDisconnect);
    }
    return;
  }


  unregisterAPI(unregAPI: IAPI) : PancakeError
  {
    // Unregister event handlers, if they exist
    if (unregAPI.onConnect) {
      this.removeListener(EVT_CONNECT, unregAPI.onConnect);
    }
    if (unregAPI.onDisconnect) {
      this.removeListener(EVT_DISCONNECT, unregAPI.onConnect);
    }
    return;
  }


  // registerAPIEndpoint(name:string, ver: string, apiToken: string, endpointInfo: any) : PancakeError
  // instanceInfo {
  //   IN eventName
  // }

  registerAPIEndpoint(name:string, ver: string, apiToken: string, endpointInfo: IEndpointInfo) : PancakeError
  {
    // Need to maintain our own collection because we'll be referring to it when
    // websocket clients attempt to negotiate
    let versions: VersionInfo[] = this._registeredEndpoints.get(name);
    if (!versions) {
      versions = [];
      this._registeredEndpoints.set(name, versions);
    }
    let match = versions.find((verinfo: VersionInfo) => {
      if (ver === verinfo.ver)
        return true;
    });
    if (!match) {
      match = { ver, endpoints: [] };
      versions.push(match);
    }
    match.endpoints.push(endpointInfo);

    // Sort in DECENDING order
    versions.sort((a: VersionInfo, b: VersionInfo) => {
      if (semver.lt(a.ver, b.ver)) {
        return 1;
      }
      if (semver.gt(a.ver, b.ver)) {
        return -1;
      }
      return 0;
    });

    /*
    log.trace(`==== REGISTER API == ${name}, v${ver} ================`);
    log.trace(JSON.stringify(versions, null, 2));
    log.trace(`======================================================`);
    */

    return;
  }


  // unregisterAPIEndpoint(name: string, ver: string, apiToken: string, endpointInfo: any) : PancakeError
  // instanceInfo {
  //   IN eventName
  // }

  unregisterAPIEndpoint(name: string, ver: string, apiToken: string, endpointInfo: IEndpointInfo) : PancakeError
  {
    let versions = this._registeredEndpoints.get(name);
    if (versions) {
      let matchIndex = versions.findIndex((verinfo: VersionInfo) => {
        if (ver === verinfo.ver)
          return true;
      });
      if (matchIndex != -1) {
        versions.splice(matchIndex, 1);
      }
      if (versions.length === 0) {
        this._registeredEndpoints.delete(name);
      }
    }
    else {
      // Weird -- this should never happen
      log.warn(`FP: WS: Encountered missing API. That's odd.`);
    }

    /*
    log.trace(`==== UNREGISTER API == ${name}, v${ver} ================`);
    log.trace(JSON.stringify(versions, null, 2));
    log.trace(`======================================================`);
    */

    return;
  }


  /****************************************************************************
   **                                                                        **
   ** Event handlers                                                         **
   **                                                                        **
   ****************************************************************************/

  private _onConnect(socket: any) : PancakeError
  {
    this._pendingWSClients.add(socket);
    log.trace(`FP: Websocket connect. (${socket.id})`);

    // Register our interest in various events
    socket.on(EVT_DISCONNECT, (reason: string) : any => {
      this._onDisconnect(reason, socket);
    });

    socket.on(EVT_NEGOTIATE, (payload:any, ack:Function) : any => {
      if (payload.apiRequests) {
        let actualPayload = {
          socket,
          apiRequests: !Array.isArray(payload.apiRequests) ? [payload.apiRequests] : payload.apiRequests,
          token: payload.token
        };
        let resp = this._onNegotiate(actualPayload);
        if (resp) {
          ack(resp)
        }
        return resp;
      }
      ack([ { status: 'ERR_BAD_NEGOTIATE', reason: 'Incorrectly formatted negotiate request.' }]);
      return;
    });

    socket.on(EVT_UPDATE_TOKEN, (payload:any, ack:Function) : any => {
      // Safely try to convert string passed in payload to a Token
      let token: Token;
      try {
        token = new Token(payload.token);
        socket.token = token;
      } catch(err) {
        return { status: 'ERR_UNAUTHORIZED', result: { reason: `${API_TAG}: Invalid authorization token.` } };
      }
      return { status: 'OK' };
    });

    // Let anyone else know who cares
    this.emit(EVT_CONNECT, socket);
    return;
  }


  private _onDisconnect(reason: string, socket: any) : void
  {
    this._pendingWSClients.delete(socket);
    this._currentWSClients.delete(socket);
    log.trace(`FP: Websocket disconnect. (${socket.id})`);

    // Let anyone else know who cares
    this.emit(EVT_DISCONNECT, socket);
  }


  private _onNegotiate(payload: any) : any
  {
    let socket = payload.socket;
    let apiRequests = payload.apiRequests;
    let token: Token;

    // We always need a token
    if (!payload.token) {
      return [ { status: 'ERR_UNAUTHORIZED', result: { reason: `${API_TAG}: Invalid authorization token.`, expired: false } } ];
    }

    // Safely try to convert string passed in payload to a Token
    try {
      token = new Token(payload.token);
      socket.token = token;
    } catch(err) {
      return [ { status: 'ERR_UNAUTHORIZED', result: { reason: `${API_TAG}: Invalid authorization token.`, expired: false } } ];
    }

    // Expired token check
    if (token.expired) {
      return [ { status: 'ERR_UNAUTHORIZED', result: { reason: `${API_TAG}: Expired authorization token.`, expired: true } } ];
    }

    // Entitlements check
    if (!entitled(token, ENT_DOMAIN, ENT_ROLE_NEGOTIATE)) {
      return [ { status: 'ERR_UNAUTHORIZED', result: { reason: `${API_TAG}: No entitlement to perform this action.`, expired: false } } ];
    }

    if (this._pendingWSClients.has(socket) || this._currentWSClients.has(socket)) {

      // Process each one in return
      let returnValues: any[] = [];
      for (let apiRequest of apiRequests) {

        // Setup
        let status: string;
        let reason: string;

        // Find a matching versions
        let name = apiRequest.name;
        let ver = apiRequest.ver;
        let versions: VersionInfo[] = this._registeredEndpoints.get(name);
        if (versions) {

          // Version search
          let match = versions.find((verinfo: VersionInfo) => {
            // log.trace(`VER MATCH CHECK: ${ver} <--> ${verinfo.ver}`);
            if (semver.satisfies(ver, '^' + verinfo.ver)) {
              // log.trace('   SATISFIED');
              return true;
            }
            // log.trace('   NO MATCH');
          });

          // Hook 'em up
          if (match) {
            let endpoints = match.endpoints;

            // Loop through the API...
            endpoints.forEach((endpointInfo: IEndpointInfo) => {

              // ...and register the endpoints with this socket
              if (endpointInfo.event) {
                let eventName = name + ':' + endpointInfo.event;

                // Unregister, just to avoid dups
                socket.removeAllListeners(eventName);

                // Register with wrapper function
                socket.on(eventName, async (payloadIn:any, ack:Function) : Promise<any> => {
                  try {
                    if (!payloadIn) payloadIn = {};
                    payloadIn.socket = socket;
                    let resp = await endpointInfo.handler(payloadIn, socket.token);
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
                // END wrapper Function

                // log.trace(`FP: Registered socket event handler (${eventName}, v${ver})`);
              }
            });

            // No longer a pending client
            this._pendingWSClients.delete(socket);
            this._currentWSClients.add(socket);

            status = 'OK';
            reason = `Websocket negotiate success. ${name}, v${ver}`;
          }
          else {
            status = 'ERR_VER_MATCH_NOT_FOUND';
            reason = `Websocket negotiate failed. ${name}, v${ver}`;
          }
        }
        else {
          status = 'ERR_API_NOT_FOUND';
          reason = `Websocket negotiate failed. ${name}, v${ver}`;
        }

        // Remember what happened
        returnValues.push({ status, reason, name, ver });
        log.trace('FP: ' + reason);
      }

      // All good
      return returnValues;
    }

    return;
  }
}
