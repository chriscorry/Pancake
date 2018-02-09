let socket = io();

socket.on('connect', function () {
  console.log('Connected to server...');
});

socket.on('disconnect', function () {
    console.log('Disconnected from server');
});

socket.on('pitboss-serveractivity', function (msg) {
  if ('Connect' === msg.payload.event)
    console.log('Server connected to Pitboss:');
  else if ('Disconnect' === msg.payload.event)
    console.log('Server disconnected from Pitboss:');
  console.log(`   server: ${JSON.stringify(msg.payload, null, 2)}`);
});

socket.on('pitboss-groupactivity', function (msg) {
  console.log('Group activity:');
  console.log(`   server: ${JSON.stringify(msg.payload, null, 2)}`);
});
