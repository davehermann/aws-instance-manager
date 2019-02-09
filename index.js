const aws = require(`aws-sdk`),
    inquirer = require(`inquirer`),
    { DateTime } = require(`luxon`),
    { AvailableInstances } = require(`./launchTemplates`);

function selectConfiguration() {
    let instanceNames = [];
    for (let name in AvailableInstances)
        instanceNames.push(name);

    const questions = [
        {
            type: `list`,
            name: `selectedInstance`,
            message: `Select a template to launch:`,
            choices: instanceNames,
        },
        {
            name: `maximumLifetime`,
            message: `How many hours should this instance operate:`,
            default: 4,
        },
    ];

    return inquirer.prompt(questions);
}

function submitRequest(answers) {
    let ec2 = new aws.EC2({ apiVersion: `2016-11-05`, region: `us-east-1` });

    // Copy the instance configuration
    let launchInstance = JSON.parse(JSON.stringify(AvailableInstances[answers.selectedInstance]));

    // Add an expiration the requested hours in the future (2020-02-09T13:34:20Z)
    if (answers.maximumLifetime > 0)
        launchInstance.ValidUntil = DateTime.local().plus({ hours: answers.maximumLifetime }).toISO();

    return ec2.requestSpotInstances(launchInstance).promise();
}

selectConfiguration()
    .then(answers => submitRequest(answers))
    .then(data => {
        console.log(`Request initiated`);
        console.log(data);
    })
    .catch(err => {
        console.error(err);
    });
