import { PancakeError } from '../util/pancake-err';
import { EndpointInfo } from './apitypes';

export interface Transport
{
  initialize?(initInfo: any) : void;
  registerAPIInstance(name:string, ver: string, endpointInfo: EndpointInfo) : PancakeError;
  unregisterAPIInstance(name: string, ver: string, endpointInfo: EndpointInfo) : PancakeError;
  onConnect?(socket: any) : PancakeError;
  onDisconnect?(socket: any) : PancakeError;
}
