import { Configuration } from '../util/pancake-config';
import { PancakeError }  from '../util/pancake-err';
import { Token }         from '../util/tokens';
import { entitled,
         Entitlements }  from '../util/entitlements';


/****************************************************************************
 **                                                                        **
 ** Vars & definitions                                                     **
 **                                                                        **
 ****************************************************************************/

// EVENTS
const EVT_EXPIRED_TOKEN = 'expiredToken';

export interface IEndpointInfo {
  handler:      Function,
  requestType?: string,
  path?:        string,
  event?:       string,
  route?:       string,
  metaTags?:    any
}

export interface IEndpointResponse {
  status?: number,
  result?: any,
  err?: any,
  header?: any
}

export type EndpointHandler = (payload: any, token?: Token, headers?: any) => IEndpointResponse;

export interface IAPI
{
  initializeAPI?(name: string, ver: string, apiToken:string, config: Configuration, opts:any) : PancakeError;
  terminateAPI?() : void;

  onConnect?(socket: any) : PancakeError;
  onDisconnect?(socket: any) : PancakeError;
  onAuthToken?(newToken: Token) : PancakeError;

  flagpoleHandlers: IEndpointInfo[];
}


/****************************************************************************
 **                                                                        **
 ** Helpers                                                                **
 **                                                                        **
 ****************************************************************************/

export function entitledEndpoint(domain: string, roles: any, apiTag: string, endpoint: Function) : Function
{
  return async function(payload: any, token?: Token, headers?: any) : Promise<IEndpointResponse>
  {
    // Expired token check
    if (token && token.expired) {
      if (payload.socket) {
        payload.socket.emit(EVT_EXPIRED_TOKEN);
      }
      return { status: 401, result: { reason: `${apiTag}: Expired authorization token.`, expired: true } };
    }

    // Entitlements check
    if (!token || !entitled(token, domain, roles)) {
      return { status: 401, result: { reason: `${apiTag}: No entitlement to perform this action.` } };
    }

    // Pass it on
    return endpoint(payload, token, headers);
  }
}
