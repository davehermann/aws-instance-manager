// NPM Modules
const aws = require(`aws-sdk`),
    { Warn } = require(`multi-level-logger`);

/**
 * Standard handling for an empty list of instances
 * @param {Array} itemList 
 * @param {String | undefined} message 
 */
function emptyList(itemList, message) {
    if (itemList == 0) {
        Warn(message || `No running instances found`);
        return Promise.resolve();
    } else
        return Promise.resolve(itemList);
}

/**
 * Pull all EC2 instance data for the region
 */
function getAllInstances() {
    let ec2 = new aws.EC2({ apiVersion: `2016-11-05`, region: `us-east-1` });

    return ec2.describeInstances().promise()
        // Flatten the list
        .then(data => {
            let instanceList = [];
            data.Reservations.forEach(reservation => {
                instanceList = instanceList.concat(reservation.Instances);
            });

            return instanceList;
        });
}

/**
 * Generate list of instances with standard naming, and full data
 * @returns {Array<Object>}
 */
function instanceSummary() {
    return getAllInstances()
        .then(instances => {
            return instances.map(instance => {
                let name = instance.InstanceId;

                if (!!instance.Tags) {
                    let nameTags = instance.Tags.filter(tag => { return tag.Key == `Name`; });
                    if (nameTags.length > 0)
                        name = `${nameTags[0].Value} (${instance.InstanceId})`;
                }

                return { name, id: instance.InstanceId, data: instance };
            });
        });
}

module.exports.EmptyList = emptyList;
module.exports.InstanceSummary = instanceSummary;
