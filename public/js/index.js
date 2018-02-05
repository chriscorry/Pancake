let socket = io();

socket.on('connect', function () {
  console.log('Connected to server...');
});

socket.on('disconnect', function () {
    console.log('Disconnected from server');
});

socket.on('serveractivity', function (body) {
  if ('connect' === body.payload.event)
    console.log('Server connected to Pitboss:');
  else if ('disconnect' === body.payload.event)
    console.log('Server disconnected from Pitboss:');
  console.log(`   server: ${JSON.stringify(body.payload.server, null, 2)}`);
});
