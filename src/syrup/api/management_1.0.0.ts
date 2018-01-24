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
import { EndpointResponse } from '../../flagpole/apitypes';


/****************************************************************************
 **                                                                        **
 ** Vars & definitions                                                     **
 **                                                                        **
 ****************************************************************************/

const DEFAULT_SHUTDOWN_TIMER = 5; // 5 seconds

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
  _shutdownCountdown--;

  if (_shutdownCountdown <= 0) {
    // Do it!
    log.warn('MGMT: Server shutting down now.');
    process.exit(0);
  }
  else {
    log.warn(`MGMT: Server shutting down in ${_shutdownCountdown} seconds.`);
    _timerID = setTimeout(_shutdownServer, _shutdownCountdown*1000);
  }
}


export function initializeAPI(name: string,
                              ver: string,
                              apiToken:string) : void
{
  _nameThisAPI       = name;
  _verThisAPI        = ver;
  _serverStart       = Date.now();
  _shutdownCountdown = 0;
}


function _shutdown(payload: any) : EndpointResponse
{
  let countdown: any = payload.hasOwnProperty('countdown') ? payload.countdown : DEFAULT_SHUTDOWN_TIMER;
  if (!util.isNumeric(countdown)) {
    _shutdownCountdown = Number.parseInt(countdown, 10);
  }
  else {
    _shutdownCountdown = countdown;
  }

  // Kick off our timer
  if (_timerID) {
    clearTimeout(_timerID);
  }
  _timerID = setTimeout(_shutdownServer, 1000);

  // Let folks know
  let message = `Server shutting down in ${_shutdownCountdown} seconds.`;
  log.warn('MGMT: ' + message);

  return { status: 200, result: { alert: message }};
}


function _cancelShutdown(payload: any) : EndpointResponse
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
  return { status: 200, result: { alert: message }};
}


function _logBookmark(payload: any) : EndpointResponse
{
  if (payload.seq) {
    log.info(`===== ${payload.seq} ===== ${payload.seq} ===== ${payload.seq} ===== ${payload.seq} ===== ${payload.seq} ====== ${payload.seq} ===== ${payload.seq} ===== ${payload.seq} =====`);
  }
  else {
    log.info('=========================================================================');
  }
  return { status: 200 };
}


function _setLogLevel(payload: any) : EndpointResponse
{
  let status: number, reason: string;

  if (payload.level) {
    let ordLevel: number = log.getLevelOrd(payload.level);
    if (ordLevel) {
      log.level = payload.level;
      status = 200;
      reason = `Logging level has been set to ${log.levelAsString}.`;
      log.info(`MGMT: ${reason}`);
    }
    else {
      status = 400;
      reason = `Invalid logging level ('${payload.level}') specified.`;
      log.trace(`MGMT: ${reason}`);
    }
  }
  else {
    status = 400;
    reason = `Logging level not specified.`;
    log.trace(`MGMT: ${reason}`);
  }
  return { status, result: { reason }};
}


function _reloadAPIConfig(payload: any) : EndpointResponse
{
  let status: number, reason: string, err: any;

  if (payload.fileName) {
    err = flagpole.loadAPIConfig(payload.fileName);
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
  return { status, result: { reason, err }};
}


function _unregisterAPI(payload: any) : EndpointResponse
{
  let status: number, reason: string, name: string, ver: string, err: any;

  name = _.toLower(_.trim(payload.name));
  ver = payload.ver;
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
  if (!status) {
    status = 400;
    reason = `API '${name}', v${ver} could not be unregistered.`;
    log.trace(`MGMT: ${reason}`);
  }
  return { status, result: { reason, err }};
}


function _getAPIs(payload: any) : EndpointResponse
{
  log.trace(`MGMT: Returned list of registered APIs.`);
  return { status: 200, result: flagpole.queryAPIs()};
}


function _getStats(payload: any) : EndpointResponse
{
  return { status: 200, result: {
    uptime: util.getTimeComponents(Date.now() - _serverStart),
    memstats: process.memoryUsage()
  }};
}


export let flagpoleHandlers = [
  { requestType: 'post',  path: '/management/logbookmark',     handler: _logBookmark },
  { requestType: 'post',  path: '/management/setloglevel',     handler: _setLogLevel },
  { requestType: 'patch', path: '/management/reloadapis',      handler: _reloadAPIConfig },
  { requestType: 'get',   path: '/management/apis',            handler: _getAPIs },
  { requestType: 'del',   path: '/management/:fox/unregisterapi',   handler: _unregisterAPI },
  { requestType: 'get',   path: '/management/stats/',          handler: _getStats },
  { requestType: 'post',  path: '/management/shutdown',        handler: _shutdown },
  { requestType: 'get',   path: '/management/cancelshutdown',  handler: _cancelShutdown }
];
