/****************************************************************************
 **                                                                        **
 ** Modules                                                                **
 **                                                                        **
 ****************************************************************************/

const  semver              = require('semver');
import { log }               from '../../../util/pancake-utils';
import { IServerInfo,
         IBalanceStrategy }  from './pitboss_types';


/****************************************************************************
 **                                                                        **
 ** Rpund Robin Strategy class                                             **
 **                                                                        **
 ****************************************************************************/

export class RandomStrategy implements IBalanceStrategy
{
  // Debug helper
  private _dump(service: string, serverArray: IServerInfo[]) : void
  {
    log.trace(`==== ${service} ===================`);
    serverArray.forEach((server: IServerInfo) => {
      log.trace(`   ${server.uuid}`);
    });
    log.trace(`============================`);
  }

  get name() : string
  {
    return 'Random';
  }

  lookup(service: string, ver: string, servers: Set<IServerInfo>, hints: any) : IServerInfo
  {
    // Copy our servers into an array, bringing over only
    // those servers that satisfy our version requirements.
    let serverArray: IServerInfo[] = [];
    servers.forEach((server: IServerInfo) => {
        let versions = server.services.get(service).versions;
        versions.find((serverVer: string) => {
          if (semver.satisfies(ver, '^' + serverVer)) {
            serverArray.push(server);
            return true;
          }
        });
    });

    // DEBUG
    // this._dump(service, serverArray);

    // Short-circuit degenerate case
    if (!serverArray.length) {
      return undefined;
    }

    // Retrieve the next server
    return serverArray[Math.floor(Math.random()*serverArray.length)];
  }
}
