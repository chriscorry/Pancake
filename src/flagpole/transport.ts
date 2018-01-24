import { PancakeError } from '../util/pancake-err';

export interface Transport
{
  initialize?(initInfo: any) : void;
  registerAPIInstance(name:string, ver: any, endpointInfo: any) : PancakeError;
  unregisterAPIInstance(name: string, ver: string, endpointInfo: any) : PancakeError;
  onConnect?(socket: any) : PancakeError;
  onDisconnect?(socket: any) : PancakeError;
}
