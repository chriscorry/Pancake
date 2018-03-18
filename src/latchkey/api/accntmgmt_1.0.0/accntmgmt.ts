/****************************************************************************
 **                                                                        **
 ** Modules                                                                **
 **                                                                        **
 ****************************************************************************/

import mongoose            = require('mongoose');
import _                   = require('lodash');
import path                = require('path');
import fs                  = require('fs');

import { Token }             from '../../../util/tokens';
import { entitled,
         Entitlements }      from '../../../util/entitlements';
import { PancakeError }      from '../../../util/pancake-err';
import { grab }              from '../../../util/pancake-grab';
import * as utils            from '../../../util/pancake-utils';
import { Configuration }     from '../../../util/pancake-config';
import { IDomain,
         IChannel,
         IMessage,
         messaging }         from '../../../screech/messaging';
import { entitledEndpoint,
         IEndpointInfo,
         IEndpointResponse } from '../../../flagpole/apitypes';
import { Account }           from '../models_1.0.0/account';
let log = utils.log;


/****************************************************************************
 **                                                                        **
 ** Vars & definitions                                                     **
 **                                                                        **
 ****************************************************************************/

const ENT_DOMAIN          = 'accntmgmt';
const ENT_ROLE_ADMIN      = 'admin';
const ENT_ROLE_CREATOR    = 'creator';
const ENT_ROLE_AUTH       = 'authenticator';
const ENT_ROLE_TOOLS      = 'tools';

const API_TAG             = 'ACCNTMGMT';
const BLACKLIST_DIR       = 'account_blacklist';
const BLACKLIST_FILE      = 'blacklist.json';
const DOMAIN_NAME         = 'AccntMgmt';
const CHANNEL_BLACKLIST   = 'Blacklist';


interface IBlacklistEntry
{
  accountID: string,
  type: string,
  timestamp: number,
  expire: number
}

let _db = mongoose.connection;
let _blacklist = new Map<string, IBlacklistEntry>();


/****************************************************************************
 **                                                                        **
 ** Private interface                                                      **
 **                                                                        **
 ****************************************************************************/

function _loadBlacklist() : void
{
  try {
    log.info('ACCNT: Loading account blacklist...');

    // Set it up and load the file
    let safeFileName: string = utils.buildSafeFileName(__dirname + path.sep + BLACKLIST_DIR + path.sep + BLACKLIST_FILE);
    let blacklist = require(safeFileName);
    let count = 0;
    _blacklist.clear();

    // Copy over the entries
    if (blacklist) {
      Object.keys(blacklist).forEach((key: string) => {

        // Copy over key into the blacklist
        let value = blacklist[key];
        if (value.expire > Date.now()) {
          let newEntry: IBlacklistEntry = {
            accountID: key,
            type: value.type,
            timestamp: value.timestamp,
            expire: value.expire
          };
          _blacklist.set(key, newEntry);
        }
      });

      // Okay, all done here
      delete require.cache[require.resolve(safeFileName)];

      log.info('ACCNT: Account blacklist loaded.');
    }

  } catch (err) {
    log.error('ACCNT: Could not load account blacklist.', err);
  }
}


function _saveBlacklist() : void
{
    try {
      log.info('ACCNT: Saving account blacklist...');

      // Set it up the file
      let safeFileName: string = utils.buildSafeFileName(__dirname + path.sep + BLACKLIST_DIR + path.sep + BLACKLIST_FILE);
      let stream = fs.createWriteStream(safeFileName);

      // Copy over the entries
      if (stream) {
        let count = 0;
        stream.write('{\n');
        _blacklist.forEach((value: IBlacklistEntry, key: string) => {
          count++;
          if (value.expire > Date.now()) {
            stream.write('"' + key + '": ' + JSON.stringify(value, null, 2) + (count === _blacklist.size ? '\n' : ',\n'));
          }
        });
        stream.end('}');
        log.info('ACCNT: Account blacklist saved.');
      }

    } catch (err) {
      log.error('ACCNT: Could not save account blacklist.', err);
    }
}


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

        // Now load up our account blacklist
        _loadBlacklist();

        // Initialize our messaging service
        messaging.createDomain(DOMAIN_NAME, 'Event notifications for important authentication events');
        messaging.createChannel(DOMAIN_NAME, CHANNEL_BLACKLIST, [ ENT_ROLE_ADMIN, ENT_ROLE_AUTH, ENT_ROLE_TOOLS ], 'Notifications about account blacklist events');

        // Okay, all done here
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
 ** Events                                                                 **
 **                                                                        **
 ****************************************************************************/

function _registerInterest(payload: any, token: Token) : IEndpointResponse
{
  // Register for events about blacklist updates
  if (messaging.subscribe(DOMAIN_NAME, CHANNEL_BLACKLIST, payload.socket, token)) {
    log.trace(`ACCNTMGMT: Event subscription added for blacklist notifications.`);
  }

  return { status: 200, result: 'Event subscription added.'};
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
  },
  {
    event: 'registerInterest',
    handler: entitledEndpoint(ENT_DOMAIN, [ ENT_ROLE_AUTH, ENT_ROLE_TOOLS, ENT_ROLE_ADMIN ], API_TAG, _registerInterest),
    metaTags: { audience: [ 'server', 'tools' ] }
  }
];
