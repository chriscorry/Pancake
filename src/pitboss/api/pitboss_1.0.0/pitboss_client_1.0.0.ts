/****************************************************************************
 **                                                                        **
 ** Modules                                                                **
 **                                                                        **
 ****************************************************************************/

import axios = require('axios');


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
