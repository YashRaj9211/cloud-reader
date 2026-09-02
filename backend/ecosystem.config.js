module.exports = {
  apps : [{
    script: 'index.js',
    watch: '.'
  }, {
    script: './service-worker/',
    watch: ['./service-worker']
  }],

  deploy : {
    production : {
      user : 'yash',
      host : '[IP_ADDRESS]',
      ref  : 'origin/main',
      repo : 'https://github.com/YashRaj9211/cloud-reader.git',
      path : '',
      'pre-deploy-local': '',
      'post-deploy' : 'npm install && pm2 reload ecosystem.config.js --env production',
      'pre-setup': ''
    }
  }
};
