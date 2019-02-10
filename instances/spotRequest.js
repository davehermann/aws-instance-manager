// NPM Modules
const aws = require(`aws-sdk`),
    inquirer = require(`inquirer`),
    { DateTime } = require(`luxon`),
    { Info, Warn } = require(`multi-level-logger`);

// Application Modules
const { AvailableInstances } = require(`./launchTemplates`);
/**
 * Series of options for configuring a spot request
 */
function selectConfiguration() {
    let instanceNames = [];
    for (let name in AvailableInstances)
        instanceNames.push(name);

    instanceNames.push({ name: `Return to Main Menu`, value: null });

    const questions = [
        {
            type: `list`,
            name: `selectedInstance`,
            message: `Select a template to launch:`,
            choices: instanceNames,
        },
        {
            name: `maximumLifetime`,
            message: `How many hours should this request be active:`,
            default: 1,
            when: answers => {
                return !!answers.selectedInstance;
            },
        },
        {
            type: `confirm`,
            name: `showRequest`,
            message: `Show the request data?`,
            when: answers => {
                return !!answers.selectedInstance;
            },
        }
    ];

    return inquirer.prompt(questions);
}

/**
 * Trigger a new EC2 spot request
 * @param {Object} answers - Answers to the spot configuration questions
 */
function submitRequest(answers) {
    if (answers.selectedInstance == null)
        return Promise.resolve();

    let ec2 = new aws.EC2({ apiVersion: `2016-11-05`, });

    // Copy the instance configuration
    let launchInstance = JSON.parse(JSON.stringify(AvailableInstances[answers.selectedInstance]));

    // Add an expiration the requested hours in the future (2020-02-09T13:34:20Z)
    if (answers.maximumLifetime > 0) {
        const expirationTime = DateTime.utc().plus({ hours: +answers.maximumLifetime });
        launchInstance.ValidUntil = expirationTime.toISO(); //`${expirationTime.toFormat(`yyyy-LL-dd`)}T${expirationTime.toFormat(`TT`)}Z`;
    }

    if (answers.showRequest)
        Info(launchInstance);

    return ec2.requestSpotInstances(launchInstance).promise();
}

/**
 * Launch a new spot request via a series of configuration options
 */
function launchSpot() {
    return selectConfiguration()
        .then(answers => submitRequest(answers))
        .then(data => {
            if (!!data) {
                Warn(`Request initiated`);
                Info(data);
            }
        });
}

module.exports.NewSpotRequest = launchSpot;
