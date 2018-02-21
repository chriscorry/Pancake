import { PitbossClient } from './api/pitboss_1.0.0/pitboss_client';
import { PancakeError }  from '../util/pancake-err';
import { Token }         from '../util/tokens';
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

  // TEMP ***** TEMP ******
  let token = new Token('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJsa2V5LTEuMC4wIiwic3ViIjoiZW50IiwiaWF0IjoxNTE5MjA2MTMwNDE3LCJleHAiOjE1MTkyMDcwMzA0MTcsInRvayI6IjZkY2ZlNGU4LTYyOTQtNDM1Yi04ZmRkLTAxZDQxZjljYzkxMiIsImFjY250IjoiNWE4Y2MwODAwMTNkZTIzM2UwYTQzMjcyIiwiZW50IjpbeyJkb21haW4iOiJwYW5jYWtlIiwicm9sZSI6InN1cGVyYWRtaW4iLCJ2YWx1ZSI6dHJ1ZX1dfQ.1kJnIsTEW4HPdVYWvXOlmLLliuxd4gB9LKPA1CkKVyQ');
  // TEMP ***** TEMP ******

  // PITBOSS
  let pitboss = new PitbossClient(token);
  await pitboss.connect('localhost', 4000, () => {
    console.log('Connected...');

    // Register for our events
    pitboss.registerInterest('AllServers', allServers);
    pitboss.registerInterest('AllGroups', allGroups);
    pitboss.registerInterest('DefaultRelays', defaultRelays);
  });
}

doIt();
