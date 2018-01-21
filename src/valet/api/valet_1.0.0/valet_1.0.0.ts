/****************************************************************************
 **                                                                        **
 ** Modules                                                                **
 **                                                                        **
 ****************************************************************************/

const  cache                  = require('../../cache');
const  { SimpleMongoFactory } = require('./SimpleMongoFactory');
import { grab }          from '../../../util/pancake-grab';
import { Configuration } from '../../../util/pancake-config';


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
    await sleep(getRandomInt(5*1000));
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


export function initialize(serverRestify: any, config?: Configuration) : void
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


async function getItem(req: any, res: any, next: Function) : Promise<any>
{
  let item, status, result;
  [result, item] = await grab(cache.get(req.body.id, req.body.className, req.body.opts));

  // Process the results
  status = (result || !item) ? 400 : 200;
  if (!result) {
    result = item ? { item } : cache.getLastError();
  }
  res.send(status, result);
  return next();
}


async function getItemMultiple(req: any, res: any, next: Function) : Promise<any>
{
  let items, status, result;
  [result, items] = await grab(cache.getMultiple(req.body.idInfos));

  // Process the results
  status = (result || !items) ? 400 : 200;
  if (!result) {
    result = items ? { numItems: items.length, items } : cache.getLastError();
  }
  res.send(status, result);
  return next();
}


async function setItem(req: any, res: any, next: Function) : Promise<any>
{
  let item, status, result;
  [result, item] = await grab(cache.set(req.body.id, req.body.obj, req.body.className, req.body.opts));

  // Process the results
  status = (result || !item) ? 400 : 200;
  if (!result) {
    result = item ? { id: item[0], item: item[1] } : cache.getLastError();
  }
  res.send(status, result);
  return next();
}


async function loadItems(req: any, res: any, next: Function) : Promise<any>
{
  let items, status, result;
  [result, items] = await grab(cache.load(req.body.query, req.body.className, req.body.opts));

  // Process the results
  status = (result || !items) ? 400 : 200;
  if (!result) {
    result = items ? { numItems: items.length, items } : cache.getLastError();
  }
  res.send(status, result);
  return next();
}


function getStats(req: any, res: any, next: Function) : Promise<any>
{
  res.send(200, cache.getStats());
  return next();
}


function dumpCache(req: any, res: any, next: Function) : Promise<any>
{
  cache.dumpCache();
  res.send(200);
  return next();
}


async function load10(req: any, res: any, next: Function) : Promise<any>
{
  let items: any[];
  for (let iter = 0; iter < 10; iter++) {
    items.push({
      id: getRandomInt(9999999)+10000000,
      className: 'Identity'
    });
  }
  try {
    items = await cache.getMultiple(items);
    if (!items) {
      res.send(400, cache.getLastError());
    }
    else {
      res.send(200, { items });
    }
  }
  catch (err) {
    res.send(400, err);
  }
  return next();
}


/****************************************************************************
 **                                                                        **
 ** Flagpole housekeeping                                                  **
 **                                                                        **
 ****************************************************************************/

export let flagpoleHandlers = [
  { requestType: 'post',  path: '/cache/item',    handler: getItem },
  { requestType: 'post',  path: '/cache/items',   handler: getItemMultiple },
  { requestType: 'post',  path: '/cache/set',     handler: setItem },
  { requestType: 'post',  path: '/cache/load',    handler: loadItems },
  { requestType: 'get',   path: '/cache/stats',   handler: getStats },
  { requestType: 'get',   path: '/cache/dump',    handler: dumpCache },
  { requestType: 'get',   path: '/cache/load10',  handler: load10 }
];