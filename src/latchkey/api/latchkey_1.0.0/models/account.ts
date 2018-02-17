/****************************************************************************
 **                                                                        **
 ** Modules                                                                **
 **                                                                        **
 ****************************************************************************/

const mongoose  = require('mongoose');
const validator = require('validator');
const jwt       = require('jsonwebtoken');
const bcrypt    = require('bcryptjs');
const _         = require('lodash');

import { log }           from '../../../../util/pancake-utils';
import { Configuration } from '../../../../util/pancake-config';



/****************************************************************************
 **                                                                        **
 ** Vars & definitions                                                     **
 **                                                                        **
 ****************************************************************************/

let _config: Configuration;


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
  }
});


AccountSchema.statics.setConfig = function(config: Configuration)
{
  _config = config;
}


AccountSchema.methods.generateAuthToken = function ()
{
  let Account = this;
  let access = 'auth';
  let token = jwt.sign({ _id: Account._id.toHexString(), access }, _config.get('JWT_SECRET')).toString();
  Account.save().then(() => {
    return token;
  });
  return token;
}


AccountSchema.methods.toJSON = function ()
{
  let Account = this;
  let AccountObject = Account.toObject();
  return _.pick(AccountObject, ['_id', 'email']);
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
