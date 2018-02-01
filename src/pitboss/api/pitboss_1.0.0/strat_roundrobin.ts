/****************************************************************************
 **                                                                        **
 ** Modules                                                                **
 **                                                                        **
 ****************************************************************************/

/*
const  _                   = require('lodash');
const  uuidv4              = require('uuid/v4');
import { PancakeError }      from '../../../util/pancake-err';
import { IEndpointInfo,
         IEndpointResponse } from '../../../flagpole/apitypes';
*/
const  semver              = require('semver');
import * as utils            from '../../../util/pancake-utils';
import { Configuration }     from '../../../util/pancake-config';
import { IServerInfo,
         IServiceInfo,
         IBalanceStrategy }  from './pitboss_types';
const  log                 = utils.log;


/****************************************************************************
 **                                                                        **
 ** Rpund Robin Strategy class                                             **
 **                                                                        **
 ****************************************************************************/

export class RoundRobinStrategy implements IBalanceStrategy
{
  private _lastServers = new Map<string, string>(); // name to server uuid

  // Debug helper
  private _dump(service: string, prevServer: string, serverArray: IServerInfo[]) : void
  {
    log.trace('Prev Server:', prevServer);
    log.trace(`==== ${service} ===================`);
    serverArray.forEach((server: IServerInfo) => {
      log.trace(`   ${server.uuid}`);
    });
    log.trace(`============================`);
  }

  get name() : string
  {
    return 'Round Robin';
  }

  lookup(service: string, ver: string, servers: Set<IServerInfo>, hints: any) : IServerInfo
  {
    let prevServer: string = this._lastServers.get(service);

    // Copy our servers into an array, bringing over only
    // those servers that satisfy our version requirements.
    let serverArray: IServerInfo[] = [];
    let index = 0, prevIndex = -1;
    servers.forEach((server: IServerInfo) => {
        let versions = server.services.get(service).versions;
        let foundVer = versions.find((serverVer: string) => {
          if (semver.satisfies(ver, '^' + serverVer)) {
            if (prevServer === server.uuid)
              prevIndex = index;
            serverArray[index++] = server;
            return true;
          }
        });
    });
    if (-1 === prevIndex) {
      prevServer = undefined;
    }

    // DEBUG
    // this._dump(service, prevServer, serverArray);

    // Short-circuit degenerate case
    if (!serverArray.length) {
      return undefined;
    }

    // Retrieve the next server
    let returnServer: IServerInfo;
    if (prevIndex === -1)
      returnServer = serverArray[0];
    else
      returnServer = (prevIndex === serverArray.length-1) ? serverArray[0] : serverArray[prevIndex+1];

    // Remember...
    this._lastServers.set(service, returnServer.uuid);

    return returnServer;
  }
}
