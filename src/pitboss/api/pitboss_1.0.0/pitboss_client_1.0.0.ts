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


let pitbossBaseURL: string;

// URLs
const URL_HTTP            = 'http://';
const URL_HTTPS           = 'https://';
const URL_REGISTER_SERVER = '/pitboss/register';

// Other constants
const HTTP_REQUEST_HEADER = {
  headers: { 'Content-Type': 'application/json', 'Accept-Version': "1" }
}


export async function registerWithPitboss(name: string, description: string, port: number,
                                          config: Configuration) : Promise<PancakeError>
{
  // Extract our config values
  let pitbossServer = config.get('PITBOSS_SERVER');
  let pitbossPort = config.get('PITBOSS_PORT');
  if (!pitbossServer || !pitbossPort) {
    return new PancakeError('ERR_MISSING_CONFIG_INFO', 'PITBOSS: Could not find Pitboss server configuration info.');
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

  // Kick it all off
  try {

    // First, register with the server and extract our notary signature
    let resp = await axios.post(pitbossBaseURL + URL_REGISTER_SERVER, server, HTTP_REQUEST_HEADER);
    if (resp.status != 200) {
      return new PancakeError('ERR_PITBOSS_REGISTER', 'PITBOSS: Pitboss registration failed.', resp.data.result);
    }
    let notarySig = resp.data.notarySig;
    log.trace(`SYRUP: Pitboss notary sig received (${notarySig})`);

    // Make our websocket connect
    let socket = await socketIOClient(pitbossBaseURL + '/');
    if (!socket) {
      return new PancakeError('ERR_PITBOSS_CONNECT', `PITBOSS: Could not connect to Pitboss server ${pitbossBaseURL}`);
    }

    // Get access to the Pitboss
    socket.emit('negotiate', { name: 'pitboss', ver: '1.0.0' }, (response1: any) => {

      // TODO Error check
      // ...

      // Send off the notarization request
      socket.emit('pitboss:notarize', { notarySig }, (response2: any) => {
        log.trace('PITBOSS: Server successfully registered with Pitboss.');
      });
    });

  } catch (err) {
    return new PancakeError('ERR_PITBOSS_REGISTER', 'PITBOSS: Pitboss registration failed.', err);
  }

  return;
}


/*

var geocodeAddress = (address: any, callback: Function) => {

  // Prep our address
  // console.log(argv);
  var addressURL = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}`;

  // Kick off the ansych request
  request({
    url: addressURL,
    json: true
  }, (error: any, response: any, body: any) => {
    if (error) {
      callback('Unable to connect to Google servers.');
    }
    else if (body.status === 'ZERO_RESULTS') {
      callback('Unable to find that address.');
    }
    else if (body.status === 'OK') {
      callback(undefined, {
        address: body.results[0].formatted_address,
        latitude: body.results[0].geometry.location.lat,
        longitude: body.results[0].geometry.location.lng
      });
    }
  })
}


module.exports = {
  geocodeAddress
};
*/
