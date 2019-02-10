// NPM Modules
const aws = require(`aws-sdk`),
    inquirer = require(`inquirer`),
    { InitializeLogging, Err } = require(`multi-level-logger`);

// Application Modules
const { ListInstances } = require(`./instances/list`),
    { NewSpotRequest } = require(`./instances/spotRequest`),
    { TagInstance } = require(`./instances/tag`),
    { TerminateInstance } = require(`./instances/terminate`);

let _useCredentialProfile = undefined;

function menu() {
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

    if (_useCredentialProfile === undefined)
        questions.unshift({
            name: `profileName`,
            message: `Profile name for credentials:`,
        });

    return inquirer.prompt(questions)
        .then(answers => {
            if (answers.profileName !== undefined) {
                if (answers.profileName.trim().length > 0)
                    aws.config.credentials = new aws.SharedIniFileCredentials({ profile: answers.profileName });

                _useCredentialProfile = answers.profileName;
            }

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
        })
        .then(() => menu());
}

InitializeLogging(`info`);

menu()
    .catch(err => {
        Err(err);
    });
