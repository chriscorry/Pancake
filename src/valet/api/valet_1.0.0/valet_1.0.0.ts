/****************************************************************************
 **                                                                        **
 ** Modules                                                                **
 **                                                                        **
 ****************************************************************************/

const  cache                  = require('../../cache');
const  { SimpleMongoFactory } = require('./SimpleMongoFactory');
import { grab }              from '../../../util/pancake-grab';
import { Configuration }     from '../../../util/pancake-config';
import { IEndpointResponse } from '../../../flagpole/apitypes';


/****************************************************************************
 **                                                                        **
 ** Quick 'n Ugly Identity Test Factory                                    **
 **                                                                        **
 ****************************************************************************/

function getRandomInt(max: number) : number
{
  return Math.floor(Math.random() * Math.floor(max));
}

function sleep(ms: number) : Promise<Function>
{
  return new Promise(resolve => setTimeout(resolve, ms));
}

let IdentityFactory = {

  createId(obj?: any) {
    return getRandomInt(999999999)+1000000000;
  },

  async loadItem(id: string, className: string, opts?: any) {
    await sleep(getRandomInt(5*1000)+5);
    return { id, className: 'Identity', now: Date.now() };
  },

  async saveItem(id: string, obj: any, className: string, opts?: any)
  {
    await sleep(getRandomInt(5*1000));
    return true;
  }
}


/****************************************************************************
 **                                                                        **
 ** Valet Cache API                                                        **
 **                                                                        **
 ****************************************************************************/


export function initializeAPI(config?: Configuration) : void
{
  let maintenanceInterval: number = config ? config.get('MAINTENANCE_INTERVAL') : 60*5;
  let maxCacheSize: number        = config ? config.get('MAX_CACHE_SIZE') : 100;
  let defaultTTL: number          = config ? config.get('DEFAULT_TTL') : cache.DEFAULT_TTL;

  // Register factories
  cache.registerFactory('Identity', IdentityFactory,    defaultTTL, config);
  cache.registerFactory('*',        SimpleMongoFactory, defaultTTL, config);

  // Fire up the cache
  cache.initialize({ maintenanceInterval, maxCacheSize });
}


async function getItem(payload: any) : Promise<IEndpointResponse>
{
  let item: any, status: number, result: any;
  [result, item] = await grab(cache.get(payload.id, payload.className, payload.opts));

  // Process the results
  status = (result || !item) ? 400 : 200;
  if (!result) {
    result = item ? { item } : cache.getLastError();
  }
  return { status, result };
}


async function getItemMultiple(payload: any) : Promise<IEndpointResponse>
{
  let items: any, status: number, result: any;
  [result, items] = await grab(cache.getMultiple(payload.idInfos));

  // Process the results
  status = (result || !items) ? 400 : 200;
  if (!result) {
    result = items ? { numItems: items.length, items } : cache.getLastError();
  }
  return { status, result };
}


async function setItem(payload: any) : Promise<IEndpointResponse>
{
  let item: any, status: number, result: any;
  [result, item] = await grab(cache.set(payload.id, payload.obj, payload.className, payload.opts));

  // Process the results
  status = (result || !item) ? 400 : 200;
  if (!result) {
    result = item ? { id: item[0], item: item[1] } : cache.getLastError();
  }
  return { status, result };
}


async function loadItems(payload: any) : Promise<IEndpointResponse>
{
  let items: any, status: number, result: any;
  [result, items] = await grab(cache.load(payload.query, payload.className, payload.opts));

  // Process the results
  status = (result || !items) ? 400 : 200;
  if (!result) {
    result = items ? { numItems: items.length, items } : cache.getLastError();
  }
  return { status, result };
}


function getStats(payload: any) : IEndpointResponse
{
  return { status: 200, result: cache.getStats() };
}


function dumpCache(payload: any) : IEndpointResponse
{
  cache.dumpCache();
  return { status: 200 };
}


async function load10(payload: any) : Promise<IEndpointResponse>
{
  let items: any[] = [];
  let status: number, result: any;
  for (let iter = 0; iter < 10; iter++) {
    items.push({
      id: getRandomInt(9999999)+10000000,
      className: 'Identity'
    });
  }

  // Make it happen
  [result, items] = await grab(cache.getMultiple(items));

  // Process the results
  status = (result || !items) ? 400 : 200;
  if (!result) {
    result = items ? { numItems: items.length, items } : cache.getLastError();
  }
  return { status, result };
}


/****************************************************************************
 **                                                                        **
 ** Flagpole housekeeping                                                  **
 **                                                                        **
 ****************************************************************************/

export let flagpoleHandlers = [
  { requestType: 'post',  path: '/cache/item',    event: 'item',   handler: getItem },
  { requestType: 'post',  path: '/cache/items',   event: 'items',  handler: getItemMultiple },
  { requestType: 'post',  path: '/cache/set',     event: 'set',    handler: setItem },
  { requestType: 'post',  path: '/cache/load',    event: 'load',   handler: loadItems },
  { requestType: 'get',   path: '/cache/stats',   event: 'stats',  handler: getStats },
  { requestType: 'get',   path: '/cache/dump',    event: 'dump',   handler: dumpCache },
  { requestType: 'get',   path: '/cache/load10',  event: 'load10', handler: load10 }
];
