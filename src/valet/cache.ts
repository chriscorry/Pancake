/****************************************************************************
 **                                                                        **
 ** Modules                                                                **
 **                                                                        **
 ****************************************************************************/

import now              = require('performance-now');
import { PancakeError }  from '../util/pancake-err';
import { Configuration } from '../util/pancake-config';
import utils             = require('../util/pancake-utils');
const  log               = utils.log;


/****************************************************************************
 **                                                                        **
 ** Vars & definitions                                                     **
 **                                                                        **
 ****************************************************************************/

export interface CacheOpts {
  maintenanceInterval?: number,
  maxCacheSize?: number
}

export interface ClassFactory {

  // Must have
  createId(obj?: any) : string;
  saveItem(id: string, obj: any, className: string, opts?: any) : any;
  loadItem(id: string, className: string, opts?: any) : any;

  // Optional
  initialize(className: string, ttl: number, config?: Configuration) : void;
  terminate() : void;
  loadItems(query: any, className: string, opts?: any) : any[];
}

export interface IdInfo {
  id?: string,
  className?: string,
  ttl?: number,
  opts?: any
}

interface _FactoryInfo {
  factory?: ClassFactory,
  ttl?: number,
  config?: Configuration
}

interface _CacheItem {
  value?: any,
  expire?: number
}


const MAINTENANCE_INTERVAL = 60*5; // Every five minutes
const MAX_CACHE_SIZE       = 100000;
export const DEFAULT_TTL   = 60*5;

let _factories           = new Map();
let _cache               = new Map();
let _maintenanceInterval = MAINTENANCE_INTERVAL * 1000;
let _maxCacheSize        = MAX_CACHE_SIZE;
let _initialized         = false;
let _timerID: NodeJS.Timer;
let _lastError: any;

// Stats
let _cacheRequests  = 0;
let _cacheHits      = 0;
let _cacheMisses    = 0;
let _cacheFlushes   = 0;
let _cacheExpires   = 0;
let _cacheLoads     = 0;
let _cacheInjects   = 0;
let _aveRequestTime = 0.0;


/****************************************************************************
 **                                                                        **
 ** Class Factories                                                        **
 **                                                                        **
 ****************************************************************************/


export function registerFactory(className: string,
                                factory: ClassFactory,
                                ttl: number = DEFAULT_TTL,
                                config?: Configuration) : any
{
  // Quick and dirty validation
  if (!className || !factory) {
    _processError('ERR_BAD_ARG', `CACHE: Cannot register factory.`);
    return;
  }

  // Interface check
  if (!factory.createId ||
      !factory.saveItem ||
      !factory.loadItem) {
    _processError('ERR_BAD_ARG', `CACHE: Factory doesn't have required interface.`);
    return;
  }

  // Unregister any existing factory
  if (_factories.get(className)) {
    unregisterFactory(className);
  }

  // Set it in and let it know
  _factories.set(className, { factory, ttl: ttl*1000, config });
  if (factory.initialize) {
    factory.initialize(className, ttl, config);
  }

  return factory;
}

export function unregisterFactory(className: string) : void
{
  let factoryInfo = _factories.get(className);
  if (factoryInfo) {
    if (factoryInfo.factory.terminate) {
      factoryInfo.factory.terminate();
    }
    _factories.delete(className);
  }
}

export function getFactory(className: string) : ClassFactory
{
  let factoryInfo = _factories.get(className);
  if (!factoryInfo) {
    factoryInfo = _factories.get('*');
  }
  return factoryInfo ? factoryInfo.factory : undefined;
}

export function getClassNames() : string[]
{
  let classNames: string[] = [];
  _factories.forEach((value, key) => {
    classNames.push(key);
  });
  return classNames;
}


/****************************************************************************
 **                                                                        **
 ** Cache                                                                  **
 **                                                                        **
 ****************************************************************************/

//
// PRIVATE
//

function _processError(status: string, reason?: string, obj?: any) : PancakeError
{
  _lastError = new PancakeError(status, reason, obj);
  log.trace(`CACHE: ${status}: ${reason}`);
  if (obj) log.trace(obj);
  return _lastError;
}

