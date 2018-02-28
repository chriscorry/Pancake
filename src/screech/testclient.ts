import { ScreechClient } from '../screech/api/screech_1.0.0/screech_client';
import { PancakeError }  from '../util/pancake-err';
import { log }           from '../util/pancake-utils';
import { grab }          from '../util/pancake-grab';


async function createDomain(name: string, description?: string)
{
  let [err, resp] = await grab(screech.createDomain(name, description));
  if (err || resp)
    console.log(err, resp);
  else {
    console.log(`Successfully created domain '${name}'`);
  }
}


async function deleteDomain(name: string)
{
  let [err, resp] = await grab(screech.deleteDomain(name));
  if (err || resp)
    console.log(err, resp);
  else {
    console.log(`Successfully deleted domain '${name}'`);
  }
}


async function openChannel(domain: string, name: string, description?: string)
{
  let [err, resp] = await grab(screech.openChannel(domain, name, undefined, description));
  if (err || resp)
    console.log(err, resp);
  else {
    console.log(`Successfully created channel '${name}'`);
  }
}


async function deleteChannel(domain: string, name: string)
{
  let [err, resp] = await grab(screech.deleteChannel(domain, name));
  if (err || resp)
    console.log(err, resp);
  else {
    console.log(`Successfully deleted channel '${name}'`);
  }
}


async function subscribe(domain: string, channel: string, onMessage: any)
{
  let [err, resp] = await grab(screech.subscribe(domain, channel, onMessage));
  if (err || resp)
    console.log(err, resp);
  else {
    console.log(`Successfully subscribed to '${channel}'`);
  }
}



// ************************ THE MAIN EVENT *********************************

function messageCallback1(message: any)
{
  console.log('=== MESSAGE CALL BACK 1 ===');
  console.log('   ', message.payload);
}


function messageCallback2(message: any)
{
  console.log('=== MESSAGE CALL BACK 2 ===');
  console.log('   ', message.payload);
}


log.info(`Test Client`);
log.level = 'trace';

async function doIt()
{
  await screech.connect('localhost', 3000, undefined, () => {
    console.log('Connected...');
  });

  createDomain('Animals');
    openChannel('Animals', 'Duck');
    openChannel('Animals', 'Fox');
    openChannel('Animals', 'Bear');
    openChannel('Animals', 'Cow');
    openChannel('Animals', 'Elephant');

  createDomain('Cars');
    openChannel('Cars', 'BMW');
    openChannel('Cars', 'Ford');
    openChannel('Cars', 'Tesla');
    openChannel('Cars', 'Kia');
    openChannel('Cars', 'Mercedes');

  subscribe('Animals', 'Duck', messageCallback1);
  subscribe('Animals', 'Bear', messageCallback2);
  subscribe('Animals', 'Cow', messageCallback1);
  subscribe('Cars',    'BMW', messageCallback2);
  subscribe('Cars',    'Tesla', messageCallback1);
  subscribe('Cars',    'Mercedes', messageCallback2);

  // deleteChannel('Animals', 'Cow');
  // deleteDomain('Animals');
}

let screech = new ScreechClient();
doIt();
