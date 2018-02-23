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
const DEFAULT_TOKEN_LIFESPAN = 24*60; // 24-hours, in minutes


/****************************************************************************
 **                                                                        **
 ** Token class                                                            **
 **                                                                        **
 ****************************************************************************/

export class Token
{
  private static _secret: string;
  private static _tokenLifespan = DEFAULT_TOKEN_LIFESPAN*60*1000; // In ms

  private _issuer: string;
  private _subject: string;
  private _issuedAt: number;
  private _expiration: number;
  private _jti: string;
  private _jwt: string;
  private _userPayload: any = {};
  private _baked = false;
  private _opaque = false;


  /****************************************************************************
   **                                                                        **
   ** Statics                                                                **
   **                                                                        **
   ****************************************************************************/

  static set config(config: Configuration)
  {
    if (config) {
      Token._secret = config.get(KEY_SECRET);
      Token._tokenLifespan = config.get(KEY_TOKEN_LIFESPAN)*60*1000; // In ms
    }
  }


  static set secret(secret: string)
  {
    Token._secret = secret;
  }


  static set tokenLifespan(tokenLifespan: number) // In minutes
  {
    Token._tokenLifespan = tokenLifespan*60*1000; // In ms
  }


  /****************************************************************************
   **                                                                        **
   ** Constructor                                                            **
   **                                                                        **
   ****************************************************************************/

  constructor(JWT?: string)
  {
    this._jwt = JWT;
    if (JWT) this._opaque = true;
  }


  /****************************************************************************
   **                                                                        **
   ** Public methods                                                         **
   **                                                                        **
   ****************************************************************************/

  get valid() : boolean
  {
    return this._baked;
  }


  get issuer() : string
  {
    if (this._opaque) {
      this.thaw(this._jwt);
    }
    return this._issuer;
  }


  set issuer(issuer: string)
  {
    if (issuer != this._issuer) {
      this._issuer = issuer;
      this._baked = false;
      this._opaque = false;
      this._jwt = undefined;
    }
  }


  get subject() : string
  {
    if (this._opaque) {
      this.thaw(this._jwt);
    }
    return this._subject;
  }


  set subject(subject: string)
  {
    if (subject != this._subject) {
      this._subject = subject;
      this._baked = false;
      this._opaque = false;
      this._jwt = undefined;
    }
  }


  get issuedAt() : number
  {
    if (this._opaque) {
      this.thaw(this._jwt);
    }
    return this._issuedAt;
  }


  get expiration() : number
  {
    if (this._opaque) {
      this.thaw(this._jwt);
    }
    return this._expiration;
  }


  get expired() : boolean
  {
    if (this._opaque) {
      this.thaw(this._jwt);
    }
    if (this._expiration) {
      return this._expiration <= Date.now();
    }
    return true;
  }


  get uuid() : string
  {
    if (this._opaque) {
      this.thaw(this._jwt);
    }
    return this._jti;
  }


  get jwt() : string
  {
    if (this._opaque) {
      return this._jwt;
    }
    return this.freeze();
  }


  set jwt(JWT: string)
  {
    this._jwt = JWT;
    if (JWT) {
      this._issuer = undefined;
      this._subject = undefined;
      this._issuedAt = undefined;
      this._expiration = undefined;
      this._jti = undefined;
      this._userPayload = {};
      this._baked = false;
      this._opaque = true;
    }
  }


  get(propName: string) : any
  {
    if (this._opaque) {
      this.thaw(this._jwt);
    }
    switch(propName) {
      case 'iss': return this.issuer;
      case 'sub': return this.subject;
      case 'iat': return this.issuedAt;
      case 'exp': return this.expiration;
      case 'jti': return this.uuid;
      default:
        if (this._userPayload) {
          return this._userPayload[propName];
        }
    }
    return undefined;
  }