function _getFactoryInfo(className: string) : _FactoryInfo
{
  var factoryInfo = _factories.get(className);
  if (!factoryInfo) {
    factoryInfo = _factories.get('*');
  }
  return factoryInfo;
}


function _updateAveRequestTime(newValue: number) : void
{
  _aveRequestTime = (_aveRequestTime * (_cacheRequests-1) + newValue) / _cacheRequests;
  if (_aveRequestTime < 0.0) {
    log.warn(`_aveRequestTime just went negative! ${_aveRequestTime}`);
  }
}


function _cacheMaintenance() : void
{
  let expired: string[] = [];
  let expiredItemCount = 0, flushedItemCount = 0;
  let perfStart = now();

  log.info(`CACHE: Beginning maintenance (interval = ${_maintenanceInterval/1000} sec)...`);

  // TASK 1: Remove expired items from the cache
  log.trace('CACHE:    Removing expired items from cache...');

  // Find the expired items
  // (Could use filterMap instead of multiple pass through cache, but
  // this implementation trades speed for lower memory footprint -- doesn't
  // dup entire cache Map()!)
  let currTime = Date.now();
  _cache.forEach((cacheItem: _CacheItem, id: string) => cacheItem.expire < currTime ? expired.push(id) : undefined);

  // Remove them from the cache
  expired.forEach((currID: string) => {
    _cache.delete(currID);
    _cacheExpires++;
    expiredItemCount++;
  });
  log.trace(`CACHE:    ${expiredItemCount} expired items removed from cache.`);

  // TASK 2: Reduce size of cache, if necessary
  if (_cache.size > _maxCacheSize) {

    log.trace(`CACHE:    Cache too large (curr = ${_cache.size}, max = ${_maxCacheSize}). Reducing...`);

    // Build the expires datastructures
    let expiresInfos      = new Map<number, string[]>();
    let expires: number[] = [];
    let idArray: string[];
    _cache.forEach((cacheItem: _CacheItem, currID: string) => {
      idArray = expiresInfos.get(cacheItem.expire);
      if (idArray) {
        idArray.push(currID);
      }
      else {
        idArray = [ currID ];
        expiresInfos.set(cacheItem.expire, idArray);
        expires.push(cacheItem.expire);
      }
    });

    // Sort our expiration timestamps
    expires.sort();

    // Start clearing items out, starting with items with soonest expiration
    let iter = 0;
    while (_cache.size > _maxCacheSize) {
      idArray = expiresInfos.get(expires[iter]);
      idArray.forEach((currID: string) => {
        _cache.delete(currID);
        _cacheFlushes++;
        flushedItemCount++;
      });
      iter++;
    }
    log.trace(`CACHE:    ${flushedItemCount} items flushed from cache.`);
  }

  log.info(`CACHE: Maintenance complete. (${(now() - perfStart).toFixed(3)} ms)`);

  // Kick off the next one
  _timerID = setTimeout(_cacheMaintenance, _maintenanceInterval);
}


function _lookupItem(id: string) : any
{
  let cacheItem: _CacheItem = _cache.get(id);
  if (cacheItem) {

    // Has the item expired?
    if (cacheItem.expire < Date.now()) {
      _cacheExpires++;
      _cache.delete(id);
    }
    return cacheItem.value;
  }
}


//
// PUBLIC
//

export function initialize(opts?: CacheOpts) : void
{
  if (opts) {
    if (opts.maintenanceInterval) _maintenanceInterval = opts.maintenanceInterval*1000;
    if (opts.maxCacheSize)        _maxCacheSize        = opts.maxCacheSize;
  }
  _initialized = true;

  // Kick off timer
  if (_timerID) {
    clearTimeout(_timerID);
  }
  _timerID = setTimeout(_cacheMaintenance, _maintenanceInterval);
}


