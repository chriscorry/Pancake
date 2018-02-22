/****************************************************************************
 **                                                                        **
 ** Modules                                                                **
 **                                                                        **
 ****************************************************************************/

import axios                  from 'axios';
import { log }                from '../../../util/pancake-utils';
import { PancakeError }       from '../../../util/pancake-err';
import { Token }              from '../../../util/tokens';


/****************************************************************************
 **                                                                        **
 ** Vars & definitions                                                     **
 **                                                                        **
 ****************************************************************************/

const URL_HTTP            = 'http://';
const URL_HTTPS           = 'https://';
const URL_CREATE_TOKEN    = '/latchkey/token';
const URL_REFRESH_TOKEN   = '/latchkey/refresh';

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

  /****************************************************************************
   **                                                                        **
   ** Private methods                                                        **
   **                                                                        **
   ****************************************************************************/


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


  async createToken(email: string, password: string) : Promise<Token>
  {
    return new Promise<Token>((resolve, reject) => {

      // First, register with the server and extract our notary signature
      axios.post(this._baseURL  + URL_CREATE_TOKEN, { email, password }, HTTP_REQUEST_HEADER)
        .then((resp) => {

          // Error case?
          if (resp.status != 200) {
            reject(new PancakeError('ERR_CREATE_TOKEN', 'LATCHKEY: Token creation failed.', resp.data.result));
            return;
          }

          // Looks good!
          this._token = new Token(resp.data.token);
          resolve(this._token);
        })
        .catch((err) => {
          reject(new PancakeError('ERR_CREATE_TOKEN', 'LATCHKEY: Token creation failed.', err));
        });
    });
  }


  async refreshToken(token?: Token) : Promise<Token>
  {
    return new Promise<Token>((resolve, reject) => {

      // Quick validation
      let useToken = token || this._token;
      if (!useToken) {
        reject(new PancakeError('ERR_REFRESH_TOKEN', 'LATCHKEY: No token specified to refresh.'));
      }
      if (!useToken.valid) {
        reject(new PancakeError('ERR_REFRESH_TOKEN', 'LATCHKEY: Invalid token specified.'));
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
