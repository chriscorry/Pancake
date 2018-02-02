
/****************************************************************************
 **                                                                        **
 ** Modules                                                                **
 **                                                                        **
 ****************************************************************************/

import { Configuration } from '../../../util/pancake-config';


/****************************************************************************
 **                                                                        **
 ** Vars & definitions                                                     **
 **                                                                        **
 ****************************************************************************/

export interface IBalanceStrategy {
  name: string;
  initialize?(config: Configuration) : void;
  lookup(service: string, ver: string, servers: Set<IServerInfo>, hints: any) : IServerInfo;
}

export interface IServiceInfo {
  name:         string,
  description?: string,
  versions:     string[],
  metaTags?:    any
}

export interface IServerInfo {
  name?:            string,
  description?:     string,
  pid?:             number,
  uuid:             string,
  address:          string,
  port:             number,
  socket:           any,
  regTime:          number,
  missedHeartbeats: number,
  services:         Map<string, IServiceInfo>
}