export async function get(id: string, className: string, opts?: any) : Promise<any>
{
  // Quick and dirty validation
  if (_initialized == false) {
    return Promise.reject(_processError('ERR_CACHE_NOT_INIT', `CACHE: Cannot use cache before initialization.`));
  }
  if (!id || !className)
  {
    _processError('ERR_BAD_ARG', `CACHE: Could not retrieve item.`);
    return;
  }

  // We only use string keys in the cache
  let perfStart = now();

  // Easy case -- we have it..
  _cacheRequests++;
  let obj = _lookupItem(id);
  if (obj) {
    _cacheHits++;
    _updateAveRequestTime(now()-perfStart);
    return obj;
  }
  _cacheMisses++;

  // Load the item
  let factoryInfo = _getFactoryInfo(className);
  if (factoryInfo) {
    try {
      let newObj = await factoryInfo.factory.loadItem(id, className, opts);
      if (newObj) {
        _cache.set(id, { value: newObj, expire: Date.now()+factoryInfo.ttl });
        _cacheLoads++;
        _updateAveRequestTime(perfStart-now());
        return newObj;
      }
    }
    catch (err) {
      return Promise.reject(_processError('ERR_BAD_CACHE_LOAD', `CACHE: Bad load. ${id}, ${className}, ${opts}`, err));
    }
  }

  // No factory
  return Promise.reject(_processError('ERR_NO_FACTORY', `CACHE: Could not find factory for class '${className}'`));
}


export async function getMultiple(idInfos: IdInfo[])
{
  // Quick and dirty validation
  if (!_initialized) {
    return Promise.reject(_processError('ERR_CACHE_NOT_INIT', `CACHE: Cannot use cache before initialization.`));
  }
  if (!idInfos)
  {
    _processError('ERR_BAD_ARG', `CACHE: Could not retrieve items (multiple).`);
    return;
  }

  let iter: number             = 0;
  let requestHits: number      = 0;
  let perfStart                = now();
  let objsNew: any[]           = [];
  let objsReturn: any[]        = [];
  let promises: Promise<any>[] = [];
  let newObj: any;
  let idInfo: IdInfo;
  let factoryInfo: _FactoryInfo;

  if (idInfos.length) {

    try {
      for (iter = 0; iter < idInfos.length; iter++) {

        idInfo = idInfos[iter];

        // Phase 1: Get our cache hits out of the way...
        _cacheRequests++;
        newObj = _lookupItem(idInfo.id);
        if (newObj) {
          _cacheHits++;
          requestHits++;
          objsReturn[iter] = newObj;
        }
        else {
          _cacheMisses++;

          // Phase 2: Otherwise kick off our load asynchronously...
          // (NOTE: promises array could be sparse, depending on # of cache hits
          factoryInfo = _getFactoryInfo(idInfo.className);
          if (factoryInfo) {
            idInfo.ttl = factoryInfo.ttl; // Save off the ttl, we'll need it later
            promises[iter] = factoryInfo.factory.loadItem(idInfo.id, idInfo.className, idInfo.opts);
          }
          else {
            // We're doomed at this point
            return Promise.reject(_processError('ERR_NO_FACTORY', `CACHE: Could not find factory for class '${idInfo.className}'`));
          }
        }
      }
      if (requestHits === idInfos.length) {
        // All items were serviced from cache
        _updateAveRequestTime(now()-perfStart);
        return objsReturn;
      }

      // Phase 3: Wait for our results...
      objsNew = await Promise.all(promises);

      // Phase 4: Add successful loads to the cache and place in return array
      for (iter = 0; iter < idInfos.length; iter++) {
        newObj = objsNew[iter];
        if (newObj) {
          idInfo = idInfos[iter];
          _cache.set(idInfo.id, { value: newObj, expire: Date.now()+idInfo.ttl });
          _cacheLoads++;
          objsReturn[iter] = newObj;
        }

        // Sadly, one fail means they all fail
        else {
          if (!objsReturn[iter]) {
            return Promise.reject(_processError('ERR_BAD_CACHE_LOAD_MULTIPLE', `CACHE: Bad load (multiple)`, idInfos));
          }
        }
      }

      // Yay!
      _updateAveRequestTime(now()-perfStart);
      return objsReturn;
    }
    catch (err) {
      return Promise.reject(_processError('ERR_BAD_CACHE_LOAD_MULTIPLE', `CACHE: Bad load (multiple)`, err));
    }
  }
}


