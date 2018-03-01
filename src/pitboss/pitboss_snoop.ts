import { LatchkeyClient } from '../latchkey/api/latchkey_1.0.0/latchkey_client';
import { PitbossClient }  from './api/pitboss_1.0.0/pitboss_client';
import { PancakeError }   from '../util/pancake-err';
import { Token }          from '../util/tokens';
import { log }            from '../util/pancake-utils';
import { grab }           from '../util/pancake-grab';


function allServers(message: any)
{
  console.log('=== SERVER ACTIVITY MESSAGE ===');
  console.log('   ', message, '\n');
}


function allGroups(message: any)
{
  console.log('=== GROUP ACTIVITY MESSAGE ===');
  console.log('   ', message, '\n');
}


function defaultRelays(message: any)
{
  console.log('=== DefaultRelays MESSAGE ===');
  console.log('   ', message, '\n');
}


log.info(`Pitboss Snoop, v1.0.0`);
log.level = 'trace';

async function doIt()
{
  // LATCHKEY
  let latchkey = new LatchkeyClient('localhost', 3500);
  let [err, token] = await grab(latchkey.createToken('admin@thecorrys.com', 'adminpassword'));
  if (err) {
    console.log(err);
    return;
  }

  // PITBOSS
  let pitboss = new PitbossClient();
  latchkey.linkClientAPI(pitboss);
  await pitboss.connect('localhost', 4000, token, () => {
    console.log('Connected...');

    // Register for our events
    pitboss.registerInterest('AllServers', allServers);
    pitboss.registerInterest('AllGroups', allGroups);
    pitboss.registerInterest('DefaultRelays', defaultRelays);
  });
}

doIt();
