import { PancakeError }  from '../util/pancake-err';
import { IAPI,
         IEndpointInfo } from './apitypes';

export interface ITransport
{
  initialize?(initInfo: any) : void;
  registerAPI?(regAPI: IAPI) : PancakeError;
  unregisterAPI?(unregAPI: IAPI) : PancakeError;
  registerAPIEndpoint(name:string, ver: string, apiToken: string, endpointInfo: IEndpointInfo) : PancakeError;
  unregisterAPIEndpoint(name: string, ver: string, apiToken: string, endpointInfo: IEndpointInfo) : PancakeError;
}
