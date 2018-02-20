/****************************************************************************
 **                                                                        **
 ** Modules                                                                **
 **                                                                        **
 ****************************************************************************/

const uuidv4    = require('uuid/v4');
const jwt       = require('jsonwebtoken');
const bcrypt    = require('bcryptjs');
const _         = require('lodash');

import { PancakeError }  from './pancake-err';
import { Configuration } from './pancake-config';


/****************************************************************************
 **                                                                        **
 ** Vars & definitions                                                     **
 **                                                                        **
 ****************************************************************************/

const KEY_SECRET             = 'JWT_SECRET';
const KEY_TOKEN_LIFESPAN     = 'DEFAULT_TOKEN_LIFESPAN';
const DEFAULT_TOKEN_LIFESPAN = 48*60*60*1000; // 48-hours

let _config: Configuration;


/****************************************************************************
 **                                                                        **
 ** Token class                                                            **
 **                                                                        **
 ****************************************************************************/

export class Token
{
  private _issuer: string;
  private _subject: string;
  private _issuedAt: number;
  private _expiration: number;
  private _uuid: string;
  private _jwt: string;
  private _userPayload: any = {};
  private _baked = false;


  /****************************************************************************
   **                                                                        **
   ** Constructor                                                            **
   **                                                                        **
   ****************************************************************************/

  constructor(JWT?: string)
  {
    if (JWT) {
      this.thaw(JWT);
    }
  }


  /****************************************************************************
   **                                                                        **
   ** Public methods                                                         **
   **                                                                        **
   ****************************************************************************/

  get issuer() : string
  {
    return this._issuer;
  }


  set issuer(issuer: string)
  {
    if (issuer != this._issuer) {
      this._issuer = issuer;
      this._baked = false;
      this._jwt = undefined;
    }
  }


  get subject() : string
  {
    return this._subject;
  }


  set subject(subject: string)
  {
    if (subject != this._subject) {
      this._subject = subject;
      this._baked = false;
      this._jwt = undefined;
    }
  }


  get issuedAt() : number
  {
    return this._issuedAt;
  }


  get expiration() : number
  {
    return this._expiration;
  }


  get expired() : boolean
  {
    if (this._expiration) {
      return this._expiration <= Date.now();
    }
    return true;
  }


  get uuid() : string
  {
    return this._uuid;
  }


  get jwt() : string
  {
    return this.freeze();
  }


  set jwt(JWT: string)
  {
    this.thaw(JWT);
  }


  get(propName: string) : any
  {
    switch(propName) {
      case 'iss': return this.issuer;
      case 'sub': return this.subject;
      case 'iat': return this.issuedAt;
      case 'exp': return this.expiration;
      case 'tok': return this.uuid;
      default:
        if (this._userPayload) {
          return this._userPayload[propName];
        }
    }
    return undefined;
  }


  set(propName: string, propValue: any)
  {
    switch(propName) {
      case 'iss': this.issuer = propValue; break;
      case 'sub': this.subject = propValue; break;
      default:
        if (!this._userPayload) {
          this._userPayload = {};
        }
        if (this._userPayload[propName] != propValue) {
          this._userPayload[propName] = propValue;
          this._baked = false;
          this._jwt = undefined;
        }
    }
  }


  freeze() : string
  {
    // Quick optimization
    if (true === this._baked) {
      return this._jwt;
    }

    // Simple validation
    if (!_config) throw new PancakeError('ERR_NO_CONFIG', 'TOKEN: No registered configuration object.');

    // Make sure we have everything we need
    this._baked = false;
    if (!this._issuer || !this._subject) {
      this._issuedAt = undefined;
      this._expiration = undefined;
      this._uuid = undefined;
      this._jwt = undefined;
      throw new PancakeError('ERR_BAD_TOKEN', 'TOKEN: Incomplete token.');
    }

    let tokenLifespan = _config.get(KEY_TOKEN_LIFESPAN);
    let now = Date.now();

    // Set our own fields first...
    this._issuedAt = now;
    this._expiration = now + (tokenLifespan || DEFAULT_TOKEN_LIFESPAN);
    this._uuid = uuidv4();

    // ... then build the payload
    let payload: any = {
      iss: this._issuer,
      sub: this._subject,
      iat: this._issuedAt,
      exp: this._expiration,
      tok: this._uuid
    };

    // Add the user payload, taking care to not overwrite existing peoperties
    Object.assign(payload, _.omit(this._userPayload, [
      'iss', 'sub', 'iat', 'exp', 'tok'
    ]));

    // Create the token
    this._jwt = undefined;
    try {
      this._jwt = jwt.sign(payload, _config.get(KEY_SECRET)).toString();
    }
    catch (err) {}
    if (!this._jwt) {
      this._issuedAt = undefined;
      this._expiration = undefined;
      this._uuid = undefined;
      throw new PancakeError('ERR_BAD_TOKEN', 'TOKEN: Failed signature.');
    }

    // Yay!
    this._baked = true;
    return this._jwt;
  }


  thaw(JWT: string)
  {
    // Simple validation
    if (!_config) throw new PancakeError('ERR_NO_CONFIG', 'TOKEN: No registered configuration object.');

    // Extract token and copy over attributes
    let decodedJWT = jwt.verify(JWT, _config.get(KEY_SECRET));
    if (decodedJWT) {

      // Remember this guy
      this._jwt = JWT;

      // Copy it all over
      this._issuer = decodedJWT.iss;
      this._subject = decodedJWT.sub;
      this._issuedAt = decodedJWT.iat;
      this._expiration= decodedJWT.exp;
      this._uuid = decodedJWT.tok;

      // Bring over payload fields
      Object.assign(this._userPayload, _.omit(decodedJWT, [
        'iss', 'sub', 'iat', 'exp', 'tok'
      ]));

      // We're baked
      this._baked = true;
    }

    // Bad mojo
    else {
      this._issuer = undefined;
      this._subject = undefined;
      this._issuedAt = undefined;
      this._expiration = undefined;
      this._uuid = undefined;
      this._jwt = undefined;
      this._userPayload = {};
      this._baked = false;

      // Simple validation
      throw new PancakeError('ERR_BAD_TOKEN', 'TOKEN: Could not verify token.');
    }
  }
}


/****************************************************************************
 **                                                                        **
 ** Tokens API                                                             **
 **                                                                        **
 ****************************************************************************/

export function setConfig(config: Configuration)
{
  _config = config;
}


// export function hasExpired(token: string) : boolean
// {
//   let decodedToken = decodeToken(token);
//   if (decodedToken) {
//     return decodedToken.exp <= Date.now();
//   }
//   return true;
// }
//
//
// export function decodeToken(token: string) : any
// {
//   // Simple validation
//   if (!_config) return;
//
//   return jwt.verify(token, _config.get(KEY_SECRET));
// }
//
//
// export function generateAuthToken(issuer: string, subject: string, userPayload: any) : string
// {
//   let tokenLifespan = _config.get(KEY_TOKEN_LIFESPAN);
//   let now = Date.now();
//
//   let payload: any = {
//     iss: issuer,
//     sub: subject,
//     iat: now,
//     exp: now + (tokenLifespan || DEFAULT_TOKEN_LIFESPAN),
//     tok: uuidv4(),
//   };
//
//   // Add the user payload, taking care to not overwrite existing peoperties
//   Object.assign(payload, _.omit(userPayload, [
//     'iss', 'sub', 'iat', 'exp', 'tok'
//   ]));
//
//   // Create the token
//   return jwt.sign(payload, _config.get(KEY_SECRET)).toString();
// }
