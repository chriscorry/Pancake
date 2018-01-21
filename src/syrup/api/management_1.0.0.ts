/****************************************************************************
 **                                                                        **
 ** Modules                                                                **
 **                                                                        **
 ****************************************************************************/

import _ = require('lodash');
import * as util    from '../../util/pancake-utils';
import { grab }     from '../../util/pancake-grab';
import { flagpole } from '../../flagpole/flagpole';
const log = util.log;


/****************************************************************************
 **                                                                        **
 ** Vars & definitions                                                     **
 **                                                                        **
 ****************************************************************************/

const DEFAULT_SHUTDOWN_TIMER = 5; // 5 seconds

let _server: any;
let _nameThisAPI: string;
let _verThisAPI: string;
let _serverStart: number;
let _shutdownCountdown: number = 0;
let _timerID: NodeJS.Timer;


/****************************************************************************
 **                                                                        **
 ** Management API                                                         **
 **                                                                        **
 ****************************************************************************/

function _shutdownServer() : void
{
  if (_shutdownCountdown > 0) {
    _shutdownCountdown--;

    if (_shutdownCountdown === 0) {
      // Do it!
      log.warn('MGMT: Server shutting down now.');
      _server.close();
      process.exit(0);
    }
    else {
      log.warn(`MGMT: Server shutting down in ${_shutdownCountdown} seconds.`);
      _timerID = setTimeout(_shutdownServer, _shutdownCountdown*1000);
    }
  }
}


export function initializeAPI(server: any,
                              name: string,
                              ver: string,
                              apiToken:string) : void
{
  _server            = server;
  _nameThisAPI       = name;
  _verThisAPI        = ver;
  _serverStart       = Date.now();
  _shutdownCountdown = 0;
}


function _shutdown(req: any, res: any, next: Function)
{
  _shutdownCountdown = (req.body && req.body.countdown) ? req.body.countdown : DEFAULT_SHUTDOWN_TIMER;

  // Kick off our timer
  if (_timerID) {
    clearTimeout(_timerID);
  }
  _timerID = setTimeout(_shutdownServer, 1000);

  // Let folks know
  let message = `Server shutting down in ${_shutdownCountdown} seconds.`;
  log.warn('MGMT: ' + message);

  res.send(200, { alert: message });
  return next();
}


function _cancelShutdown(req: any, res: any, next: Function)
{
  let message: string;
  if (_shutdownCountdown > 0)
  {
    clearTimeout(_timerID);
    _shutdownCountdown = 0;
    message = 'Server shutdown canceled.';
    log.warn('MGMT: ' + message);
  }
  else {
    message = 'Server not shutting down. Nothing to cancel.';
  }
  res.send(200, { alert: message });
  return next();
}


function _logBookmark(req: any, res: any, next: Function)
{
  if (req.body && req.body.seq) {
    log.info(`===== ${req.body.seq} ===== ${req.body.seq} ===== ${req.body.seq} ===== ${req.body.seq} ===== ${req.body.seq} ====== ${req.body.seq} ===== ${req.body.seq} ===== ${req.body.seq} =====`);
  }
  else {
    log.info('=========================================================================');
  }
  res.send(200);
  return next();
}


function _setLogLevel(req: any, res: any, next: Function)
{
  let status: number, reason: string;

  if (req.body && req.body.level) {
    let ordLevel: number = log.getLevelOrd(req.body.level);
    if (ordLevel) {
      log.level = req.body.level;
      status = 200;
      reason = `Logging level has been set to ${log.levelAsString}.`;
      log.info(`MGMT: ${reason}`);
    }
    else {
      status = 400;
      reason = `Invalid logging level ('${req.body.level}') specified.`;
      log.trace(`MGMT: ${reason}`);
    }
  }
  else {
    status = 400;
    reason = `Logging level not specified.`;
    log.trace(`MGMT: ${reason}`);
  }
  res.send(status, { reason });
  return next();
}


function _reloadAPIConfig(req: any, res: any, next: Function)
{
  let status: number, reason: string, err: any;

  if (req.body && req.body.fileName) {
    err = flagpole.loadAPIConfig(req.body.fileName);
    if (!err) {
      status = 200;
      reason = `API config file has been reloaded.`;
      log.info(`MGMT: ${reason}`);
    }
    else {
      status = 400;
      reason = 'API config file could not be reloaded.';
      log.trace(`MGMT: ${reason}`);
    }
  }
  else {
    status = 400;
    reason = 'Config filename not specified.';
    log.trace(`MGMT: ${reason}`);
  }
  res.send(status, { reason, err });
  return next();
}


function _unregisterAPI(req: any, res: any, next: Function)
{
  let status: number, reason: string, name: string, ver: string, err: any;

  if (req.body) {
    name = _.toLower(_.trim(req.body.name));
    ver = req.body.ver;
    if (name === _nameThisAPI && ver === _verThisAPI) {
      status = 400;
      reason = `This management API ('${name}', v${ver}) cannot be unregistered.`;
      log.trace(`MGMT: ${reason}`);
    }
    else {
      err = flagpole.unregisterAPI(name, ver);
      if (!err) {
        status = 200;
        reason = `API '${name}', v${ver} has been unregistered.`;
        log.trace(`MGMT: ${reason}`);
      }
    }
  }
  else {
    status = 400;
    reason = `This management API ('${_nameThisAPI}', v${_verThisAPI}) cannot be unregistered.`;
    log.trace(`MGMT: ${reason}`);
  }
  if (!status) {
    status = 400;
    reason = `API '${name}', v${ver} could not be unregistered.`;
    log.trace(`MGMT: ${reason}`);
  }
  res.send(status, { reason, err });
  return next();
}


function _getAPIs(req: any, res: any, next: Function)
{
  res.send(200, flagpole.queryAPIs());
  log.trace(`MGMT: Returned list of registered APIs.`);
  return next();
}


function _getStats(req: any, res: any, next: Function)
{
  res.send(200, {
    uptime: util.getTimeComponents(Date.now() - _serverStart)
  });
  return next();
}


export let flagpoleHandlers = [
  { requestType: 'post',  path: '/management/logbookmark',     handler: _logBookmark },
  { requestType: 'post',  path: '/management/setloglevel',     handler: _setLogLevel },
  { requestType: 'patch', path: '/management/reloadapis',      handler: _reloadAPIConfig },
  { requestType: 'get',   path: '/management/apis',            handler: _getAPIs },
  { requestType: 'del',   path: '/management/unregisterapi',   handler: _unregisterAPI },
  { requestType: 'get',   path: '/management/stats',           handler: _getStats },
  { requestType: 'post',  path: '/management/shutdown',        handler: _shutdown },
  { requestType: 'get',   path: '/management/cancelshutdown',  handler: _cancelShutdown }
];
