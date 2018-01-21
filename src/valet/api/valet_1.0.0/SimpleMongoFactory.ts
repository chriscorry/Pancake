/****************************************************************************
 **                                                                        **
 ** Modules                                                                **
 **                                                                        **
 ****************************************************************************/

const { MongoClient, ObjectID } = require('mongodb');
import { PancakeError }  from '../../../util/pancake-err';
import { Configuration } from '../../../util/pancake-config';
import utils             = require('../../../util/pancake-utils');
const  log               = utils.log;


/****************************************************************************
 **                                                                        **
 ** Vars & definitions                                                     **
 **                                                                        **
 ****************************************************************************/

let _db: any;

export let SimpleMongoFactory = {

  async initialize(className: string, ttl: number, config?: Configuration) : Promise<void>
  {
    // Initialize our database connection
    if (config) {
      MongoClient.connect(config.get('MONGODB_URI'))
        .then((db: any) => {
          _db = db.db(config.get('MONGODB_DATABASE'));
          log.trace(`MONGO: SimpleMongoDB attached to database '${config.get('MONGODB_DATABASE')}' (${config.get('MONGODB_URI')}).`);
        }, (err: any) => {
          _db = undefined;
          log.trace('MONGO: Could not connect factory to Mongo database.', err);
          return Promise.reject(new PancakeError('ERR_INIT', 'Could not connect factory to Mongo database.', err));
        });
    }
  },

  terminate() : void
  {
    if (_db) {
      _db.close();
    }
  },

  createId(obj?: any) : string
  {
    return new ObjectID().toString();
  },

  async loadItem(id: string, className: string, opts?: any) : Promise<any>
  {
    // Quick and dirty validation
    if (!_db) {
      log.trace(`MONGO: ERR_BAD_ARG: Database not initialized.`);
      return Promise.reject(new PancakeError('ERR_BAD_ARG', `MONGO: Database not initialized.`));
    }
    return _db.collection(className).findOne( {_id: new ObjectID(id) });
  },

  async loadItems(query: any, className: string, opts?: any) : Promise<any[]>
  {
    // Quick and dirty validation
    if (!_db) {
      log.trace(`MONGO: ERR_BAD_ARG: Database not initialized.`);
      return Promise.reject(new PancakeError('ERR_BAD_ARG', `MONGO: Database not initialized.`));
    }
    return _db.collection(className).find(query).toArray();
  },

  async saveItem(id: string, obj: any, className: string, opts?: any) : Promise<any>
  {
    // Quick and dirty validation
    if (!_db) {
      log.trace(`MONGO: ERR_BAD_ARG: Database not initialized.`);
      throw new PancakeError('ERR_BAD_ARG', `MONGO: Database not initialized.`);
    }
    delete obj.isDirty;
    return _db.collection(className).update( {_id: new ObjectID(id)}, obj, {upsert: true});
  }
}
