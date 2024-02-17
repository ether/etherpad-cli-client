'use strict';

// This is a workaround for https://github.com/eslint/eslint/issues/3458
require('eslint-config-etherpad/patch/modern-module-resolution');

module.exports = {
  root: true,
  rules:{
    'no-extraneous-require': 'off', // Turn off the rule here
  },
  extends: 'etherpad/plugin',
};
