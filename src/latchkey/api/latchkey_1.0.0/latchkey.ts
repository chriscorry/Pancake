/****************************************************************************
 **                                                                        **
 ** Modules                                                                **
 **                                                                        **
 ****************************************************************************/

import { grab }              from '../../../util/pancake-grab';
import { Configuration }     from '../../../util/pancake-config';
import { IEndpointInfo,
         IEndpointResponse } from '../../../flagpole/apitypes';


/****************************************************************************
 **                                                                        **
 ** Latchkey API                                                           **
 **                                                                        **
 ****************************************************************************/


export function initializeAPI(name: string, ver: string, apiToken:string,
                              config: Configuration) : void
{
  let maintenanceInterval: number = config ? config.get('MAINTENANCE_INTERVAL') : 60*5;
}


async function test(payload: any) : Promise<IEndpointResponse>
{
  // let item: any, status: number, result: any;
  // [result, item] = await grab(cache.get(payload.id, payload.className, payload.opts));
  //
  // // Process the results
  // status = (result || !item) ? 400 : 200;
  // if (!result) {
  //   result = item ? { item } : cache.getLastError();
  // }
  // return { status, result };
  return { status: 200, result: { message: 'Everything is just fine here' } };
}



/****************************************************************************
 **                                                                        **
 ** Flagpole housekeeping                                                  **
 **                                                                        **
 ****************************************************************************/

export let flagpoleHandlers: IEndpointInfo[] = [
  { requestType: 'post',  path: '/latchkey/test', event: 'test',   handler: test, metaTags: { audience: 'debug' } }
];
