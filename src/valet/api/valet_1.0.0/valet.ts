/****************************************************************************
 **                                                                        **
 ** Modules                                                                **
 **                                                                        **
 ****************************************************************************/

const  cache                  = require('../../cache');
const  { SimpleMongoFactory } = require('./SimpleMongoFactory');
import { PancakeError }      from '../../../util/pancake-err';
import { grab }              from '../../../util/pancake-grab';
import { Configuration }     from '../../../util/pancake-config';
import { entitledEndpoint,
         IEndpointInfo,
         IEndpointResponse } from '../../../flagpole/apitypes';

/****************************************************************************
 **                                                                        **
 ** Vars & definitions                                                     **
 **                                                                        **
 ****************************************************************************/

// ENTITLEMENTS
const ENT_DOMAIN       = 'valet';
const ENT_ROLE_ADMIN   = 'admin';
const ENT_ROLE_CLIENT  = 'client';
const ENT_ROLE_SERVER  = 'server';
const ENT_ROLE_TOOLS   = 'tools';
const ENT_ROLE_DEBUG   = 'debug';
const API_TAG          = 'VALET';


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


export function initializeAPI(name: string, ver: string, apiToken:string,
                              config: Configuration,
                              opts: any) : PancakeError
{
  let eventSinks                  = opts.initEventsSink;
  let maintenanceInterval: number = config ? config.get('MAINTENANCE_INTERVAL') : 60*5;
  let maxCacheSize: number        = config ? config.get('MAX_CACHE_SIZE') : 100;
  let defaultTTL: number          = config ? config.get('DEFAULT_TTL') : cache.DEFAULT_TTL;

  // Register factories
  cache.registerFactory('Identity', IdentityFactory,    defaultTTL, config);
  cache.registerFactory('*',        SimpleMongoFactory, defaultTTL, config);

  // Fire up the cache
  cache.initialize({ maintenanceInterval, maxCacheSize });

  // Let folks know
  eventSinks.emit('initComplete', 'valet');

  return;
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

export let flagpoleHandlers: IEndpointInfo[] = [
  {
    requestType: 'post',
    path: '/cache/item',
    event: 'item',
    handler: entitledEndpoint(ENT_DOMAIN, [ ENT_ROLE_CLIENT, ENT_ROLE_SERVER, ENT_ROLE_TOOLS, ENT_ROLE_ADMIN ], API_TAG, getItem)
  },
  {
    requestType: 'post',
    path: '/cache/items',
    event: 'items',
    handler: entitledEndpoint(ENT_DOMAIN, [ ENT_ROLE_CLIENT, ENT_ROLE_SERVER, ENT_ROLE_TOOLS, ENT_ROLE_ADMIN ], API_TAG, getItemMultiple)
  },
  {
    requestType: 'post',
    path: '/cache/set',
    event: 'set',
    handler: entitledEndpoint(ENT_DOMAIN, [ ENT_ROLE_CLIENT, ENT_ROLE_SERVER, ENT_ROLE_TOOLS, ENT_ROLE_ADMIN ], API_TAG, setItem)
  },
  {
    requestType: 'post',
    path: '/cache/load',
    event: 'load',
    handler: entitledEndpoint(ENT_DOMAIN, [ ENT_ROLE_CLIENT, ENT_ROLE_SERVER, ENT_ROLE_DEBUG, ENT_ROLE_TOOLS, ENT_ROLE_ADMIN ], API_TAG, loadItems)
  },
  {
    requestType: 'get',
    path: '/cache/stats',
    event: 'stats',
    handler: entitledEndpoint(ENT_DOMAIN, [ ENT_ROLE_DEBUG, ENT_ROLE_TOOLS, ENT_ROLE_ADMIN ], API_TAG, getStats),
    metaTags: { audience: 'tools' }
  },
  {
    requestType: 'get',
    path: '/cache/dump',
    event: 'dump',
    handler: entitledEndpoint(ENT_DOMAIN, [ ENT_ROLE_DEBUG, ENT_ROLE_TOOLS, ENT_ROLE_ADMIN ], API_TAG, dumpCache),
    metaTags: { audience: 'tools' }
  },
  {
    requestType: 'get',
    path: '/cache/load10',
    event: 'load10',
    handler: entitledEndpoint(ENT_DOMAIN, [ ENT_ROLE_DEBUG, ENT_ROLE_TOOLS, ENT_ROLE_ADMIN ], API_TAG, load10),
    metaTags: { audience: 'debug' }
  }
];
