/****************************************************************************
 **                                                                        **
 ** Modules                                                                **
 **                                                                        **
 ****************************************************************************/

/*
const  _                   = require('lodash');
const  uuidv4              = require('uuid/v4');
const  semver              = require('semver');
*/
import * as utils            from '../../../util/pancake-utils';
import { PancakeError }      from '../../../util/pancake-err';
import { Configuration }     from '../../../util/pancake-config';
import { IEndpointInfo,
         IEndpointResponse } from '../../../flagpole/apitypes';
const  log                 = utils.log;


/****************************************************************************
 **                                                                        **
 ** Vars & definitions                                                     **
 **                                                                        **
 ****************************************************************************/

 let _lastError: any;


/****************************************************************************
 **                                                                        **
 ** Framework callbacks                                                    **
 **                                                                        **
 ****************************************************************************/

export function initializeAPI(config: Configuration) : void
{
}


export function onConnect(socket: any) : PancakeError
{
  return;
}


export function onDisconnect(socket: any) : PancakeError
{
  return;
}


/****************************************************************************
 **                                                                        **
 ** Private functions                                                      **
 **                                                                        **
 ****************************************************************************/

function _processError(status: string, reason?: string, obj?: any) : PancakeError
{
  _lastError = new PancakeError(status, reason, obj);
  log.trace(`SCREECH: ${status}: ${reason}`);
  if (obj) log.trace(obj);
  return _lastError;
}



/****************************************************************************
 **                                                                        **
 ** Screech API                                                            **
 **                                                                        **
 ****************************************************************************/



function getLastError() : PancakeError
{
  return _lastError;
}


/****************************************************************************
 **                                                                        **
 ** Flagpole housekeeping                                                  **
 **                                                                        **
 ****************************************************************************/

export let flagpoleHandlers: IEndpointInfo[] = [
  /*
  { requestType: 'post',  path: '/pitboss/register',    event: 'register',   handler: _registerServer,    metaTags: { audience: 'server' } },
  { requestType: 'post',  path: '/pitboss/lookup',      event: 'lookup',     handler: _lookup             },
  { requestType: 'post',  path: '/pitboss/server',      event: 'server',     handler: _getServerInfo      },
  { requestType: 'get',   path: '/pitboss/servers',     event: 'servers',    handler: _getServerRegistry  },
  { requestType: 'get',   path: '/pitboss/services',    event: 'services',   handler: _getServiceRegistry },
  {                                                     event: 'notarize',   handler: _onNotarize,        metaTags: { audience: 'server' } }
  */
];
