/****************************************************************************
 **                                                                        **
 ** Modules                                                                **
 **                                                                        **
 ****************************************************************************/

let mongoose               = require('mongoose');
let _                      = require('lodash');

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
  let token: string;

  // Create the new Account and then generate an authorization token
  let account = new Account(_.pick(payload, ['email', 'password']));

  // ... save to the database and generate an authorization token...
  let [err, resp] = await grab(account.save().then(() => {
      token = account.generateAuthToken();
    }));
  if (err) {
    return { status: 400, result: err };
  }
  return { status: 200, result: { token } };
}


/****************************************************************************
 **                                                                        **
 ** Flagpole housekeeping                                                  **
 **                                                                        **
 ****************************************************************************/

export let flagpoleHandlers: IEndpointInfo[] = [
  { requestType: 'post',  path: '/latchkey/account', event: 'createAccount',   handler: _createAccount }
];
