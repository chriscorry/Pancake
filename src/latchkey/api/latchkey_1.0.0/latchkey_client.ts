/****************************************************************************
 **                                                                        **
 ** Modules                                                                **
 **                                                                        **
 ****************************************************************************/

import axios                  from 'axios';
import { log }                from '../../../util/pancake-utils';
import { PancakeError }       from '../../../util/pancake-err';
import { Token }              from '../../../util/tokens';
import { ClientWebsocketAPI } from '../../../util/clientapi';


/****************************************************************************
 **                                                                        **
 ** Vars & definitions                                                     **
 **                                                                        **
 ****************************************************************************/

// EVENTS
const EVT_EXPIRED_TOKEN  = 'expiredToken';

const URL_HTTP           = 'http://';
const URL_HTTPS          = 'https://';
const URL_CREATE_TOKEN   = '/latchkey/token';
const URL_REFRESH_TOKEN  = '/latchkey/refresh';
const RECONNECT_INTERVAL = 15; // sec

 const HTTP_REQUEST_HEADER = {
   headers: { 'Content-Type': 'application/json', 'Accept-Version': "1" }
 }


/****************************************************************************
 **                                                                        **
 ** Class LatchkeyClient                                                   **
 **                                                                        **
 ****************************************************************************/

export class LatchkeyClient
{
  private _token: Token;
  private _address: string;
  private _port: number;
  private _baseURL: string;
  private _email: string;
  private _password: string;
  private _lastError: any;
  private _timerID: NodeJS.Timer;
  private _retrying = false;


  /****************************************************************************
   **                                                                        **
   ** Private methods                                                        **
   **                                                                        **
   ****************************************************************************/

  private _onExpiredToken(oldToken: Token, clientAPI: ClientWebsocketAPI)
  {
    this.refreshToken(oldToken).then(
      (newToken: Token) => {
        clientAPI.token = newToken;
      },

      (err: any) => {
        log.trace('LATCHKEY: Encountered error refreshing expired token.', err);
      });
  }


  private _cancelRetries() : void
  {
    if (this._timerID) {
      clearTimeout(this._timerID);
      this._timerID = undefined;
    }
    this._retrying = false;
  }


  private _initiateRetries(retryFunc?: Function, passThis: boolean = false) : void
  {
    this._cancelRetries();
    this._retrying = true;
    this._timerID = setTimeout(() => {

      // Let folks know
      log.info(`LATCHKEY: Trying to establish connection with authentication server.`);

      // Give it another shot
      if (!retryFunc) {
        this._createToken(false, true);
      }
      else {
        passThis ? retryFunc(this, false) : retryFunc.bind(this, false);
      }
     }, RECONNECT_INTERVAL*1000);
  }


  private async _createToken(logErrors: boolean, retry: boolean) : Promise<Token>
  {
    return new Promise<Token>((resolve, reject) => {

      function _innerCreateToken(client: LatchkeyClient, logErrorsInner: boolean) : PancakeError
      {
        // Kick off the request
        axios.post(client._baseURL  + URL_CREATE_TOKEN, { email: client._email, password: client._password }, HTTP_REQUEST_HEADER)
          .then((resp) => {

            // Error case?
            client._retrying = false;
            if (resp.status != 200) {
              reject(new PancakeError('ERR_CREATE_TOKEN', 'LATCHKEY: Token creation failed.', resp.data.result));
              return;
            }

            // Looks good!
            client._token = new Token(resp.data.token);
            resolve(client._token);
          })
          .catch((err) => {

            // Is the server simply not up?
            if ('ECONNREFUSED' === err.code) {
              if (true === retry) {
                client._initiateRetries(_innerCreateToken, true);
              }
              client._processError('ERR_SERVER_NOT_FOUND', `LATCHKEY: Could not connect to authentication server`, undefined, logErrorsInner);
            }

            // Something more serious...
            else {
              reject(new PancakeError('ERR_CREATE_TOKEN', 'LATCHKEY: Token creation failed.', err));
            }
          });
        return;
      }

      // Okay, kick it off
      _innerCreateToken(this, true);
    });
  }


  /****************************************************************************
   **                                                                        **
   ** Protected methods                                                      **
   **                                                                        **
   ****************************************************************************/

  protected _processError(status: string, reason?: string, obj?: any, logError: boolean = true) : PancakeError
  {
    this._lastError = new PancakeError(status, reason, obj);
    if (true === logError) {
      log.trace(`LATCHKEY: ${status}: ${reason}`);
      if (obj) log.trace(obj);
    }
    return this._lastError;
  }


  /****************************************************************************
   **                                                                        **
   ** Constructor                                                            **
   **                                                                        **
   ****************************************************************************/

  constructor(address: string, port: number)
  {
    this._address = address;
    this._port = port;
    this._baseURL = URL_HTTP + address + ':' + port;
  }


  /****************************************************************************
   **                                                                        **
   ** Public methods                                                         **
   **                                                                        **
   ****************************************************************************/

  get token() : Token
  {
      return this._token;
  }


  linkClientAPI(clientAPI: ClientWebsocketAPI) : void
  {
    clientAPI.on(EVT_EXPIRED_TOKEN, (oldToken: Token, clientAPI: ClientWebsocketAPI) => {
      this._onExpiredToken(oldToken, clientAPI);
    });
  }


  // unlinkClientAPI(clientAPI: ClientWebsocketAPI) : void
  // {
  //   clientAPI.emit(EVT_EXPIRED_TOKEN, (oldToken: Token, clientAPI: ClientWebsocketAPI) => {
  //     this._onExpiredToken(oldToken, clientAPI);
  //   });
  // }


  async createToken(email: string, password: string, retry: boolean = true) : Promise<Token>
  {
    // Save off our info
    this._email = email;
    this._password = password;

    // Okay, kick it off
    return this._createToken(true, retry);
  }


  async refreshToken(token?: Token) : Promise<Token>
  {
    return new Promise<Token>((resolve, reject) => {

      // Quick validation
      let useToken = token || this._token;
      if (!useToken) {
        reject(new PancakeError('ERR_REFRESH_TOKEN', 'LATCHKEY: No token specified to refresh.'));
      }

      // First, register with the server and extract our notary signature
      axios.post(this._baseURL  + URL_REFRESH_TOKEN, { token: useToken.jwt }, HTTP_REQUEST_HEADER)
        .then((resp) => {

          // Error case?
          if (resp.status != 200) {
            reject(new PancakeError('ERR_REFRESH_TOKEN', 'LATCHKEY: Token refresh failed.', resp.data.result));
            return;
          }

          // Looks good!
          this._token = new Token(resp.data.token);
          resolve(this._token);
        })
        .catch((err) => {
          reject(new PancakeError('ERR_REFRESH_TOKEN', 'LATCHKEY: Token refresh failed.', err));
        });
    });
  }


} // END class LatchkeyClient
