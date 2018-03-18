/****************************************************************************
 **                                                                        **
 ** Modules                                                                **
 **                                                                        **
 ****************************************************************************/

import { PitbossClient } from './pitboss_client';
import * as utils        from '../../../util/pancake-utils';
import { grab }          from '../../../util/pancake-grab';
import { PancakeError }  from '../../../util/pancake-err';
const log = utils.log;


/****************************************************************************
 **                                                                        **
 ** Vars & definitions                                                     **
 **                                                                        **
 ****************************************************************************/



/****************************************************************************
 **                                                                        **
 ** Class Cadre                                                            **
 **                                                                        **
 ****************************************************************************/

export class Cadre<CohortRecord>
{
  protected _pitboss: PitbossClient;
  protected _uuid: string;
  protected _apiTag: string;
  protected _group: string;
  protected _cohort = new Map<string, CohortRecord>();


  /****************************************************************************
   **                                                                        **
   ** Private methods                                                        **
   **                                                                        **
   ****************************************************************************/

  private _onGroupChange(msg: any) : void
  {
    switch(msg.event) {
      case 'JoinedGroup':
        if (msg.server.uuid != this._uuid) {
          let newCohortMember: CohortRecord = this.createCohortRecord(msg.server);
          if (newCohortMember) {
            this._cohort.set(msg.server.uuid, newCohortMember);
            log.trace(`${this._apiTag}: Added server '${msg.server.uuid}' to cadre.`);
          }
        }
        break;
      case 'LeftGroup':
        if (msg.server.uuid != this._uuid) {
          let cohortMember = this._cohort.get(msg.server.uuid);
          if (cohortMember) {
            this.removeCohortRecord(cohortMember);
            this._cohort.delete(msg.server.uuid);
          }
        }
        log.trace(`${this._apiTag}: Removed server '${msg.server.uuid}' from cadre.`);
        break;
    }
  }


  private async _onNewServerUUID(uuid: string) : Promise<void>
  {
    // Save off
    this._uuid = uuid;

    // We want to receive notifications about the relay group
    await grab(this._pitboss.registerInterest(this._group,
      (msg:any) : void => { this._onGroupChange(msg); }));

    // Retrive our list of groups from the server
    let [err, resp] = await grab(this._pitboss.getGroups());
    if (err) return;

    // Process each server already in the groups
    let cohort = resp.find((group:any) => {
      if (this._group === group.name)
        return true;
    });
    if (cohort && cohort.members) {
      cohort.members.forEach((cohortMember: any) => {
        if (cohortMember.uuid != this._uuid) {
          let newCohortMember: CohortRecord = this.createCohortRecord(cohortMember);
          if (newCohortMember) {
            this._cohort.set(cohortMember.uuid, newCohortMember);
            log.trace(`${this._apiTag}: Added server '${cohortMember.uuid}' to cadre.`);
          }
        }
      });
    }
  }


  /****************************************************************************
   **                                                                        **
   ** To override                                                            **
   **                                                                        **
   ****************************************************************************/

   protected createCohortRecord(serverInfo: any) : CohortRecord
   {
     // Do nothing here in the base class
     return;
   }


   protected removeCohortRecord(cohortInfo: CohortRecord) : void
   {
     // Do nothing here in the base class
   }


  /****************************************************************************
   **                                                                        **
   ** Constructor                                                            **
   **                                                                        **
   ****************************************************************************/

  constructor(pitboss: PitbossClient, cadreGroup: string, apiTag: string)
  {
    this._pitboss = pitboss;
    this._group   = cadreGroup;
    this._apiTag  = apiTag;

    // Let us know!
    this._pitboss.on('serverUUID', (uuid: string) => { this._onNewServerUUID(uuid); });
  }

} // END class Cadre