  set(propName: string, propValue: any)
  {
    let dirty = false;

    switch(propName) {
      case 'iss':
        if (this.issuer != propValue) {
          this.issuer = propValue;
          dirty = true;
        }
        break;
      case 'sub':
        if (this.subject != propValue) {
          this.subject = propValue;
          dirty = true;
        }
        break;
      default:
        if (!this._userPayload) {
          this._userPayload = {};
        }
        if (this._userPayload[propName] != propValue) {
          this._userPayload[propName] = propValue;
          dirty = true;
        }
    }

    if (dirty) {
      this._baked = false;
      this._opaque = false;
      this._jwt = undefined;
    }
  }


  isSame(JWT: string) : boolean
  {
    return JWT === this._jwt ? true : false;
  }


  freeze() : string
  {
    // Quick optimization
    if (true === this._baked || true === this._opaque) {
      return this._jwt;
    }

    // Simple validation
    if (!Token._secret) throw new PancakeError('ERR_NO_CONFIG', 'TOKEN: No configuration data.');

    // Make sure we have everything we need
    this._baked = false;
    if (!this._issuer || !this._subject) {
      this._issuedAt = undefined;
      this._expiration = undefined;
      this._jti = undefined;
      this._jwt = undefined;
      throw new PancakeError('ERR_BAD_TOKEN', 'TOKEN: Incomplete token.');
    }

    // Set our own fields first...
    let now = Date.now();
    this._issuedAt = now;
    this._expiration = now + (Token._tokenLifespan || DEFAULT_TOKEN_LIFESPAN*60*1000); // In ms
    this._jti = uuidv4();

    // ... then build the payload
    let payload: any = {
      iss: this._issuer,
      sub: this._subject,
      iat: this._issuedAt,
      exp: this._expiration,
      jti: this._jti
    };

    // Add the user payload, taking care to not overwrite existing peoperties
    Object.assign(payload, _.omit(this._userPayload, [
      'iss', 'sub', 'iat', 'exp', 'jti'
    ]));

    // Create the token
    this._jwt = undefined;
    try {
      this._jwt = jwt.sign(payload, Token._secret).toString();
    }
    catch (err) {}
    if (!this._jwt) {
      this._issuedAt = undefined;
      this._expiration = undefined;
      this._jti = undefined;
      throw new PancakeError('ERR_BAD_TOKEN', 'TOKEN: Failed signature.');
    }

    // Yay!
    this._baked = true;
    return this._jwt;
  }


  thaw(JWT?: string)
  {
    // Simple validation
    if (!Token._secret) throw new PancakeError('ERR_NO_CONFIG', 'TOKEN: No configuration data.');

    // Extract token and copy over attributes
    if (!JWT) JWT = this._jwt;
    let decodedJWT = jwt.verify(JWT, Token._secret);
    if (decodedJWT) {

      // Remember this guy
      this._jwt = JWT;

      // Copy it all over
      this._issuer = decodedJWT.iss;
      this._subject = decodedJWT.sub;
      this._issuedAt = decodedJWT.iat;
      this._expiration= decodedJWT.exp;
      this._jti = decodedJWT.jti;

      // Bring over payload fields
      // NOTE: Don't use this.expired for this expiration check -- we might be
      // here because of a call from there
      if (this._expiration > Date.now()) {

        Object.assign(this._userPayload, _.omit(decodedJWT, [
          'iss', 'sub', 'iat', 'exp', 'jti'
        ]));
      }

      // We're thawed and baked
      this._opaque = false;
      this._baked = true;
    }

    // Bad mojo
    else {
      this._issuer = undefined;
      this._subject = undefined;
      this._issuedAt = undefined;
      this._expiration = undefined;
      this._jti = undefined;
      this._jwt = undefined;
      this._userPayload = {};
      this._opaque = false;
      this._baked = false;

      // Simple validation
      throw new PancakeError('ERR_BAD_TOKEN', 'TOKEN: Could not verify token.');
    }
  }

} // END class Token
