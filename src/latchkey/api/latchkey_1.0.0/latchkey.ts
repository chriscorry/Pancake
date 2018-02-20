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
import { Account }           from './models/account';


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
                              config: Configuration) : PancakeError
{
  let maintenanceInterval: number = config ? config.get('MAINTENANCE_INTERVAL') : 60*5;

  // Initialize our database connection
  if (config) {

    // Set in our configuration object
    Account.setConfig(config);

    // Setup the database
    mongoose.Promise = global.Promise;
    mongoose.connect(config.get('MONGODB_URI')).then(

      // Okay, good to go
      () => {
        log.trace(`MONGO: Latchkey attached to database '${config.get('MONGODB_DATABASE')}' (${config.get('MONGODB_URI')}).`);
      },

      // Catch any errors
      (err: any) => {
        _db = undefined;
        log.trace('MONGO: Could not connect Latchkey to Mongo database.', err);
      });
  }

  return;
}


/****************************************************************************
 **                                                                        **
 ** Latchkey API                                                           **
 **                                                                        **
 ****************************************************************************/

async function _createAccount(payload: any) : Promise<IEndpointResponse>
{
  let token: Token;

  // Create the new Account and then generate an authorization token
  let account = new Account(_.pick(payload, ['email', 'password']));

  // ... save to the database and generate an authorization token...
  let [err, resp] = await grab(account.save().then(() => {
      token = account.generateAuthToken();
    }));
  if (err) {
    return { status: 400, result: err };
  }
  return { status: 200, result: { token: token.jwt } };
}


async function _createToken(payload: any) : Promise<IEndpointResponse>
{
  let email = payload.email;
  let password = payload.password;
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
    oldToken = new Token(payload.token);
  } catch(err) {
    oldToken = new Token();
  }

  // Pull token from header?
  if (!oldToken.valid && currToken && currToken.valid) {
    oldToken = currToken;
  }
  if (!oldToken.valid) {
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
  { requestType: 'post',  path: '/latchkey/account', event: 'createAccount', handler: _createAccount },
  { requestType: 'post',  path: '/latchkey/token',   event: 'createToken',   handler: _createToken   },
  { requestType: 'post',  path: '/latchkey/refresh', event: 'refreshToken',  handler: _refreshToken  }
];