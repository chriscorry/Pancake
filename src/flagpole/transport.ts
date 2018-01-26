import { PancakeError } from '../util/pancake-err';
import { EndpointInfo } from './apitypes';

export interface Transport
{
  initialize?(initInfo: any) : void;
  registerAPIEndpoint(name:string, ver: string, apiToken: string, endpointInfo: EndpointInfo) : PancakeError;
  unregisterAPIEndpoint(name: string, ver: string, apiToken: string, endpointInfo: EndpointInfo) : PancakeError;
  onConnect?(socket: any) : PancakeError;
  onDisconnect?(socket: any) : PancakeError;
}
