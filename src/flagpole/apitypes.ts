import { Configuration } from '../util/pancake-config';
import { PancakeError }  from '../util/pancake-err';


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
  err?: any
}

export type EndpointHandler = (payload: any) => IEndpointResponse;

export interface IAPI
{
  initializeAPI?(config: Configuration, name: string, ver: string, apiToken:string) : void;
  terminateAPI?() : void;

  onConnect?(socket: any) : PancakeError;
  onDisconnect?(socket: any) : PancakeError;

  flagpoleHandlers: IEndpointInfo[];
}
