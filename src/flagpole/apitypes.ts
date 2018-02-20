import { Configuration } from '../util/pancake-config';
import { PancakeError }  from '../util/pancake-err';
import { Token }         from '../util/tokens';


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

  flagpoleHandlers: IEndpointInfo[];
}