export async function set(id: string, obj: any, className: string, opts?: any) : Promise<[string, any]>
{
  // Quick and dirty validation
  if (!_initialized) {
    return Promise.reject(_processError('ERR_CACHE_NOT_INIT', `CACHE: Cannot use cache before initialization.`));
  }
  if (!obj || !className)
  {
    _processError('ERR_BAD_ARG', `CACHE: Could not place object into cache.`);
    return;
  }

  let cacheItem: _CacheItem = {};
  let factoryInfo = _getFactoryInfo(className);
  if (factoryInfo) {

    // Do we need to generate a new ID?
    if (!id) {
      id = obj._id || factoryInfo.factory.createId(obj);
      if (!id) {
        return Promise.reject(_processError('ERR_NO_ID', `CACHE: Cannot add item to cache without id.`));
      }
    }

    // Place in the cache
    let ttl = factoryInfo.ttl;
    if (opts && opts.ttl) {
      ttl = opts.ttl;
    }
    cacheItem.expire = Date.now()+ttl;
    cacheItem.value = obj;

    _cache.set(id, cacheItem);
    _cacheInjects++;

    // Do we also need to persist the object?
    if ((obj.isDirty != undefined &&
          obj.isDirty === true) ||
        (opts && opts.isDirty === true)) {
      log.trace(`CACHE: Saving dirty object (${id})`);
      await factoryInfo.factory.saveItem(id, obj, className, opts);
    }

    return [id, obj];
  }

  // No factory
  return Promise.reject(_processError('ERR_NO_FACTORY', `CACHE: Could not find factory for class '${className}'`));
}


export async function load(query: any, className: string, opts?: any) : Promise<any[]>
{
  // Quick and dirty validation
  if (!_initialized) {
    return Promise.reject(_processError('ERR_CACHE_NOT_INIT', `CACHE: Cannot use cache before initialization.`));
  }
  if (!query || !className)
  {
    _processError('ERR_BAD_ARG', `CACHE: Could not load objects into cache.`);
    return;
  }

  let newObjs: any[] = [];
  let factoryInfo = _getFactoryInfo(className);
  if (factoryInfo) {

    // Supports queries?
    if (!factoryInfo.factory.loadItems) {
      return Promise.reject(_processError('ERR_UNSUPPORTED', `CACHE: Factory does not support queried loads (${className}).`));
    }

    try {
      newObjs = await factoryInfo.factory.loadItems(query, className, opts);
      if (newObjs) {
        newObjs.forEach((newObj: any) => {
          let id = (typeof newObj._id === 'string') ? newObj._id : newObj._id.toString();
          _cache.set(id, { value: newObj, expire: Date.now()+factoryInfo.ttl });
          _cacheLoads++;
        });
        return newObjs;
      }
    }
    catch (err) {
      return Promise.reject(_processError('ERR_BAD_CACHE_LOAD', `CACHE: Bad load. ${query}, ${className}, ${opts}`, err));
    }
  }

  // No factory
  return Promise.reject(_processError('ERR_NO_FACTORY', `CACHE: Could not find factory for class '${className}'`));
}


export function getStats() : any
{
  return {
    cacheRequests:   _cacheRequests,
    cacheHits:       _cacheHits,
    cacheMisses:     _cacheMisses,
    cacheFlushes:    _cacheFlushes,
    cacheExpires:    _cacheExpires,
    cacheLoads:      _cacheLoads,
    cacheInjects:    _cacheInjects,
    cacheSize:       _cache.size,
    maxCacheSize:    _maxCacheSize,
    aveRequestTime:  parseFloat(_aveRequestTime.toFixed(3)),
    numFactories:    _factories.size,
    classNames:      getClassNames()
  };
}


export function resetStats() : void
{
  _cacheRequests   = 0;
  _cacheHits       = 0;
  _cacheMisses     = 0;
  _cacheFlushes    = 0;
  _cacheExpires    = 0;
  _cacheLoads      = 0;
  _cacheInjects    = 0;
  _aveRequestTime  = 0.0;
}


export function dumpCache() : void
{
  log.info('===== DUMP CACHE START =======================================');
  log.info(`Cache size: ${_cache.size}`);
  _cache.forEach((cacheItem: _CacheItem, id: string) => {
    log.info(`   Cache Item '${id}'`);
    log.info(`          expire: ${cacheItem.expire}`);
    log.info(`          value:  ${JSON.stringify(cacheItem.value)}`);
  });
  log.info('===== DUMP CACHE END =========================================');
}


export function getLastError() : PancakeError
{
  return _lastError;
}
