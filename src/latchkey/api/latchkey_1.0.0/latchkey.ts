/****************************************************************************
 **                                                                        **
 ** Modules                                                                **
 **                                                                        **
 ****************************************************************************/

let mongoose               = require('mongoose');
let _                      = require('lodash');

import { Token }             from '../../../util/tokens';
import { PancakeError }      from '../../../util/pancake-err';
import { grab }              from '../../../util/pancake-grab';
import { log }               from '../../../util/pancake-utils';
import { Configuration }     from '../../../util/pancake-config';
import { IEndpointInfo,
         IEndpointResponse } from '../../../flagpole/apitypes';
import { Account }           from '../models_1.0.0/account';


/****************************************************************************
 **                                                                        **
 ** Vars & definitions                                                     **
 **                                                                        **
 ****************************************************************************/

let _db = mongoose.connection;


/****************************************************************************
 **                                                                        **
 ** Framework callbacks                                                    **
 **                                                                        **
 ****************************************************************************/

export function initializeAPI(name: string, ver: string, apiToken:string,
                              config: Configuration,
                              opts: any) : PancakeError
{
  let eventSinks                  = opts.initEventsSink;
  let maintenanceInterval: number = config ? config.get('MAINTENANCE_INTERVAL') : 60*5;

  // Initialize our database connection
  if (config) {

    // Setup the database
    mongoose.Promise = global.Promise;
    mongoose.connect(config.get('MONGODB_URI')).then(

      // Okay, good to go
      () => {
        log.trace(`MONGO: Latchkey attached to database '${config.get('MONGODB_DATABASE')}' (${config.get('MONGODB_URI')}).`);
        eventSinks.emit('initComplete', 'latchkey');
      },

      // Catch any errors
      (err: any) => {
        _db = undefined;
        log.trace('MONGO: Could not connect Latchkey to Mongo database.', err);
        eventSinks.emit('initComplete', 'latchkey', err);
      });
  }

  return;
}


/****************************************************************************
 **                                                                        **
 ** Latchkey API                                                           **
 **                                                                        **
 ****************************************************************************/

async function _createToken(payload: any) : Promise<IEndpointResponse>
{
  let { email, password } = payload;
  let account: any;
  let token: Token;

  // Find the account and generate the token
  await Account.findByCredentials(email, password).then((account: any) => {
    token = account.generateAuthToken();
  }).catch((err: any) => {});
  if (!token || !token.valid) {
    return { status: 400, result: new PancakeError('ERR_AUTHENTICATE', 'LATCHKEY: Could not generate token.') };
  }
  return { status: 200, result: { token: token.jwt }, header: { name: 'x-auth', data: token.jwt } };
}


async function _refreshToken(payload: any, currToken: Token) : Promise<IEndpointResponse>
{
  let oldToken: Token;
  let newToken: Token;
  let account: any;
  let JWT: string;

  // Safely try to convert string passed in payload to a Token
  try {
    oldToken = payload.token ? new Token(payload.token) : currToken;
  } catch(err) {
    oldToken = currToken || new Token();
  }
  if (!oldToken.jwt) {
    return { status: 400, result: new PancakeError('ERR_NO_TOKEN', 'LATCHKEY: No valid token specified in request to refresh.') };
  }

  // Find the account and generate the token
  await Account.findByToken(oldToken).then((account: any) => {
    newToken = account.generateAuthToken();
  }).catch((err: any) => {});
  if (!newToken) {
    return { status: 400, result: new PancakeError('ERR_AUTHENTICATE', 'LATCHKEY: Invalid token to refresh.') };
  }
  return { status: 200, result: { token: newToken.jwt }, header: { name: 'x-auth', data: newToken.jwt } };
}


/****************************************************************************
 **                                                                        **
 ** Flagpole housekeeping                                                  **
 **                                                                        **
 ****************************************************************************/

export let flagpoleHandlers: IEndpointInfo[] = [
  { requestType: 'post',  path: '/latchkey/token',   event: 'createToken',   handler: _createToken   },
  { requestType: 'post',  path: '/latchkey/refresh', event: 'refreshToken',  handler: _refreshToken  }
];
