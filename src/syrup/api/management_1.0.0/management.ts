/****************************************************************************
 **                                                                        **
 ** Modules                                                                **
 **                                                                        **
 ****************************************************************************/

import _ = require('lodash');
import * as util    from '../../../util/pancake-utils';
import { grab }     from '../../../util/pancake-grab';
import { flagpole } from '../../../flagpole/flagpole';
const log = util.log;
import { IEndpointInfo,
         IEndpointResponse } from '../../../flagpole/apitypes';


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


function _shutdownServerCallback() : void
{
  _shutdownCountdown--;

  if (_shutdownCountdown <= 0) {
    // Do it!
    log.warn('MGMT: Server shutting down now.');
    process.exit(0);
  }

  log.warn(`MGMT: Server shutting down in ${_shutdownCountdown} seconds.`);
  _timerID = setTimeout(_shutdownServerCallback, 1000);
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


function _shutdown(payload: any) : IEndpointResponse
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
  _timerID = setTimeout(_shutdownServerCallback, 1000);

  // Let folks know
  let message = `Server shutting down in ${_shutdownCountdown} seconds.`;
  log.warn('MGMT: ' + message);

  return { status: 200, result: { alert: message }};
}


function _cancelShutdown(payload: any) : IEndpointResponse
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


function _logBookmark(payload: any) : IEndpointResponse
{
  if (payload.seq) {
    log.info(`===== ${payload.seq} ===== ${payload.seq} ===== ${payload.seq} ===== ${payload.seq} ===== ${payload.seq} ====== ${payload.seq} ===== ${payload.seq} ===== ${payload.seq} =====`);
  }
  else {
    log.info('=========================================================================');
  }
  return { status: 200 };
}


function _setLogLevel(payload: any) : IEndpointResponse
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


function _reloadAPIConfig(payload: any) : IEndpointResponse
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


function _unregisterAPI(payload: any) : IEndpointResponse
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


function _getAPIs(payload: any) : IEndpointResponse
{
  log.trace(`MGMT: Returned list of registered APIs.`);
  return { status: 200, result: flagpole.queryAPIs()};
}


function _getStats(payload: any) : IEndpointResponse
{
  return { status: 200, result: {
    uptime: util.getTimeComponents(Date.now() - _serverStart),
    memstats: process.memoryUsage()
  }};
}


export let flagpoleHandlers: IEndpointInfo[] = [
  { requestType: 'post',  path: '/management/logbookmark',    event: 'logBookmark',    handler: _logBookmark, metaTags: { audience: 'debug' } },
  { requestType: 'post',  path: '/management/setloglevel',    event: 'setLogLevel',    handler: _setLogLevel },
  { requestType: 'patch', path: '/management/reloadapis',     event: 'reloadAPIs',     handler: _reloadAPIConfig },
  { requestType: 'get',   path: '/management/apis',           event: 'apis',           handler: _getAPIs },
  { requestType: 'del',   path: '/management/unregisterapi',  event: 'unregisterapi',  handler: _unregisterAPI },
  { requestType: 'get',   path: '/management/stats/',         event: 'stats',          handler: _getStats },
  { requestType: 'post',  path: '/management/shutdown',       event: 'shutdown',       handler: _shutdown },
  { requestType: 'get',   path: '/management/cancelshutdown', event: 'cancelShutdown', handler: _cancelShutdown }
];
