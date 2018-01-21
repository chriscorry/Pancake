"use strict";
/****************************************************************************
 **                                                                        **
 ** Modules                                                                **
 **                                                                        **
 ****************************************************************************/
exports.__esModule = true;
var path = require("path");
var fs = require("fs");
var _ = require("lodash");
var pancake_err_1 = require("../util/pancake-err");
var pancake_config_1 = require("../util/pancake-config");
var utils = require("../util/pancake-utils");
var log = utils.log;
/****************************************************************************
 **                                                                        **
 ** class Flagpole                                                         **
 **                                                                        **
 ****************************************************************************/
var Flagpole = /** @class */ (function () {
    function Flagpole() {
        this._apiSearchDirs = [];
        this._requestTypes = new Map();
        this._registeredAPIsByToken = new Map();
    }
    /****************************************************************************
     **                                                                        **
     ** PRIVATE _registerAPIDirect(...)                                        **
     **                                                                        **
     ****************************************************************************/
    Flagpole.prototype._registerAPIDirect = function (name, descriptiveName, // opt
        description, // opt
        ver, apiHandler, fileName, // opt
        config) {
        var _this = this;
        // Simple validation
        if (!this._serverRestify) {
            log.trace('FP: ERR_FLAGPOLE_NOT_INIT');
            return new pancake_err_1.PancakeError('ERR_FLAGPOLE_NOT_INIT');
        }
        if (!name || !ver || !apiHandler) {
            log.trace('FP: ERR_BAD_ARG');
            return new pancake_err_1.PancakeError('ERR_BAD_ARG');
        }
        // Validate version format
        if (!ver.match(/(\d+\.)?(\d+\.)?(\d+)/)) {
            log.trace('FP: ERR_BAD_ARG: Invalid version format');
            return new pancake_err_1.PancakeError('ERR_BAD_ARG', 'Invalid version format');
        }
        // Create our new API token
        name = _.toLower(_.trim(name));
        var apiToken = name + ':' + _.trim(ver);
        // Has this API already been registered?
        if (this._registeredAPIsByToken.get(apiToken)) {
            // Unregister what's currently there
            this.unregisterAPI(apiToken);
            log.trace('FP: Overwriting api %s', apiToken);
        }
        var newAPI = {
            name: name,
            descriptiveName: descriptiveName,
            description: description,
            ver: ver,
            apiHandler: apiHandler,
            apiToken: apiToken,
            fileName: fileName
        };
        var pathInfo;
        try {
            // Register the routes
            // newApi.apiHandler.flagpoleHandlers is an array of pathInfos
            // pathInfo { requestType, path, handler, route (which we set) }
            newAPI.apiHandler.flagpoleHandlers.forEach(function (pathInfo) {
                // Validate requestType
                var httpRequestType = _.toLower(_.trim(pathInfo.requestType));
                if (httpRequestType.match('get|post|put|patch|del|opts')) {
                    // Register the route
                    var funcRequestHandler = _this._requestTypes.get(httpRequestType);
                    if (funcRequestHandler) {
                        pathInfo.route = funcRequestHandler.call(_this._serverRestify, {
                            path: pathInfo.path,
                            version: newAPI.ver
                        }, pathInfo.handler);
                        log.trace("FP: Registered route (" + pathInfo.path + ", " + newAPI.ver + ")");
                    }
                }
                else {
                    log.trace("FP: ERR_REGISTER_ROUTE: Bad request type: \"" + pathInfo.requestType + "\"");
                    throw new pancake_err_1.PancakeError('ERR_REGISTER_ROUTE', "Bad request type: \"" + pathInfo.requestType + "\"");
                }
            });
        }
        catch (error) {
            if (error instanceof pancake_err_1.PancakeError) {
                return error;
            }
            log.trace("FP: ERR_REGISTER_ROUTE: Could not register route: \"" + pathInfo.requestType + "\", \"" + pathInfo.path + "\", " + newAPI.ver);
            return new pancake_err_1.PancakeError('ERR_REGISTER_ROUTE', "Could not register route: \"" + pathInfo.requestType + "\", \"" + pathInfo.path + "\", " + newAPI.ver, error);
        }
        // Add to the main API collection
        this._registeredAPIsByToken.set(apiToken, newAPI);
        log.trace("FP: New API \"" + apiToken + "\" registered.");
        // Let the API know
        if (newAPI.apiHandler.initialize) {
            log.trace("FP: Calling API initializer");
            newAPI.apiHandler.initialize(this._serverRestify, config, name, ver, apiToken);
        }
    };
    /****************************************************************************
     **                                                                        **
     ** PRIVATE _registerAPIFromFile(...)                                      **
     **                                                                        **
     ****************************************************************************/
    Flagpole.prototype._registerAPIFromFile = function (name, descriptiveName, description, ver, fileName) {
        var _this = this;
        // Simple validation
        if (!this._serverRestify) {
            log.trace("FP: ERR_FLAGPOLE_NOT_INIT");
            return new pancake_err_1.PancakeError('ERR_FLAGPOLE_NOT_INIT');
        }
        if (!name || !ver) {
            log.trace("FP: ERR_BAD_ARG");
            return new pancake_err_1.PancakeError('ERR_BAD_ARG');
        }
        // Try to load up the file
        var newAPI;
        var err;
        this._apiSearchDirs.find(function (apiDir) {
            // Search through each api dir
            var safeFileName = utils.buildSafeFileName(fileName, apiDir);
            if (fs.existsSync(safeFileName)) {
                try {
                    // Load it...
                    newAPI = require(safeFileName);
                    // Look for a configuration file, if it exists
                    var config = void 0;
                    var configFile = path.dirname(safeFileName) + path.sep + path.basename(safeFileName, path.extname(safeFileName));
                    configFile += '.config.json';
                    if (fs.existsSync(configFile)) {
                        config = new pancake_config_1.Configuration(configFile, _this._envName);
                    }
                    // ... and register it
                    err = _this._registerAPIDirect(name, descriptiveName, description, ver, newAPI, safeFileName, config);
                    // Swallow the exception
                }
                catch (error) {
                    err = error;
                }
                return true;
            }
        });
        // No dice
        if (!newAPI) {
            log.trace("FP: ERR_FILE_LOAD: Could not load API file " + fileName, err);
            return new pancake_err_1.PancakeError('ERR_FILE_LOAD', "Could not load API file " + fileName, err);
        }
    };
    /****************************************************************************
     **                                                                        **
     ** PRIVATE _unregisterAPIInfo(...)                                        **
     **                                                                        **
     ****************************************************************************/
    Flagpole.prototype._unregisterAPIInfo = function (apiUnregInfo) {
        var _this = this;
        // Iterate over each route and remove
        apiUnregInfo.apiHandler.flagpoleHandlers.forEach(function (pathInfo) {
            // Unregister the route
            _this._serverRestify.rm(pathInfo.route);
            log.trace("FP: Unregistered route (" + pathInfo.route + ")");
            pathInfo.route = undefined;
        });
    };
    /****************************************************************************
     **                                                                        **
     ** PRIVATE _unregisterAllAPIs(...)                                        **
     **                                                                        **
     ****************************************************************************/
    Flagpole.prototype._unregisterAllAPIs = function () {
        var _this = this;
        this._registeredAPIsByToken.forEach(function (apiInfo) {
            // Remove routes
            _this._unregisterAPIInfo(apiInfo);
            // Unload modules from the cache
            if (apiInfo.fileName) {
                delete require.cache[require.resolve(apiInfo.fileName)];
                log.trace("FP: Removed module (" + apiInfo.fileName + ") from Node cache.");
            }
            // Let the API know
            if (apiInfo.apiHandler.terminate) {
                log.trace("FP: Calling API terminator");
                apiInfo.apiHandler.terminate();
            }
        });
        // Wipe the collection
        this._registeredAPIsByToken.clear();
        log.trace("FP: All APIs unregistered.");
    };
    /****************************************************************************
     **                                                                        **
     ** PUBLIC init(server: Required, Restify server instance)                 **
     **                                                                        **
     ****************************************************************************/
    Flagpole.prototype.initialize = function (server, opts) {
        var _this = this;
        // Simple validation
        if (!server) {
            log.trace("FP: ERR_BAD_ARG: Restify server instance not provided");
            throw new pancake_err_1.PancakeError('ERR_BAD_ARG');
        }
        if (opts.envName)
            this._envName = opts.envName;
        // Set it all up
        this._serverRestify = server;
        this._requestTypes.set('get', this._serverRestify.get);
        this._requestTypes.set('post', this._serverRestify.post);
        this._requestTypes.set('put', this._serverRestify.put);
        this._requestTypes.set('patch', this._serverRestify.patch);
        this._requestTypes.set('del', this._serverRestify.del);
        this._requestTypes.set('opts', this._serverRestify.opts);
        // API dirs
        if (opts && opts.apiSearchDirs) {
            opts.apiSearchDirs.split(path.delimiter).forEach(function (dir) {
                _this._apiSearchDirs.push(path.resolve(dir) + path.sep);
            });
        }
        else {
            this._apiSearchDirs = ['.' + path.sep];
        }
    };
    /****************************************************************************
     **                                                                        **
     ** PUBLIC registerAPI(...)                                                **
     **                                                                        **
     ****************************************************************************/
    Flagpole.prototype.registerAPI = function (name, descriptiveName, description, ver, pathOrHandler) {
        var typePathOrHandler = typeof pathOrHandler;
        if (typePathOrHandler === 'object') {
            return this._registerAPIDirect(name, descriptiveName, description, ver, pathOrHandler);
        }
        else if (typePathOrHandler === 'string') {
            return this._registerAPIFromFile(name, descriptiveName, description, ver, pathOrHandler);
        }
        return new pancake_err_1.PancakeError('ERR_BAD_ARG', 'FP: Must provide filename or handler to registerAPI.');
    };
    /****************************************************************************
     **                                                                        **
     ** PUBLIC unregisterAPI(...)                                              **
     **                                                                        **
     ****************************************************************************/
    Flagpole.prototype.unregisterAPI = function (nameOrToken, ver) {
        var _this = this;
        var found = false;
        // Simple validation
        if (!this._serverRestify) {
            log.trace("FP: ERR_FLAGPOLE_NOT_INIT");
            return new pancake_err_1.PancakeError('ERR_FLAGPOLE_NOT_INIT');
        }
        // No args means wipe them all out
        if (!nameOrToken && !ver) {
            this._unregisterAllAPIs();
            return;
        }
        // Move through the map and process each item
        this._registeredAPIsByToken = utils.filterMap(this._registeredAPIsByToken, function (apiToken, apiInfo) {
            // If a version was specified, nameOrToken is a name and only the
            // specified version should be removed
            if ((ver && apiInfo.name === nameOrToken && apiInfo.ver === ver) ||
                // If a version was NOT specified and the tokens match, that's our target
                (!ver && apiInfo.apiToken === nameOrToken) ||
                // If a version was NOT specified and the names match, we want to
                // remove ALL versions of this API, including this one
                (!ver && apiInfo.name === nameOrToken)) {
                // Out with the routes, remove from the cache, and keep out of map
                _this._unregisterAPIInfo(apiInfo);
                if (apiInfo.fileName) {
                    delete require.cache[require.resolve(apiInfo.fileName)];
                    log.trace("FP: Removed module (" + apiInfo.fileName + ") from Node cache.");
                }
                found = true;
                return false;
            }
            // Keep in the map
            return true;
        });
        // Was it found?
        if (!found) {
            log.trace("FP: ERR_API_NOT_FOUND: Could not find API (" + nameOrToken + ", " + ver + ") to unregister.");
            return new pancake_err_1.PancakeError('ERR_API_NOT_FOUND');
        }
        else {
            log.trace("FP: API (" + nameOrToken + ", " + ver + ") successfully unregistered.");
        }
    };
    /****************************************************************************
     **                                                                        **
     ** PUBLIC loadAPIConfig(...)                                              **
     **                                                                        **
     ****************************************************************************/
    Flagpole.prototype.loadAPIConfig = function (configFile) {
        var _this = this;
        // Simple validation
        if (!this._serverRestify) {
            log.trace("FP: ERR_FLAGPOLE_NOT_INIT");
            return new pancake_err_1.PancakeError('ERR_FLAGPOLE_NOT_INIT');
        }
        if (!configFile) {
            log.trace("FP: ERR_NO_CONFIG_FILE");
            return new pancake_err_1.PancakeError('ERR_NO_CONFIG_FILE');
        }
        // Load up the file
        var config;
        var err;
        var safeFileName;
        this._apiSearchDirs.find(function (apiDir) {
            // Search through each api dir
            safeFileName = utils.buildSafeFileName(configFile, apiDir);
            if (fs.existsSync(safeFileName)) {
                try {
                    config = require(safeFileName);
                    log.trace("FP: Loading API config file (" + safeFileName + ")...");
                }
                catch (error) {
                    err = error;
                }
                return true;
            }
        });
        if (!config) {
            log.trace("FP: ERR_FILE_LOAD: Could not load API config file (" + configFile + ")");
            if (err)
                log.trace(err);
            return new pancake_err_1.PancakeError('ERR_FILE_LOAD', "Could not load API config file (" + configFile + ")", err);
        }
        // Now process the config data
        err = undefined;
        try {
            var apis = config.apis;
            // Process each api in return
            apis.forEach(function (api) {
                if (api.versions && !err) {
                    api.versions.forEach(function (ver) {
                        if (!err) {
                            err = _this.registerAPI(api.name, api.descriptiveName, api.description, ver.ver, ver.fileName);
                        }
                    });
                }
            });
        }
        catch (error) {
            log.trace("FP: ERR_CONFIG: Could not process config file.");
            log.trace(error);
            return new pancake_err_1.PancakeError('ERR_CONFIG', 'Could not process config file.', error);
        }
        return err;
    };
    /****************************************************************************
     **                                                                        **
     ** PUBLIC queryAPIs(...)                                                  **
     **                                                                        **
     ****************************************************************************/
    Flagpole.prototype.queryAPIs = function () {
        var apis = [];
        this._registeredAPIsByToken.forEach(function (newAPI) {
            apis.push(_.pick(newAPI, [
                'name',
                'descriptiveName',
                'description',
                'ver',
                'apiToken',
                'fileName'
            ]));
        });
        log.trace("FP: Returned list of APIs.");
        return apis;
    };
    return Flagpole;
}()); // END class Flagpole
exports.Flagpole = Flagpole;
if (!exports.flagpole) {
    exports.flagpole = new Flagpole();
}
