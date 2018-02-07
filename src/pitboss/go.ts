require('../syrup/syrup').go('pitboss_config.json', 'apiconfig.json', {
  name: 'Pitboss',
  ver: '1.0.0',
  apiDir: __dirname + '/api',
  usePitboss: false });

// const syrup = require('../syrup/syrup');
//
// syrup.go('pitboss_config.json', 'apiconfig.json', {
//   name: 'Pitboss',
//   ver: '1.0.0',
//   apiDir: __dirname + '/api',
//   usePitboss: false });
