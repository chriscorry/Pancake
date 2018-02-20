/****************************************************************************
 **                                                                        **
 ** Modules                                                                **
 **                                                                        **
 ****************************************************************************/

const uuidv4    = require('uuid/v4');
const mongoose  = require('mongoose');
const validator = require('validator');
const bcrypt    = require('bcryptjs');
const _         = require('lodash');

import * as tokens       from '../../../../util/tokens';
import { log }           from '../../../../util/pancake-utils';
import { PancakeError }  from '../../../../util/pancake-err';
import { Configuration } from '../../../../util/pancake-config';


/****************************************************************************
 **                                                                        **
 ** Vars & definitions                                                     **
 **                                                                        **
 ****************************************************************************/


/****************************************************************************
 **                                                                        **
 ** Account model                                                          **
 **                                                                        **
 ****************************************************************************/

let AccountSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    minlength: 5,
    trim: true,
    unique: true,
    validate: {
      validator: validator.isEmail,
      message: '{VALUE} is not a valid email'
    }
  },
  password: {
    type: String,
    required: true,
    minlength: 8
  },
  entitlements : [
    {
      domain: {
        type: String,
        required: true
      },
      role: {
        type: String,
        required: true
      },
      value: {
        type: Boolean,
        required: true
      }
    }
  ]
});


AccountSchema.statics.setConfig = function(config: Configuration)
{
  tokens.setConfig(config);
}


AccountSchema.statics.findByID = async function(id: string) : Promise<any>
{
  let Account = this;

  // Find the user
  return Account.findOne({_id: id}).then((account: any) => {

    // Have an account?
    if (!account) {
      return Promise.reject(new PancakeError('ERR_NO_ACCOUNT', `LATCHKEY: Could not retrieve account with that ID`));
    }

    return account;
  });
}


AccountSchema.statics.findByCredentials = async function(email: string, password: string) : Promise<any>
{
  let Account = this;

  // Find the user
  return Account.findOne({email}).then((account: any) => {

    // Have an account?
    if (!account) {
      return Promise.reject(new PancakeError('ERR_NO_ACCOUNT', `LATCHKEY: Could not retrieve account with email '${email}'`));
    }

    // Make sure the passwords match
    return new Promise((resolve, reject) => {
        bcrypt.compare(password, account.password, (err: any, res: any) => {
          if (!res) {
            reject(err);
          }
          else {
            resolve(account);
          }
        });
    });
  });
}


AccountSchema.statics.findByToken = async function(token: tokens.Token) : Promise<any>
{
  let Account = this;

  try {
    if (token.valid)
      return Account.findByID(token.get('accnt'));
  }
  catch (err) {}

  return ;
}


AccountSchema.methods.generateAuthToken = function() : tokens.Token
{
  let Account = this;
  let token = new tokens.Token();

  // Set it up
  token.issuer = 'lkey-1.0.0';
  token.subject = 'ent';
  token.set('accnt', Account._id.toHexString());
  token.set('ent', Account.entitlements);
  token.freeze();

  // Create the token
  return token;
}


AccountSchema.methods.toJSON = function ()
{
  let Account = this;
  let AccountObject = Account.toObject();
  return _.pick(AccountObject, ['_id', 'email', 'entitlements']);
}


AccountSchema.pre('save', function(next: any)
{
  let Account = this;

  // Has the password changed?
  if (Account.isModified('password')) {

    // Password has changed so we need to hash it anew
    bcrypt.genSalt(10, (err: any, salt: string) => {
      bcrypt.hash(Account.password, salt, (err: any, hash: string) => {
        Account.password = hash;
        next();
      });
    });
  }
  else {
    next();
  }
});


export let Account = mongoose.model('Account', AccountSchema);
