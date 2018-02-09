import { pitboss }       from './api/pitboss_1.0.0/pitboss_client';
import { PancakeError }  from '../util/pancake-err';
import { log }           from '../util/pancake-utils';
import { grab }          from '../util/pancake-grab';


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
  await pitboss.connect('localhost', 4000, () => {
    console.log('Connected...');

    // Register for our events
    pitboss.registerInterest('AllServers', allServers);
    pitboss.registerInterest('AllGroups', allGroups);
    pitboss.registerInterest('DefaultRelays', defaultRelays);
  });
}

doIt();
