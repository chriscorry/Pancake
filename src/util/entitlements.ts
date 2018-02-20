/****************************************************************************
 **                                                                        **
 ** Modules                                                                **
 **                                                                        **
 ****************************************************************************/

import { Token } from './tokens'


/****************************************************************************
 **                                                                        **
 ** Vars & definitions                                                     **
 **                                                                        **
 ****************************************************************************/

export interface IEntitlement
{
  domain: string,
  role: string,
  value: boolean
}


/****************************************************************************
 **                                                                        **
 ** Entitlements class                                                     **
 **                                                                        **
 ****************************************************************************/

export class Entitlements
{
  private _entitlements: IEntitlement[] = [];
  private _expired: boolean = false;
  private _defaultDomain: string;


  /****************************************************************************
   **                                                                        **
   ** Constructor                                                            **
   **                                                                        **
   ****************************************************************************/

  constructor(entitlementsOrToken?: any, defaultDomain?: string)
  {
    if (entitlementsOrToken) {
      if (Array.isArray(entitlementsOrToken)) {
        this._entitlements = entitlementsOrToken as IEntitlement[];
      }
      else if (entitlementsOrToken instanceof Token) {
        let token = entitlementsOrToken as Token;
        this._expired = token.expired;
        if (!token.expired) {
          this._entitlements = token.get('ent');
        }
      }
    }
    if (!this._entitlements) this._entitlements = [];
    this._defaultDomain = defaultDomain;
  }


  /****************************************************************************
   **                                                                        **
   ** Public methods                                                         **
   **                                                                        **
   ****************************************************************************/

  get expired() : boolean
  {
    return this._expired;
  }


  get defaultDomain() : string
  {
    return this._defaultDomain;
  }


  set defaultDomain(defaultDomain: string)
  {
    this.defaultDomain = defaultDomain;
  }


  set entitlements(entitlements: IEntitlement[])
  {
    this._entitlements = entitlements;
    this._expired = false;
  }


  get(role: string, domain?: string) : boolean
  {
    if (!this._expired) {
      if (!domain) domain = this._defaultDomain;
      let found = this._entitlements.find((entitlement: IEntitlement) : boolean => {
        if (entitlement.domain === domain && entitlement.role === role)
          return true;
      });
      return found ? found.value : false;
    }
    return false;
  }


  satisfies(role: string, domain?: string) : boolean
  {
    return this.get(role, domain) === true;
  }

} // END class Entitlements
