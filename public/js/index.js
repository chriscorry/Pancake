let socket = io();

socket.on('connect', function () {
  console.log('Connected to server...');
});

socket.on('disconnect', function () {
    console.log('Disconnected from server');
});

socket.on('newMessage', function (body) {
  console.log('Received a new message:');
  console.log(`   From: ${body.sender}`);
  console.log(`   Time: ${Date(body.createdAt)}`);
  console.log(`   Text: "${body.text}"`);

});

socket.emit('createMessage', { sender: 'Frank', text: 'Hello world'}, (data) => {
  console.log('Received awk: ', data);
});
