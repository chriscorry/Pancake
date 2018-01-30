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

let pitbossBaseURL: string;

// URLs
const URL_HTTP            = 'http://';
const URL_HTTPS           = 'https://';
const URL_REGISTER_SERVER = '/pitboss/register';

// Other constants
const HTTP_REQUEST_HEADER = {
  headers: { 'Content-Type': 'application/json', 'Accept-Version': "1" }
}


/****************************************************************************
 **                                                                        **
 ** Private functions                                                      **
 **                                                                        **
 ****************************************************************************/

function _onHeartbeat(heartbeat: any, ack: Function)
{
  log.trace('PITBULL: Received heartbeat request. Responding.');
  ack({ status: 'OK', timestamp: Date.now() });
}


async function _registerUsingNotary(server: any, pitbossBaseURL: string) : Promise<void>
{
  // Kick it all off
  try {

    // First, register with the server and extract our notary signature
    let resp = await axios.post(pitbossBaseURL + URL_REGISTER_SERVER, server, HTTP_REQUEST_HEADER);
    if (resp.status != 200) {
      log.trace(new PancakeError('ERR_PITBOSS_REGISTER', 'PITBOSS: Pitboss registration failed.', resp.data.result));
      return;
    }
    let notarySig = resp.data.notarySig;
    log.trace(`SYRUP: Pitboss notary sig received (${notarySig})`);

    // Make our websocket connect
    let socket = await socketIOClient(pitbossBaseURL + '/');
    if (!socket) {
      log.trace(new PancakeError('ERR_PITBOSS_CONNECT', `PITBOSS: Could not connect to Pitboss server ${pitbossBaseURL}`));
      return;
    }

    // Get access to the Pitboss API
    socket.emit('negotiate', { name: 'pitboss', ver: '1.0.0' }, (negotiateResp: any) => {

      // Everything okay?
      if (negotiateResp[0].status === 'SUCCESS') {

        // Send off the notarization request
        socket.emit('pitboss:notarize', { notarySig }, (notarizeResp: any) => {

          // Everything okay?
          if (200 === notarizeResp.status) {
            log.trace('PITBOSS: Server successfully registered with Pitboss.');

            // Make sure we receive heartbeat messages
            socket.on('heartbeat', _onHeartbeat);
          }
          else {
            log.trace(new PancakeError('ERR_PITBOSS_REGISTER', 'PITBOSS: Pitboss registration failed.', notarizeResp));
          }
        });
      }
      else {
        log.trace(new PancakeError('ERR_PITBOSS_REGISTER', 'PITBOSS: Pitboss registration failed.', negotiateResp));
      }
    });

  } catch (error) {
    log.trace(new PancakeError('ERR_PITBOSS_REGISTER', 'PITBOSS: Pitboss registration failed.', error));
  }
}


export function _registerWithoutNotary(server: any, pitbossBaseURL: string) : void
{
  // Kick it all off
  try {

    // Make our websocket connect
    let socket = socketIOClient(pitbossBaseURL + '/');
    if (!socket) {
      log.trace(new PancakeError('ERR_PITBOSS_CONNECT', `PITBOSS: Could not connect to Pitboss server ${pitbossBaseURL}`));
      return;
    }

    // Get access to the Pitboss API
    socket.emit('negotiate', { name: 'pitboss', ver: '1.0.0' }, (negotiateResp: any) => {

      // Everything okay?
      if (negotiateResp[0].status === 'SUCCESS') {

        // Send off the registration request
        socket.emit('pitboss:register', server, (registerResp: any) => {

          // Everything okay?
          if (200 === registerResp.status) {
            log.trace('PITBOSS: Server successfully registered with Pitboss.');

            // Make sure we receive heartbeat messages
            socket.on('heartbeat', _onHeartbeat);
          }
          else {
            log.trace(new PancakeError('ERR_PITBOSS_REGISTER', 'PITBOSS: Pitboss registration failed.', registerResp));
          }
        });
      }
      else {
        log.trace(new PancakeError('ERR_PITBOSS_REGISTER', 'PITBOSS: Pitboss registration failed.', negotiateResp));
      }
    });

  } catch (error) {
    log.trace(new PancakeError('ERR_PITBOSS_REGISTER', 'PITBOSS: Pitboss registration failed.', error));
  }
}


/****************************************************************************
 **                                                                        **
 ** Pitboss API                                                            **
 **                                                                        **
 ****************************************************************************/

export function registerWithPitboss(name: string, description: string, port: number,
                                    config: Configuration, useNotary: boolean = false) : void
{
  // Extract our config values
  let pitbossServer = config.get('PITBOSS_SERVER');
  let pitbossPort = config.get('PITBOSS_PORT');
  if (!pitbossServer || !pitbossPort) {
    log.trace(new PancakeError('ERR_MISSING_CONFIG_INFO', 'PITBOSS: Could not find Pitboss server configuration info.'));
  }
  pitbossBaseURL = URL_HTTP + pitbossServer + ':' + pitbossPort;

  // Build our initial registration request data
  let services = flagpole.queryAPIs();
  let server = {
    name,
    description,
    pid: process.pid,
    address: ip.address(),
    port,
    services
  }

  if (true === useNotary)
    _registerUsingNotary(server, pitbossBaseURL);
  else
    _registerWithoutNotary(server, pitbossBaseURL);
}
