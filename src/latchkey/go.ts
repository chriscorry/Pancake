const syrup = require('../syrup/syrup');

syrup.go('latchkey_config.json', 'apiconfig.json', {
  name: 'Latchkey',
  ver: '1.0.0',
  apiDir: __dirname + '/api',
  selfAuth: true
});
