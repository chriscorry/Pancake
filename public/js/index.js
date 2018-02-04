let socket = io();

socket.on('connect', function () {
  console.log('Connected to server...');
});

socket.on('disconnect', function () {
    console.log('Disconnected from server');
});

socket.on('newMessage', function (payload) {
  console.log('Received a new message:');
  console.log(`   uuid: ${payload.uuid}`);
  console.log(`   domain: ${payload.domain}`);
  console.log(`   channel: ${payload.channel}`);
  console.log(`   sent: ${Date(payload.sent)}`);
  console.log(`   payload: ${JSON.stringify(payload.payload, null, 2)}`);
});
