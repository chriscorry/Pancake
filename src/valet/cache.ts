/****************************************************************************
 **                                                                        **
 ** Modules                                                                **
 **                                                                        **
 ****************************************************************************/

import now             = require('performance-now');
const { log }          = require('../../Util/pancake-utils');
const { PancakeError } = require('../../Util/pancake-err');


/****************************************************************************
 **                                                                        **
 ** Vars & definitions                                                     **
 **                                                                        **
 ****************************************************************************/

const MAINTENANCE_INTERVAL = 60*5; // Every five minutes
const MAX_CACHE_SIZE       = 100000;
const DEFAULT_TTL          = 60*5;

var _factories           = new Map();
var _cache               = new Map();
var _maintenanceInterval = MAINTENANCE_INTERVAL * 1000;
var _maxCacheSize        = MAX_CACHE_SIZE;
var _timerID             = 0;
var _initialized         = false;
var _lastError;

// Stats
var _cacheRequests  = 0;
var _cacheHits      = 0;
var _cacheMisses    = 0;
var _cacheFlushes   = 0;
var _cacheExpires   = 0;
var _cacheLoads     = 0;
var _cacheInjects   = 0;
var _aveRequestTime = 0.0;


/****************************************************************************
 **                                                                        **
 ** Class Factories                                                        **
 **                                                                        **
 ****************************************************************************/


function registerFactory(className, factory, ttl = DEFAULT_TTL, config)
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

function unregisterFactory(className)
{
  var factoryInfo = _factories.get(className);
  if (factoryInfo) {
    if (factoryInfo.factory.terminate) {
      factoryInfo.factory.terminate();
    }
    _factories.delete(className);
  }
}

function getFactory(className)
{
  var factoryInfo = _factories.get(className);
  if (!factoryInfo) {
    factoryInfo = _factories.get('*');
  }
  return factoryInfo ? factoryInfo.factory : undefined;
}

function getClassNames()
{
  var classNames = [];
  _factories.forEach((value, key) => {
    classNames.push(key);
  });
  return classNames;
}

module.exports.DEFAULT_TTL       = DEFAULT_TTL;
module.exports.registerFactory   = registerFactory;
module.exports.unregisterFactory = unregisterFactory;
module.exports.getFactory        = getFactory;
module.exports.getClassNames     = getClassNames;


/****************************************************************************
 **                                                                        **
 ** Cache                                                                  **
 **                                                                        **
 ****************************************************************************/

//
// PRIVATE
//

function _processError(status, reason, obj)
{
  _lastError = new PancakeError(status, reason, obj);
  log.trace(`CACHE: ${status}: ${reason}`);
  if (obj) log.trace(obj);
  return _lastError;
}

function _getFactoryInfo(className)
{
  var factoryInfo = _factories.get(className);
  if (!factoryInfo) {
    factoryInfo = _factories.get('*');
  }
  return factoryInfo;
}


function _updateAveRequestTime(newValue)
{
  _aveRequestTime = (_aveRequestTime * (_cacheRequests-1) + newValue) / _cacheRequests;
  if (_aveRequestTime < 0.0) {
    log.error(`_aveRequestTime just went negative! ${_aveRequestTime}`);
    process.exit(1);
  }
}


