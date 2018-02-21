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
 ** Entitlements API                                                       **
 **                                                                        **
 ****************************************************************************/

export function entitled(token: Token, domain: string, role: string)
{
  let ent = new Entitlements(token, domain);
  return ent.isSuperAdmin || ent.satisfies(role);
}


export function entitledMultiple(token: Token, domain: string, roles: string[])
{
  let ent = new Entitlements(token, domain);
  for (let role of roles) {
    if (ent.satisfies(role))
      return true;
  }
  return ent.isSuperAdmin;
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
  private _isSuperAdmin = false;
  private _defaultDomain: string;


  /****************************************************************************
   **                                                                        **
   ** Constructor                                                            **
   **                                                                        **
   ****************************************************************************/

  constructor(entitlementsOrToken?: any, defaultDomain?: string)
  {
    // Set in the entitlements array
    if (entitlementsOrToken) {
      if (Array.isArray(entitlementsOrToken)) {
        this._entitlements = entitlementsOrToken as IEntitlement[];
      }
      else if (entitlementsOrToken instanceof Token) {
        let token = entitlementsOrToken as Token;
        if (token.valid) {
          this._expired = token.expired;
          if (!token.expired) {
            this._entitlements = token.get('ent');
          }
        }
      }
    }
    if (!this._entitlements) this._entitlements = [];
    this._defaultDomain = defaultDomain;
  }


  /****************************************************************************
   **                                                                        **
   ** Private methods                                                        **
   **                                                                        **
   ****************************************************************************/

  /****************************************************************************
   **                                                                        **
   ** Public methods                                                         **
   **                                                                        **
   ****************************************************************************/

  get isSuperAdmin() : boolean
  {
    return this.satisfies('superadmin', 'pancake');
  }


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
