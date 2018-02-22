const syrup2 = require('../syrup/syrup');

syrup2.go('pitboss_config.json', 'apiconfig.json', {
  name: 'Pitboss',
  ver: '1.0.0',
  apiDir: __dirname + '/api',
  usePitboss: false,
  skipAuth: true
 });