function _cacheMaintenance()
{
  var expired = [], idArray = [];
  var expiredItemCount = 0, flushedItemCount = 0;
  var perfStart = now();

  log.info(`CACHE: Beginning maintenance (interval = ${_maintenanceInterval/1000} sec)...`);

  // TASK 1: Remove expired items from the cache
  log.trace('CACHE:    Removing expired items from cache...');

  // Find the expired items
  // (Could use filterMap instead of multiple pass through cache, but
  // this implementation trades speed for lower memory footprint -- doesn't
  // dup entire cache Map()!)
  var currTime = Date.now();
  _cache.forEach((value, key) => value.expire < currTime ? expired.push(key) : undefined);

  // Remove them from the cache
  expired.forEach((currID) => {
    _cache.delete(currID);
    _cacheExpires++;
    expiredItemCount++;
  });
  log.trace(`CACHE:    ${expiredItemCount} expired items removed from cache.`);

  // TASK 2: Reduce size of cache, if necessary
  if (_cache.size > _maxCacheSize) {

    log.trace(`CACHE:    Cache too large (curr = ${_cache.size}, max = ${_maxCacheSize}). Reducing...`);

    // Build the expires datastructures
    var expiresInfos = new Map();
    var expires      = [];
    _cache.forEach((cacheItem, currID) => {
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
    var iter = 0;
    while (_cache.size > _maxCacheSize) {
      idArray = expiresInfos.get(expires[iter]);
      idArray.forEach((currID) => {
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


function _lookupItem(id)
{
  var cacheItem = _cache.get(id);
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

function initialize(opts)
{
  if (opts) {
    if (opts.maintenanceInterval) _maintenanceInterval = opts.maintenanceInterval*1000;
    if (opts.maxCacheSize)        _maxCacheSize        = opts.maxCacheSize;
  }
  _initialized = true;

  // Kick off timer
  if (_timerID != 0) {
    clearTimeout(_timerID);
  }
  _timerID = setTimeout(_cacheMaintenance, _maintenanceInterval);
}


async function get(userId, className, opts)
{
  // Quick and dirty validation
  if (_initialized == false) {
    return Promise.reject(_processError('ERR_CACHE_NOT_INIT', `CACHE: Cannot use cache before initialization.`));
  }
  if (!userId || !className)
  {
    _processError('ERR_BAD_ARG', `CACHE: Could not retrieve item.`);
    return;
  }

  // We only use string keys in the cache
  let id = (typeof userId === 'string') ? userId : userId.toString();
  let perfStart = now();

  // Easy case -- we have it..
  _cacheRequests++;
  var obj = _lookupItem(id);
  if (obj) {
    _cacheHits++;
    _updateAveRequestTime(now()-perfStart);
    return obj;
  }
  _cacheMisses++;

  // Load the item
  var factoryInfo = _getFactoryInfo(className);
  if (factoryInfo) {
    try {
      var newObj = await factoryInfo.factory.loadItem(id, className, opts);
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


async function getMultiple(idInfos)
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

  var iter, newObj, idInfo, factoryInfo, id, requestHits = 0;
  var perfStart  = now();
  var objsNew    = [];
  var objsReturn = [];
  var promises   = [];

  if (idInfos.length) {

    try {
      for (iter = 0; iter < idInfos.length; iter++) {

        idInfo = idInfos[iter];

        // Phase 1: Get our cache hits out of the way...
        _cacheRequests++;
        id = (typeof idInfo.id === 'string') ? idInfo.id : idInfo.id.toString();
        newObj = _lookupItem(id);
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
            promises[iter] = factoryInfo.factory.loadItem(id, idInfo.className, idInfo.opts);
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
          id = (typeof idInfo.id === 'string') ? idInfo.id : idInfo.id.toString();
          _cache.set(id, { value: newObj, expire: Date.now()+idInfo.ttl });
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


async function set(userId, obj, className, opts)
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

  // Massage our id, if provided
  var id;
  if (userId) {
    id = (typeof userId === 'string') ? userId : userId.toString();
  }

  var cacheItem = {};
  var factoryInfo = _getFactoryInfo(className);
  if (factoryInfo) {

    // Do we need to generate a new ID?
    if (!id) {
      id = obj._id || factoryInfo.factory.createId(obj);
      if (!id) {
        return Promise.reject(_processError('ERR_NO_ID', `CACHE: Cannot add item to cache without id.`));
      }
      id = (typeof userId === id) ? id : id.toString();
    }

    // Place in the cache
    var ttl = factoryInfo.ttl;
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


async function load(query, className, opts)
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

  var newObjs = [];
  var factoryInfo = _getFactoryInfo(className);
  if (factoryInfo) {

    // Supports queries?
    if (!factoryInfo.factory.loadItems) {
      return Promise.reject(_processError('ERR_UNSUPPORTED', `CACHE: Factory does not support queried loads (${className}).`));
    }

    try {
      newObjs = await factoryInfo.factory.loadItems(query, className, opts);
      if (newObjs) {
        newObjs.forEach((newObj) => {
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


function getStats()
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


function resetStats()
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


function dumpCache()
{
  log.info('===== DUMP CACHE START =======================================');
  log.info(`Cache size: ${_cache.size}`);
  _cache.forEach((value, key) => {
    log.info(`   Cache Item ${key}`);
    log.info(`          expire: ${value.expire}`);
    log.info(`          value:  ${JSON.stringify(value.value)}`);
  });
  log.info('===== DUMP CACHE END =========================================');
}


function getLastError()
{
  return _lastError;
}


module.exports.initialize   = initialize;
module.exports.get          = get;
module.exports.getMultiple  = getMultiple;
module.exports.set          = set;
module.exports.load         = load;
module.exports.getStats     = getStats;
module.exports.dumpCache    = dumpCache;
module.exports.resetStats   = resetStats;
module.exports.getLastError = getLastError;
