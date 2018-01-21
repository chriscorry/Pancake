require('../syrup/syrup').go('config.json', 'apiconfig.json', {
  name: 'Valet',
  ver: '1.0.0',
  apiDir: __dirname + '/api' });
