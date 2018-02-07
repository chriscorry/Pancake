require('../syrup/syrup').go('valet_config.json', 'apiconfig.json', {
  name: 'Valet',
  ver: '1.0.0',
  apiDir: __dirname + '/api' });


// const syrup = require('../syrup/syrup');
//
// syrup.go('valet_config.json', 'apiconfig.json', {
//   name: 'Valet',
//   ver: '1.0.0',
//   apiDir: __dirname + '/api'});
