"use strict";

const {
    defineConfig,
    globalIgnores,
} = require("eslint/config");

const js = require("@eslint/js");

const {
    FlatCompat,
} = require("@eslint/eslintrc");

const compat = new FlatCompat({
    baseDirectory: __dirname,
    recommendedConfig: js.configs.recommended,
    allConfig: js.configs.all
});
require("eslint-config-etherpad/patch/modern-module-resolution");

module.exports = defineConfig([{
    rules: {
        "no-extraneous-require": "off",
    },

}, globalIgnores(["lib/Changeset.js"])]);
