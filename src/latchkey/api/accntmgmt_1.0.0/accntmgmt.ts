/****************************************************************************
 **                                                                        **
 ** Modules                                                                **
 **                                                                        **
 ****************************************************************************/

let mongoose               = require('mongoose');
let _                      = require('lodash');

import { Token }             from '../../../util/tokens';
import { entitled,
         Entitlements }      from '../../../util/entitlements';
import { PancakeError }      from '../../../util/pancake-err';
import { grab }              from '../../../util/pancake-grab';
import { log }               from '../../../util/pancake-utils';
import { Configuration }     from '../../../util/pancake-config';
import { entitledEndpoint,
         IEndpointInfo,
         IEndpointResponse } from '../../../flagpole/apitypes';
import { Account }           from '../models_1.0.0/account';


/****************************************************************************
 **                                                                        **
 ** Vars & definitions                                                     **
 **                                                                        **
 ****************************************************************************/

const ENT_DOMAIN       = 'accntmgmt';
const ENT_ROLE_ADMIN   = 'admin';
const ENT_ROLE_CREATOR = 'creator';
const API_TAG          = 'ACCNTMGMT';

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
        log.trace(`MONGO: AccountMgmt attached to database '${config.get('MONGODB_DATABASE')}' (${config.get('MONGODB_URI')}).`);
        eventSinks.emit('initComplete', 'accntmgmt');
      },

      // Catch any errors
      (err: any) => {
        _db = undefined;
        log.trace('MONGO: Could not connect AccountMgmt to Mongo database.', err);
        eventSinks.emit('initComplete', 'accntmgmt', err);
      });
  }

  return;
}


/****************************************************************************
 **                                                                        **
 ** Account Management API                                                 **
 **                                                                        **
 ****************************************************************************/

async function _createAccount(payload: any) : Promise<IEndpointResponse>
{
  let newToken: Token;

  // Create the new Account and then generate an authorization token
  let account = new Account(_.pick(payload, ['email', 'password']));

  // ... save to the database and generate an authorization token...
  let [err, resp] = await grab(account.save().then(() => {
      newToken = account.generateAuthToken();
    }));
  if (err) {
    return { status: 400, result: err };
  }
  return { status: 200, result: { id: account._id, token: newToken.jwt } };
}


async function _getEntitlements(payload: any, token: Token) : Promise<IEndpointResponse>
{
  return { status: 200, result: { } };
}





/****************************************************************************
 **                                                                        **
 ** Flagpole housekeeping                                                  **
 **                                                                        **
 ****************************************************************************/

export let flagpoleHandlers: IEndpointInfo[] = [
  {
    requestType: 'post',
    path: '/accntmgmt/account',
    event: 'createAccount',
    handler: _createAccount
  }
];
