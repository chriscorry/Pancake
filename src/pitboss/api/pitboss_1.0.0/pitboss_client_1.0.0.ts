/****************************************************************************
 **                                                                        **
 ** Modules                                                                **
 **                                                                        **
 ****************************************************************************/

import axios             from 'axios';
import ip                = require('ip');
import socketIOClient    = require('socket.io-client');

import { log }           from '../../../util/pancake-utils';
import { PancakeError }  from '../../../util/pancake-err';
import { Configuration } from '../../../util/pancake-config';
import { flagpole }      from '../../../flagpole/flagpole';


/****************************************************************************
 **                                                                        **
 ** Vars & definitions                                                     **
 **                                                                        **
 ****************************************************************************/

// URLs
const URL_HTTP                   = 'http://';
const URL_HTTPS                  = 'https://';
const URL_REGISTER_SERVER        = '/pitboss/register';
const PITBOSS_RECONNECT_INTERVAL = 60; // sec
const PITBOSS_CONNECT_TIMEOUT    = 30; // sec

// Other constants
const HTTP_REQUEST_HEADER = {
  headers: { 'Content-Type': 'application/json', 'Accept-Version': "1" }
}

let _server: any;
let _pitbossServer: string;
let _pitbossPort: number;
let _pitbossBaseURL: string;
let _pitbossSocket: any;
let _reconnectInterval = PITBOSS_RECONNECT_INTERVAL;
let _timerID: NodeJS.Timer;


/****************************************************************************
 **                                                                        **
 ** Private functions                                                      **
 **                                                                        **
 ****************************************************************************/

 function _timeoutCallback(callback: Function)
 {
   let called = false;

   let _timerID = setTimeout(() => {
       if (called) return;
       called = true;
       callback(new PancakeError('ERR_CALLBACK_TIMEOUT'));
     },
     PITBOSS_CONNECT_TIMEOUT*1000);

  return function() {
    if (called) return;
    called = true;
    clearTimeout(_timerID);
    callback.apply(this, arguments);
  }
}


function _reconnect()
{
  log.info('PITBOSS: Trying to establish connection with our Pitboss.');

  // Give it a shot
  _registerWithoutNotary(_server, _pitbossBaseURL, false);
}


function _onDisconnect(socket: any)
{
  _initiateReconnects();
  log.info(`PITBOSS: Lost connection to our Pitboss. Will attempt to reconnect in ${_reconnectInterval} sec.`);
}


function _onHeartbeat(heartbeat: any, ack: Function)
{
  log.trace('PITBOSS: Received heartbeat request. Responding.');
  ack({ status: 'OK', timestamp: Date.now() });
}


function _initiateReconnects()
{
  if (_timerID) {
    clearTimeout(_timerID);
  }
  _pitbossSocket = undefined;
  _timerID = setTimeout(_reconnect, _reconnectInterval*1000);
}


function _postRegistration(socket: any) : void
{
  // Remember this connection
  _pitbossSocket = socket;

  // Cancel any reconnect attempts
  if (_timerID) {
    clearTimeout(_timerID);
    _timerID = undefined;
  }

  // Make sure we receive important notifications
  _pitbossSocket.on('disconnect', _onDisconnect);
  _pitbossSocket.on('heartbeat',  _onHeartbeat);
}


export function _registerWithoutNotary(server: any, pitbossBaseURL: string, logErrors: boolean) : void
{
  let socket: any;

  // Kick it all off
  try {

    // Make our websocket connect
    socket = socketIOClient(pitbossBaseURL + '/', { reconnection: false });
    if (!socket) {
      if (true === logErrors) {
        log.trace(new PancakeError('ERR_PITBOSS_CONNECT', `PITBOSS: Could not connect to Pitboss server ${pitbossBaseURL}`));
      }
      _initiateReconnects();
      return;
    }

    // Get access to the Pitboss API
    socket.emit('negotiate', { name: 'pitboss', ver: '1.0.0' }, _timeoutCallback((negotiateResp: any) => {

      // Timeout?
      if (!(negotiateResp instanceof PancakeError)) {

        // Everything okay?
        if (negotiateResp[0].status === 'SUCCESS') {

          // Send off the registration request
          socket.emit('pitboss:register', server, _timeoutCallback((registerResp: any) => {

            // Timeout?
            if (!(registerResp instanceof PancakeError)) {

              // Everything okay?
              if (200 === registerResp.status) {
                log.info('PITBOSS: Server successfully registered with Pitboss.');
                _postRegistration(socket);
              }
              else {
                socket.close();
                socket = undefined;
                if (true === logErrors) {
                  log.trace(new PancakeError('ERR_PITBOSS_REGISTER', 'PITBOSS: Pitboss registration failed.', registerResp));
                }
                _initiateReconnects();
              }
            }

            // Callback timeout
            else {
              socket.close();
              socket = undefined;
              if (true === logErrors) {
                log.trace('PITBOSS: ERR_PITBOSS_REGISTER_TIMEOUT: Pitboss registration timeout.');
              }
              _initiateReconnects();
            }
          }));
        }
      }

      // Callback timeout
      else {
        socket.close();
        socket = undefined;
        if (true === logErrors) {
          log.trace('PITBOSS: ERR_PITBOSS_REGISTER_TIMEOUT: Pitboss registration timeout.');
        }
        _initiateReconnects();
      }
    }));

  } catch (error) {
    socket.close();
    socket = undefined;
    if (true === logErrors) {
      log.trace(new PancakeError('ERR_PITBOSS_REGISTER', 'PITBOSS: Pitboss registration failed.', error));
    }
    _initiateReconnects();
  }
}


/****************************************************************************
 **                                                                        **
 ** Pitboss API                                                            **
 **                                                                        **
 ****************************************************************************/

export function registerWithPitboss(name: string, description: string, port: number,
                                    config: Configuration, logErrors = true) : void
{
  // If we're already connected to a Pitboss, break it off
  if (_pitbossSocket) {
    _pitbossSocket.removeAllListeners();
    _pitbossSocket.close();
    _pitbossServer = undefined;
    _pitbossBaseURL = '';
    _server = undefined;
  }

  // Extract our config values
  _pitbossServer = config.get('PITBOSS_SERVER');
  _pitbossPort = config.get('PITBOSS_PORT');
  if (!_pitbossServer || !_pitbossPort) {
    if (true === logErrors) {
      log.trace(new PancakeError('ERR_MISSING_CONFIG_INFO', 'PITBOSS: Could not find Pitboss server configuration info.'));
    }
    return;
  }
  _pitbossBaseURL = URL_HTTP + _pitbossServer + ':' + _pitbossPort;

  // Build our initial registration request data
  let services = flagpole.queryAPIs();
  _server = {
    name,
    description,
    pid: process.pid,
    address: ip.address(),
    port,
    services
  }

  // Do the real deal
  _registerWithoutNotary(_server, _pitbossBaseURL, logErrors);
}
