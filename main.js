// Node Modules
const fs = require(`fs`),
    path = require(`path`);

// NPM Modules
const aws = require(`aws-sdk`),
    inquirer = require(`inquirer`),
    { InitializeLogging, Err } = require(`multi-level-logger`);

// Application Modules
const { ListInstances } = require(`./instances/list`),
    { NewSpotRequest } = require(`./instances/spotRequest`),
    { TagInstance } = require(`./instances/tag`),
    { TerminateInstance } = require(`./instances/terminate`);

const _defaultFile = path.join(__dirname, `awsDefaults.json`);
let _useCredentialProfile = undefined,
    _defaultRegion = undefined;

/**
 * Attempt to load configuration defaults, if they exist
 */
function loadDefaults() {
    return new Promise(resolve => {
        fs.readFile(_defaultFile, { encoding: `utf8` }, (err, contents) => {
            // Ignore any error, and proceed as if no defaults exist
            if (!!err)
                resolve();
            else
                resolve(JSON.parse(contents));
        });
    })
        // Ignore any error, and proceed as if no defaults exist
        // eslint-disable-next-line no-unused-vars
        .catch(err => {
            return null;
        });
}

/**
 * Update the awsDefaults.json file after any changes
 */
function updateDefaults() {
    return new Promise((resolve, reject) => {
        fs.writeFile(_defaultFile, JSON.stringify({ profile: _useCredentialProfile, region: _defaultRegion }, null, 4), (err) => {
            if (!!err)
                reject(err);
            else
                resolve();
        });
    });
}

/**
 * Render the main menu
 * @param {Object} configurationDefaults - loaded awsDefaults.json
 */
function menu(configurationDefaults) {
    let questions = [
        {
            type: `list`,
            name: `selection`,
            message: `Main Menu`,
            choices: [
                { name: `List Instances`, value: `instanceList` },
                { name: `Tag Running Instance`, value: `tagInstance` },
                { name: `Launch Spot Instance`, value: `launchSpot` },
                { name: `Terminate Instances`, value: `terminate` },
                { name: `Exit`, value: `exit` },
            ],
        },
    ];

    if (_defaultRegion === undefined)
        questions.unshift({
            name: `awsRegion`,
            message: `AWS Region:`,
            default: !!configurationDefaults ? configurationDefaults.region : null,
        });

    if (_useCredentialProfile === undefined)
        questions.unshift({
            name: `profileName`,
            message: `Profile name for credentials:`,
            default: !!configurationDefaults ? configurationDefaults.profile : null,
        });

    return inquirer.prompt(questions)
        .then(answers => {
            if (answers.profileName !== undefined) {
                if (answers.profileName.trim().length > 0)
                    aws.config.credentials = new aws.SharedIniFileCredentials({ profile: answers.profileName });

                _useCredentialProfile = answers.profileName;
            }

            if (answers.awsRegion !== undefined) {
                if (answers.awsRegion.trim().length > 0)
                    aws.config.update({ region: answers.awsRegion.trim() });

                _defaultRegion = answers.awsRegion;
            }

            // If the configurationDefaults have been updated, write the updated values
            let pUpdate = Promise.resolve();
            if (!configurationDefaults || (_defaultRegion !== configurationDefaults.region) || (_useCredentialProfile !== configurationDefaults.profile))
                pUpdate = pUpdate.then(() => updateDefaults());

            return pUpdate
                .then(() => {
                    switch (answers.selection) {
                        case `exit`:
                            process.exit();
                            break;
        
                        case `instanceList`:
                            return ListInstances();
        
                        case `launchSpot`:
                            return NewSpotRequest();
        
                        case `tagInstance`:
                            return TagInstance();
        
                        case `terminate`:
                            return TerminateInstance();
                    }
                });
        })
        .then(() => menu());
}

InitializeLogging(`info`);

loadDefaults()
    .then(configurationDefaults => menu(configurationDefaults))
    .catch(err => {
        Err(err, true);
    });
