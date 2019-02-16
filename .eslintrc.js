module.exports = {
    "env": {
        "commonjs": true,
        "es6": true,
        "node": true,
    },
    "extends": "eslint:recommended",
    "parserOptions": {
        "sourceType": "module"
    },
    "rules": {
        /* Fall 2018: make sure to copy any changes to sub-eslintrc.json as eslint-plugin-vue
        is prevent inheritance of a number of style */
        "indent": ["error", 4, { "SwitchCase": 1 }],
        "linebreak-style": ["error", "unix"],
        "no-extra-boolean-cast": ["off"],
        "no-unused-vars": ["warn"],
        "quotes": ["warn", "backtick"],
        "semi": ["error", "always"],
        "no-console": ["warn"]
    }
}
